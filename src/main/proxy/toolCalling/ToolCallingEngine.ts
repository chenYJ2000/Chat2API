import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv'
import addFormats from 'ajv-formats'
import type { ChatCompletionRequest, ChatMessage, ToolCall } from '../types.ts'
import type { Provider } from '../../store/types.ts'
import {
  DEFAULT_TOOL_CALLING_CONFIG,
  normalizeToolCallingConfig,
  type ToolCallingConfig,
} from '../../../shared/toolCalling.ts'
import { getToolProtocol } from './protocols/index.ts'
import { getToolClientAdapter } from './clientAdapters/index.ts'
import { buildToolCallingRuntimePlan } from './runtimePlan.ts'
import type { NormalizedToolDefinition, ToolCallingPlan, ToolCallingTransformResult, ToolProtocolId } from './types.ts'

export class ToolCallingResponseError extends Error {
  readonly status = 502

  constructor(message: string) {
    super(message)
    this.name = 'ToolCallingResponseError'
  }
}

export class ToolCallingRequestError extends Error {
  readonly status = 400

  constructor(message: string) {
    super(message)
    this.name = 'ToolCallingRequestError'
  }
}

export function isToolCallingResponseErrorMessage(message?: string): boolean {
  return Boolean(
    message?.startsWith('Upstream model did not return the required tool call')
    || message?.startsWith('Upstream model returned invalid tool arguments')
  )
}

const MAX_SCHEMA_CACHE_ENTRIES = 256
const MAX_SCHEMA_CHARS = 100_000
const MANAGED_PROTOCOL_MARKER = /<\/?\|CHAT2API\||<\/?tool_(?:calls|use)>|\[\/?function_calls\]|\[call:[^\]]+\]|\[\/call\]/i
const schemaValidator = new Ajv({
  allErrors: true,
  coerceTypes: false,
  removeAdditional: false,
  strict: false,
  useDefaults: false,
})
addFormats(schemaValidator)
const compiledSchemaCache = new Map<string, ValidateFunction>()

export class ToolCallingEngine {
  private readonly config: ToolCallingConfig

  constructor(config: Partial<ToolCallingConfig> = {}) {
    this.config = normalizeToolCallingConfig({
      ...DEFAULT_TOOL_CALLING_CONFIG,
      ...config,
      advanced: {
        ...DEFAULT_TOOL_CALLING_CONFIG.advanced,
        ...config.advanced,
      },
    })
  }

  transformRequest(input: {
    request: ChatCompletionRequest
    provider: Provider
    actualModel: string
    requestId?: string
  }): ToolCallingTransformResult {
    const { request, provider, actualModel, requestId } = input
    const adapter = getToolClientAdapter(this.config.clientAdapterId)
    const clientRequest = adapter.normalizeRequest(request)
    const plan = buildToolCallingRuntimePlan({
      requestId,
      providerId: provider.id,
      actualModel,
      model: request.model,
      config: this.config,
      clientRequest,
    })
    if (plan.shouldParseResponse) {
      for (const tool of plan.tools) getToolArgumentValidator(tool)
    }
    const shouldInjectPrompt = plan.shouldInjectPrompt

    if (!shouldInjectPrompt) {
      return {
        messages: request.messages,
        tools: plan.mode === 'disabled' ? request.tools : undefined,
        plan,
      }
    }

    return {
      messages: injectPrompt(request.messages, renderPrompt(plan.protocol, plan.tools, this.config)),
      tools: undefined,
      plan,
    }
  }

  applyNonStreamResponse(result: any, plan: ToolCallingPlan): void {
    if (!plan.shouldParseResponse) return

    const message = result?.choices?.[0]?.message
    if (!message || typeof message.content !== 'string') {
      if (message?.tool_calls?.length) {
        message.tool_calls = validateAndSanitizeToolCalls(message.tool_calls, plan)
        return
      }
      this.assertRequiredToolCall(plan)
      return
    }

    const parseResult = parseSelectedProtocol(message.content, plan)
    plan.diagnostics.parserFormat = parseResult.protocol
    plan.diagnostics.parsedToolCallCount = parseResult.toolCalls.length
    plan.diagnostics.invalidToolNames = parseResult.invalidToolNames
    plan.diagnostics.malformedReason = parseResult.malformedReason

    if (parseResult.toolCalls.length === 0) {
      this.assertRequiredToolCall(plan, parseResult.invalidToolNames, parseResult.malformedReason)
      return
    }

    const toolCalls = validateAndSanitizeToolCalls(parseResult.toolCalls, plan)
    message.content = parseResult.content || null
    message.tool_calls = toolCalls

    const choice = result.choices[0]
    choice.finish_reason = 'tool_calls'
  }

  private assertRequiredToolCall(
    plan: ToolCallingPlan,
    invalidToolNames: string[] = [],
    malformedReason?: string,
  ): void {
    if (plan.toolChoiceMode !== 'required' && plan.toolChoiceMode !== 'forced') return

    const details = [
      invalidToolNames.length > 0 ? `invalid tools: ${invalidToolNames.join(', ')}` : undefined,
      malformedReason,
    ].filter(Boolean).join('; ')
    const suffix = details ? ` (${details})` : ''
    throw new ToolCallingResponseError(
      `Upstream model did not return the required tool call${suffix}`,
    )
  }
}

function validateAndSanitizeToolCalls(
  toolCalls: ToolCall[],
  plan: ToolCallingPlan,
): ToolCall[] {
  const definitions = new Map(plan.tools.map((tool) => [tool.name, tool]))

  return toolCalls.map((toolCall) => {
    const publicToolCall = stripInternalToolMetadata(toolCall)
    const toolName = publicToolCall.function?.name
    const definition = definitions.get(toolName)
    if (!definition) {
      throwInvalidToolArguments(toolName || 'unknown', 'tool is not allowed by this request')
    }

    const rawArguments = publicToolCall.function?.arguments
    if (typeof rawArguments !== 'string') {
      throwInvalidToolArguments(toolName, 'arguments must be a JSON string')
    }
    if (MANAGED_PROTOCOL_MARKER.test(rawArguments)) {
      throwInvalidToolArguments(toolName, 'arguments contain internal protocol markers')
    }

    let argumentsValue: unknown
    try {
      argumentsValue = JSON.parse(rawArguments)
    } catch {
      throwInvalidToolArguments(toolName, 'arguments are not valid JSON')
    }

    if (!isPlainObject(argumentsValue)) {
      throwInvalidToolArguments(toolName, 'arguments must decode to a JSON object')
    }

    const validate = getToolArgumentValidator(definition)
    if (!validate(argumentsValue)) {
      throwInvalidToolArguments(toolName, formatSchemaErrors(validate.errors))
    }

    return publicToolCall
  })
}

function getToolArgumentValidator(tool: NormalizedToolDefinition): ValidateFunction {
  const rawSchema = tool.parameters ?? {}
  if (rawSchema.type !== undefined && rawSchema.type !== 'object') {
    throwInvalidToolSchema(tool.name, 'root type must be "object"')
  }
  const { $id, $schema, ...schemaWithoutMetadata } = rawSchema
  void $id
  void $schema
  const normalizedSchema = {
    ...schemaWithoutMetadata,
    type: 'object',
  }

  let cacheKey: string
  try {
    cacheKey = JSON.stringify(normalizedSchema)
  } catch {
    throwInvalidToolSchema(tool.name, 'schema is not serializable')
  }
  if (cacheKey.length > MAX_SCHEMA_CHARS) {
    throwInvalidToolSchema(tool.name, `schema exceeds ${MAX_SCHEMA_CHARS} characters`)
  }

  const cached = compiledSchemaCache.get(cacheKey)
  if (cached) {
    compiledSchemaCache.delete(cacheKey)
    compiledSchemaCache.set(cacheKey, cached)
    return cached
  }

  let compiled: ValidateFunction
  try {
    compiled = schemaValidator.compile(normalizedSchema)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown schema error'
    throwInvalidToolSchema(tool.name, message)
  }

  compiledSchemaCache.set(cacheKey, compiled)
  if (compiledSchemaCache.size > MAX_SCHEMA_CACHE_ENTRIES) {
    const oldestKey = compiledSchemaCache.keys().next().value
    if (oldestKey !== undefined) compiledSchemaCache.delete(oldestKey)
  }
  return compiled
}

function formatSchemaErrors(errors: ErrorObject[] | null | undefined): string {
  if (!errors?.length) return 'arguments do not match the declared JSON Schema'

  return errors.slice(0, 6).map((error) => {
    const missingProperty = error.keyword === 'required'
      ? String(error.params.missingProperty || '')
      : ''
    const path = `${error.instancePath || '$'}${missingProperty ? `/${missingProperty}` : ''}`
    return `${path} ${error.message || error.keyword}`
  }).join('; ')
}

function throwInvalidToolArguments(toolName: string, reason: string): never {
  throw new ToolCallingResponseError(
    `Upstream model returned invalid tool arguments for "${sanitizeToolName(toolName)}": ${reason}`,
  )
}

function throwInvalidToolSchema(toolName: string, reason: string): never {
  throw new ToolCallingRequestError(
    `Invalid JSON Schema for tool "${sanitizeToolName(toolName)}": ${reason}`,
  )
}

function sanitizeToolName(toolName: string): string {
  return toolName.replace(/[\r\n\t]/g, ' ').slice(0, 128)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stripInternalToolMetadata(toolCall: ToolCall): ToolCall {
  const { rawText, ...publicToolCall } = toolCall as ToolCall & { rawText?: string }
  void rawText
  return publicToolCall
}

function renderPrompt(
  protocol: ToolProtocolId,
  tools: NormalizedToolDefinition[],
  config: ToolCallingConfig,
): string {
  const prompt = getToolProtocol(protocol).renderPrompt(tools)
  const customPromptTemplate = config.diagnosticsEnabled
    ? config.advanced.customPromptTemplate
    : undefined
  if (!customPromptTemplate) return prompt

  return customPromptTemplate
    .replace(/\{\{tools\}\}/g, prompt)
    .replace(/\{\{tool_names\}\}/g, tools.map((tool) => tool.name).join(', '))
    .replace(/\{\{format\}\}/g, protocol)
}

function injectPrompt(messages: ChatMessage[], prompt: string): ChatMessage[] {
  const [first, ...rest] = messages
  if (first?.role === 'system' && typeof first.content === 'string') {
    return [{ ...first, content: `${first.content}\n\n${prompt}` }, ...rest]
  }

  return [{ role: 'system', content: prompt }, ...messages]
}

function parseSelectedProtocol(content: string, plan: ToolCallingPlan) {
  const selected = getToolProtocol(plan.protocol)
  return selected.parse(content, { tools: plan.tools, protocol: plan.protocol })
}

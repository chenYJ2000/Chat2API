import type { ChatCompletionRequest } from '../../types.ts'
import type { NormalizedToolDefinition, ToolProtocolId } from '../types.ts'
import type { ToolClientAdapterId } from '../../../../shared/toolCalling.ts'

export interface NormalizedToolChoice {
  mode: 'auto' | 'none' | 'required' | 'forced'
  forcedName?: string
}

export interface NormalizedClientToolRequest {
  clientAdapterId: string
  toolSource: 'openai' | 'mcp' | 'none'
  tools: NormalizedToolDefinition[]
  toolChoice: NormalizedToolChoice
  /** A client may require a particular managed response envelope. */
  preferredProtocol?: ToolProtocolId
  /** Provider-specific protocol override when a client interoperates with several upstreams. */
  preferredProtocolByProvider?: Record<string, ToolProtocolId>
  diagnostics: {
    requestedClientAdapterId?: string
    fallbackClientAdapterId?: string
    configuredClientAdapterId?: string
    clientAdapterResolution?: 'configuration' | 'request_identity'
    detectedClientType?: string
    rawToolCount: number
    normalizedToolNames: string[]
  }
}

export interface ToolClientAdapter {
  id: ToolClientAdapterId
  displayName: string
  normalizeRequest(request: ChatCompletionRequest): NormalizedClientToolRequest
  /**
   * An optional final compatibility instruction. It is placed after the
   * client conversation so providers that flatten all roles into one prompt
   * retain the tool-call contract at the most recent position.
   */
  createTrailingToolInstruction?(
    protocol: ToolProtocolId,
    tools: NormalizedToolDefinition[],
  ): string | undefined
  /**
   * Some clients use long system prompts that can make an upstream model
   * describe a declared tool as unavailable instead of emitting a call. An
   * adapter may identify that narrow, client-specific refusal so the bounded
   * repair path can retry with the named tool forced.
   */
  detectToolRefusal?(
    content: string,
    allowedToolNames: ReadonlySet<string>,
  ): { toolName: string } | undefined
  /**
   * Removes a known client-specific tool-refusal preamble when the upstream
   * otherwise returned a substantive ordinary answer.
   */
  stripToolRefusalPreamble?(
    content: string,
    allowedToolNames: ReadonlySet<string>,
  ): string | undefined
}

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ToolCallingEngine,
  ToolCallingRequestError,
  ToolCallingResponseError,
} from '../../src/main/proxy/toolCalling/ToolCallingEngine.ts'
import type { ChatCompletionRequest } from '../../src/main/proxy/types.ts'
import type { Provider } from '../../src/main/store/types.ts'

const provider = {
  id: 'deepseek',
  name: 'DeepSeek',
  type: 'builtin',
  authType: 'userToken',
  apiEndpoint: 'https://chat.deepseek.com',
  headers: {},
  enabled: true,
  createdAt: 0,
  updatedAt: 0,
} as Provider

const tools = [
  {
    type: 'function' as const,
    function: {
      name: 'default_api:read_file',
      description: 'Read a file',
      parameters: { type: 'object', properties: { filePath: { type: 'string' } } },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'default_api:list_dir',
      description: 'List a directory',
      parameters: { type: 'object', properties: { path: { type: 'string' } } },
    },
  },
]

const strictDecisionTool = {
  type: 'function' as const,
  function: {
    name: 'signal_wait',
    description: 'Record a wait decision',
    parameters: {
      type: 'object',
      properties: {
        pair: { type: 'string' },
        confidence_score: { type: 'number', minimum: 1, maximum: 100 },
        cancel_pending_trigger: { type: 'boolean' },
        lean_direction: { type: 'string', enum: ['long', 'short', 'neutral'] },
        reason: { type: 'string', minLength: 1 },
      },
      required: [
        'pair',
        'confidence_score',
        'cancel_pending_trigger',
        'lean_direction',
        'reason',
      ],
      additionalProperties: false,
    },
  },
}

function request(overrides: Partial<ChatCompletionRequest> = {}): ChatCompletionRequest {
  return {
    model: 'deepseek-chat',
    messages: [{ role: 'user', content: 'read /tmp/a' }],
    tools,
    ...overrides,
  }
}

test('OpenAI tools plus DeepSeek choose managed prompt', () => {
  const result = new ToolCallingEngine().transformRequest({
    request: request(),
    provider,
    actualModel: 'deepseek-chat',
  })

  assert.equal(result.plan.mode, 'managed')
  assert.equal(result.plan.protocol, 'managed_xml')
  assert.equal(result.plan.shouldInjectPrompt, true)
  assert.equal(result.tools, undefined)
  assert.equal(result.plan.tools.length, 2)
  assert.match(result.messages[0].content as string, /<\|CHAT2API\|tool_calls>/)
})

test('explicit Cherry Studio MCP adapter uses managed prompt and preserves tool names', () => {
  const result = new ToolCallingEngine({ clientAdapterId: 'cherry-studio-mcp' }).transformRequest({
    request: request({
      messages: [
        { role: 'system', content: 'In this environment you have access to a set of tools' },
        { role: 'user', content: 'read /tmp/a' },
      ],
    }),
    provider,
    actualModel: 'deepseek-chat',
  })

  assert.equal(result.plan.clientAdapterId, 'cherry-studio-mcp')
  assert.equal(result.plan.mode, 'managed')
  assert.equal(result.plan.shouldInjectPrompt, true)
  assert.equal(result.plan.tools[0].name, 'default_api:read_file')
  assert.equal(result.plan.tools[0].source, 'mcp')
})

test('client prompt signatures do not override selected adapter', () => {
  const result = new ToolCallingEngine().transformRequest({
    request: request({
      messages: [
        { role: 'system', content: 'You are Kilo, the best coding agent. Tool definitions:' },
        { role: 'user', content: 'read /tmp/a' },
      ],
    }),
    provider,
    actualModel: 'deepseek-chat',
  })

  assert.equal(result.plan.clientAdapterId, 'standard-openai-tools')
  assert.equal(result.plan.mode, 'managed')
  assert.equal(result.plan.shouldInjectPrompt, true)
})

test('No tools choose disabled', () => {
  const result = new ToolCallingEngine().transformRequest({
    request: request({ tools: undefined }),
    provider,
    actualModel: 'deepseek-chat',
  })

  assert.equal(result.plan.mode, 'disabled')
  assert.equal(result.plan.shouldInjectPrompt, false)
})

test('Store mode off chooses disabled', () => {
  const result = new ToolCallingEngine({ mode: 'off', enabled: false }).transformRequest({
    request: request(),
    provider,
    actualModel: 'deepseek-chat',
  })

  assert.equal(result.plan.mode, 'disabled')
  assert.equal(result.tools, tools)
})

test('tool_choice none chooses disabled even when tools are present', () => {
  const result = new ToolCallingEngine().transformRequest({
    request: request({ tool_choice: 'none' }),
    provider,
    actualModel: 'deepseek-chat',
  })

  assert.equal(result.plan.mode, 'disabled')
  assert.equal(result.plan.toolChoiceMode, 'none')
})

test('tool_choice required preserves required policy on the plan', () => {
  const result = new ToolCallingEngine().transformRequest({
    request: request({ tool_choice: 'required' }),
    provider,
    actualModel: 'deepseek-chat',
  })

  assert.equal(result.plan.toolChoiceMode, 'required')
  assert.deepEqual([...result.plan.allowedToolNames].sort(), ['default_api:list_dir', 'default_api:read_file'])
})

test('forced function choice narrows allowed tool names to the selected function', () => {
  const result = new ToolCallingEngine().transformRequest({
    request: request({ tool_choice: { type: 'function', function: { name: 'default_api:list_dir' } } }),
    provider,
    actualModel: 'deepseek-chat',
  })

  assert.equal(result.plan.toolChoiceMode, 'forced')
  assert.equal(result.plan.forcedToolName, 'default_api:list_dir')
  assert.deepEqual(result.plan.tools.map((tool) => tool.name), ['default_api:list_dir'])
})

test('non-stream parsing safely falls back to another supported protocol', () => {
  const engine = new ToolCallingEngine()
  const transformed = engine.transformRequest({
    request: request(),
    provider,
    actualModel: 'deepseek-chat',
  })
  const result: any = {
    choices: [{
      message: {
        role: 'assistant',
        content: '[function_calls][call:default_api:read_file]{"filePath":"/tmp/a"}[/call][/function_calls]',
      },
      finish_reason: 'stop',
    }],
  }

  engine.applyNonStreamResponse(result, transformed.plan)

  assert.equal(result.choices[0].message.tool_calls.length, 1)
  assert.equal(result.choices[0].message.tool_calls[0].function.arguments, '{"filePath":"/tmp/a"}')
  assert.equal(transformed.plan.diagnostics.parserFormat, 'managed_bracket')
})

test('non-stream parsing accepts OpenAI tool_calls JSON emitted as content', () => {
  const engine = new ToolCallingEngine()
  const transformed = engine.transformRequest({
    request: request({ tool_choice: 'required' }),
    provider,
    actualModel: 'deepseek-chat',
  })
  const result: any = {
    choices: [{
      message: {
        role: 'assistant',
        content: JSON.stringify({
          tool_calls: [{
            id: 'call_json',
            type: 'function',
            function: {
              name: 'default_api:read_file',
              arguments: { filePath: '/tmp/json' },
            },
          }],
        }),
      },
      finish_reason: 'stop',
    }],
  }

  engine.applyNonStreamResponse(result, transformed.plan)

  assert.equal(result.choices[0].message.tool_calls[0].id, 'call_json')
  assert.equal(result.choices[0].message.tool_calls[0].function.arguments, '{"filePath":"/tmp/json"}')
  assert.equal(transformed.plan.diagnostics.parserFormat, 'openai_chat')
})

test('OpenAI tool_calls JSON is autodetected inside fenced prose', () => {
  const engine = new ToolCallingEngine()
  const transformed = engine.transformRequest({
    request: request({ tool_choice: 'required' }),
    provider,
    actualModel: 'deepseek-chat',
  })
  const result: any = {
    choices: [{
      message: {
        role: 'assistant',
        content: 'Final call:\n```json\n' + JSON.stringify({
          tool_calls: [{
            id: 'call_embedded',
            type: 'function',
            function: {
              name: 'default_api:read_file',
              arguments: { filePath: '/tmp/embedded' },
            },
          }],
        }) + '\n```',
      },
      finish_reason: 'stop',
    }],
  }

  engine.applyNonStreamResponse(result, transformed.plan)

  assert.equal(result.choices[0].message.tool_calls[0].id, 'call_embedded')
  assert.equal(result.choices[0].message.tool_calls[0].function.arguments, '{"filePath":"/tmp/embedded"}')
  assert.equal(transformed.plan.diagnostics.parserFormat, 'openai_chat')
})

test('malformed OpenAI JSON naming a legal tool is repairable invalid arguments', () => {
  const engine = new ToolCallingEngine({ diagnosticsEnabled: true })
  const transformed = engine.transformRequest({
    request: request({ tool_choice: 'required' }),
    provider,
    actualModel: 'deepseek-chat',
  })
  const result: any = {
    choices: [{
      message: {
        role: 'assistant',
        content: '{"tool_calls":[{"function":{"name":"default_api:read_file","arguments":',
      },
      finish_reason: 'stop',
    }],
  }

  assert.throws(
    () => engine.applyNonStreamResponse(result, transformed.plan),
    (error: unknown) => (
      error instanceof ToolCallingResponseError
      && error.code === 'invalid_arguments'
      && error.toolName === 'default_api:read_file'
      && error.repairable
      && error.diagnostics?.parserFormat === 'openai_chat'
    ),
  )
})

test('managed tool parsing strips internal raw protocol metadata from the public response', () => {
  const engine = new ToolCallingEngine()
  const transformed = engine.transformRequest({
    request: request(),
    provider,
    actualModel: 'deepseek-chat',
  })
  const result: any = {
    choices: [{
      message: {
        role: 'assistant',
        content: '<|CHAT2API|tool_calls><|CHAT2API|invoke name="default_api:read_file"><|CHAT2API|parameter name="filePath"><![CDATA[/tmp/a]]></|CHAT2API|parameter></|CHAT2API|invoke></|CHAT2API|tool_calls>',
      },
      finish_reason: 'stop',
    }],
  }

  engine.applyNonStreamResponse(result, transformed.plan)

  assert.equal(result.choices[0].message.content, null)
  assert.equal(result.choices[0].message.tool_calls.length, 1)
  assert.equal(result.choices[0].message.tool_calls[0].function.name, 'default_api:read_file')
  assert.equal(result.choices[0].message.tool_calls[0].function.arguments, '{"filePath":"/tmp/a"}')
  assert.equal('rawText' in result.choices[0].message.tool_calls[0], false)
})

test('required tool choice rejects a plain text upstream response', () => {
  const engine = new ToolCallingEngine()
  const transformed = engine.transformRequest({
    request: request({ tool_choice: 'required' }),
    provider,
    actualModel: 'deepseek-chat',
  })
  const result: any = {
    choices: [{
      message: { role: 'assistant', content: 'I will not call a tool.' },
      finish_reason: 'stop',
    }],
  }

  assert.throws(
    () => engine.applyNonStreamResponse(result, transformed.plan),
    (error: unknown) => (
      error instanceof ToolCallingResponseError
      && error.status === 502
      && error.diagnostics?.protocol === 'managed_xml'
      && error.diagnostics.rawContentPreview === 'I will not call a tool.'
    ),
  )
})

test('required-call failure retains reasoning only for bounded-repair response merge', () => {
  const engine = new ToolCallingEngine()
  const transformed = engine.transformRequest({
    request: request({ tool_choice: 'required', reasoning_effort: 'enabled' }),
    provider,
    actualModel: 'deepseek-chat',
  })
  const result: any = {
    choices: [{
      message: {
        role: 'assistant',
        content: 'plain text instead',
        reasoning_content: 'private first-attempt reasoning',
      },
      finish_reason: 'stop',
    }],
  }

  assert.throws(
    () => engine.applyNonStreamResponse(result, transformed.plan),
    (error: unknown) => (
      error instanceof ToolCallingResponseError
      && error.reasoningContent === 'private first-attempt reasoning'
      && !JSON.stringify(error.diagnostics).includes('private first-attempt reasoning')
    ),
  )
})

test('required tool choice accepts an already-native tool call', () => {
  const engine = new ToolCallingEngine()
  const transformed = engine.transformRequest({
    request: request({ tool_choice: 'required' }),
    provider,
    actualModel: 'deepseek-chat',
  })
  const result: any = {
    choices: [{
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: 'call_native',
          type: 'function',
          function: { name: 'default_api:read_file', arguments: '{"filePath":"/tmp/a"}' },
        }],
      },
      finish_reason: 'tool_calls',
    }],
  }

  assert.doesNotThrow(() => engine.applyNonStreamResponse(result, transformed.plan))
})

test('native tool_calls are preferred and validated even when content is also a string', () => {
  const engine = new ToolCallingEngine()
  const transformed = engine.transformRequest({
    request: request({ tool_choice: 'required' }),
    provider,
    actualModel: 'deepseek-chat',
  })
  const result: any = {
    choices: [{
      message: {
        role: 'assistant',
        content: 'final answer metadata',
        tool_calls: [{
          id: 'call_native_with_content',
          type: 'function',
          function: { name: 'default_api:read_file', arguments: '{"filePath":"/tmp/a"}' },
        }],
      },
      finish_reason: 'stop',
    }],
  }

  engine.applyNonStreamResponse(result, transformed.plan)

  assert.equal(result.choices[0].message.tool_calls.length, 1)
  assert.equal(result.choices[0].finish_reason, 'tool_calls')
})

test('empty invoke for a legal tool is classified as repairable invalid arguments', () => {
  const engine = new ToolCallingEngine({ diagnosticsEnabled: true })
  const transformed = engine.transformRequest({
    request: request({ tool_choice: 'required' }),
    provider,
    actualModel: 'deepseek-chat',
  })
  const result: any = {
    choices: [{
      message: {
        role: 'assistant',
        content: '<tool_calls><invoke name="default_api:read_file"></invoke></tool_calls>',
      },
      finish_reason: 'stop',
    }],
  }

  assert.throws(
    () => engine.applyNonStreamResponse(result, transformed.plan),
    (error: unknown) => (
      error instanceof ToolCallingResponseError
      && error.code === 'invalid_arguments'
      && error.repairable
      && error.toolName === 'default_api:read_file'
      && error.diagnostics?.parserFormat === 'managed_xml'
    ),
  )
})

test('tool response validation accepts arguments that fully match the declared schema', () => {
  const engine = new ToolCallingEngine()
  const transformed = engine.transformRequest({
    request: request({ tools: [strictDecisionTool], tool_choice: 'required' }),
    provider,
    actualModel: 'deepseek-chat',
  })
  const result: any = {
    choices: [{
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: 'call_wait',
          type: 'function',
          function: {
            name: 'signal_wait',
            arguments: JSON.stringify({
              pair: 'MSFT/USDT:USDT',
              confidence_score: 61,
              cancel_pending_trigger: false,
              lean_direction: 'neutral',
              reason: 'Evidence is stale',
            }),
          },
        }],
      },
      finish_reason: 'tool_calls',
    }],
  }

  assert.doesNotThrow(() => engine.applyNonStreamResponse(result, transformed.plan))
})

test('tool response validation rejects missing, mistyped, enum, and extra arguments', () => {
  const engine = new ToolCallingEngine()
  const transformed = engine.transformRequest({
    request: request({ tools: [strictDecisionTool], tool_choice: 'required' }),
    provider,
    actualModel: 'deepseek-chat',
  })
  const result: any = {
    choices: [{
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: 'call_wait_invalid',
          type: 'function',
          function: {
            name: 'signal_wait',
            arguments: JSON.stringify({
              confidence_score: '61',
              cancel_pending_trigger: 'false',
              lean_direction: 'sideways',
              reason: '',
              unexpected: true,
            }),
          },
        }],
      },
      finish_reason: 'tool_calls',
    }],
  }

  assert.throws(
    () => engine.applyNonStreamResponse(result, transformed.plan),
    (error: unknown) => (
      error instanceof ToolCallingResponseError
      && error.status === 502
      && /invalid tool arguments/.test(error.message)
      && /pair/.test(error.message)
    ),
  )
})

test('schema type failures retain exact JSON Pointer, expected type, actual type, and rejected arguments', () => {
  const ladderTool = {
    type: 'function' as const,
    function: {
      name: 'signal_entry_short',
      parameters: {
        type: 'object',
        properties: {
          pair: { type: 'string' },
          take_profit_ladder: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                pct: { type: 'number' },
                close_pct: { type: 'number' },
              },
              required: ['pct', 'close_pct'],
            },
          },
        },
        required: ['pair', 'take_profit_ladder'],
      },
    },
  }
  const engine = new ToolCallingEngine({ diagnosticsEnabled: true })
  const transformed = engine.transformRequest({
    request: request({ tools: [ladderTool], tool_choice: 'required' }),
    provider,
    actualModel: 'glm-5.2',
  })
  const rejectedArguments = JSON.stringify({
    pair: 'SKHYNIX/USDT:USDT',
    take_profit_ladder: '{"pct":0.015},{"pct":0.03}',
  })
  const result: any = {
    choices: [{
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: 'call_short',
          type: 'function',
          function: { name: 'signal_entry_short', arguments: rejectedArguments },
        }],
      },
      finish_reason: 'tool_calls',
    }],
  }

  assert.throws(
    () => engine.applyNonStreamResponse(result, transformed.plan),
    (error: unknown) => {
      if (!(error instanceof ToolCallingResponseError)) return false
      assert.deepEqual(error.validationIssues, [{
        jsonPointer: '/take_profit_ladder',
        keyword: 'type',
        message: 'must be array',
        expected: 'array',
        actualType: 'string',
      }])
      assert.equal(error.rejectedArguments, rejectedArguments)
      assert.match(error.message, /expected array, actual string/)
      assert.deepEqual(error.diagnostics?.schemaValidationIssues, error.validationIssues)
      return true
    },
  )
})

test('tool response validation rejects leaked managed protocol markers', () => {
  const engine = new ToolCallingEngine()
  const transformed = engine.transformRequest({
    request: request({ tools: [strictDecisionTool], tool_choice: 'required' }),
    provider,
    actualModel: 'deepseek-chat',
  })
  const result: any = {
    choices: [{
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: 'call_wait_leaked',
          type: 'function',
          function: {
            name: 'signal_wait',
            arguments: JSON.stringify({
              pair: 'MSFT/USDT:USDT',
              confidence_score: 61,
              cancel_pending_trigger: false,
              lean_direction: 'neutral',
              reason: 'stale </|CHAT2API|parameter> evidence',
            }),
          },
        }],
      },
      finish_reason: 'tool_calls',
    }],
  }

  assert.throws(
    () => engine.applyNonStreamResponse(result, transformed.plan),
    /arguments contain internal protocol markers/,
  )
})

test('tool response validation rejects leaked standard XML parameter markers', () => {
  const engine = new ToolCallingEngine()
  const transformed = engine.transformRequest({
    request: request({ tools: [strictDecisionTool], tool_choice: 'required' }),
    provider,
    actualModel: 'deepseek-chat',
  })
  const result: any = {
    choices: [{
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: 'call_wait_leaked_xml',
          type: 'function',
          function: {
            name: 'signal_wait',
            arguments: JSON.stringify({
              pair: 'MSFT/USDT:USDT',
              confidence_score: 61,
              cancel_pending_trigger: false,
              lean_direction: 'neutral',
              reason: 'stale </parameter> evidence',
            }),
          },
        }],
      },
      finish_reason: 'tool_calls',
    }],
  }

  assert.throws(
    () => engine.applyNonStreamResponse(result, transformed.plan),
    /arguments contain internal protocol markers/,
  )
})

test('diagnostics mode reports protocol, fences, redacted raw output, parsed arguments, and schema errors', () => {
  const engine = new ToolCallingEngine({ diagnosticsEnabled: true })
  const transformed = engine.transformRequest({
    request: request({ tools: [strictDecisionTool], tool_choice: 'required' }),
    provider,
    actualModel: 'deepseek-chat',
  })
  const result: any = {
    choices: [{
      message: {
        role: 'assistant',
        content: '```xml\n<tool_calls><invoke name="signal_wait"><arguments>{"pair":"MSFT/USDT:USDT","api_key":"do-not-log"}</arguments></invoke></tool_calls>\n```',
      },
      finish_reason: 'stop',
    }],
  }

  assert.throws(
    () => engine.applyNonStreamResponse(result, transformed.plan),
    (error: unknown) => {
      if (!(error instanceof ToolCallingResponseError)) return false
      assert.equal(error.diagnostics?.parserFormat, 'managed_xml')
      assert.equal(error.diagnostics?.fencedBlockDetected, true)
      assert.match(error.diagnostics?.rawContentPreview || '', /\[REDACTED\]/)
      assert.equal(error.diagnostics?.rawContentPreview?.includes('do-not-log'), false)
      assert.equal(error.diagnostics?.parsedArgumentsPreview?.[0].name, 'signal_wait')
      assert.ok((error.diagnostics?.schemaValidationErrors?.length ?? 0) > 0)
      return true
    },
  )
})

test('reasoning content is never parsed into function arguments', () => {
  const engine = new ToolCallingEngine()
  const transformed = engine.transformRequest({
    request: request({ tools: [strictDecisionTool], tool_choice: 'required' }),
    provider,
    actualModel: 'deepseek-chat',
  })
  const args = {
    pair: 'MSFT/USDT:USDT',
    confidence_score: 61,
    cancel_pending_trigger: false,
    lean_direction: 'neutral',
    reason: 'Evidence is stale',
  }
  const result: any = {
    choices: [{
      message: {
        role: 'assistant',
        reasoning_content: '<tool_calls><invoke name="signal_wait">draft</invoke></tool_calls>',
        content: `<tool_calls><invoke name="signal_wait">${JSON.stringify(args)}</invoke></tool_calls>`,
      },
      finish_reason: 'stop',
    }],
  }

  engine.applyNonStreamResponse(result, transformed.plan)

  const argumentsText = result.choices[0].message.tool_calls[0].function.arguments
  assert.deepEqual(JSON.parse(argumentsText), args)
  assert.equal(argumentsText.includes('draft'), false)
})

test('invalid client tool schemas fail with HTTP 400 semantics before forwarding', () => {
  const engine = new ToolCallingEngine()

  assert.throws(
    () => engine.transformRequest({
      request: request({
        tools: [{
          type: 'function',
          function: {
            name: 'broken_schema',
            parameters: { type: 'not-a-json-schema-type' },
          },
        }],
      }),
      provider,
      actualModel: 'deepseek-chat',
    }),
    (error: unknown) => error instanceof ToolCallingRequestError && error.status === 400,
  )
})

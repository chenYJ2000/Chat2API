import test from 'node:test'
import assert from 'node:assert/strict'

import { StreamHandler } from '../../src/main/proxy/stream.ts'

async function collect(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: string[] = []
  for await (const chunk of stream) chunks.push(String(chunk))
  return chunks.join('')
}

test('concurrent generic streams keep independent partial SSE buffers', async () => {
  const handler = new StreamHandler()
  const first = handler.createTransformStream('model-a', 'response-a')
  const second = handler.createTransformStream('model-b', 'response-b')
  const firstOutput = collect(first)
  const secondOutput = collect(second)

  first.write('data: {"choices":[{"delta":{"content":"A')
  second.end('data: {"choices":[{"delta":{"content":"B"}}]}\n\ndata: [DONE]\n\n')
  first.end('"}}]}\n\ndata: [DONE]\n\n')

  const [a, b] = await Promise.all([firstOutput, secondOutput])
  assert.match(a, /"content":"A"/)
  assert.doesNotMatch(a, /"content":"B"/)
  assert.match(b, /"content":"B"/)
  assert.doesNotMatch(b, /"content":"A"/)
})

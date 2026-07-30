import test from 'node:test'
import assert from 'node:assert/strict'

import { isReasoningEnabled } from '../../src/main/proxy/utils/reasoning.ts'

test('reasoning helper treats explicit disabled aliases as false', () => {
  for (const value of [undefined, null, false, 'none', 'off', 'disabled', 'false', ' OFF ']) {
    assert.equal(isReasoningEnabled(value), false)
  }
})

test('reasoning helper enables supported truthy efforts', () => {
  for (const value of [true, 'minimal', 'low', 'enabled', 'medium', 'high', 'xhigh']) {
    assert.equal(isReasoningEnabled(value), true)
  }
})

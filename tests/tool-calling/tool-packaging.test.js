const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const root = join(__dirname, '..', '..')

test('tool schema validation dependencies are bundled into the Electron main process', () => {
  const source = readFileSync(join(root, 'electron.vite.config.ts'), 'utf8')
  const match = source.match(/externalizeDepsPlugin\(\{[\s\S]*?exclude:\s*\[([\s\S]*?)\]/)
  const excludeBlock = match?.[1] ?? ''

  assert.ok(excludeBlock.includes("'ajv'"))
  assert.ok(excludeBlock.includes("'ajv-formats'"))
})

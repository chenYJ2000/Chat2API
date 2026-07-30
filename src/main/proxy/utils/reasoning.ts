const DISABLED_REASONING_VALUES = new Set(['none', 'off', 'disabled', 'false'])

export function isReasoningEnabled(value: unknown): boolean {
  if (value === undefined || value === null || value === false) return false
  if (value === true) return true
  return !DISABLED_REASONING_VALUES.has(String(value).trim().toLowerCase())
}

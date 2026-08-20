const FALLBACK_SENDER_USER_NAME = 'Someone'
const MAX_SENDER_USER_NAME_LENGTH = 50

export function normalizeMqttSenderUserName(value: unknown): string {
  if (typeof value !== 'string') return FALLBACK_SENDER_USER_NAME

  const normalized = value.trim()
  if (!normalized) return FALLBACK_SENDER_USER_NAME

  return normalized.slice(0, MAX_SENDER_USER_NAME_LENGTH)
}

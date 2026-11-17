/**
 * PaaS route prefix rule (docs/paas-api.md §3), kept consistent with the
 * platform: 3 to 63 lowercase letters, digits or "-", not starting or ending
 * with "-". The public hostname is `<prefix>.<route_domain>`.
 */
export const ROUTE_PREFIX_RE = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/

/** The bulk route call takes at most this many routes. */
export const MAX_ROUTES_PER_BATCH = 10

/** What the user typed, the way the platform compares it. */
export function normalizePrefix(raw: string): string {
  return raw.trim().toLowerCase()
}

/** A human-readable error for an invalid (normalized) prefix, or `null` when it is valid. */
export function routePrefixError(prefix: string): string | null {
  if (!prefix) return '請輸入子網域前綴'
  if (prefix.length < 3 || prefix.length > 63) return '前綴長度需為 3 到 63 個字元'
  if (!ROUTE_PREFIX_RE.test(prefix)) {
    return '前綴只能用小寫英文、數字與「-」，且開頭與結尾不可為「-」'
  }
  return null
}

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
  if (!prefix) return 'Enter a subdomain prefix'
  if (prefix.length < 3 || prefix.length > 63) return 'A prefix must be 3 to 63 characters long'
  if (!ROUTE_PREFIX_RE.test(prefix)) {
    return 'A prefix can only use lowercase letters, digits and "-", and cannot start or end with "-"'
  }
  return null
}

import type { Route } from '@/types'

function hostnameKey(route: Route): string {
  return route.hostname.trim().toLowerCase()
}

/**
 * Append routes to a route list, skipping hostnames that are already there
 * (case-insensitive). Completely blank rows of the current list are dropped,
 * so a "+ Add route" row left empty does not block saving.
 */
export function appendRoutes(current: Route[], added: Route[]): Route[] {
  const result = current.filter((route) => route.hostname.trim() || route.service.trim())
  const seen = new Set(result.map(hostnameKey).filter(Boolean))
  for (const route of added) {
    const key = hostnameKey(route)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push({ ...route })
  }
  return result
}

/** `hostname → service` lines, e.g. to paste into the Cloudflare dashboard. */
export function routeLines(routes: Route[]): string {
  return routes
    .filter((route) => route.hostname.trim() && route.service.trim())
    .map((route) => `${route.hostname.trim()} → ${route.service.trim()}`)
    .join('\n')
}

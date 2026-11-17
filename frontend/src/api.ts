import { getCsrfToken } from '@/composables/useCsrf'
import type {
  PaasPrefixCheck,
  PaasRouteDeleted,
  PaasRouteRequest,
  PaasRoutesCreated,
  WorkspaceInfo,
} from '@/types'

/**
 * fetch wrapper for the backend API: JSON in and out, the CSRF header on
 * every state-changing request, and readable errors (FastAPI 422 detail
 * arrays become "field: message"; a `{message, errors}` detail keeps its
 * per-item reasons in `ApiError.errors`).
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The `errors` map of a `{message, errors: {key: reason}}` detail, or {}. */
function detailErrors(detail: unknown): Record<string, string> {
  if (!isRecord(detail) || !isRecord(detail.errors)) return {}
  return Object.fromEntries(
    Object.entries(detail.errors).map(([key, reason]) => [
      key,
      typeof reason === 'string' ? reason : JSON.stringify(reason),
    ])
  )
}

function formatDetail(detail: unknown): string {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        const loc = Array.isArray(d?.loc) ? d.loc.slice(1).join('.') : ''
        return loc ? `${loc}: ${d?.msg ?? ''}` : String(d?.msg ?? '')
      })
      .filter(Boolean)
      .join('; ')
  }
  if (isRecord(detail)) {
    if (typeof detail.message === 'string' && detail.message) return detail.message
    const reasons = Object.entries(detailErrors(detail)).map(([key, reason]) => `${key}: ${reason}`)
    if (reasons.length) return reasons.join('; ')
  }
  return JSON.stringify(detail)
}

/** A non-2xx answer from the backend. Still an `Error`, so `cause.message` keeps working. */
export class ApiError extends Error {
  readonly status: number
  readonly detail: unknown
  /** Per-item reasons (e.g. route prefix → reason) when the detail carried them. */
  readonly errors: Record<string, string>

  constructor(status: number, detail: unknown) {
    super((detail === undefined ? '' : formatDetail(detail)) || `HTTP ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
    this.errors = detailErrors(detail)
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (method !== 'GET' && method !== 'HEAD') headers['x-csrftoken'] = getCsrfToken()
  const res = await fetch(path, { ...init, headers: { ...headers, ...(init.headers as object) } })
  if (!res.ok) {
    let detail: unknown
    try {
      const body = await res.json()
      detail = body?.detail
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail)
  }
  return res.json() as Promise<T>
}

export function wsUrl(path: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${path}`
}

/* ---- PaaS edition (docs/paas-api.md §1) ---- */

/** The services that run next to this WebGUI in the same workspace. */
export function getWorkspace(): Promise<WorkspaceInfo> {
  return api<WorkspaceInfo>('/api/workspace')
}

/** Whether a PaaS route prefix is free (format, platform database and Cloudflare DNS). */
export function checkRoutePrefix(prefix: string): Promise<PaasPrefixCheck> {
  return api<PaasPrefixCheck>(`/api/paas/routes/check?prefix=${encodeURIComponent(prefix)}`)
}

/** Add several public routes to a Security Access; all of them are created or none. */
export function createAccessRoutes(accessId: number, routes: PaasRouteRequest[]): Promise<PaasRoutesCreated> {
  return api<PaasRoutesCreated>(`/api/paas/accesses/${accessId}/routes`, {
    method: 'POST',
    body: JSON.stringify({ routes }),
  })
}

/** Remove one route from a Security Access. */
export function deleteAccessRoute(accessId: number, routeId: number): Promise<PaasRouteDeleted> {
  return api<PaasRouteDeleted>(`/api/paas/accesses/${accessId}/routes/${encodeURIComponent(String(routeId))}`, {
    method: 'DELETE',
  })
}

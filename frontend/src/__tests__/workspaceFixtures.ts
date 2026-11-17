import { vi } from 'vitest'
import type { WorkspaceEndpoint, WorkspaceInfo, WorkspaceService } from '@/types'

/** Test data shaped like GET /api/workspace (docs/paas-api.md §1). */

export function endpoint(overrides: Partial<WorkspaceEndpoint> = {}): WorkspaceEndpoint {
  return {
    service: 'svc-11111111-pi-agent',
    port: 8080,
    port_name: 'http',
    protocol: 'TCP',
    kind: 'http',
    url: 'http://svc-11111111-pi-agent:8080',
    primary: true,
    ...overrides,
  }
}

export function service(overrides: Partial<WorkspaceService> = {}): WorkspaceService {
  return {
    release: 'svc-11111111',
    chart: 'pi-agent',
    display_name: 'pi-1',
    template_slug: 'pi-agent',
    state: 'running',
    ready: true,
    suggested_prefix: 'pi-1',
    endpoints: [endpoint()],
    ...overrides,
  }
}

/** Ready, with an http primary port and an extra ssh port. */
export const PI = service({
  endpoints: [
    endpoint(),
    endpoint({ port: 22, port_name: 'ssh', kind: 'tcp', url: 'ssh://svc-11111111-pi-agent:22', primary: false }),
  ],
})

/** No platform name, not ready. */
export const OMNIGENT = service({
  release: 'svc-22222222',
  chart: 'omnigent',
  display_name: null,
  template_slug: null,
  state: null,
  ready: false,
  suggested_prefix: 'omnigent-1',
  endpoints: [endpoint({ service: 'svc-22222222-omnigent', port: 8000, port_name: null, url: 'http://svc-22222222-omnigent:8000' })],
})

/** Only a TCP port; readiness unknown. */
export const CACHE = service({
  release: 'svc-33333333',
  chart: 'redis',
  display_name: 'cache',
  template_slug: 'redis',
  state: 'running',
  ready: null,
  suggested_prefix: 'cache',
  endpoints: [
    endpoint({ service: 'svc-33333333-redis', port: 6379, port_name: 'redis', kind: 'tcp', url: 'tcp://svc-33333333-redis:6379' }),
  ],
})

export function workspaceInfo(services: WorkspaceService[] = [PI, OMNIGENT, CACHE]): WorkspaceInfo {
  return {
    available: true,
    reason: null,
    namespace: 'paas-ws-0a1b2c3d',
    self_release: 'svc-1a2b3c4d',
    workspace: { id: 4, name: 'my-workspace' },
    services,
  }
}

/** The subset of a fetch Response the api() helper reads. */
export function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

/** Put a writeText spy on navigator.clipboard (jsdom has none); returns it. */
export function stubClipboard() {
  const writeText = vi.fn(async (_text: string) => {})
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  return writeText
}

export function unstubClipboard() {
  Reflect.deleteProperty(navigator, 'clipboard')
}

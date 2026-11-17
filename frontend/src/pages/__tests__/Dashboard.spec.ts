import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import Dashboard from '../Dashboard.vue'
import { PI, jsonResponse, workspaceInfo } from '@/__tests__/workspaceFixtures'
import type { HealthStatus, TunnelConfig, WorkspaceInfo } from '@/types'

const HEALTH: HealthStatus = {
  status: 'ok',
  version: '1.3.1',
  process_running: true,
  stopped_by_operator: false,
  tunnel: { status: 'running', ready_connections: 4, metrics_reachable: true },
  credentials_error: null,
}

const APPORO_LINKED: TunnelConfig = {
  mode: 'token', tunnel_name: '', routes: [], catch_all_service: '', post_quantum: false,
  log_level: 'info', run_parameters: [], no_tls_verify: true, tunnel_token_masked: '',
  tunnel_token_set: true, tunnel_token_managed_by_paas: true,
}

function backend(workspace: WorkspaceInfo) {
  return vi.fn(async (url: string) => {
    if (url === '/api/health') return jsonResponse(HEALTH)
    if (url === '/api/config') return jsonResponse(APPORO_LINKED)
    if (url === '/api/workspace') return jsonResponse(workspace)
    throw new Error(`unexpected fetch ${url}`)
  })
}

async function mountDashboard(workspace: WorkspaceInfo) {
  vi.stubGlobal('fetch', backend(workspace))
  const wrapper = mount(Dashboard, {
    global: { plugins: [createPinia()], stubs: { RouterLink: { template: '<a><slot /></a>' } } },
  })
  await flushPromises()
  return wrapper
}

describe('Dashboard', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows the workspace line and a token managed by Apporo', async () => {
    const wrapper = await mountDashboard(workspaceInfo())
    expect(wrapper.get('[data-test="workspace-summary"]').text()).toBe(
      'Workspace namespace paas-ws-0a1b2c3d (my-workspace) · 3 other services in this workspace'
    )
    expect(wrapper.text()).toContain('Remote-managed tunnel: routes are managed in the Cloudflare dashboard or on Apporo')
    expect(wrapper.text()).toContain('Managed automatically by Apporo')
    expect(wrapper.text()).toContain('Tunnel is connected (4 edge connections)')
  })

  it('counts one service in the singular', async () => {
    const wrapper = await mountDashboard(workspaceInfo([PI]))
    expect(wrapper.get('[data-test="workspace-summary"]').text()).toContain('· 1 other service in this workspace')
  })

  it("shows the backend's reason when the workspace services cannot be listed", async () => {
    const wrapper = await mountDashboard({
      available: false,
      reason: 'Not running inside Kubernetes, so the workspace services cannot be listed.',
    })
    expect(wrapper.get('[data-test="workspace-summary"]').text()).toBe(
      'Workspace services unavailable: Not running inside Kubernetes, so the workspace services cannot be listed.'
    )
  })
})

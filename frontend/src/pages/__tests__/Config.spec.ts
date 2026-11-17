import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import Config from '../Config.vue'
import type { TunnelConfig } from '@/types'
import { jsonResponse, stubClipboard, unstubClipboard, workspaceInfo } from '@/__tests__/workspaceFixtures'

function baseConfig(overrides: Partial<TunnelConfig> = {}): TunnelConfig {
  return {
    mode: 'local', tunnel_name: '', routes: [], catch_all_service: '', post_quantum: false,
    log_level: 'info', run_parameters: [], no_tls_verify: true, tunnel_token_masked: '',
    tunnel_token_set: false, tunnel_token_managed_by_paas: false, ...overrides,
  }
}

function backend(config: TunnelConfig) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/config') return { ok: true, json: async () => config }
    if (url.startsWith('/api/config?restart=')) return { ok: true, json: async () => ({ ...config, ...JSON.parse(String(init?.body)) }) }
    if (url === '/api/health') return { ok: true, json: async () => ({ status: 'ok', tunnel: { status: 'stopped' } }) }
    throw new Error(`unexpected fetch ${url}`)
  })
}

function mountConfig() {
  return mount(Config, { global: { plugins: [createPinia()], stubs: { RouterLink: { template: '<a><slot /></a>' } } } })
}

function lastPut(fetchMock: ReturnType<typeof backend>) {
  const call = fetchMock.mock.calls.find(([url]) => String(url).startsWith('/api/config?restart='))!
  return { url: String(call[0]), body: JSON.parse(String(call[1]!.body)) }
}

describe('Config', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    document.cookie = 'apporo_csrftoken=tok123'
  })
  afterEach(() => vi.unstubAllGlobals())

  it('sends run parameters as a list and Save & Apply as ?restart=true', async () => {
    const fetchMock = backend(baseConfig({ run_parameters: ['--protocol=http2'] }))
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mountConfig()
    await flushPromises()
    await wrapper.find('textarea').setValue('--protocol=http2\n\n--region=us')
    await wrapper.findAll('button').find((b) => b.text().includes('Save & Apply'))!.trigger('click')
    await flushPromises()
    const put = lastPut(fetchMock)
    expect(put.url).toBe('/api/config?restart=true')
    expect(put.body.run_parameters).toEqual(['--protocol=http2', '--region=us'])
    expect('tunnel_token' in put.body).toBe(false) // omitted = keep the stored token
  })

  it('blocks saving a run parameter outside the allow-list', async () => {
    vi.stubGlobal('fetch', backend(baseConfig()))
    const wrapper = mountConfig()
    await flushPromises()
    await wrapper.find('textarea').setValue('--token=abc')
    expect(wrapper.text()).toContain('is not an allowed run parameter')
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
  })

  it('removing the token sends an empty string and switches to local', async () => {
    const fetchMock = backend(baseConfig({ mode: 'token', tunnel_token_set: true, tunnel_token_masked: '********' }))
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mountConfig()
    await flushPromises()
    await wrapper.findAll('button').find((b) => b.text().includes('Remove the token'))!.trigger('click')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    const put = lastPut(fetchMock)
    expect(put.body.tunnel_token).toBe('')
    expect(put.body.mode).toBe('local')
  })

  it('an Apporo-managed token hides the token input and locks the mode', async () => {
    vi.stubGlobal('fetch', backend(baseConfig({ mode: 'token', tunnel_token_set: true, tunnel_token_managed_by_paas: true })))
    const wrapper = mountConfig()
    await flushPromises()
    expect(wrapper.text()).toContain('This credential is managed automatically by Apporo')
    expect(wrapper.text()).toContain('release the binding on the Apporo Link page')
    expect(wrapper.find('select').attributes('disabled')).toBeDefined()
  })
})

describe('Config: workspace services', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    document.cookie = 'apporo_csrftoken=tok123'
    window.localStorage.clear()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    unstubClipboard()
  })

  function backendWithWorkspace(config: TunnelConfig) {
    const base = backend(config)
    return vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/workspace') return jsonResponse(workspaceInfo())
      return base(url, init)
    })
  }

  function routeInputs(wrapper: ReturnType<typeof mountConfig>, placeholder: string) {
    return wrapper.findAll(`input[placeholder="${placeholder}"]`).map((input) => (input.element as HTMLInputElement).value)
  }

  it('“Add from workspace” appends the picked services to the routes, and Save sends them', async () => {
    const old = { hostname: 'old.example.com', service: 'http://svc-old:80', disableChunkedEncoding: false }
    const fetchMock = backendWithWorkspace(baseConfig({ routes: [old] }))
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mountConfig()
    await flushPromises()
    expect(wrapper.find('[data-test="copy-routes"]').exists()).toBe(false) // local mode
    expect(wrapper.get('[data-test="add-from-workspace"]').text()).toBe('Add from workspace')

    await wrapper.get('[data-test="add-from-workspace"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-test="picker-domain"]').setValue('example.com')
    await wrapper.findAll('[data-test="picker-row"]')[0].get('[data-test="picker-select"]').setValue(true)
    await wrapper.get('[data-test="picker-submit"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-test="workspace-picker"]').exists()).toBe(false)
    expect(routeInputs(wrapper, 'app.example.com')).toEqual(['old.example.com', 'pi-1.example.com'])
    expect(routeInputs(wrapper, 'http://<service-name>:8080')).toEqual(['http://svc-old:80', 'http://svc-11111111-pi-agent:8080'])

    await wrapper.find('form').trigger('submit')
    await flushPromises()
    const put = fetchMock.mock.calls.find(([url]) => url.startsWith('/api/config?restart='))!
    expect(JSON.parse(String(put[1]!.body)).routes).toEqual([
      old,
      { hostname: 'pi-1.example.com', service: 'http://svc-11111111-pi-agent:8080', disableChunkedEncoding: false },
    ])
  })

  it('token mode keeps the dashboard note and copies hostname → service lines', async () => {
    vi.stubGlobal('fetch', backendWithWorkspace(baseConfig({
      mode: 'token',
      tunnel_token_set: true,
      tunnel_token_masked: '********',
      routes: [
        { hostname: 'a.example.com', service: 'http://svc-a:8080', disableChunkedEncoding: false },
        { hostname: 'b.example.com', service: 'http://svc-b:80', disableChunkedEncoding: false },
      ],
    })))
    const writeText = stubClipboard()
    const wrapper = mountConfig()
    await flushPromises()
    expect(wrapper.text()).toContain('In token mode, ingress routes are managed in the Cloudflare dashboard or on Apporo')
    expect(wrapper.get('[data-test="copy-routes"]').text()).toBe('Copy list')
    await wrapper.get('[data-test="copy-routes"]').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith('a.example.com → http://svc-a:8080\nb.example.com → http://svc-b:80')
    expect(wrapper.text()).toContain('Copied')
  })

  it('shows the list for manual copying when the browser refuses the clipboard', async () => {
    vi.stubGlobal('fetch', backendWithWorkspace(baseConfig({
      mode: 'token',
      tunnel_token_set: true,
      routes: [{ hostname: 'a.example.com', service: 'http://svc-a:8080', disableChunkedEncoding: false }],
    })))
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(async () => { throw new Error('denied') }) },
      configurable: true,
    })
    const wrapper = mountConfig()
    await flushPromises()
    await wrapper.get('[data-test="copy-routes"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Your browser blocked the copy. Select the text below and copy it manually.')
    const manual = wrapper.findAll('textarea').find((area) => (area.element as HTMLTextAreaElement).readOnly)!
    expect((manual.element as HTMLTextAreaElement).value).toBe('a.example.com → http://svc-a:8080')
  })

  it('no longer suggests localhost', async () => {
    vi.stubGlobal('fetch', backend(baseConfig()))
    const wrapper = mountConfig()
    await flushPromises()
    expect(wrapper.html()).not.toContain('localhost:')
  })
})

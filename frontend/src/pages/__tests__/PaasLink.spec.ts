import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import PaasLink from '../PaasLink.vue'
import { jsonResponse, stubClipboard, unstubClipboard, workspaceInfo } from '@/__tests__/workspaceFixtures'
import type { PaasBootstrap, PaasReview, PaasReviewRoute } from '@/types'

type Page = VueWrapper<InstanceType<typeof PaasLink>>

const BOOTSTRAP: PaasBootstrap = {
  authorized: true,
  portal_url: 'https://paas.example.com/woow#/workspaces',
  connection: null,
  release_pending: false,
  routes_write: true,
  route_domain: 'example.io',
}

const WEB_ROUTE: PaasReviewRoute = {
  id: 101,
  subdomain_prefix: 'web',
  hostname: 'web.example.io',
  service_url: 'http://svc-web:80',
  public: false,
  protected: true,
  awaiting_publication: false,
}

const PI_ROUTE: PaasReviewRoute = {
  id: 102,
  subdomain_prefix: 'pi-1',
  hostname: 'pi-1.example.io',
  service_url: 'http://svc-11111111-pi-agent:8080',
  public: true,
  protected: false,
  awaiting_publication: false,
}

function review(routes: PaasReviewRoute[]): PaasReview {
  return {
    ready: true,
    issues: [],
    public_routes: routes.filter((route) => route.public).map((route) => route.hostname),
    awaiting_publication: false,
    access: {
      id: 9,
      name: 'my-access',
      state: 'active',
      binding_state: 'unbound',
      subscription: { state: 'in_progress', plan_name: 'Basic' },
      routes,
    },
    portal_access_url: 'https://paas.example.com/woow#/workspaces/4/access/9?tab=access',
    portal_routes_url: 'https://paas.example.com/woow#/workspaces/4/access/9?tab=application',
  }
}

interface Reply {
  status: number
  body: unknown
}

interface BackendOptions {
  bootstrap?: Partial<PaasBootstrap>
  create?: Reply
  remove?: Reply
  connectionStatus?: unknown
}

function backend(options: BackendOptions = {}) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase()
    if (url === '/api/paas/bootstrap') return jsonResponse({ ...BOOTSTRAP, ...options.bootstrap })
    if (url === '/api/paas/workspaces') {
      return jsonResponse({
        workspaces: [
          { id: 3, name: 'other-workspace', portal_url: 'https://paas.example.com/woow#/workspaces/3' },
          { id: 4, name: 'my-workspace', portal_url: 'https://paas.example.com/woow#/workspaces/4' },
        ],
      })
    }
    if (url === '/api/workspace') return jsonResponse(workspaceInfo())
    if (url === '/api/paas/workspaces/4/accesses') return jsonResponse({ accesses: [{ id: 9, name: 'my-access', state: 'active' }] })
    if (url === '/api/paas/workspaces/3/accesses') return jsonResponse({ accesses: [{ id: 5, name: 'other-access', state: 'active' }] })
    if (url === '/api/paas/accesses/9/review') return jsonResponse(review([WEB_ROUTE]))
    if (url === '/api/paas/accesses/9/routes' && method === 'POST' && options.create) {
      return jsonResponse(options.create.body, options.create.status)
    }
    if (url === '/api/paas/accesses/9/routes/101' && method === 'DELETE' && options.remove) {
      return jsonResponse(options.remove.body, options.remove.status)
    }
    if (url.startsWith('/api/paas/connection/status') && options.connectionStatus) return jsonResponse(options.connectionStatus)
    throw new Error(`unexpected fetch ${method} ${url}`)
  })
}

async function mountPage(options: BackendOptions = {}) {
  const fetchMock = backend(options)
  vi.stubGlobal('fetch', fetchMock)
  const wrapper: Page = mount(PaasLink, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } })
  await flushPromises()
  return { wrapper, fetchMock }
}

async function chooseAccess(wrapper: Page) {
  await wrapper.get('[data-test="access-select"]').setValue('9')
  await flushPromises()
}

function call(fetchMock: ReturnType<typeof backend>, method: string, url: string) {
  return fetchMock.mock.calls.find(([u, init]) => u === url && (init?.method ?? 'GET').toUpperCase() === method)
}

function reviewHostnames(wrapper: Page) {
  return wrapper.findAll('[data-test="review-route"]').map((item) => item.findAll('span')[1].text())
}

enableAutoUnmount(afterEach)

describe('PaasLink (PaaS edition)', () => {
  beforeEach(() => {
    document.cookie = 'csrftoken=tok123'
    window.localStorage.clear()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    unstubClipboard()
  })

  it('uses the portal URL from bootstrap and preselects the workspace this WebGUI runs in', async () => {
    const { wrapper, fetchMock } = await mountPage()
    expect(wrapper.get('[data-test="portal-link"]').attributes('href')).toBe(BOOTSTRAP.portal_url)
    expect(wrapper.html()).not.toContain('aiot.woowtech.io')

    const workspaceSelect = wrapper.get('[data-test="workspace-select"]')
    expect((workspaceSelect.element as HTMLSelectElement).value).toBe('4')
    expect(workspaceSelect.text()).toContain('my-workspace（此工作區）')
    expect(call(fetchMock, 'GET', '/api/paas/workspaces/4/accesses')).toBeTruthy()
    expect(wrapper.find('[data-test="other-workspace-note"]').exists()).toBe(false)

    // Another workspace stays possible, with a note.
    await workspaceSelect.setValue('3')
    await flushPromises()
    expect(call(fetchMock, 'GET', '/api/paas/workspaces/3/accesses')).toBeTruthy()
    expect(wrapper.get('[data-test="other-workspace-note"]').text()).toContain('只能透過「my-workspace」的安全存取服務')
  })

  it('offers the picker only when the platform allows route writes', async () => {
    const readOnly = await mountPage({ bootstrap: { routes_write: false } })
    await chooseAccess(readOnly.wrapper)
    const section = readOnly.wrapper.get('[data-test="bulk-section"]')
    expect(section.find('[data-test="open-picker"]').exists()).toBe(false)
    expect(readOnly.wrapper.find('[data-test="remove-route"]').exists()).toBe(false)
    expect(section.text()).toContain('請到 PaaS 的「應用路由」逐一新增')
    const urls = section.get('[data-test="service-urls"]').text()
    expect(urls).toContain('http://svc-11111111-pi-agent:8080')
    expect(urls).toContain('http://svc-22222222-omnigent:8000')

    const writeText = stubClipboard()
    await section.get('[data-test="copy-service-urls"]').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith(
      'pi-1 → http://svc-11111111-pi-agent:8080\n' +
        'omnigent · svc-22222222 → http://svc-22222222-omnigent:8000\n' +
        'cache → tcp://svc-33333333-redis:6379'
    )
    readOnly.wrapper.unmount()

    const writable = await mountPage()
    expect(writable.wrapper.find('[data-test="open-picker"]').exists()).toBe(false) // nothing reviewed yet
    await chooseAccess(writable.wrapper)
    expect(writable.wrapper.find('[data-test="service-urls"]').exists()).toBe(false)
    await writable.wrapper.get('[data-test="open-picker"]').trigger('click')
    await flushPromises()
    expect(writable.wrapper.find('[data-test="workspace-picker"]').exists()).toBe(true)
  })

  it('creates the picked services in one call and replaces the review', async () => {
    const { wrapper, fetchMock } = await mountPage({
      create: {
        status: 200,
        body: {
          created: [{ id: 102, subdomain_prefix: 'pi-1', hostname: 'pi-1.example.io', service_url: 'http://svc-11111111-pi-agent:8080' }],
          review: review([WEB_ROUTE, PI_ROUTE]),
        },
      },
    })
    await chooseAccess(wrapper)
    expect(reviewHostnames(wrapper)).toEqual(['web.example.io'])
    await wrapper.get('[data-test="open-picker"]').trigger('click')
    await flushPromises()

    const pickerRows = wrapper.findAll('[data-test="picker-row"]')
    await pickerRows[0].get('[data-test="picker-select"]').setValue(true)
    await wrapper.get('[data-test="picker-submit"]').trigger('click')
    await flushPromises()

    const post = call(fetchMock, 'POST', '/api/paas/accesses/9/routes')!
    expect(JSON.parse(String(post[1]!.body))).toEqual({
      routes: [{ subdomain_prefix: 'pi-1', service_url: 'http://svc-11111111-pi-agent:8080' }],
    })
    expect((post[1]!.headers as Record<string, string>)['x-csrftoken']).toBe('tok123')
    expect(wrapper.find('[data-test="workspace-picker"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="bulk-created"]').text()).toContain('pi-1.example.io')
    expect(reviewHostnames(wrapper)).toEqual(['web.example.io', 'pi-1.example.io'])
    // The page did not need to reload the review: the POST answer carried it.
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/paas/accesses/9/review')).toHaveLength(1)
  })

  it('passes the prefixes the access already uses to the picker', async () => {
    const { wrapper } = await mountPage()
    await chooseAccess(wrapper)
    await wrapper.get('[data-test="open-picker"]').trigger('click')
    await flushPromises()
    const first = wrapper.findAll('[data-test="picker-row"]')[0]
    await first.get('[data-test="picker-field"]').setValue('web')
    await first.get('[data-test="picker-select"]').setValue(true)
    expect(first.get('[data-test="picker-error"]').text()).toContain('已有相同前綴')
    expect(first.get('[data-test="picker-preview"]').text()).toContain('web.example.io')
  })

  it('shows the 409 message and the per-prefix reasons, and keeps the picker open', async () => {
    const { wrapper } = await mountPage({
      create: {
        status: 409,
        body: { detail: { message: '有前綴無法使用', errors: { 'pi-1': '已被其他服務使用' } } },
      },
    })
    await chooseAccess(wrapper)
    await wrapper.get('[data-test="open-picker"]').trigger('click')
    await flushPromises()
    await wrapper.findAll('[data-test="picker-row"]')[0].get('[data-test="picker-select"]').setValue(true)
    await wrapper.get('[data-test="picker-submit"]').trigger('click')
    await flushPromises()

    const bulkError = wrapper.get('[data-test="bulk-error"]').text()
    expect(bulkError).toContain('有前綴無法使用')
    expect(bulkError).toContain('pi-1')
    expect(bulkError).toContain('已被其他服務使用')
    expect(bulkError).toContain('這一批路由都沒有建立')
    expect(wrapper.find('[data-test="workspace-picker"]').exists()).toBe(true)
    expect(wrapper.get('[data-test="picker-server-error"]').text()).toContain('有前綴無法使用')
    expect(wrapper.get('[data-test="picker-rejected"]').text()).toContain('已被其他服務使用')
    expect(reviewHostnames(wrapper)).toEqual(['web.example.io'])
  })

  it('removes a route after an inline confirmation and replaces the review', async () => {
    const { wrapper, fetchMock } = await mountPage({ remove: { status: 200, body: { deleted: true, review: review([]) } } })
    await chooseAccess(wrapper)

    await wrapper.get('[data-test="remove-route"]').trigger('click')
    await wrapper.get('[data-test="cancel-remove-route"]').trigger('click')
    expect(wrapper.find('[data-test="confirm-remove-route"]').exists()).toBe(false)
    expect(call(fetchMock, 'DELETE', '/api/paas/accesses/9/routes/101')).toBeUndefined()

    await wrapper.get('[data-test="remove-route"]').trigger('click')
    expect(call(fetchMock, 'DELETE', '/api/paas/accesses/9/routes/101')).toBeUndefined()
    await wrapper.get('[data-test="confirm-remove-route"]').trigger('click')
    await flushPromises()

    const del = call(fetchMock, 'DELETE', '/api/paas/accesses/9/routes/101')!
    expect((del[1]!.headers as Record<string, string>)['x-csrftoken']).toBe('tok123')
    expect(reviewHostnames(wrapper)).toEqual([])
    expect(wrapper.text()).toContain('已移除 web.example.io。')
  })

  it('keeps the review and explains when a route cannot be removed', async () => {
    const { wrapper } = await mountPage({ remove: { status: 403, body: { detail: '需要此工作區的管理權限' } } })
    await chooseAccess(wrapper)
    await wrapper.get('[data-test="remove-route"]').trigger('click')
    await wrapper.get('[data-test="confirm-remove-route"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('無法移除 web.example.io：需要此工作區的管理權限')
    expect(reviewHostnames(wrapper)).toEqual(['web.example.io'])
  })

  it('labels a public route that shows an Access login as a mismatch', async () => {
    const { wrapper } = await mountPage({
      bootstrap: { connection: { access_id: 9, workspace_id: 4, name: 'my-access' } },
      connectionStatus: {
        connected: true,
        subscription: { state: 'in_progress' },
        access_ready: false,
        service_ready: true,
        public_routes: ['pi-1.example.io'],
        awaiting_publication: false,
        issues: [],
        tunnel_status: 'running',
        checked_at: 1700000000,
        external: [
          { hostname: 'pi-1.example.io', status: 'login_required' },
          { hostname: 'web.example.io', status: 'login_required' },
        ],
      },
    })
    const results = wrapper.findAll('[data-test="external-result"]')
    expect(results[0].text()).toContain('外部出現 Access 登入，與 PaaS 的公開設定不同')
    expect(results[0].get('p.text-xs').classes()).toContain('text-amber-700')
    expect(results[1].text()).toContain('匿名訪問進入 Cloudflare Access 登入流程')
    expect(results[1].get('p.text-xs').classes()).toContain('text-emerald-700')
  })

  it('tells users to enter workspace service URLs, not localhost', async () => {
    const { wrapper } = await mountPage()
    expect(wrapper.text()).not.toContain('http://localhost')
    expect(wrapper.text()).toContain('http://<服務名稱>:8080')
  })
})

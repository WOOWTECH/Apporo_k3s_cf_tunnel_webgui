import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import WorkspaceServicePicker from '../WorkspaceServicePicker.vue'
import { CACHE, PI, endpoint, jsonResponse, service, workspaceInfo } from '@/__tests__/workspaceFixtures'
import type { PaasPrefixCheck, RouteBatchError, WorkspaceInfo } from '@/types'

type Picker = VueWrapper<InstanceType<typeof WorkspaceServicePicker>>

function backend(body: WorkspaceInfo, checks: Record<string, PaasPrefixCheck> = {}) {
  return vi.fn(async (url: string, _init?: RequestInit) => {
    if (url === '/api/workspace') return jsonResponse(body)
    if (url.startsWith('/api/paas/routes/check?prefix=')) {
      const prefix = decodeURIComponent(url.slice(url.indexOf('=') + 1))
      return jsonResponse(checks[prefix] ?? { prefix, available: true, reason: '' })
    }
    throw new Error(`unexpected fetch ${url}`)
  })
}

async function mountPicker(
  props: InstanceType<typeof WorkspaceServicePicker>['$props'],
  body: WorkspaceInfo = workspaceInfo(),
  checks: Record<string, PaasPrefixCheck> = {}
) {
  const fetchMock = backend(body, checks)
  vi.stubGlobal('fetch', fetchMock)
  const wrapper: Picker = mount(WorkspaceServicePicker, { props })
  await flushPromises()
  return { wrapper, fetchMock }
}

function row(wrapper: Picker, name: string) {
  const found = wrapper
    .findAll('[data-test="picker-row"]')
    .find((item) => item.get('[data-test="picker-service-name"]').text() === name)
  if (!found) throw new Error(`no row ${name}`)
  return found
}

async function select(wrapper: Picker, name: string) {
  await row(wrapper, name).get('[data-test="picker-select"]').setValue(true)
}

function submitButton(wrapper: Picker) {
  return wrapper.get('[data-test="picker-submit"]')
}

function submitted(wrapper: Picker) {
  const events = wrapper.emitted('submit')
  return events ? events[events.length - 1][0] : undefined
}

enableAutoUnmount(afterEach)

describe('WorkspaceServicePicker', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('shows only the reason when the workspace is not available', async () => {
    const { wrapper } = await mountPicker(
      { mode: 'paas', routeDomain: 'example.io' },
      { available: false, reason: '這個 WebGUI 沒有讀取 Kubernetes 服務的權限' }
    )
    expect(wrapper.get('[data-test="picker-unavailable"]').text()).toBe('這個 WebGUI 沒有讀取 Kubernetes 服務的權限')
    expect(wrapper.find('[data-test="picker-row"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="picker-submit"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="picker-check"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="picker-cancel"]').text()).toBe('關閉')
  })

  it('paas: rows start unchecked with the suggested prefix and the primary endpoint', async () => {
    const { wrapper } = await mountPicker({ mode: 'paas', routeDomain: 'example.io' })
    const boxes = wrapper.findAll('[data-test="picker-select"]')
    expect(boxes).toHaveLength(3)
    expect(boxes.every((box) => !(box.element as HTMLInputElement).checked)).toBe(true)
    expect(wrapper.findAll('[data-test="picker-field"]').map((f) => (f.element as HTMLInputElement).value))
      .toEqual(['pi-1', 'omnigent-1', 'cache'])
    expect(row(wrapper, 'pi-1').get('[data-test="picker-preview"]').text()).toContain('pi-1.example.io')
    // A service without a platform name is shown as "chart · release".
    expect(row(wrapper, 'omnigent · svc-22222222').exists()).toBe(true)
    expect((row(wrapper, 'pi-1').get('[data-test="picker-endpoint"]').element as HTMLSelectElement).value)
      .toBe('http://svc-11111111-pi-agent:8080')
    expect(submitButton(wrapper).text()).toBe('一次開通 0 個')
    expect(submitButton(wrapper).attributes('disabled')).toBeDefined()

    await select(wrapper, 'pi-1')
    await select(wrapper, 'omnigent · svc-22222222')
    expect(submitButton(wrapper).text()).toBe('一次開通 2 個')
    expect(submitButton(wrapper).attributes('disabled')).toBeUndefined()
    await submitButton(wrapper).trigger('click')
    expect(submitted(wrapper)).toEqual([
      { subdomain_prefix: 'pi-1', service_url: 'http://svc-11111111-pi-agent:8080' },
      { subdomain_prefix: 'omnigent-1', service_url: 'http://svc-22222222-omnigent:8000' },
    ])
  })

  it('paas: another port can be chosen, and TCP ports carry a browser warning', async () => {
    const { wrapper } = await mountPicker({ mode: 'paas', routeDomain: 'example.io' })
    const pi = () => row(wrapper, 'pi-1')
    expect(pi().get('[data-test="picker-endpoint"]').find('optgroup[label="其他連接埠"]').exists()).toBe(true)
    expect(pi().find('[data-test="picker-tcp-warning"]').exists()).toBe(false)
    expect(row(wrapper, 'cache').find('[data-test="picker-tcp-warning"]').exists()).toBe(true)

    await pi().get('[data-test="picker-endpoint"]').setValue('ssh://svc-11111111-pi-agent:22')
    expect(pi().find('[data-test="picker-tcp-warning"]').exists()).toBe(true)
    await select(wrapper, 'pi-1')
    await submitButton(wrapper).trigger('click')
    expect(submitted(wrapper)).toEqual([{ subdomain_prefix: 'pi-1', service_url: 'ssh://svc-11111111-pi-agent:22' }])
  })

  it('paas: validates the prefix format, prefixes already used and duplicates', async () => {
    const { wrapper } = await mountPicker({ mode: 'paas', routeDomain: 'example.io', existing: ['pi-1'] })
    const field = (name: string) => row(wrapper, name).get('[data-test="picker-field"]')
    const error = (name: string) => row(wrapper, name).find('[data-test="picker-error"]')

    await select(wrapper, 'pi-1')
    expect(error('pi-1').text()).toContain('已有相同前綴')
    expect(submitButton(wrapper).attributes('disabled')).toBeDefined()

    await field('pi-1').setValue('bad_prefix')
    expect(error('pi-1').text()).toContain('小寫英文')
    expect(submitButton(wrapper).attributes('disabled')).toBeDefined()

    await field('pi-1').setValue(' Pi-2 ')
    expect(error('pi-1').exists()).toBe(false)
    expect(submitButton(wrapper).attributes('disabled')).toBeUndefined()

    await select(wrapper, 'cache')
    await field('cache').setValue('pi-2')
    expect(error('pi-1').text()).toContain('重複')
    expect(error('cache').text()).toContain('重複')
    expect(submitButton(wrapper).attributes('disabled')).toBeDefined()

    await field('cache').setValue('cache-1')
    await submitButton(wrapper).trigger('click')
    expect(submitted(wrapper)).toEqual([
      { subdomain_prefix: 'pi-2', service_url: 'http://svc-11111111-pi-agent:8080' },
      { subdomain_prefix: 'cache-1', service_url: 'tcp://svc-33333333-redis:6379' },
    ])
  })

  it('paas: 全選 takes at most 10 services and locks the rest', async () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      service({
        release: `svc-${i}`,
        display_name: `app-${i}`,
        suggested_prefix: `app-${i}`,
        endpoints: [endpoint({ service: `svc-${i}-web`, url: `http://svc-${i}-web:8080` })],
      })
    )
    const { wrapper } = await mountPicker({ mode: 'paas', routeDomain: 'example.io' }, workspaceInfo(many))
    const boxes = () => wrapper.findAll('[data-test="picker-select"]').map((box) => box.element as HTMLInputElement)

    await wrapper.get('[data-test="picker-select-all"]').setValue(true)
    expect(boxes().filter((box) => box.checked)).toHaveLength(10)
    expect(boxes().filter((box) => !box.checked).every((box) => box.disabled)).toBe(true)
    expect(wrapper.find('[data-test="picker-limit"]').exists()).toBe(true)
    expect(submitButton(wrapper).text()).toBe('一次開通 10 個')

    await wrapper.get('[data-test="picker-select-all"]').setValue(false)
    expect(boxes().some((box) => box.checked)).toBe(false)
    expect(boxes().some((box) => box.disabled)).toBe(false)
  })

  it('paas: 檢查可用性 checks each selected prefix and shows ✓ or the reason', async () => {
    const { wrapper, fetchMock } = await mountPicker({ mode: 'paas', routeDomain: 'example.io' }, workspaceInfo(), {
      'omnigent-1': { prefix: 'omnigent-1', available: false, reason: '已被其他服務使用' },
    })
    await select(wrapper, 'pi-1')
    await select(wrapper, 'omnigent · svc-22222222')
    await wrapper.get('[data-test="picker-check"]').trigger('click')
    await flushPromises()

    const urls = fetchMock.mock.calls.map(([url]) => url)
    expect(urls).toContain('/api/paas/routes/check?prefix=pi-1')
    expect(urls).toContain('/api/paas/routes/check?prefix=omnigent-1')
    expect(urls.filter((url) => url.startsWith('/api/paas/routes/check'))).toHaveLength(2)
    expect(row(wrapper, 'pi-1').get('[data-test="picker-available"]').text()).toContain('✓')
    expect(row(wrapper, 'omnigent · svc-22222222').get('[data-test="picker-error"]').text()).toBe('已被其他服務使用')
    expect(submitButton(wrapper).attributes('disabled')).toBeDefined()

    // A different prefix is a different question: the old answer no longer applies.
    await row(wrapper, 'omnigent · svc-22222222').get('[data-test="picker-field"]').setValue('omnigent-2')
    expect(row(wrapper, 'omnigent · svc-22222222').find('[data-test="picker-error"]').exists()).toBe(false)
    expect(submitButton(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('warns about services that are not ready', async () => {
    const { wrapper } = await mountPicker({ mode: 'paas', routeDomain: 'example.io' })
    expect(row(wrapper, 'omnigent · svc-22222222').find('[data-test="picker-not-ready"]').exists()).toBe(true)
    expect(row(wrapper, 'pi-1').find('[data-test="picker-not-ready"]').exists()).toBe(false)
    expect(row(wrapper, 'cache').find('[data-test="picker-not-ready"]').exists()).toBe(false)
  })

  it('paas: shows server errors per prefix without blocking a retry', async () => {
    const { wrapper } = await mountPicker({ mode: 'paas', routeDomain: 'example.io' })
    await select(wrapper, 'pi-1')
    const serverError: RouteBatchError = {
      status: 409,
      message: '有前綴無法使用',
      errors: { 'pi-1': '已被其他服務使用', quota: '超過方案的路由上限' },
    }
    await wrapper.setProps({ serverError })
    expect(row(wrapper, 'pi-1').get('[data-test="picker-rejected"]').text()).toContain('已被其他服務使用')
    const top = wrapper.get('[data-test="picker-server-error"]').text()
    expect(top).toContain('有前綴無法使用')
    expect(top).toContain('超過方案的路由上限')
    expect(top).not.toContain('已被其他服務使用') // shown on its row instead
    expect(submitButton(wrapper).attributes('disabled')).toBeUndefined()

    await wrapper.setProps({ busy: true })
    expect(submitButton(wrapper).attributes('disabled')).toBeDefined()
    expect(submitButton(wrapper).text()).toBe('處理中…')
  })

  it('hostname: builds Route items from the name and the domain, and remembers the domain', async () => {
    const { wrapper } = await mountPicker({ mode: 'hostname', existing: ['pi-1.example.com'] })
    expect((wrapper.get('[data-test="picker-domain"]').element as HTMLInputElement).value).toBe('')
    await select(wrapper, 'omnigent · svc-22222222')
    expect(wrapper.get('[data-test="picker-domain-error"]').text()).toContain('請輸入網域')
    expect(submitButton(wrapper).text()).toBe('加入 1 條路由')
    expect(submitButton(wrapper).attributes('disabled')).toBeDefined()

    await wrapper.get('[data-test="picker-domain"]').setValue('Example.com')
    expect(row(wrapper, 'omnigent · svc-22222222').get('[data-test="picker-preview"]').text()).toContain('omnigent-1.example.com')

    await select(wrapper, 'pi-1')
    expect(row(wrapper, 'pi-1').get('[data-test="picker-error"]').text()).toContain('已有這個 hostname')
    expect(submitButton(wrapper).attributes('disabled')).toBeDefined()
    await row(wrapper, 'pi-1').get('[data-test="picker-field"]').setValue('bad name')
    expect(row(wrapper, 'pi-1').get('[data-test="picker-error"]').text()).toContain('hostname 格式不正確')
    await row(wrapper, 'pi-1').get('[data-test="picker-select"]').setValue(false)

    await submitButton(wrapper).trigger('click')
    expect(submitted(wrapper)).toEqual([
      { hostname: 'omnigent-1.example.com', service: 'http://svc-22222222-omnigent:8000', disableChunkedEncoding: false },
    ])
    expect(window.localStorage.getItem('cf-tunnel-gui.workspace-picker.domain')).toBe('example.com')

    wrapper.unmount()
    const again = await mountPicker({ mode: 'hostname' })
    expect((again.wrapper.get('[data-test="picker-domain"]').element as HTMLInputElement).value).toBe('example.com')
  })

  it('hostname: works when the browser blocks localStorage', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { wrapper } = await mountPicker({ mode: 'hostname' })
    await wrapper.get('[data-test="picker-domain"]').setValue('example.com')
    await select(wrapper, 'pi-1')
    await submitButton(wrapper).trigger('click')
    expect(submitted(wrapper)).toEqual([
      { hostname: 'pi-1.example.com', service: 'http://svc-11111111-pi-agent:8080', disableChunkedEncoding: false },
    ])
  })

  it('shows a load error with a retry', async () => {
    let calls = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls += 1
      return calls === 1 ? jsonResponse({ detail: '無法連到 Kubernetes API' }, 502) : jsonResponse(workspaceInfo([PI, CACHE]))
    }))
    const wrapper: Picker = mount(WorkspaceServicePicker, { props: { mode: 'paas', routeDomain: 'example.io' } })
    await flushPromises()
    expect(wrapper.text()).toContain('無法連到 Kubernetes API')
    await wrapper.findAll('button').find((button) => button.text() === '重試')!.trigger('click')
    await flushPromises()
    expect(wrapper.findAll('[data-test="picker-row"]')).toHaveLength(2)
  })

  it('emits close from 取消, the × button and Escape', async () => {
    const { wrapper } = await mountPicker({ mode: 'paas', routeDomain: 'example.io' })
    await wrapper.get('[data-test="picker-cancel"]').trigger('click')
    await wrapper.get('[data-test="picker-close"]').trigger('click')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('close')).toHaveLength(3)
    expect(wrapper.emitted('submit')).toBeUndefined()
  })

  it('lists services that have no port but does not let them be picked', async () => {
    const { wrapper } = await mountPicker(
      { mode: 'paas', routeDomain: 'example.io' },
      workspaceInfo([PI, service({ release: 'svc-44444444', display_name: 'no-ports', suggested_prefix: 'no-ports', endpoints: [] })])
    )
    const box = row(wrapper, 'no-ports').get('[data-test="picker-select"]').element as HTMLInputElement
    expect(box.disabled).toBe(true)
    await wrapper.get('[data-test="picker-select-all"]').setValue(true)
    expect(box.checked).toBe(false)
    expect(submitButton(wrapper).text()).toBe('一次開通 1 個')
  })

  it('shows an empty state for a workspace without other services', async () => {
    const { wrapper } = await mountPicker({ mode: 'paas', routeDomain: 'example.io' }, workspaceInfo([]))
    expect(wrapper.find('[data-test="picker-empty"]').exists()).toBe(true)
    expect(submitButton(wrapper).attributes('disabled')).toBeDefined()
  })
})

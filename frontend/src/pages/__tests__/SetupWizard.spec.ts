import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import SetupWizard from '../SetupWizard.vue'
import { jsonResponse, workspaceInfo } from '@/__tests__/workspaceFixtures'

interface StateResp {
  has_cert: boolean
  has_tunnel: boolean
  tunnel_uuid: string | null
  mode: 'local' | 'token'
}

function stateOnly(state: StateResp) {
  return vi.fn((url: string) => {
    if (url === '/api/setup/state') {
      return Promise.resolve({ ok: true, json: async () => state })
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`))
  })
}

function mountWizard() {
  return mount(SetupWizard, {
    global: { plugins: [createPinia()] },
  })
}

describe('SetupWizard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    document.cookie = 'csrftoken=tok123'
  })
  afterEach(() => vi.unstubAllGlobals())

  it('無 cert → 顯示步驟 A(連結帳號)', async () => {
    vi.stubGlobal(
      'fetch',
      stateOnly({ has_cert: false, has_tunnel: false, tunnel_uuid: null, mode: 'local' })
    )
    const wrapper = mountWizard()
    await flushPromises()
    expect(wrapper.find('[data-test="step-a"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="start-login"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="step-b"]').exists()).toBe(false)
  })

  it('有 cert 無 tunnel → 顯示步驟 B(建立 tunnel)', async () => {
    vi.stubGlobal(
      'fetch',
      stateOnly({ has_cert: true, has_tunnel: false, tunnel_uuid: null, mode: 'local' })
    )
    const wrapper = mountWizard()
    await flushPromises()
    expect(wrapper.find('[data-test="step-b"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="create-tunnel"]').exists()).toBe(true)
  })

  it('有 tunnel → 顯示步驟 C(RouteEditor)', async () => {
    vi.stubGlobal(
      'fetch',
      stateOnly({ has_cert: true, has_tunnel: true, tunnel_uuid: 'uuid-1', mode: 'local' })
    )
    const wrapper = mountWizard()
    await flushPromises()
    expect(wrapper.find('[data-test="step-c"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="add-row"]').exists()).toBe(true)
  })

  it('步驟 C 套用失敗(422)顯示 detail 錯誤', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === '/api/setup/state') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            has_cert: true,
            has_tunnel: true,
            tunnel_uuid: 'uuid-1',
            mode: 'local',
          }),
        })
      }
      if (url === '/api/setup/apply') {
        return Promise.resolve({
          ok: false,
          status: 422,
          json: async () => ({ detail: 'ingress 驗證失敗:bad' }),
        })
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`))
    })
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = mountWizard()
    await flushPromises()

    // add a row and give it a valid hostname so apply is enabled
    await wrapper.get('[data-test="add-row"]').trigger('click')
    await wrapper.get('input[placeholder="app.example.com"]').setValue('app.example.com')
    await flushPromises()

    await wrapper.get('[data-test="apply"]').trigger('click')
    await flushPromises()

    const err = wrapper.find('[data-test="apply-error"]')
    expect(err.exists()).toBe(true)
    expect(err.text()).toContain('ingress 驗證失敗')
  })
})

describe('SetupWizard: workspace services', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    document.cookie = 'csrftoken=tok123'
    window.localStorage.clear()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('步驟 C:從工作區加入服務 appends the picked services to the routes', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url === '/api/setup/state') {
        return Promise.resolve(jsonResponse({ has_cert: true, has_tunnel: true, tunnel_uuid: 'uuid-1', mode: 'local' }))
      }
      if (url === '/api/workspace') return Promise.resolve(jsonResponse(workspaceInfo()))
      return Promise.reject(new Error(`unexpected fetch: ${url}`))
    }))
    const wrapper = mountWizard()
    await flushPromises()

    await wrapper.get('[data-test="add-row"]').trigger('click') // left blank: dropped when services are added
    await wrapper.get('[data-test="add-from-workspace"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-test="picker-domain"]').setValue('example.com')
    const rows = wrapper.findAll('[data-test="picker-row"]')
    await rows[0].get('[data-test="picker-select"]').setValue(true)
    await rows[1].get('[data-test="picker-select"]').setValue(true)
    await wrapper.get('[data-test="picker-submit"]').trigger('click')
    await flushPromises()

    const values = (placeholder: string) =>
      wrapper.findAll(`input[placeholder="${placeholder}"]`).map((input) => (input.element as HTMLInputElement).value)
    expect(values('app.example.com')).toEqual(['pi-1.example.com', 'omnigent-1.example.com'])
    expect(values('http://<服務名稱>:8080')).toEqual(['http://svc-11111111-pi-agent:8080', 'http://svc-22222222-omnigent:8000'])
    expect(wrapper.find('[data-test="workspace-picker"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="apply"]').attributes('disabled')).toBeUndefined()
  })

  it('token mode points to Config for building the list for the dashboard', async () => {
    vi.stubGlobal('fetch', stateOnly({ has_cert: false, has_tunnel: false, tunnel_uuid: null, mode: 'token' }))
    const wrapper = mountWizard()
    await flushPromises()
    expect(wrapper.get('[data-test="token-guard"]').text()).toContain('從工作區加入服務')
    expect(wrapper.find('[data-test="add-from-workspace"]').exists()).toBe(false)
  })
})

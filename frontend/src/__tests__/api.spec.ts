import { describe, it, expect, vi, afterEach } from 'vitest'
import { api, ApiError, checkRoutePrefix, createAccessRoutes, deleteAccessRoute, getWorkspace } from '../api'

describe('api()', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends the CSRF header on state-changing requests only', async () => {
    document.cookie = 'apporo_csrftoken=tok123'
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }))
    vi.stubGlobal('fetch', fetchMock)
    await api('/api/config')
    await api('/api/tunnel/start', { method: 'POST' })
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][]
    expect((calls[0][1].headers as Record<string, string>)['x-csrftoken']).toBeUndefined()
    expect((calls[1][1].headers as Record<string, string>)['x-csrftoken']).toBe('tok123')
  })

  it('turns a FastAPI 422 detail list into field: message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 422,
      json: async () => ({ detail: [{ loc: ['body', 'tunnel_token'], msg: 'bad token', type: 'value_error' }] }),
    })))
    await expect(api('/api/config', { method: 'PUT' })).rejects.toThrow('tunnel_token: bad token')
  })

  it('passes a string detail through', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 409, json: async () => ({ detail: 'Release the Apporo binding first' }) })))
    await expect(api('/api/config', { method: 'PUT' })).rejects.toThrow('Release the Apporo binding first')
  })

  it("sends this app's apporo_csrftoken, never another GUI's csrftoken", async () => {
    // Cookies are per host, not per port: a second tunnel GUI opened on the same host (WOOW's
    // uses starlette-csrf's default name) keeps its own csrftoken cookie in the same jar.
    const expired = '=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    document.cookie = 'csrftoken=other-gui-token'
    document.cookie = 'apporo_csrftoken=tok123'
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }))
    vi.stubGlobal('fetch', fetchMock)
    await api('/api/tunnel/stop', { method: 'POST' })
    document.cookie = `apporo_csrftoken${expired}`
    await api('/api/tunnel/stop', { method: 'POST' })
    document.cookie = `csrftoken${expired}`
    warn.mockRestore()
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][]
    expect((calls[0][1].headers as Record<string, string>)['x-csrftoken']).toBe('tok123')
    // without a cookie of its own it sends no token, rather than the other GUI's
    expect((calls[1][1].headers as Record<string, string>)['x-csrftoken']).toBe('')
  })
})

describe('PaaS edition helpers', () => {
  afterEach(() => vi.unstubAllGlobals())

  function okFetch(body: unknown) {
    return vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: true, status: 200, json: async () => body }))
  }

  function headersOf(init: RequestInit | undefined) {
    return (init?.headers ?? {}) as Record<string, string>
  }

  it('getWorkspace reads /api/workspace without a CSRF header', async () => {
    document.cookie = 'apporo_csrftoken=tok123'
    const fetchMock = okFetch({ available: false, reason: 'Not running inside Kubernetes.' })
    vi.stubGlobal('fetch', fetchMock)
    expect(await getWorkspace()).toEqual({ available: false, reason: 'Not running inside Kubernetes.' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/workspace')
    expect(headersOf(init)['x-csrftoken']).toBeUndefined()
  })

  it('checkRoutePrefix encodes the prefix into the query', async () => {
    const fetchMock = okFetch({ prefix: 'pi-1', available: true, reason: '' })
    vi.stubGlobal('fetch', fetchMock)
    expect((await checkRoutePrefix('pi 1&x')).available).toBe(true)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/paas/routes/check?prefix=pi%201%26x')
  })

  it('createAccessRoutes posts {routes} with the CSRF header', async () => {
    document.cookie = 'apporo_csrftoken=tok123'
    const fetchMock = okFetch({ created: [], review: {} })
    vi.stubGlobal('fetch', fetchMock)
    const routes = [{ subdomain_prefix: 'pi-1', service_url: 'http://svc-11111111-pi-agent:8080' }]
    await createAccessRoutes(7, routes)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/paas/accesses/7/routes')
    expect(init?.method).toBe('POST')
    expect(headersOf(init)['x-csrftoken']).toBe('tok123')
    expect(JSON.parse(String(init?.body))).toEqual({ routes })
  })

  it('deleteAccessRoute sends DELETE with the CSRF header', async () => {
    document.cookie = 'apporo_csrftoken=tok123'
    const fetchMock = okFetch({ deleted: true, review: {} })
    vi.stubGlobal('fetch', fetchMock)
    expect((await deleteAccessRoute(7, 101)).deleted).toBe(true)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/paas/accesses/7/routes/101')
    expect(init?.method).toBe('DELETE')
    expect(headersOf(init)['x-csrftoken']).toBe('tok123')
  })

  it('a 409 {message, errors} detail keeps the message and the per-prefix reasons', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 409,
      json: async () => ({ detail: { message: 'Some subdomain prefixes cannot be used.', errors: { 'pi-1': 'Already used by another service' } } }),
    })))
    const error = await createAccessRoutes(7, []).catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toBeInstanceOf(Error)
    expect((error as ApiError).message).toBe('Some subdomain prefixes cannot be used.')
    expect((error as ApiError).status).toBe(409)
    expect((error as ApiError).errors).toEqual({ 'pi-1': 'Already used by another service' })
  })

  it('a detail with errors but no message lists the reasons', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 409,
      json: async () => ({ detail: { errors: { 'pi-1': 'already taken', 'pi-2': 'over the plan limit' } } }),
    })))
    await expect(api('/api/x', { method: 'POST' })).rejects.toThrow('pi-1: already taken; pi-2: over the plan limit')
  })

  it('a string detail has no per-item errors, and a body without detail falls back to the status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 501, json: async () => ({ detail: 'Not offered by this platform' }) })))
    const stringDetail = (await api('/api/x').catch((cause: unknown) => cause)) as ApiError
    expect(stringDetail.message).toBe('Not offered by this platform')
    expect(stringDetail.errors).toEqual({})

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502, json: async () => { throw new Error('not json') } })))
    await expect(api('/api/x')).rejects.toThrow('HTTP 502')
  })
})

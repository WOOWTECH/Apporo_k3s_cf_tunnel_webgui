import { describe, it, expect } from 'vitest'
import { appendRoutes, routeLines } from '../routes'
import { normalizePrefix, routePrefixError } from '../routePrefix'
import type { Route } from '@/types'

function route(hostname: string, service = 'http://svc:80'): Route {
  return { hostname, service, disableChunkedEncoding: false }
}

describe('appendRoutes', () => {
  it('appends new hostnames and skips ones already listed (case-insensitive)', () => {
    const result = appendRoutes(
      [route('a.example.com')],
      [route('A.Example.com', 'http://other:1'), route('b.example.com'), route('b.example.com', 'http://dup:2')]
    )
    expect(result.map((r) => r.hostname)).toEqual(['a.example.com', 'b.example.com'])
    expect(result[1].service).toBe('http://svc:80')
  })

  it('drops completely blank rows of the current list but keeps partly filled ones', () => {
    const result = appendRoutes([route('', ''), route('', 'http://kept:1')], [route('c.example.com')])
    expect(result).toEqual([route('', 'http://kept:1'), route('c.example.com')])
  })
})

describe('routeLines', () => {
  it('formats hostname → service lines and skips incomplete rows', () => {
    expect(routeLines([route(' a.example.com ', 'http://a:1 '), route('', 'http://x:1'), route('b.example.com', 'http://b:2')]))
      .toBe('a.example.com → http://a:1\nb.example.com → http://b:2')
  })
})

describe('routePrefixError', () => {
  it.each([
    ['pi-1', null],
    ['abc', null],
    ['a'.repeat(63), null],
  ])('accepts %s', (prefix, expected) => {
    expect(routePrefixError(prefix)).toBe(expected)
  })

  it.each([
    ['', 'Enter a subdomain prefix'],
    ['ab', '3 to 63 characters'],
    ['a'.repeat(64), '3 to 63 characters'],
    ['-pi', 'cannot start or end with "-"'],
    ['pi-', 'cannot start or end with "-"'],
    ['pi_1', 'lowercase letters, digits and "-"'],
    ['pi.1', 'lowercase letters, digits and "-"'],
  ])('rejects %j', (prefix, fragment) => {
    expect(routePrefixError(prefix)).toContain(fragment)
  })

  it('normalizes case and surrounding spaces before validation', () => {
    expect(normalizePrefix('  Pi-1 ')).toBe('pi-1')
  })
})

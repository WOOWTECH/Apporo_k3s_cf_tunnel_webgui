import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative, resolve } from 'path'

// Guards the Apporo edition against upstream (WOOW) merges: the UI is English only, carries no
// WOOW branding and uses the Apporo gold theme.
const FRONTEND = resolve(__dirname, '../..')

// CJK radicals, punctuation, Bopomofo, ideographs (BMP and supplementary planes), compatibility
// and fullwidth forms. Written as escapes so this file passes its own scan: the Chinese-text
// check covers the tests as well, not only the UI.
const CJK =
  /[\u{2e80}-\u{2fdf}\u{3000}-\u{303f}\u{3100}-\u{312f}\u{31a0}-\u{31bf}\u{3400}-\u{4dbf}\u{4e00}-\u{9fff}\u{f900}-\u{faff}\u{fe30}-\u{fe4f}\u{ff00}-\u{ffef}\u{20000}-\u{2fa1f}]/u
const OLD_BRAND = [/woowtech/i, /\bW(OOW|oow)\b/]
// tailwind.config.js no longer defines cf-orange; a class left over from a merge would render
// unstyled (a white button on white), and the stock orange-* shades are off-brand.
const OLD_THEME = [/\borange\b/]
const GOLD = '#8B6B24'

/** The .vue and .ts files under dir; with `withTests`, the __tests__ folders too. */
function sources(dir: string, withTests: boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === '__tests__' && !withTests ? [] : sources(path, withTests)
    return /\.(vue|ts)$/.test(name) ? [path] : []
  })
}

/** What ships besides the bundle: the page shell and the public assets. */
function shell(): string[] {
  const publicDir = join(FRONTEND, 'public')
  return [join(FRONTEND, 'index.html'), ...readdirSync(publicDir).map((name) => join(publicDir, name))]
}

function offending(files: string[], patterns: RegExp[]): string[] {
  return files.flatMap((file) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .flatMap((line, i) => (patterns.some((p) => p.test(line)) ? [`${relative(FRONTEND, file)}:${i + 1}`] : []))
  )
}

function read(path: string): string {
  return readFileSync(join(FRONTEND, path), 'utf8')
}

describe('Apporo branding', () => {
  it('has no Chinese text in src (tests included) or in the page shell', () => {
    expect(offending([...sources(join(FRONTEND, 'src'), true), ...shell()], [CJK])).toEqual([])
  })

  it('the Chinese-text check would catch Traditional Chinese and fullwidth punctuation', () => {
    // "Workspace" in Traditional Chinese and a fullwidth colon, written as escapes.
    expect(CJK.test('\u{5de5}\u{4f5c}\u{5340}')).toBe(true)
    expect(CJK.test('Workspace\u{ff1a}')).toBe(true)
    expect(CJK.test('Publish 2 services · <prefix>.apporo.ai → “Check again” ✓ … — ↗')).toBe(false)
  })

  it('has no WOOW branding in the UI sources', () => {
    expect(offending([...sources(join(FRONTEND, 'src'), false), ...shell()], OLD_BRAND)).toEqual([])
  })

  it('uses the Apporo gold theme, not the old orange one', () => {
    expect(offending([...sources(join(FRONTEND, 'src'), false), join(FRONTEND, 'index.html')], OLD_THEME)).toEqual([])
    expect(read('tailwind.config.js')).toContain(`DEFAULT: '${GOLD}'`)
    expect(read('index.html')).toContain(`<meta name="theme-color" content="${GOLD}" />`)
    expect(read('public/favicon.svg')).toContain(`fill="${GOLD}"`)
  })

  it('names the page Apporo CF Tunnel Web', () => {
    expect(read('index.html')).toContain('<title>Apporo CF Tunnel Web</title>')
  })
})

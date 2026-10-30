import { existsSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import {
  buildContentSecurityPolicy,
  buildHeadersFile,
  buildSecurityHeaders,
  findInlineCode,
  supabaseOrigins,
} from './securityHeaders'

const URL_ = 'https://abcdefgh.supabase.co'

function directives(csp: string): Map<string, string[]> {
  return new Map(
    csp.split(';').map((part) => {
      const [name, ...values] = part.trim().split(/\s+/)
      return [name, values]
    }),
  )
}

describe('supabaseOrigins', () => {
  it('derives https and wss origins from the project URL, dropping path and case', () => {
    expect(supabaseOrigins('https://AbcDefgh.Supabase.co/rest/v1/')).toEqual({
      https: 'https://abcdefgh.supabase.co',
      wss: 'wss://abcdefgh.supabase.co',
    })
    expect(supabaseOrigins('https://db.example.com:8443')).toEqual({
      https: 'https://db.example.com:8443',
      wss: 'wss://db.example.com:8443',
    })
  })

  it('refuses a URL that is not https, carries credentials or is not a URL', () => {
    expect(() => supabaseOrigins('http://abcdefgh.supabase.co')).toThrow(/https/)
    expect(() => supabaseOrigins('https://user:pw@abcdefgh.supabase.co')).toThrow(/credentials/)
    expect(() => supabaseOrigins('abcdefgh.supabase.co; script-src *')).toThrow(/not a URL/)
  })
})

describe('buildContentSecurityPolicy', () => {
  const csp = directives(buildContentSecurityPolicy(URL_))

  it('allows scripts and styles from this origin only, with no inline code or eval', () => {
    expect(csp.get('default-src')).toEqual(["'self'"])
    expect(csp.get('script-src')).toEqual(["'self'"])
    expect(csp.get('style-src')).toEqual(["'self'", 'https://fonts.googleapis.com'])
    const all = [...csp.values()].flat()
    expect(all).not.toContain("'unsafe-inline'")
    expect(all).not.toContain("'unsafe-eval'")
    expect(all).not.toContain('*')
  })

  it('connects only to this origin and the pinned Supabase host', () => {
    expect(csp.get('connect-src')).toEqual([
      "'self'",
      URL_,
      'wss://abcdefgh.supabase.co',
      'https://*.supabase.co',
      'wss://*.supabase.co',
      'https://api.github.com',
    ])
    // The org's API server, by origin, when the build is given one.
    const withApi = directives(buildContentSecurityPolicy(URL_, ['https://api.example.com/v1/', ' ', 'https://API.example.com']))
    expect(withApi.get('connect-src')).toEqual([
      "'self'",
      URL_,
      'wss://abcdefgh.supabase.co',
      'https://*.supabase.co',
      'wss://*.supabase.co',
      'https://api.example.com',
      'https://api.github.com',
    ])
    expect(() => buildContentSecurityPolicy(URL_, ['http://api.example.com'])).toThrow(/https/)
  })

  it('limits images and frames to this origin, the Supabase host and local blob: URLs', () => {
    expect(csp.get('img-src')).toEqual([
      "'self'",
      URL_,
      'https://*.supabase.co',
      'https://*.googleusercontent.com',
      'blob:',
      'data:',
    ])
    expect(csp.get('frame-src')).toEqual(['blob:'])
    // data: is for images and pdf.js fonts, never for frames.
    expect(csp.get('frame-src')).not.toContain('data:')
  })

  it('locks plugins, base, forms, framing and Trusted Types', () => {
    expect(csp.get('object-src')).toEqual(["'none'"])
    expect(csp.get('base-uri')).toEqual(["'none'"])
    expect(csp.get('form-action')).toEqual(["'self'"])
    expect(csp.get('frame-ancestors')).toEqual(["'none'"])
    expect(csp.get('require-trusted-types-for')).toEqual(["'script'"])
    expect(csp.get('trusted-types')).toEqual(["'none'"])
    expect(csp.has('upgrade-insecure-requests')).toBe(true)
  })
})

describe('buildSecurityHeaders', () => {
  const headers = buildSecurityHeaders(URL_)

  it('sets HSTS eligible for the preload list', () => {
    const hsts = headers['Strict-Transport-Security']
    expect(Number(/max-age=(\d+)/.exec(hsts)?.[1])).toBeGreaterThanOrEqual(31536000)
    expect(hsts).toContain('includeSubDomains')
    expect(hsts).toContain('preload')
  })

  it('sets the remaining hardening headers', () => {
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['X-Frame-Options']).toBe('DENY')
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    expect(headers['Cross-Origin-Opener-Policy']).toBe('same-origin')
    expect(headers['Permissions-Policy']).toMatch(/camera=\(\)/)
    expect(headers['Permissions-Policy']).toMatch(/microphone=\(\)/)
    expect(headers['Permissions-Policy']).toMatch(/geolocation=\(\)/)
  })
})

describe('buildHeadersFile', () => {
  const file = buildHeadersFile(URL_)
  const rules = new Map<string, string[]>()
  let current = ''
  for (const line of file.split('\n')) {
    if (line === '' || line.startsWith('#')) continue
    if (!line.startsWith(' ')) {
      current = line
      rules.set(current, [])
    } else {
      rules.get(current)!.push(line.trim())
    }
  }

  it('applies the security headers to every path', () => {
    const all = rules.get('/*') ?? []
    expect(all).toContain(`Content-Security-Policy: ${buildContentSecurityPolicy(URL_)}`)
    expect(all.some((header) => header.startsWith('Strict-Transport-Security:'))).toBe(true)
  })

  it('caches hashed assets forever and revalidates the HTML entry', () => {
    expect(rules.get('/assets/*')).toEqual(['Cache-Control: public, max-age=31536000, immutable'])
    expect(rules.get('/')).toEqual(['Cache-Control: no-cache'])
    expect(rules.get('/index.html')).toEqual(['Cache-Control: no-cache'])
    // Pages joins a header two matching rules set, so Cache-Control must not also be on /*.
    expect((rules.get('/*') ?? []).some((header) => header.startsWith('Cache-Control'))).toBe(false)
  })

  it('stays inside Cloudflare Pages limits (100 rules, 2,000 characters per line)', () => {
    expect(rules.size).toBeLessThanOrEqual(100)
    expect(Math.max(...file.split('\n').map((line) => line.length))).toBeLessThan(2000)
  })
})

describe('findInlineCode', () => {
  it('accepts what Vite emits: an external module script and a stylesheet link', () => {
    const html =
      '<head><script type="module" crossorigin src="/assets/index-abc.js"></script>' +
      '<link rel="stylesheet" crossorigin href="/assets/index-abc.css"></head><body><div id="root"></div></body>'
    expect(findInlineCode(html)).toEqual([])
  })

  it('reports inline scripts, styles, handlers and javascript: URLs', () => {
    expect(findInlineCode('<script>alert(1)</script>')).toHaveLength(1)
    expect(findInlineCode('<script src="/a.js">alert(1)</script>')).toHaveLength(1)
    expect(findInlineCode('<style>body{}</style>')).toEqual(['inline <style> element'])
    expect(findInlineCode('<div style="color:red"></div>')).toEqual(['inline style attribute'])
    expect(findInlineCode('<img src="x" onerror="alert(1)">')).toHaveLength(1)
    expect(findInlineCode('<a href="javascript:void 0">x</a>')).toEqual(['javascript: URL'])
  })
})

describe('web/public', () => {
  const publicDir = resolve(__dirname, '../../public')

  it('has no 404.html, so Cloudflare Pages serves index.html for deep links (SPA mode)', () => {
    expect(existsSync(resolve(publicDir, '404.html'))).toBe(false)
  })

  it('has no hand-written _headers or _redirects to shadow the generated headers', () => {
    expect(existsSync(resolve(publicDir, '_headers'))).toBe(false)
    expect(existsSync(resolve(publicDir, '_redirects'))).toBe(false)
  })
})

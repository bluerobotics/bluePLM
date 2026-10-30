// Response headers for BluePLM Web on Cloudflare Pages, written to `dist-web/_headers` at build
// time by the plugin in vite.web.config.ts. Generated rather than checked in because the CSP must
// name the exact Supabase host the build was pinned to (VITE_SUPABASE_URL).
//
// Decisions (see web/DEPLOY.md):
// - script-src 'self' only. Vite emits one external module script and no inline code;
//   `findInlineCode` fails the build if index.html ever gains some.
// - style-src 'self' without 'unsafe-inline'. Tailwind compiles to an external stylesheet, and
//   React's `style={{...}}` writes through CSSOM (element.style), which CSP does not govern. Only a
//   `style="..."` attribute in HTML or a `<style>` element would need 'unsafe-inline'.
// - Trusted Types enforced with no policies allowed. The bundle's only DOM-injection sinks are in
//   react-dom (dangerouslySetInnerHTML, rendering a <script> element, ReactDOM.preinit) and
//   realtime-js's opt-in Web Worker; web/src/webBoundary.test.ts bans the triggers in our code.
// - blob: is allowed for images and frames (a PDF fetched with the session and shown from a blob:
//   URL). Only our own scripts can mint a blob: URL on this origin, so it adds no third party.

/** Paths that are content-hashed by Vite and can be cached forever. */
export const IMMUTABLE_ASSET_PATTERN = '/assets/*'

export interface SupabaseOrigins {
  https: string
  wss: string
}

/** The HTTPS and WebSocket origins of the Supabase project, from VITE_SUPABASE_URL. */
export function supabaseOrigins(supabaseUrl: string): SupabaseOrigins {
  let url: URL
  try {
    url = new URL(supabaseUrl)
  } catch {
    throw new Error(`BluePLM Web: VITE_SUPABASE_URL is not a URL: ${supabaseUrl}`)
  }
  if (url.protocol !== 'https:') {
    throw new Error('BluePLM Web: VITE_SUPABASE_URL must use https for a deployable build')
  }
  if (url.username || url.password) {
    throw new Error('BluePLM Web: VITE_SUPABASE_URL must not carry credentials')
  }
  // url.host is normalised (lower case, no default port) and cannot contain spaces or ';', so it
  // cannot inject another directive into the policy.
  return { https: `https://${url.host}`, wss: `wss://${url.host}` }
}

export function buildContentSecurityPolicy(supabaseUrl: string): string {
  const supabase = supabaseOrigins(supabaseUrl)
  const directives: Array<[string, ...string[]]> = [
    ['default-src', "'self'"],
    ['script-src', "'self'"],
    // The desktop renderer loads Plus Jakarta Sans from Google Fonts (index.html); the web uses the same.
    ['style-src', "'self'", 'https://fonts.googleapis.com'],
    // Google account avatars (users.avatar_url) are served from googleusercontent.com.
    ['img-src', "'self'", supabase.https, 'https://*.googleusercontent.com', 'blob:', 'data:'],
    // pdf.js (review PDFs) may load a drawing's embedded fonts as data: URLs.
    ['font-src', "'self'", 'https://fonts.gstatic.com', 'data:'],
    // api.github.com: the sign-in page looks up the latest desktop installer (src/lib/desktopDownload.ts).
    ['connect-src', "'self'", supabase.https, supabase.wss, 'https://api.github.com'],
    // Only the review PDF is framed, from a blob: URL; signed URLs are navigations, not frames.
    ['frame-src', 'blob:'],
    ['worker-src', "'self'"],
    ['media-src', "'self'"],
    ['manifest-src', "'self'"],
    ['object-src', "'none'"],
    ['base-uri', "'none'"],
    ['form-action', "'self'"],
    ['frame-ancestors', "'none'"],
    ['require-trusted-types-for', "'script'"],
    ['trusted-types', "'none'"],
    ['upgrade-insecure-requests'],
  ]
  return directives.map((parts) => parts.join(' ')).join('; ')
}

/** Headers sent on every response, HTML and assets alike. */
export function buildSecurityHeaders(supabaseUrl: string): Record<string, string> {
  return {
    'Content-Security-Policy': buildContentSecurityPolicy(supabaseUrl),
    // Two years, subdomains, preload: the minimum hstspreload.org accepts.
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    'X-Content-Type-Options': 'nosniff',
    // Older browsers that ignore frame-ancestors.
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': [
      'accelerometer=()',
      'autoplay=()',
      'bluetooth=()',
      'browsing-topics=()',
      'camera=()',
      'display-capture=()',
      'geolocation=()',
      'gyroscope=()',
      'hid=()',
      'magnetometer=()',
      'microphone=()',
      'midi=()',
      'payment=()',
      'serial=()',
      'usb=()',
    ].join(', '),
    // Same-origin keeps a window we open (or that opens us) from holding a reference to this one.
    // Google sign-in is a full-page redirect, not a popup, so it is unaffected.
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-Permitted-Cross-Domain-Policies': 'none',
  }
}

/**
 * The Cloudflare Pages `_headers` file. Cache-Control is set per path and never on `/*`, because
 * Pages joins a header set by two matching rules with a comma. Deep links served by the SPA
 * fallback keep Pages' default (`public, max-age=0, must-revalidate`), which revalidates like
 * no-cache.
 */
export function buildHeadersFile(supabaseUrl: string): string {
  const lines: string[] = ['# Generated by vite.web.config.ts from web/src/app/securityHeaders.ts. Do not edit.', '/*']
  for (const [name, value] of Object.entries(buildSecurityHeaders(supabaseUrl))) {
    lines.push(`  ${name}: ${value}`)
  }
  lines.push('', IMMUTABLE_ASSET_PATTERN, '  Cache-Control: public, max-age=31536000, immutable')
  for (const path of ['/', '/index.html']) {
    lines.push('', path, '  Cache-Control: no-cache')
  }
  return lines.join('\n') + '\n'
}

/**
 * Inline code in built HTML that the CSP would block (and that would force 'unsafe-inline').
 * Returns one description per finding; empty means the page is clean.
 */
export function findInlineCode(html: string): string[] {
  const findings: string[] = []
  const scriptTags = html.match(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi) ?? []
  for (const tag of scriptTags) {
    const open = tag.slice(0, tag.indexOf('>') + 1)
    const body = tag.slice(open.length).replace(/<\/script\s*>$/i, '')
    if (!/\bsrc\s*=/i.test(open) || body.trim() !== '') findings.push(`inline script: ${open}`)
  }
  if (/<style\b/i.test(html)) findings.push('inline <style> element')
  if (/\sstyle\s*=/i.test(html)) findings.push('inline style attribute')
  const handler = html.match(/<[^>]*\son[a-z]+\s*=/i)
  if (handler) findings.push(`inline event handler: ${handler[0]}`)
  if (/javascript:/i.test(html)) findings.push('javascript: URL')
  return findings
}

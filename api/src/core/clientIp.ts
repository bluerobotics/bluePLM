/**
 * The caller's address, for per-client rate limits and the request log.
 *
 * Behind most proxies `request.ip` is right: Fastify walks `X-Forwarded-For` back through the proxies
 * `TRUST_PROXY` names. Railway's edge reaches the container from a public address that no published
 * range covers, so there `request.ip` is the edge for every caller and all callers share one rate-limit
 * bucket. Railway overwrites `X-Real-IP` on every public request with the address it saw, so on Railway
 * that header is the client address. `CLIENT_IP_HEADER` names such a header for any host; on Railway it
 * defaults to `x-real-ip`, and `off` turns it off.
 */

import { isIP } from 'node:net'

/** Railway sets these on every deployment. */
const RAILWAY_MARKERS = ['RAILWAY_ENVIRONMENT_NAME', 'RAILWAY_PROJECT_ID'] as const

/** The header to read the client address from, lower-cased, or null to use `request.ip`. */
export function resolveClientIpHeader(
  configured: string | undefined,
  environment: Readonly<Record<string, string | undefined>>,
): string | null {
  const value = configured?.trim().toLowerCase()
  if (value === 'off') return null
  if (value) return value
  return RAILWAY_MARKERS.some((name) => !!environment[name]) ? 'x-real-ip' : null
}

/**
 * The first entry of the configured header, trimmed, when it is an IP address; `request.ip` otherwise
 * (header not configured, absent, or not an address).
 */
export function clientIp(
  request: { ip: string; headers: Record<string, string | string[] | undefined> },
  header: string | null,
): string {
  if (!header) return request.ip
  const raw = request.headers[header]
  const first = (Array.isArray(raw) ? raw[0] : raw)?.split(',')[0]?.trim()
  return first && isIP(first) ? first : request.ip
}

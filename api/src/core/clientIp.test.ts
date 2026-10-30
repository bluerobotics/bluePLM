import { describe, expect, it } from 'vitest'

import { clientIp, resolveClientIpHeader } from './clientIp.js'

const PROXY = '34.120.0.10'
const req = (headers: Record<string, string | string[] | undefined>) => ({ ip: PROXY, headers })

describe('resolveClientIpHeader', () => {
  it('defaults to x-real-ip on Railway', () => {
    expect(resolveClientIpHeader(undefined, { RAILWAY_ENVIRONMENT_NAME: 'production' })).toBe('x-real-ip')
    expect(resolveClientIpHeader(undefined, { RAILWAY_PROJECT_ID: 'p' })).toBe('x-real-ip')
  })

  it('is off elsewhere unless configured', () => {
    expect(resolveClientIpHeader(undefined, {})).toBeNull()
    expect(resolveClientIpHeader('', {})).toBeNull()
    expect(resolveClientIpHeader('CF-Connecting-IP', {})).toBe('cf-connecting-ip')
  })

  it('can be turned off on Railway', () => {
    expect(resolveClientIpHeader('off', { RAILWAY_PROJECT_ID: 'p' })).toBeNull()
  })
})

describe('clientIp', () => {
  it('uses the header on Railway, so each caller gets its own rate-limit key', () => {
    const header = resolveClientIpHeader(undefined, { RAILWAY_ENVIRONMENT_NAME: 'production' })
    expect(clientIp(req({ 'x-real-ip': '203.0.113.7' }), header)).toBe('203.0.113.7')
    expect(clientIp(req({ 'x-real-ip': '2001:db8::1' }), header)).toBe('2001:db8::1')
    expect(clientIp(req({ 'x-real-ip': ' 203.0.113.7 , 10.0.0.1' }), header)).toBe('203.0.113.7')
    expect(clientIp(req({ 'x-real-ip': ['198.51.100.2', '10.0.0.1'] }), header)).toBe('198.51.100.2')
  })

  it('ignores the header when none is configured, so a caller cannot pick its own key', () => {
    expect(clientIp(req({ 'x-real-ip': '203.0.113.7' }), null)).toBe(PROXY)
  })

  it('falls back to request.ip for a missing or invalid value', () => {
    expect(clientIp(req({}), 'x-real-ip')).toBe(PROXY)
    expect(clientIp(req({ 'x-real-ip': 'not-an-ip' }), 'x-real-ip')).toBe(PROXY)
    expect(clientIp(req({ 'x-real-ip': '' }), 'x-real-ip')).toBe(PROXY)
    expect(clientIp(req({ 'x-real-ip': '999.1.1.1' }), 'x-real-ip')).toBe(PROXY)
  })
})

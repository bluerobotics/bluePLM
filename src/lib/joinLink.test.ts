import { describe, expect, it } from 'vitest'
import { describeJoinTarget, joinLinkFor, readJoinCode } from './joinLink'
import { generateOrgCode } from './supabaseConfig'

const hostedCode = generateOrgCode(
  { version: 1, url: 'https://abcdefghijklmnop.supabase.co', anonKey: 'anon-key' },
  'acme',
)
const selfHostedCode = generateOrgCode({ version: 1, url: 'https://supabase.acme.example', anonKey: 'k' }, 'acme')

describe('join links', () => {
  it('round-trips an organization code through a link', () => {
    const link = joinLinkFor(hostedCode)
    expect(link.startsWith('https://blueplm.io/join#')).toBe(true)
    const url = new URL(link)
    expect(readJoinCode(url.pathname, url.hash)).toBe(hostedCode)
  })

  it('reads the code only from /join, tolerating a trailing slash', () => {
    expect(readJoinCode('/join/', `#${hostedCode}`)).toBe(hostedCode)
    expect(readJoinCode('/files', `#${hostedCode}`)).toBeNull()
    expect(readJoinCode('/', `#${hostedCode}`)).toBeNull()
  })

  it('treats an empty or malformed fragment as no code', () => {
    expect(readJoinCode('/join', '')).toBeNull()
    expect(readJoinCode('/join', '#   ')).toBeNull()
    expect(readJoinCode('/join', '#%E0%A4%A')).toBeNull()
  })

  it('describes where a code leads: the real host, the slug as a label, and reachability', () => {
    expect(describeJoinTarget(hostedCode)).toEqual({
      host: 'abcdefghijklmnop.supabase.co',
      orgSlug: 'acme',
      reachable: true,
    })
    expect(describeJoinTarget(selfHostedCode)).toEqual({
      host: 'supabase.acme.example',
      orgSlug: 'acme',
      reachable: false,
    })
    expect(describeJoinTarget('not a code')).toBeNull()
  })
})

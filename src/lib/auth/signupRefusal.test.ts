import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

import { getTranslation } from '@/lib/i18n'
import { readAuthRedirectError, signupErrorText, signupRefusalKind } from './signupRefusal'

const MIGRATION = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/0502_security_hardening.sql'),
  'utf8',
)

/** The hook's own refusal messages, read from the migration so the two cannot drift apart. */
function hookMessage(prefix: string): string {
  const m = new RegExp(`'message', '(${prefix}:[^']*(?:''[^']*)*)'`).exec(MIGRATION)
  expect(m, prefix).not.toBeNull()
  return (m?.[1] ?? '').replace(/''/g, "'")
}

describe('sign-up refusals from the Before User Created hook', () => {
  it('recognises both messages the hook sends', () => {
    expect(signupRefusalKind(hookMessage('Not invited'))).toBe('notInvited')
    expect(signupRefusalKind(hookMessage('Not set up'))).toBe('notSetUp')
  })

  it('recognises them URL-encoded, as the OAuth callback carries them', () => {
    const encoded = new URLSearchParams({ error_description: hookMessage('Not invited') }).toString()
    const description = readAuthRedirectError({ search: `?error=access_denied&${encoded}`, hash: '' })
    expect(signupRefusalKind(description)).toBe('notInvited')
  })

  it('leaves other errors alone', () => {
    expect(signupRefusalKind('Invalid login credentials')).toBeNull()
    expect(signupErrorText('Invalid login credentials')).toBe('Invalid login credentials')
    expect(signupRefusalKind(null)).toBeNull()
  })

  it('shows the translated text', () => {
    expect(signupErrorText(hookMessage('Not invited'))).toBe(getTranslation('en', 'securityMonitoring.signup.notInvited'))
    expect(signupErrorText(hookMessage('Not set up'))).toBe(getTranslation('en', 'securityMonitoring.signup.notSetUp'))
  })

  it('reads the error from the hash for the implicit flow, and nothing from a clean URL', () => {
    expect(readAuthRedirectError({ search: '', hash: '#error=server_error&error_description=Not+set+up%3A+x' })).toBe(
      'Not set up: x',
    )
    expect(readAuthRedirectError({ search: '?tab=files', hash: '' })).toBeNull()
  })
})

/**
 * The two refusals of the Before User Created auth hook (schema 502,
 * `auth_hook_before_user_created`), shown in the user's language instead of the database's English.
 *
 * Supabase Auth hands the hook's message back as the error: as `error.message` from a password
 * sign-up, as `error_description` on the OAuth callback (desktop: electron/handlers/oauth.ts) and on
 * the redirect back to the web app. The hook's messages start with "Not invited" or "Not set up";
 * matching on those, wherever Auth puts them in the text, is what ties the two sides together.
 */
import { t } from '@/lib/i18n'

export type SignupRefusal = 'notInvited' | 'notSetUp'

/** Which hook refusal `message` carries, if any. Tolerates URL encoding (`+` for spaces). */
export function signupRefusalKind(message: string | null | undefined): SignupRefusal | null {
  if (!message) return null
  let text = message.replace(/\+/g, ' ')
  try {
    text = decodeURIComponent(text)
  } catch {
    // Not URL-encoded; keep it as it is.
  }
  if (/\bnot invited\b/i.test(text)) return 'notInvited'
  if (/\bnot set up\b/i.test(text)) return 'notSetUp'
  return null
}

/** The translated text for a hook refusal, or the message unchanged when it is something else. */
export function signupErrorText(message: string): string {
  const kind = signupRefusalKind(message)
  return kind ? t(`securityMonitoring.signup.${kind}`) : message
}

/**
 * The error an OAuth redirect brought back to the web app (`?error_description=` with PKCE,
 * `#error_description=` with the implicit flow), or null.
 */
export function readAuthRedirectError(location: { search: string; hash: string }): string | null {
  for (const part of [location.search.slice(1), location.hash.slice(1)]) {
    const params = new URLSearchParams(part)
    const description = params.get('error_description') ?? params.get('error')
    if (description) return description
  }
  return null
}

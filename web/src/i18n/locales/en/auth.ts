import type { TranslationValue } from '@/lib/i18n/types'

export const auth: Record<string, TranslationValue> = {
  signInWithGoogle: 'Continue with Google',
  signOut: 'Sign out',
  noProfile:
    'Your account is not part of an organization yet. Ask an administrator to invite you, then sign in again.',
  profileFailed: 'Could not load your profile.',
}

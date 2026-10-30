import type { TranslationValue } from '@/lib/i18n/types'

export const auth: Record<string, TranslationValue> = {
  title: 'Sign in to BluePLM',
  subtitle: 'Use the account your organization invited you with.',
  email: 'Email',
  password: 'Password',
  signIn: 'Sign in',
  signingIn: 'Signing in…',
  signInWithGoogle: 'Continue with Google',
  or: 'or',
  signOut: 'Sign out',
  invalidCredentials: 'The email or password is not right.',
  noProfile:
    'Your account is not part of an organization yet. Ask an administrator to invite you, then sign in again.',
  profileFailed: 'Could not load your profile.',
  desktopOnlyHint: 'Checking files in and out, and working with SOLIDWORKS, needs the BluePLM desktop app.',
}

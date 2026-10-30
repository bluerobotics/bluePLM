// Translations for BluePLM Web.
//
// The desktop `t()` (src/lib/i18n) reads the language from usePDMStore, which pulls the whole
// desktop store into the bundle, so the web client keeps its own small runtime over the same
// dictionary shape. Every key lives in locales/en.ts; the other locales
// carry every English key (webLocales.test.ts), and a missing key falls back to English.
import { useSyncExternalStore } from 'react'
import type { WebDict } from './types'
import { en } from './locales/en'
import { de } from './locales/de'
import { es } from './locales/es'
import { fr } from './locales/fr'
import { pt } from './locales/pt'
import { zhCN } from './locales/zhCN'
import { zhTW } from './locales/zhTW'

export const WEB_LANGUAGES = ['en', 'de', 'es', 'fr', 'pt', 'zh-CN', 'zh-TW'] as const
export type WebLanguage = (typeof WEB_LANGUAGES)[number]

export const WEB_LOCALES: Record<WebLanguage, WebDict> = {
  en,
  de,
  es,
  fr,
  pt,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
}

/** `{ a: { b: 'x' } }` → `{ 'a.b': 'x' }`, at any depth. */
export function flatten(dict: WebDict, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(dict)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') result[fullKey] = value
    else Object.assign(result, flatten(value, fullKey))
  }
  return result
}

const flat = Object.fromEntries(
  WEB_LANGUAGES.map((language) => [language, flatten(WEB_LOCALES[language])]),
) as Record<WebLanguage, Record<string, string>>

const STORAGE_KEY = 'blueplm-web-language'

function isWebLanguage(value: string | null | undefined): value is WebLanguage {
  return !!value && (WEB_LANGUAGES as readonly string[]).includes(value)
}

function initialLanguage(): WebLanguage {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (isWebLanguage(saved)) return saved
  } catch {
    // Storage blocked: fall through to the browser language.
  }
  if (typeof navigator !== 'undefined') {
    const nav = navigator.language
    if (isWebLanguage(nav)) return nav
    const short = nav?.split('-')[0]
    if (isWebLanguage(short)) return short
  }
  return 'en'
}

let language: WebLanguage = typeof window === 'undefined' ? 'en' : initialLanguage()
const listeners = new Set<() => void>()

export function getLanguage(): WebLanguage {
  return language
}

export function setLanguage(next: WebLanguage): void {
  language = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Not persisted; the choice still applies to this tab.
  }
  if (typeof document !== 'undefined') document.documentElement.lang = next
  listeners.forEach((listener) => listener())
}

export type TranslationParams = Record<string, string | number>

/** Translate a key in the current language, falling back to English, then to the key itself. */
export function t(key: string, params?: TranslationParams): string {
  const text = flat[language][key] ?? flat.en[key] ?? key
  if (!params) return text
  return text.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    params[name] !== undefined ? String(params[name]) : match,
  )
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Re-render when the language changes; returns `t`. */
export function useT(): typeof t {
  useSyncExternalStore(subscribe, getLanguage, getLanguage)
  return t
}

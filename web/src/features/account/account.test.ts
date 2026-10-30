import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const update = vi.fn()
vi.mock('@/lib/supabase/client', () => ({
  getSupabaseClient: () => ({
    from: () => ({ update: (values: unknown) => ({ eq: () => ({ select: () => update(values) }) }) }),
  }),
}))

import { applySavedTheme, getSavedTheme, parseTheme, setTheme, THEME_STORAGE_KEY } from './theme'
import { checkDisplayName, normalizeDisplayName, updateDisplayName } from './profile'

describe('theme', () => {
  let store: Map<string, string>
  let root: { dataset: Record<string, string> }

  beforeEach(() => {
    store = new Map()
    root = { dataset: {} }
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    })
    vi.stubGlobal('document', { documentElement: root })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('parses only known themes', () => {
    expect(parseTheme('light')).toBe('light')
    expect(parseTheme('dark')).toBe('dark')
    expect(parseTheme('neon')).toBeNull()
    expect(parseTheme(null)).toBeNull()
  })

  it('defaults to dark and applies the saved theme', () => {
    expect(applySavedTheme()).toBe('dark')
    expect(root.dataset.theme).toBe('dark')
    store.set(THEME_STORAGE_KEY, 'light')
    expect(applySavedTheme()).toBe('light')
    expect(root.dataset.theme).toBe('light')
  })

  it('applies and remembers a chosen theme', () => {
    setTheme('light')
    expect(root.dataset.theme).toBe('light')
    expect(store.get(THEME_STORAGE_KEY)).toBe('light')
    expect(getSavedTheme()).toBe('light')
  })

  it('still works when storage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    expect(getSavedTheme()).toBe('dark')
    expect(() => setTheme('light')).not.toThrow()
    expect(root.dataset.theme).toBe('light')
  })
})

describe('display name', () => {
  it('normalizes and checks', () => {
    expect(normalizeDisplayName('  Ada   Lovelace ')).toBe('Ada Lovelace')
    expect(checkDisplayName('   ')).toBe('empty')
    expect(checkDisplayName('x'.repeat(101))).toBe('tooLong')
    expect(checkDisplayName('Ada')).toBeNull()
  })

  it('sends the normalized name and reports a refused update', async () => {
    update.mockResolvedValueOnce({ data: [{ id: 'u1' }], error: null })
    expect(await updateDisplayName('u1', ' Ada  L ')).toEqual({ error: null })
    expect(update).toHaveBeenLastCalledWith({ full_name: 'Ada L' })

    update.mockResolvedValueOnce({ data: [], error: null })
    expect(await updateDisplayName('u1', 'Ada')).toEqual({ error: 'refused' })

    update.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    expect(await updateDisplayName('u1', 'Ada')).toEqual({ error: 'boom' })
  })
})

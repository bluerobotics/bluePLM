// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SerializationSettingsBindings } from './SerializationSettingsPresentation'

const state = vi.hoisted(() => ({
  language: 'en' as 'en' | 'de',
  bindings: null as SerializationSettingsBindings | null,
  rpc: vi.fn(async (_name: string, _params: { p_settings?: { keepout_zones: unknown } }) => ({
    data: null,
    error: null,
  })),
}))

vi.mock('@/stores/pdmStore', () => ({
  usePDMStore: (selector: (value: unknown) => unknown) =>
    selector({ organization: { id: 'org-1' }, addToast: vi.fn(), getEffectiveRole: () => 'admin' }),
}))
vi.mock('zustand/react/shallow', () => ({ useShallow: (selector: unknown) => selector }))
vi.mock('@/lib/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/i18n')>()
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, params?: string | import('@/lib/i18n').TranslationParams) =>
        actual.getTranslation(state.language, key, params),
      language: state.language,
    }),
  }
})
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
    }),
    rpc: state.rpc,
  },
}))
vi.mock('./SerializationSettingsPresentation', () => ({
  SerializationSettingsPresentation: ({
    bindings,
  }: {
    bindings: SerializationSettingsBindings
  }) => {
    state.bindings = bindings
    return null
  },
}))

import { SerializationSettings } from './SerializationSettings'

beforeEach(() => {
  state.bindings = null
  state.rpc.mockClear()
})
afterEach(() => cleanup())

describe('serialization keepout persistence', () => {
  it.each(['en', 'de'] as const)(
    'saves the legacy default and an unchanged custom description in %s UI',
    async (language) => {
      state.language = language
      render(<SerializationSettings />)
      await waitFor(() => expect(state.bindings?.loading).toBe(false))

      act(() => state.bindings!.setNewKeepout({ start: '12', end: '17', description: '' }))
      act(() => state.bindings!.addKeepoutZone())
      act(() => state.bindings!.setNewKeepout({ start: '20', end: '22', description: '  Maß α  ' }))
      act(() => state.bindings!.addKeepoutZone())
      await act(async () => state.bindings!.handleSave())

      const save = state.rpc.mock.calls.find(
        ([name]) => name === 'update_serialization_settings_safe',
      )
      expect(save).toBeDefined()
      expect(save![1].p_settings?.keepout_zones).toEqual([
        { start: 12, end_num: 17, description: 'Reserved range 12-17' },
        { start: 20, end_num: 22, description: '  Maß α  ' },
      ])
    },
  )
})

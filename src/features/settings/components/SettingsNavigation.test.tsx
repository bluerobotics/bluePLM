// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { usePDMStore } from '@/stores/pdmStore'
import { SettingsNavigation } from './SettingsNavigation'

afterEach(() => {
  cleanup()
  usePDMStore.setState({ language: 'en' })
})

it('updates navigation when the selected language changes', () => {
  usePDMStore.setState({ language: 'en' })
  render(<SettingsNavigation activeTab="profile" onTabChange={vi.fn()} />)
  expect(screen.getByText('Account')).toBeTruthy()

  act(() => usePDMStore.getState().setLanguage('de'))
  expect(screen.getByText('Konto')).toBeTruthy()
})

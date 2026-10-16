import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  locale: 'en',
  role: 'admin' as 'admin' | 'user',
  translate: vi.fn((key: string) => key),
}))

vi.mock('@/lib/i18n', () => ({
  t: mocks.translate,
}))

vi.mock('@/stores/pdmStore', () => ({
  usePDMStore: (selector: (state: { getEffectiveRole: () => string }) => unknown) =>
    selector({ getEffectiveRole: () => mocks.role }),
}))

vi.mock('./tabs', () => ({
  ServiceTab: () => null,
  LicensesTab: () => null,
  TemplatesTab: () => null,
  SettingsTab: () => null,
}))

import { SolidWorksSettings } from './SolidWorksSettings'

function markup() {
  return renderToStaticMarkup(createElement(SolidWorksSettings))
}

describe('SolidWorksSettings translated tab navigation', () => {
  beforeEach(() => {
    mocks.locale = 'en'
    mocks.role = 'admin'
    mocks.translate.mockImplementation(() => `Audit (${mocks.locale})`)
  })

  it('uses the current translation when the component renders again', () => {
    expect(markup()).toContain('Audit (en)')

    mocks.locale = 'de'
    expect(markup()).toContain('Audit (de)')
  })

  it('keeps the audit tab administrator-only', () => {
    mocks.role = 'user'

    expect(markup()).not.toContain('Audit (en)')
  })
})

import { createElement, isValidElement, type ReactNode } from 'react'
import { createHash } from 'node:crypto'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { getTranslation } from '@/lib/i18n'
import {
  SerializationSettingsPresentation,
  type SerializationSettingsBindings,
} from './SerializationSettingsPresentation'
import { DEFAULT_SERIALIZATION_SETTINGS } from './serializationSettingsModel'

const richSettings = {
  ...DEFAULT_SERIALIZATION_SETTINGS,
  current_counter: 41,
  prefix: 'CAD-',
  suffix: '-REV',
  letter_prefix: 'AB',
  tab_enabled: true,
  tab_required: true,
  tab_allow_letters: true,
  tab_allow_special: true,
  keepout_zones: [{ start: 43, end_num: 99, description: 'Reserved' }],
  auto_apply_extensions: ['.sldprt', '.custom'],
}

function bindings(
  overrides: Partial<SerializationSettingsBindings> = {},
): SerializationSettingsBindings {
  return {
    organization: true,
    loading: false,
    isAdmin: true,
    settings: DEFAULT_SERIALIZATION_SETTINGS,
    livePreview: 'PN-00001',
    loadingPreview: false,
    fetchPreview: vi.fn(async () => undefined),
    previewNumber: null,
    updateSetting: vi.fn(),
    detecting: false,
    handleDetectHighest: vi.fn(async () => undefined),
    detectedResult: null,
    applyDetectedCounter: vi.fn(),
    basePreview: 'PN-00001',
    newKeepout: { start: '', end: '', description: '' },
    setNewKeepout: vi.fn(),
    showKeepoutForm: false,
    setShowKeepoutForm: vi.fn(),
    addKeepoutZone: vi.fn(),
    removeKeepoutZone: vi.fn(),
    customExtension: '',
    setCustomExtension: vi.fn(),
    toggleExtension: vi.fn(),
    addCustomExtension: vi.fn(),
    t: (key, params) =>
      key.startsWith('settingsPages.')
        ? getTranslation('en', key, params)
        : params
          ? `${key}:${JSON.stringify(params)}`
          : key,
    saving: false,
    handleSave: vi.fn(async () => undefined),
    ...overrides,
  }
}

interface ElementProps {
  children?: ReactNode
  title?: string
  value?: unknown
  placeholder?: string
  disabled?: boolean
  onClick?: () => unknown
  onChange?: (event: { target: { value: string; checked: boolean } }) => unknown
  onKeyDown?: (event: { key: string }) => unknown
}

function elements(node: ReactNode): Array<{ type: unknown; props: ElementProps }> {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<ElementProps>(node)) return []
  return [{ type: node.type, props: node.props }, ...elements(node.props.children)]
}

function text(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(text).join('')
  if (isValidElement<ElementProps>(node)) return text(node.props.children)
  return ''
}

function tree(value: SerializationSettingsBindings) {
  return elements(SerializationSettingsPresentation({ bindings: value }))
}

function button(value: SerializationSettingsBindings, label: string) {
  const found = tree(value).find(
    (node) => node.type === 'button' && text(node.props.children).trim() === label,
  )
  if (!found) throw new Error(`Button missing: ${label}`)
  return found.props
}

describe('shared Serialization settings presentation', () => {
  it('matches ten real legacy normal HTML trees from fixed 51b020 / blob 3f6fec3', () => {
    // Captured before extraction from the actual normal component, with only its
    // provider dependencies and React state hooks substituted for deterministic states.
    const rich = {
      settings: richSettings,
      livePreview: 'CAD-AB00042-001-REV',
      basePreview: 'CAD-AB00042',
    }
    const cases: Array<{
      name: string
      value: Partial<SerializationSettingsBindings>
      hash: string
    }> = [
      {
        name: 'disconnected',
        value: { organization: false, isAdmin: false },
        hash: 'a7d61b9b030918bf3df5b23d53e4c2ecec56e5c7cb705fc82221c0fa4c4e6b70',
      },
      {
        name: 'loading',
        value: { loading: true },
        hash: 'a20cb6e23327f831b80dd9fd2a4a61b10d1f3386b442e7e8e55eec25ea61e1b6',
      },
      {
        name: 'admin-default',
        value: {},
        hash: '1ee6d4bbd9a62b2619b96fc60a90649eb15d6580acd754bd6388b21a5f9a3c52',
      },
      {
        name: 'member-readonly',
        value: { ...rich, isAdmin: false },
        hash: '2870de270dc0c93a7da5a49dcc63c855e588fb93ab4e354d39ea6372ce34c68a',
      },
      {
        name: 'admin-rich',
        value: {
          ...rich,
          previewNumber: 'CAD-AB00042-REV',
          detectedResult: {
            highestCounter: 105,
            highestPartNumber: 'CAD-AB00105-REV',
            totalScanned: 12,
            skippedHidden: 3,
          },
        },
        hash: '3271ffb9842a298854202bfdd6ea26171e4e481eb13d3c191b398976f156cadd',
      },
      {
        name: 'admin-disabled',
        value: {
          settings: { ...DEFAULT_SERIALIZATION_SETTINGS, enabled: false },
          livePreview: 'Disabled',
          basePreview: '',
        },
        hash: 'ff3e56ee0dc0aa24014a0e1988bbbcd398262ead43f32d7453ed862fcd7ed734',
      },
      {
        name: 'admin-keepout-form',
        value: {
          newKeepout: { start: '200', end: '299', description: 'Legacy' },
          showKeepoutForm: true,
          customExtension: '.custom',
        },
        hash: 'f1716431f8a25823cce1cbd012bb6100494ebd32b6cf968e902c72e2e348310d',
      },
      {
        name: 'admin-busy',
        value: { saving: true, loadingPreview: true, detecting: true },
        hash: 'aed0cb6cccadaf9b7aa0238dbff09752c2ac54f9fd45688dfa0db3a97fc70603',
      },
      {
        name: 'admin-no-tab-characters',
        value: {
          ...rich,
          settings: {
            ...richSettings,
            tab_allow_letters: false,
            tab_allow_numbers: false,
            tab_allow_special: false,
          },
        },
        hash: '45d93114bd928392519183c815d18472228b2b1ef56895e290afde908860281d',
      },
      {
        name: 'scan-no-match',
        value: {
          detectedResult: {
            highestCounter: 0,
            highestPartNumber: '',
            totalScanned: 6,
            skippedHidden: 0,
          },
        },
        hash: '39148768dce38115ce1646ab7dd25cded22ad0780b772ebf8b62a6e24e59ad97',
      },
    ]
    for (const state of cases) {
      const html = renderToStaticMarkup(
        createElement(SerializationSettingsPresentation, { bindings: bindings(state.value) }),
      )
      expect(createHash('sha256').update(html).digest('hex'), state.name).toBe(state.hash)
    }
  })

  it('routes preview, scan, explicit Apply and Save to their supplied normal callbacks', async () => {
    const value = bindings({
      detectedResult: {
        highestCounter: 5,
        highestPartNumber: 'PN-00005',
        totalScanned: 2,
        skippedHidden: 0,
      },
    })
    const preview = tree(value).find(
      (node) => node.type === 'button' && node.props.title === 'Fetch from server',
    )
    await preview?.props.onClick?.()
    await button(value, 'Scan Vault').onClick?.()
    button(value, 'Apply').onClick?.()
    await button(value, 'Save Settings').onClick?.()
    expect(value.fetchPreview).toHaveBeenCalledOnce()
    expect(value.handleDetectHighest).toHaveBeenCalledOnce()
    expect(value.applyDetectedCounter).toHaveBeenCalledOnce()
    expect(value.handleSave).toHaveBeenCalledOnce()
  })

  it('keeps normal field conversion and extension/keepout control callbacks', () => {
    const value = bindings({ settings: richSettings, showKeepoutForm: true })
    const nodes = tree(value)
    const field = (fieldValue: unknown) =>
      nodes.find((node) => node.type === 'input' && node.props.value === fieldValue)?.props
    field('CAD-')?.onChange?.({ target: { value: 'NEW-', checked: false } })
    field('AB')?.onChange?.({ target: { value: 'xy', checked: false } })
    expect(value.updateSetting).toHaveBeenCalledWith('prefix', 'NEW-')
    expect(value.updateSetting).toHaveBeenCalledWith('letter_prefix', 'XY')
    const extension = nodes.find(
      (node) => node.type === 'button' && text(node.props.children).includes('SolidWorks Part'),
    )
    extension?.props.onClick?.()
    expect(value.toggleExtension).toHaveBeenCalledWith('.sldprt')
    const remove = nodes.find(
      (node) => node.type === 'button' && node.props.title === 'Remove zone',
    )
    remove?.props.onClick?.()
    expect(value.removeKeepoutZone).toHaveBeenCalledWith(0)
    const adds = nodes.filter(
      (node) => node.type === 'button' && text(node.props.children).trim() === 'Add',
    )
    for (const add of adds) add.props.onClick?.()
    expect(value.addCustomExtension).toHaveBeenCalledOnce()
    expect(value.addKeepoutZone).toHaveBeenCalledOnce()
  })

  it('retains readonly and busy control availability', () => {
    const member = bindings({ isAdmin: false })
    expect(
      tree(member).some(
        (node) => node.type === 'button' && text(node.props.children).trim() === 'Save Settings',
      ),
    ).toBe(false)
    expect(
      tree(member)
        .filter((node) => node.type === 'input')
        .every((node) => node.props.disabled),
    ).toBe(true)
    const busy = bindings({ saving: true, loadingPreview: true, detecting: true })
    expect(button(busy, 'Save Settings').disabled).toBe(true)
    const preview = tree(busy).find(
      (node) => node.type === 'button' && node.props.title === 'Fetch from server',
    )
    expect(preview?.props.disabled).toBe(true)
  })
})

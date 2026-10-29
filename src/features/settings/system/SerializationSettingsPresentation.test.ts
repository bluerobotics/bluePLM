import { isValidElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
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
    t: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
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

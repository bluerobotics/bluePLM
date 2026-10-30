import { describe, expect, it } from 'vitest'
import { customPropertyRows, groupReferences, propertyText, splitWhereUsed, type ReferenceRow } from './detail'

function ref(id: string, fileName: string, overrides: Partial<ReferenceRow> = {}, deleted = false): ReferenceRow {
  return {
    id: `ref-${id}-${overrides.configuration ?? ''}`,
    reference_type: 'component',
    quantity: 1,
    configuration: null,
    other: {
      id,
      file_name: fileName,
      file_path: `A/${fileName}`,
      vault_id: 'v',
      part_number: null,
      description: null,
      revision: 'A',
      state: null,
      deleted_at: deleted ? '2026-01-01T00:00:00Z' : null,
    },
    ...overrides,
  }
}

describe('groupReferences', () => {
  it('merges configurations of the same file and keeps the largest quantity', () => {
    const items = groupReferences([
      ref('1', 'bolt.sldprt', { configuration: 'Default', quantity: 4 }),
      ref('1', 'bolt.sldprt', { configuration: 'Long', quantity: 8 }),
      ref('2', 'nut.sldprt'),
    ])
    expect(items).toHaveLength(2)
    expect(items[0].file.id).toBe('1')
    expect(items[0].configurations).toEqual(['Default', 'Long'])
    expect(items[0].quantity).toBe(8)
  })
  it('drops deleted files and rows whose file RLS hid', () => {
    const items = groupReferences([ref('1', 'gone.sldprt', {}, true), { ...ref('2', 'x'), other: null }])
    expect(items).toEqual([])
  })
  it('defaults the type and a missing quantity', () => {
    const [item] = groupReferences([ref('1', 'a', { reference_type: null, quantity: null })])
    expect(item.referenceType).toBe('component')
    expect(item.quantity).toBe(1)
  })
})

describe('splitWhereUsed', () => {
  it('separates drawings from other parents', () => {
    const items = groupReferences([ref('1', 'top.SLDASM'), ref('2', 'part.SLDDRW')])
    const { drawings, parents } = splitWhereUsed(items)
    expect(drawings.map((i) => i.file.id)).toEqual(['2'])
    expect(parents.map((i) => i.file.id)).toEqual(['1'])
  })
})

describe('customPropertyRows', () => {
  const columns = [
    { name: 'Material', label: 'Material', sort_order: 2 },
    { name: 'finish', label: 'Surface finish', sort_order: 1 },
  ]
  it('orders by the org columns, labels them, then lists other keys alphabetically', () => {
    const rows = customPropertyRows({ zeta: 'z', Material: '6061', Finish: 'Anodized', alpha: 3, empty: '' }, columns)
    expect(rows.map((r) => [r.label, r.value])).toEqual([
      ['Surface finish', 'Anodized'],
      ['Material', '6061'],
      ['alpha', '3'],
      ['zeta', 'z'],
    ])
  })
  it('ignores non-objects', () => {
    expect(customPropertyRows(null, columns)).toEqual([])
    expect(customPropertyRows(['a'], columns)).toEqual([])
    expect(customPropertyRows('x', columns)).toEqual([])
  })
})

describe('propertyText', () => {
  it('renders scalars and JSON, skipping empty values', () => {
    expect(propertyText('x')).toBe('x')
    expect(propertyText(false)).toBe('false')
    expect(propertyText({ a: 1 })).toBe('{"a":1}')
    expect(propertyText({})).toBeNull()
    expect(propertyText(' ')).toBeNull()
    expect(propertyText(undefined)).toBeNull()
  })
})

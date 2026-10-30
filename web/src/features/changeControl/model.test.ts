import { describe, expect, it } from 'vitest'
import {
  buildEcoHistory,
  checklistStatusPatch,
  dateInputToIso,
  deviationStatusPatch,
  deviationStatusTargets,
  ecoStatusPatch,
  ecoStatusTargets,
  effectiveDeviationStatus,
  groupChecklist,
  hasGrant,
  isExpiringSoon,
  isUniqueViolation,
  isUuid,
  isoToDateInput,
  matchesQuery,
  mergePartNumbers,
  normalizeNumber,
  parsePartNumbers,
  resolvePermissions,
  sanitizeSearchTerm,
  validateDeviationDraft,
  validateEcoDraft,
  type ChecklistItemLike,
  type GateLike,
} from './model'

const NOW = '2026-10-29T12:00:00.000Z'

describe('permissions', () => {
  it('gives an admin everything', () => {
    expect(resolvePermissions([], true)).toEqual({
      eco: { create: true, edit: true, delete: true },
      deviations: { create: true, edit: true, delete: true },
    })
  })

  it('reads actions per module', () => {
    const perms = resolvePermissions(
      [
        { resource: 'module:eco', actions: ['view', 'create', 'edit'] },
        { resource: 'module:deviations', actions: ['view'] },
      ],
      false,
    )
    expect(perms.eco).toEqual({ create: true, edit: true, delete: false })
    expect(perms.deviations).toEqual({ create: false, edit: false, delete: false })
  })

  it('treats an admin grant on a resource as every action, like user_has_permission', () => {
    expect(hasGrant([{ resource: 'module:eco', actions: ['admin'] }], false, 'module:eco', 'delete')).toBe(true)
    expect(hasGrant([{ resource: 'module:eco', actions: ['admin'] }], false, 'module:deviations', 'edit')).toBe(false)
  })
})

describe('validation', () => {
  it('normalizes numbers', () => {
    expect(normalizeNumber('  eco-12 ')).toBe('ECO-12')
  })

  it('requires an ECO number, title optional', () => {
    expect(validateEcoDraft({ number: ' ', title: '', description: '' })).toEqual({ number: 'required' })
    expect(validateEcoDraft({ number: 'ECO-1', title: '', description: '' })).toEqual({})
    expect(validateEcoDraft({ number: 'x'.repeat(65), title: 't'.repeat(201), description: '' })).toEqual({
      number: 'tooLong',
      title: 'tooLong',
    })
  })

  it('requires deviation number and title, and expiry not before effective date', () => {
    const base = { number: 'DEV-1', title: 'Alt material', description: '', type: '', effectiveDate: '', expirationDate: '', partNumbers: '' }
    expect(validateDeviationDraft(base)).toEqual({})
    expect(validateDeviationDraft({ ...base, number: '', title: ' ' })).toEqual({ number: 'required', title: 'required' })
    expect(validateDeviationDraft({ ...base, effectiveDate: '2026-11-02', expirationDate: '2026-11-01' })).toEqual({
      expirationDate: 'beforeEffective',
    })
    expect(validateDeviationDraft({ ...base, effectiveDate: '2026-11-01', expirationDate: '2026-11-01' })).toEqual({})
  })

  it('parses and merges part numbers', () => {
    expect(parsePartNumbers('A-1, B-2;\nA-1\n\n C-3 ')).toEqual(['A-1', 'B-2', 'C-3'])
    expect(mergePartNumbers(['A-1'], ['B-2', null, 'A-1', ''])).toEqual(['A-1', 'B-2'])
    expect(mergePartNumbers(null, [])).toEqual([])
  })
})

describe('dates', () => {
  it('round-trips a date input through local midnight', () => {
    const iso = dateInputToIso('2026-03-15')
    expect(iso).not.toBeNull()
    expect(isoToDateInput(iso)).toBe('2026-03-15')
  })

  it('rejects invalid dates', () => {
    expect(dateInputToIso('')).toBeNull()
    expect(dateInputToIso('2026-02-30')).toBeNull()
    expect(isoToDateInput('nonsense')).toBe('')
    expect(isoToDateInput(null)).toBe('')
  })
})

describe('ECO status', () => {
  it('offers every other status', () => {
    expect(ecoStatusTargets('open')).toEqual(['in_progress', 'completed', 'cancelled'])
    expect(ecoStatusTargets(null)).toEqual(['in_progress', 'completed', 'cancelled'])
    expect(ecoStatusTargets('completed')).toEqual(['open', 'in_progress', 'cancelled'])
  })

  it('stamps completion and clears it on reopen', () => {
    expect(ecoStatusPatch('open', 'completed', 'u1', NOW)).toEqual({ status: 'completed', updated_at: NOW, updated_by: 'u1', completed_at: NOW })
    expect(ecoStatusPatch('completed', 'in_progress', 'u1', NOW)).toEqual({ status: 'in_progress', updated_at: NOW, updated_by: 'u1', completed_at: null })
    expect(ecoStatusPatch('open', 'cancelled', 'u1', NOW)).not.toHaveProperty('completed_at')
  })
})

describe('deviation status', () => {
  const now = new Date(NOW)

  it('derives expired from the expiration date of an approved deviation', () => {
    expect(effectiveDeviationStatus({ status: 'approved', expiration_date: '2026-10-01T00:00:00Z' }, now)).toBe('expired')
    expect(effectiveDeviationStatus({ status: 'approved', expiration_date: '2026-12-01T00:00:00Z' }, now)).toBe('approved')
    expect(effectiveDeviationStatus({ status: 'draft', expiration_date: '2026-10-01T00:00:00Z' }, now)).toBe('draft')
    expect(effectiveDeviationStatus({ status: null, expiration_date: null }, now)).toBe('draft')
  })

  it('flags approvals expiring within 30 days', () => {
    expect(isExpiringSoon({ status: 'approved', expiration_date: '2026-11-10T00:00:00Z' }, now)).toBe(true)
    expect(isExpiringSoon({ status: 'approved', expiration_date: '2027-01-10T00:00:00Z' }, now)).toBe(false)
    expect(isExpiringSoon({ status: 'pending_approval', expiration_date: '2026-11-10T00:00:00Z' }, now)).toBe(false)
  })

  it('never offers expired as a target', () => {
    expect(deviationStatusTargets('draft')).toEqual(['pending_approval', 'approved', 'rejected', 'closed'])
    expect(deviationStatusTargets('expired')).toContain('closed')
    expect(deviationStatusTargets('expired')).not.toContain('expired')
  })

  it('records approval', () => {
    expect(deviationStatusPatch('pending_approval', 'approved', 'u1', NOW)).toEqual({
      ok: true,
      patch: { status: 'approved', updated_at: NOW, updated_by: 'u1', approved_by: 'u1', approved_at: NOW, rejection_reason: null },
    })
  })

  it('requires a reason to reject and withdraws approval', () => {
    expect(deviationStatusPatch('pending_approval', 'rejected', 'u1', NOW, '  ')).toEqual({ ok: false, error: 'reasonRequired' })
    const result = deviationStatusPatch('approved', 'rejected', 'u1', NOW, ' wrong alloy ')
    expect(result).toEqual({
      ok: true,
      patch: { status: 'rejected', updated_at: NOW, updated_by: 'u1', rejection_reason: 'wrong alloy', approved_by: null, approved_at: null },
    })
  })

  it('withdraws a decision when sent back, keeps it when closed', () => {
    expect(deviationStatusPatch('approved', 'draft', 'u1', NOW)).toEqual({
      ok: true,
      patch: { status: 'draft', updated_at: NOW, updated_by: 'u1', approved_by: null, approved_at: null },
    })
    expect(deviationStatusPatch('rejected', 'pending_approval', 'u1', NOW)).toEqual({
      ok: true,
      patch: { status: 'pending_approval', updated_at: NOW, updated_by: 'u1', rejection_reason: null },
    })
    expect(deviationStatusPatch('approved', 'closed', 'u1', NOW)).toEqual({
      ok: true,
      patch: { status: 'closed', updated_at: NOW, updated_by: 'u1' },
    })
  })
})

describe('lists and search', () => {
  it('matches number, title, description and extras case-insensitively', () => {
    const item = { number: 'ECO-7', title: 'Bracket', description: null, extra: ['BR-100'] }
    expect(matchesQuery(item, 'eco-7')).toBe(true)
    expect(matchesQuery(item, 'bracket')).toBe(true)
    expect(matchesQuery(item, 'br-100')).toBe(true)
    expect(matchesQuery(item, 'nope')).toBe(false)
    expect(matchesQuery(item, '  ')).toBe(true)
  })

  it('strips characters that would alter a PostgREST filter', () => {
    expect(sanitizeSearchTerm('a,b)(c%_d*')).toBe('a b c d')
    expect(sanitizeSearchTerm('  BR-100  ')).toBe('BR-100')
    expect(sanitizeSearchTerm('bracket.sldprt')).toBe('bracket.sldprt')
  })

  it('recognizes UUIDs', () => {
    expect(isUuid('3f2b8c1e-1d2a-4b5c-9e8f-0a1b2c3d4e5f')).toBe(true)
    expect(isUuid('new')).toBe(false)
    expect(isUuid('3f2b8c1e-1d2a-4b5c-9e8f-0a1b2c3d4e5')).toBe(false)
  })

  it('recognizes unique violations', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true)
    expect(isUniqueViolation({ message: 'duplicate key value violates unique constraint' })).toBe(true)
    expect(isUniqueViolation({ code: '42501', message: 'permission denied' })).toBe(false)
    expect(isUniqueViolation(null)).toBe(false)
  })
})

describe('checklist', () => {
  const item = (over: Partial<ChecklistItemLike> & { id: string }): ChecklistItemLike => ({
    phase_name: 'Design',
    phase_sort_order: 0,
    sort_order: 0,
    name: over.id,
    status: 'not_started',
    required_for_gate: false,
    gate_name: null,
    ...over,
  })

  it('groups by phase in order, counts progress and lists blocking items', () => {
    const items = [
      item({ id: 'b', phase_name: 'Build', phase_sort_order: 1, required_for_gate: true }),
      item({ id: 'a2', sort_order: 2, status: 'complete', required_for_gate: true }),
      item({ id: 'a1', sort_order: 1, status: 'na' }),
      item({ id: 'a3', sort_order: 3, required_for_gate: true, status: 'blocked' }),
    ]
    const gates: GateLike[] = [
      { gate_name: 'G1', phase_name: 'Design', is_approved: false },
      { gate_name: 'G9', phase_name: 'Ship', is_approved: true },
    ]
    const phases = groupChecklist(items, gates)
    expect(phases.map((phase) => phase.name)).toEqual(['Design', 'Build', 'Ship'])
    expect(phases[0].items.map((i) => i.id)).toEqual(['a1', 'a2', 'a3'])
    expect(phases[0]).toMatchObject({ done: 2, total: 3, blocking: ['a3'] })
    expect(phases[0].gate?.gate_name).toBe('G1')
    expect(phases[1]).toMatchObject({ done: 0, total: 1, blocking: ['b'], gate: null })
    expect(phases[2]).toMatchObject({ total: 0, blocking: [] })
  })

  it('stamps start and completion', () => {
    expect(checklistStatusPatch('not_started', 'in_progress', 'u1', NOW, null)).toEqual({
      status: 'in_progress', updated_at: NOW, updated_by: 'u1', started_at: NOW,
    })
    expect(checklistStatusPatch('in_progress', 'complete', 'u1', NOW, '2026-10-01T00:00:00Z')).toEqual({
      status: 'complete', updated_at: NOW, updated_by: 'u1', completed_at: NOW, completed_by: 'u1',
    })
    expect(checklistStatusPatch('complete', 'in_progress', 'u1', NOW, '2026-10-01T00:00:00Z')).toEqual({
      status: 'in_progress', updated_at: NOW, updated_by: 'u1', completed_at: null, completed_by: null,
    })
  })
})

describe('history', () => {
  const eco = { id: 'e1', created_at: '2026-10-01T00:00:00Z', created_by: 'u1', completed_at: '2026-10-20T00:00:00Z', status: 'completed' as const }

  it('adds creation and completion from the row when not logged, newest first', () => {
    const history = buildEcoHistory(eco, [
      { id: 'a1', action: 'files_added', old_value: null, new_value: '2', notes: null, performed_by: 'u2', performed_at: '2026-10-05T00:00:00Z' },
    ])
    expect(history.map((entry) => entry.action)).toEqual(['status_changed', 'files_added', 'eco_created'])
    expect(history[0].newValue).toBe('completed')
    expect(history[2].userId).toBe('u1')
  })

  it('does not duplicate logged creation or completion', () => {
    const history = buildEcoHistory(eco, [
      { id: 'c', action: 'eco_created', old_value: null, new_value: null, notes: null, performed_by: 'u1', performed_at: '2026-10-01T00:00:01Z' },
      { id: 's', action: 'status_changed', old_value: 'open', new_value: 'completed', notes: null, performed_by: 'u1', performed_at: '2026-10-20T00:00:01Z' },
      { id: 'x', action: 'files_added', old_value: null, new_value: '1', notes: null, performed_by: 'u1', performed_at: null },
    ])
    expect(history.map((entry) => entry.id)).toEqual(['s', 'c'])
  })
})

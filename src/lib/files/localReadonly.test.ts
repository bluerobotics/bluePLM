import { afterEach, describe, expect, it, vi } from 'vitest'

import { t } from '@/lib/i18n'

import { makeFilesWritable, readDiskWriteAccess, stopIfFileNotWritable } from './localReadonly'

const storeActions = vi.hoisted(() => ({
  addToast: vi.fn(),
  recordMetadataWriteStates: vi.fn(),
}))

vi.mock('@/stores/pdmStore', () => ({
  usePDMStore: { getState: () => storeActions },
}))

type ReadonlyResult = { success: boolean; readonly?: boolean; error?: string; code?: string }

function install(options: {
  reads: ReadonlyResult[]
  batch?: { success: boolean; results?: Array<{ path: string; success: boolean }> } | null
}) {
  const isReadonly = vi.fn(async () => options.reads.shift() ?? { success: false })
  const setReadonlyBatch = vi.fn(async () => options.batch ?? { success: true, results: [] })
  // @ts-expect-error the test only needs the filesystem surface these functions touch
  globalThis.window = { electronAPI: { isReadonly, setReadonlyBatch } }
  return { isReadonly, setReadonlyBatch }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('readDiskWriteAccess', () => {
  it('reports a read-only file', async () => {
    install({ reads: [{ success: true, readonly: true }] })
    expect(await readDiskWriteAccess('C:\\vault\\a.sldprt')).toBe('readonly')
  })

  it('reports a writable file', async () => {
    install({ reads: [{ success: true, readonly: false }] })
    expect(await readDiskWriteAccess('C:\\vault\\a.sldprt')).toBe('writable')
  })

  it('reports unknown when the attribute cannot be read', async () => {
    install({ reads: [{ success: false, error: 'locked' }] })
    expect(await readDiskWriteAccess('C:\\vault\\a.sldprt')).toBe('unknown')
  })

  it('reports missing when nothing exists at the path', async () => {
    install({ reads: [{ success: false, error: 'Error: ENOENT', code: 'ENOENT' }] })
    expect(await readDiskWriteAccess('C:\\vault\\renamed.sldprt')).toBe('missing')
  })

  it('keeps unknown for a stat failure that is not a missing file', async () => {
    install({ reads: [{ success: false, error: 'Error: EPERM', code: 'EPERM' }] })
    expect(await readDiskWriteAccess('C:\\vault\\a.sldprt')).toBe('unknown')
  })
})

describe('stopIfFileNotWritable', () => {
  const path = 'C:\\vault\\heatsink.sldprt'
  const edit = {
    path,
    fields: ['description' as const],
    pending: { description: 'Heatsink' },
  }

  afterEach(() => {
    storeActions.addToast.mockClear()
    storeActions.recordMetadataWriteStates.mockClear()
  })

  it('names the missing file, not read-only state, and marks the edit failed', async () => {
    install({ reads: [{ success: false, error: 'Error: ENOENT', code: 'ENOENT' }] })

    expect(await stopIfFileNotWritable(path, edit)).toBe(true)

    expect(storeActions.addToast).toHaveBeenCalledWith('error', t('fileReadonly.missing'))
    expect(storeActions.addToast).not.toHaveBeenCalledWith('error', t('fileReadonly.unknown'))
    expect(storeActions.recordMetadataWriteStates).toHaveBeenCalledWith(path, [
      {
        address: { scope: 'file', field: 'description' },
        state: 'failed',
        reason: t('fileReadonly.missing'),
      },
    ])
  })

  it('still reports unknown for a stat failure that is not a missing file', async () => {
    install({ reads: [{ success: false, error: 'Error: EBUSY', code: 'EBUSY' }] })

    expect(await stopIfFileNotWritable(path)).toBe(true)

    expect(storeActions.addToast).toHaveBeenCalledWith('error', t('fileReadonly.unknown'))
  })

  it('lets a writable file through without a toast', async () => {
    install({ reads: [{ success: true, readonly: false }] })

    expect(await stopIfFileNotWritable(path, edit)).toBe(false)

    expect(storeActions.addToast).not.toHaveBeenCalled()
    expect(storeActions.recordMetadataWriteStates).not.toHaveBeenCalled()
  })
})

describe('makeFilesWritable', () => {
  it('retries once and returns only the paths that stay unwritable', async () => {
    const { setReadonlyBatch } = install({
      reads: [
        { success: true, readonly: true },
        { success: true, readonly: false },
        { success: true, readonly: true },
        { success: true, readonly: true },
      ],
    })

    const still = await makeFilesWritable(['C:\\vault\\stuck.sldprt', 'C:\\vault\\ok.sldprt'])

    expect(setReadonlyBatch).toHaveBeenCalledTimes(2)
    expect(still).toEqual(['C:\\vault\\stuck.sldprt'])
  })

  it('does nothing for an empty list', async () => {
    const { setReadonlyBatch } = install({ reads: [] })
    expect(await makeFilesWritable([])).toEqual([])
    expect(setReadonlyBatch).not.toHaveBeenCalled()
  })
})

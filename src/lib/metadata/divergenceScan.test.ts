import { describe, expect, it } from 'vitest'

import {
  inFileScope,
  isInsideFixtureRoot,
  resolveAbsolutePath,
  type DivergenceScanOptions,
  type ScanRow,
} from './divergenceScan'

function rowAt(filePath: string, extension = '.sldprt'): ScanRow {
  const slash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  return {
    id: `row-${filePath}`,
    file_path: filePath,
    file_name: filePath.slice(slash + 1),
    extension,
    part_number: null,
    description: null,
    revision: null,
    custom_properties: null,
  }
}

function optionsWith(pathPrefix?: string): DivergenceScanOptions {
  return {
    orgId: 'org-1',
    vaultId: null,
    vaultPath: 'C:\\BluePLM\\br-vault',
    pathPrefix,
  }
}

describe('inFileScope', () => {
  it('covers every model in the vault when no folder was named', () => {
    expect(inFileScope(rowAt('Parts/ORING.SLDPRT'), optionsWith())).toBe(true)
    expect(inFileScope(rowAt('Assemblies/RIG.SLDASM', '.sldasm'), optionsWith())).toBe(true)
  })

  it('leaves out the file types a scan of this kind never opens', () => {
    expect(inFileScope(rowAt('Parts/SPEC.pdf', '.pdf'), optionsWith())).toBe(false)
    expect(inFileScope(rowAt('Parts/PLATE.SLDDRW', '.slddrw'), optionsWith())).toBe(false)
    expect(
      inFileScope(rowAt('Parts/PLATE.SLDDRW', '.slddrw'), {
        ...optionsWith(),
        includeDrawings: true,
      }),
    ).toBe(true)
  })

  it('takes the folder and everything beneath it', () => {
    const options = optionsWith('0 - SHARED/00 - REGRESSION TESTS')
    expect(inFileScope(rowAt('0 - SHARED/00 - REGRESSION TESTS/ORING.SLDPRT'), options)).toBe(true)
    const nested = rowAt('0 - SHARED/00 - REGRESSION TESTS/nested/deep/RIG.SLDASM', '.sldasm')
    expect(inFileScope(nested, options)).toBe(true)
    expect(inFileScope(rowAt('1 - PRIVATE/ORING.SLDPRT'), options)).toBe(false)
  })

  /**
   * The bug this predicate shipped with. `startsWith` on a bare prefix let a folder claim every
   * sibling whose name it happened to begin, so a scope of `Parts` silently audited `Parts-Old`
   * too - and the operator had no way to see it, because the extra files simply appeared in the
   * results as if they belonged.
   */
  it('does not let a folder claim a sibling whose name merely starts the same way', () => {
    const options = optionsWith('Parts')
    expect(inFileScope(rowAt('Parts/ORING.SLDPRT'), options)).toBe(true)
    expect(inFileScope(rowAt('Parts-Old/ORING.SLDPRT'), options)).toBe(false)
    expect(inFileScope(rowAt('PartsArchive/ORING.SLDPRT'), options)).toBe(false)
  })

  it('reads a folder the same way whichever separator, casing or stray edges it arrives with', () => {
    const row = rowAt('0 - SHARED/00 - REGRESSION TESTS/ORING.SLDPRT')
    for (const prefix of [
      '0 - SHARED\\00 - REGRESSION TESTS',
      '0 - shared/00 - regression tests',
      '/0 - SHARED/00 - REGRESSION TESTS/',
      '  0 - SHARED\\00 - REGRESSION TESTS  ',
    ]) {
      expect(inFileScope(row, optionsWith(prefix))).toBe(true)
    }
  })

  /**
   * Both copy-path affordances in the browser hand out an absolute path, so this is the easiest
   * thing to paste into the folder box. The run knows its vault root exactly, so a path inside it
   * is cut back to the relative part (Wilson's blank POWERMODULE run, 2026-10-29).
   */
  it('accepts an absolute path inside the vault root', () => {
    const options = optionsWith('C:\\BluePLM\\br-vault\\0 - SHARED\\')
    expect(inFileScope(rowAt('0 - SHARED/ORING.SLDPRT'), options)).toBe(true)
    expect(inFileScope(rowAt('Parts/ORING.SLDPRT'), options)).toBe(false)
  })

  it('is case-insensitive about the vault root and its separators', () => {
    const options = optionsWith('c:/bluePLM/BR-VAULT/0 - SHARED')
    expect(inFileScope(rowAt('0 - SHARED/ORING.SLDPRT'), options)).toBe(true)
  })

  // Outside the root nothing can be cut, so it still matches nothing and is reported as such.
  it('matches nothing for an absolute path outside the vault root', () => {
    const options = optionsWith('D:\\Elsewhere\\0 - SHARED')
    expect(inFileScope(rowAt('0 - SHARED/ORING.SLDPRT'), options)).toBe(false)
  })

  it('treats the vault root itself as the whole vault', () => {
    const options = optionsWith('C:\\BluePLM\\br-vault')
    expect(inFileScope(rowAt('Parts/ORING.SLDPRT'), options)).toBe(true)
  })

  it('treats a folder of nothing but separators as the vault root', () => {
    expect(inFileScope(rowAt('Parts/ORING.SLDPRT'), optionsWith('/'))).toBe(true)
  })
})

describe('resolveAbsolutePath', () => {
  it('joins the vault root to a relative row path in one separator', () => {
    expect(resolveAbsolutePath('C:\\BluePLM\\br-vault\\', '/Parts/ORING.SLDPRT')).toBe(
      'C:\\BluePLM\\br-vault\\Parts\\ORING.SLDPRT',
    )
  })
})

describe('isInsideFixtureRoot', () => {
  it('holds the separator boundary a sibling folder would otherwise cross', () => {
    expect(isInsideFixtureRoot('C:\\Fixtures\\case-1\\A.SLDPRT', 'C:\\Fixtures')).toBe(true)
    expect(isInsideFixtureRoot('C:\\FixturesOld\\A.SLDPRT', 'C:\\Fixtures')).toBe(false)
  })
})

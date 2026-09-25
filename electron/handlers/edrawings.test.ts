import { describe, expect, it } from 'vitest'

import { findEDrawingsExecutable } from './edrawings'

describe('findEDrawingsExecutable', () => {
  it('finds the current Common Files eDrawings year layout', () => {
    const expected = 'C:\\Program Files\\Common Files\\eDrawings2026\\eDrawings.exe'
    expect(findEDrawingsExecutable({
      exists: (candidate) => candidate === expected,
      listDirectories: (parent) => parent === 'C:\\Program Files\\Common Files' ? ['eDrawings2026'] : [],
    })).toBe(expected)
  })

  it('continues to support the historic SOLIDWORKS Corp layout', () => {
    const expected = 'C:\\Program Files\\SOLIDWORKS Corp\\eDrawings\\eDrawings.exe'
    expect(findEDrawingsExecutable({
      exists: (candidate) => candidate === expected,
      listDirectories: () => [],
    })).toBe(expected)
  })
})

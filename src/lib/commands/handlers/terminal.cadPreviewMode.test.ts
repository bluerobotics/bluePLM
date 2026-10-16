import { afterEach, describe, expect, it, vi } from 'vitest'

import { usePDMStore } from '../../../stores/pdmStore'
import { handleSet, handleSettings } from './terminal'
import type { ParsedCommand, TerminalOutput } from '../parser'

const originalMode = usePDMStore.getState().cadPreviewMode

function parsed(...args: string[]): ParsedCommand {
  return { command: 'set', args, flags: {} }
}

describe('terminal cadPreviewMode setting', () => {
  afterEach(() => {
    usePDMStore.getState().setCadPreviewMode(originalMode)
  })

  it.each(['thumbnail', 'edrawings', 'edrawings-embedded'] as const)(
    'accepts %s',
    (mode) => {
      const addOutput = vi.fn<(type: TerminalOutput['type'], content: string) => void>()

      handleSet(parsed('cadPreviewMode', mode), addOutput)

      expect(usePDMStore.getState().cadPreviewMode).toBe(mode)
      expect(addOutput).toHaveBeenLastCalledWith('success', `Set cadPreviewMode = ${mode}`)
    },
  )

  it('rejects unknown values while naming every accepted value', () => {
    const addOutput = vi.fn<(type: TerminalOutput['type'], content: string) => void>()

    handleSet(parsed('cadPreviewMode', 'embedded'), addOutput)

    expect(usePDMStore.getState().cadPreviewMode).toBe(originalMode)
    const message = addOutput.mock.calls.at(-1)?.[1] ?? ''
    expect(message).toContain('thumbnail')
    expect(message).toContain('edrawings')
    expect(message).toContain('edrawings-embedded')
  })

  it('lists every accepted value in settings help', () => {
    const addOutput = vi.fn<(type: TerminalOutput['type'], content: string) => void>()

    handleSettings(addOutput)

    const message = addOutput.mock.calls.at(-1)?.[1] ?? ''
    expect(message).toContain('cadPreviewMode values: thumbnail, edrawings, edrawings-embedded')
  })
})

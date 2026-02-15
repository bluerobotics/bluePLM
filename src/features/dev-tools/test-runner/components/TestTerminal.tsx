import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import type { TerminalOutputLine } from '@/lib/commands/testing/types'

interface TestTerminalProps {
  /** Live output lines from the test runner */
  outputs: TerminalOutputLine[]
  /** Called when user types a command (for interactive manual testing) */
  onCommand?: (command: string) => void
  /** Whether the terminal input should be disabled (e.g., during automated run) */
  inputDisabled?: boolean
}

/**
 * Embedded CLI terminal for displaying live test output.
 * Color-coded: green for PASS, red for FAIL, white for regular, gray for info.
 * Auto-scrolls to bottom. Users can type commands for manual testing.
 */
export function TestTerminal({ outputs, onCommand, inputDisabled = false }: TestTerminalProps) {
  const [input, setInput] = useState('')
  const outputRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-scroll to bottom when outputs change
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [outputs])

  const handleSubmit = () => {
    if (!input.trim() || inputDisabled) return
    onCommand?.(input.trim())
    setInput('')
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault()
      // Could add clear support here
    }
  }

  return (
    <div className="flex flex-col h-full bg-[#0d1117]">
      {/* Path indicator */}
      <div className="px-3 py-1 text-[10px] text-slate-500 font-mono border-b border-[#30363d] bg-[#161b22] flex-shrink-0">
        Test Runner Output
      </div>

      {/* Output area */}
      <div
        ref={outputRef}
        className="flex-1 overflow-y-auto p-3 font-mono text-xs space-y-0.5"
        onClick={() => inputRef.current?.focus()}
      >
        {outputs.length === 0 && (
          <div className="text-slate-600 italic">
            Waiting for test output...
          </div>
        )}
        {outputs.map((line) => (
          <div key={line.id} className={`${getOutputColor(line.type)} whitespace-pre-wrap break-words`}>
            {line.content}
          </div>
        ))}
      </div>

      {/* Input area */}
      <div className="border-t border-[#30363d] flex-shrink-0">
        <div className="flex items-center px-3 py-2 gap-2 bg-[#0d1117]">
          <span className={`font-mono text-xs ${inputDisabled ? 'text-slate-600' : 'text-emerald-500'}`}>
            {inputDisabled ? '...' : '❯'}
          </span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={inputDisabled ? 'Test running...' : 'Type a command...'}
            disabled={inputDisabled}
            className="flex-1 bg-transparent border-none outline-none text-slate-200 font-mono text-xs placeholder:text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  )
}

function getOutputColor(type: TerminalOutputLine['type']): string {
  switch (type) {
    case 'input':
      return 'text-cyan-400'
    case 'success':
      return 'text-emerald-400'
    case 'error':
      return 'text-red-400'
    case 'info':
      return 'text-slate-400'
    case 'assert-pass':
      return 'text-emerald-400'
    case 'assert-fail':
      return 'text-red-400'
    case 'section':
      return 'text-plm-accent'
    default:
      return 'text-slate-300'
  }
}

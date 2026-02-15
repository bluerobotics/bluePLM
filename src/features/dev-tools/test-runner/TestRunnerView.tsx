import { useState, useCallback, useRef } from 'react'
import { FlaskConical, Square } from 'lucide-react'
import type {
  ParsedTestScript,
  TestRunResult,
  TerminalOutputLine,
} from '@/lib/commands/testing/types'
import type { ScriptRunStatus } from './components/ScriptListItem'
import { ScriptBrowser } from './components/ScriptBrowser'
import { TestTerminal } from './components/TestTerminal'
import { TestResultsPanel } from './components/TestResultsPanel'

/** Width of the left script browser panel */
const SCRIPT_BROWSER_WIDTH = 300

/**
 * TestRunnerView — Main view for the test runner.
 *
 * Layout: left/right split.
 *   Left  (~300px): ScriptBrowser with folder name input, script list, run controls.
 *   Right (split top/bottom):
 *     Top  (~60%): TestTerminal — live CLI output during test run.
 *     Bottom (~40%): TestResultsPanel — structured pass/fail results.
 */
export function TestRunnerView() {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const [outputs, setOutputs] = useState<TerminalOutputLine[]>([])
  const [results, setResults] = useState<TestRunResult | null>(null)
  const [scriptStatuses, setScriptStatuses] = useState<Map<string, ScriptRunStatus>>(new Map())
  const [isRunning, setIsRunning] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  // ---------------------------------------------------------------------------
  // Terminal output helpers
  // ---------------------------------------------------------------------------

  const appendOutput = useCallback(
    (type: TerminalOutputLine['type'], content: string) => {
      setOutputs((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type,
          content,
          timestamp: new Date(),
        },
      ])
    },
    []
  )

  // ---------------------------------------------------------------------------
  // Run handlers
  // ---------------------------------------------------------------------------

  /**
   * Simulate running a set of scripts.
   *
   * The real test engine (being built by another agent) will provide a
   * `runTestScripts()` function. For now, this stub demonstrates the UI flow:
   * outputs appear in the terminal, results populate the panel.
   */
  const runScripts = useCallback(
    async (scripts: ParsedTestScript[]) => {
      if (isRunning) return

      // Reset state
      setOutputs([])
      setResults(null)
      setIsRunning(true)
      const controller = new AbortController()
      abortControllerRef.current = controller

      const newStatuses = new Map<string, ScriptRunStatus>()
      scripts.forEach((s) => {
        newStatuses.set(s.sourceFile || s.metadata.name, 'idle')
      })
      setScriptStatuses(new Map(newStatuses))

      appendOutput('info', `Starting test run — ${scripts.length} script(s)`)
      appendOutput('info', '─'.repeat(50))

      // Placeholder: when the real test engine is ready, the run loop will be:
      //   const runner = new TestRunner(options)
      //   const result = await runner.run(scripts)
      //
      // For now, emit a helpful message.
      appendOutput('info', 'The test engine is not yet connected.')
      appendOutput('info', 'Scripts detected:')
      for (const script of scripts) {
        const key = script.sourceFile || script.metadata.name
        appendOutput('info', `  • ${key} (${script.sections.length} sections)`)
        newStatuses.set(key, 'idle')
      }
      appendOutput('info', '')
      appendOutput('info', 'Waiting for test engine integration (Agent 5).')
      appendOutput('info', 'The Test Runner UI is ready — once the engine is wired in,')
      appendOutput('info', 'live output will stream here and results will appear below.')

      setScriptStatuses(new Map(newStatuses))
      setIsRunning(false)
      abortControllerRef.current = null
    },
    [isRunning, appendOutput]
  )

  const handleRunAll = useCallback(
    (scripts: ParsedTestScript[]) => {
      runScripts(scripts)
    },
    [runScripts]
  )

  const handleRunSingle = useCallback(
    (script: ParsedTestScript) => {
      runScripts([script])
    },
    [runScripts]
  )

  const handleAbort = useCallback(() => {
    abortControllerRef.current?.abort()
    appendOutput('error', 'Test run aborted by user.')
    setIsRunning(false)
  }, [appendOutput])

  const handleManualCommand = useCallback(
    (command: string) => {
      appendOutput('input', `$ ${command}`)
      appendOutput('info', `Manual command execution not yet connected to engine.`)
    },
    [appendOutput]
  )

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col h-full bg-[#0d1117]">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#30363d] bg-[#161b22] flex-shrink-0">
        <div className="flex items-center gap-2">
          <FlaskConical size={14} className="text-plm-accent" />
          <span className="text-xs font-semibold text-slate-200">Test Runner</span>
          {isRunning && (
            <span className="text-[10px] text-blue-400 font-mono animate-pulse">
              RUNNING
            </span>
          )}
        </div>
        {isRunning && (
          <button
            onClick={handleAbort}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium bg-red-600/80 hover:bg-red-600 text-white rounded transition-colors"
          >
            <Square size={9} />
            Abort
          </button>
        )}
      </div>

      {/* Main content: left/right split */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Left panel: Script Browser */}
        <div style={{ width: SCRIPT_BROWSER_WIDTH, minWidth: SCRIPT_BROWSER_WIDTH }} className="flex-shrink-0">
          <ScriptBrowser
            scriptStatuses={scriptStatuses}
            onRunAll={handleRunAll}
            onRunSingle={handleRunSingle}
            isRunning={isRunning}
          />
        </div>

        {/* Right panel: Terminal (top) + Results (bottom) */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Top: Embedded CLI (~60%) */}
          <div className="flex-[6] min-h-0 border-b border-[#30363d]">
            <TestTerminal
              outputs={outputs}
              onCommand={handleManualCommand}
              inputDisabled={isRunning}
            />
          </div>

          {/* Bottom: Results Panel (~40%) */}
          <div className="flex-[4] min-h-0 overflow-hidden">
            <TestResultsPanel results={results} />
          </div>
        </div>
      </div>
    </div>
  )
}

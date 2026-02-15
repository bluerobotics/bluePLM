/**
 * Test Runner Engine
 *
 * Executes parsed `.bptest` scripts by routing each command line through
 * the terminal command system (`executeTerminalCommand`).
 *
 * ## Execution Model
 *
 * 1. Commands within a section run sequentially.
 * 2. Assertion failures (FAIL: in output) stop the current section and
 *    skip remaining sections, then jump straight to teardown.
 * 3. Non-assert command errors are logged but do not halt execution
 *    (some commands may legitimately fail, e.g., deleting a non-existent file).
 * 4. The teardown section always runs — even on failure or cancellation.
 * 5. Cancellation is checked between commands via an AbortSignal.
 *
 * ## Path Rewriting
 *
 * Test scripts write paths relative to a virtual test sandbox. The runner
 * prepends `{testFolderName}/` to the first path argument of each command
 * so that all test artifacts are isolated inside a dedicated folder.
 */

import type { TerminalOutput } from '../parser'
import { executeTerminalCommand } from '../parser'
import type { ParsedTestScript, TestSection } from './scriptParser'

// ============================================
// Types
// ============================================

/**
 * Callbacks for observing test execution progress.
 */
export interface TestRunnerOptions {
  /** Name of the folder to contain all test artifacts (e.g., "0 - Tests") */
  testFolderName: string
  /** Called when a section starts executing */
  onSectionStart?: (scriptName: string, sectionName: string) => void
  /** Called after each command executes */
  onCommandExecute?: (scriptName: string, command: string, output: TerminalOutput[]) => void
  /** Called after each assertion command with its result */
  onAssertResult?: (scriptName: string, command: string, passed: boolean, message: string) => void
  /** Called when a script finishes (pass or fail) */
  onScriptComplete?: (result: ScriptResult) => void
  /** Called when all scripts have finished */
  onComplete?: (results: TestRunResult) => void
  /** AbortSignal for cancelling the test run */
  signal?: AbortSignal
}

/**
 * Result of a single assertion within a section.
 */
export interface AssertionResult {
  /** The raw command text that was executed */
  command: string
  /** Whether the assertion passed */
  passed: boolean
  /** Human-readable result message (PASS: ... or FAIL: ...) */
  message: string
}

/**
 * Result of executing one section within a script.
 */
export interface SectionResult {
  /** Section name */
  name: string
  /** Whether all assertions in this section passed */
  passed: boolean
  /** Individual assertion results */
  assertions: AssertionResult[]
  /** Total commands run in this section (including non-assert) */
  commandsRun: number
  /** Error message if a non-assert command failed catastrophically */
  error?: string
}

/**
 * Result of executing one test script.
 */
export interface ScriptResult {
  /** Script name from metadata */
  scriptName: string
  /** Whether the entire script passed */
  passed: boolean
  /** Results per section */
  sections: SectionResult[]
  /** Whether the script was skipped (e.g., missing requirements) */
  skipped: boolean
  /** Reason for skipping, if applicable */
  skipReason?: string
  /** Total execution time in milliseconds */
  duration: number
}

/**
 * Aggregated result of running all test scripts.
 */
export interface TestRunResult {
  /** Individual script results */
  scripts: ScriptResult[]
  /** Number of scripts that passed */
  totalPassed: number
  /** Number of scripts that failed */
  totalFailed: number
  /** Number of scripts that were skipped */
  totalSkipped: number
  /** Total number of assertions across all scripts */
  totalAssertions: number
  /** Number of assertions that passed */
  passedAssertions: number
  /** Number of assertions that failed */
  failedAssertions: number
  /** Total execution time in milliseconds */
  duration: number
}

// ============================================
// Constants
// ============================================

/**
 * Commands whose first argument should be rewritten with the test folder prefix.
 *
 * These are commands that take a file/folder path as their first argument.
 * Commands not in this list pass through unchanged (e.g., `wait`, `help`).
 */
const PATH_REWRITE_COMMANDS = new Set([
  'mkdir', 'md', 'new-folder',
  'touch',
  'sync', 'upload', 'add',
  'checkout', 'co',
  'checkin', 'ci',
  'assert', 'expect',
  'delete', 'rm',
  'remove', 'rm-local',
  'discard', 'revert',
  'download', 'dl',
  'get-latest', 'gl', 'update',
  'info', 'props', 'properties',
  'metadata',
  'set-metadata',
  'set-state',
  'status',
  'open', 'o',
  'reveal', 'show',
  'force-release',
  'sync-metadata', 'sync-sw-metadata', 'sw-sync',
  'rename',
  'move',
  'copy',
])

/**
 * Commands that are treated as assertions.
 * The runner checks their output for PASS:/FAIL: markers.
 */
const ASSERT_COMMANDS = new Set(['assert', 'expect'])

// ============================================
// Path Rewriting
// ============================================

/**
 * Rewrite a command line to prepend the test folder to the first path argument.
 *
 * For example, with testFolderName = "0 - Tests":
 *   `sync _data/file.txt` → `sync "0 - Tests/_data/file.txt"`
 *   `wait 2000` → `wait 2000` (no rewrite)
 *
 * @param commandLine    - Raw command line from the test script
 * @param testFolderName - Name of the test sandbox folder
 * @returns Rewritten command line
 */
function rewriteCommandPath(commandLine: string, testFolderName: string): string {
  const trimmed = commandLine.trim()
  if (!trimmed) return trimmed

  // Parse command name and the rest
  const spaceIndex = trimmed.indexOf(' ')
  if (spaceIndex === -1) {
    // Single-word command with no arguments (e.g., `help`)
    return trimmed
  }

  const commandName = trimmed.slice(0, spaceIndex).toLowerCase()
  const rest = trimmed.slice(spaceIndex + 1)

  if (!PATH_REWRITE_COMMANDS.has(commandName)) {
    return trimmed
  }

  // Split rest into first-arg and remaining-flags.
  // The first non-flag token is the path argument.
  const tokens = tokenize(rest)
  let pathIndex = -1

  for (let i = 0; i < tokens.length; i++) {
    if (!tokens[i].startsWith('-')) {
      pathIndex = i
      break
    }
  }

  if (pathIndex === -1) {
    // No non-flag argument found — return unchanged
    return trimmed
  }

  // Prepend test folder to the path
  const originalPath = tokens[pathIndex]
  const rewrittenPath = `${testFolderName}/${originalPath}`

  // Quote the path if the folder name contains spaces
  const needsQuotes = testFolderName.includes(' ')
  tokens[pathIndex] = needsQuotes ? `"${rewrittenPath}"` : rewrittenPath

  return `${commandName} ${tokens.join(' ')}`
}

/**
 * Simple tokenizer that splits a string on whitespace while preserving
 * quoted strings as single tokens.
 *
 * @param input - String to tokenize
 * @returns Array of tokens
 */
function tokenize(input: string): string[] {
  const tokens: string[] = []
  let current = ''
  let inQuotes = false
  let quoteChar = ''

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]

    if (inQuotes) {
      if (ch === quoteChar) {
        inQuotes = false
        // Include closing quote in token
        current += ch
      } else {
        current += ch
      }
    } else if (ch === '"' || ch === "'") {
      inQuotes = true
      quoteChar = ch
      current += ch
    } else if (ch === ' ' || ch === '\t') {
      if (current) {
        tokens.push(current)
        current = ''
      }
    } else {
      current += ch
    }
  }

  if (current) {
    tokens.push(current)
  }

  return tokens
}

// ============================================
// Script Runner
// ============================================

/**
 * Run a single parsed test script.
 *
 * Executes each section's commands sequentially, tracks assertion results,
 * and always runs the teardown section at the end.
 *
 * @param script  - Parsed test script to execute
 * @param options - Runner configuration and callbacks
 * @returns Promise resolving to the script's result
 */
export async function runTestScript(
  script: ParsedTestScript,
  options: TestRunnerOptions
): Promise<ScriptResult> {
  const startTime = Date.now()
  const scriptName = script.metadata.name
  const sectionResults: SectionResult[] = []
  let overallPassed = true
  let shouldSkipRemaining = false

  // Execute main sections
  for (const section of script.sections) {
    // Check for cancellation between sections
    if (options.signal?.aborted) {
      shouldSkipRemaining = true
      break
    }

    if (shouldSkipRemaining) {
      // Record skipped section
      sectionResults.push({
        name: section.name,
        passed: false,
        assertions: [],
        commandsRun: 0,
        error: 'Skipped due to earlier failure',
      })
      continue
    }

    const sectionResult = await executeSection(
      section,
      scriptName,
      options
    )

    sectionResults.push(sectionResult)

    if (!sectionResult.passed) {
      overallPassed = false
      shouldSkipRemaining = true
    }
  }

  // Always run teardown
  if (script.teardown && script.teardown.commands.length > 0) {
    await executeSection(script.teardown, scriptName, options)
    // Teardown failures don't affect the overall script result
  }

  return {
    scriptName,
    passed: overallPassed,
    sections: sectionResults,
    skipped: false,
    duration: Date.now() - startTime,
  }
}

/**
 * Execute all commands in a single section.
 *
 * @param section    - Section to execute
 * @param scriptName - Parent script name (for callbacks)
 * @param options    - Runner configuration and callbacks
 * @returns Section execution result
 */
async function executeSection(
  section: TestSection,
  scriptName: string,
  options: TestRunnerOptions
): Promise<SectionResult> {
  options.onSectionStart?.(scriptName, section.name)

  const assertions: AssertionResult[] = []
  let commandsRun = 0
  let sectionPassed = true
  let sectionError: string | undefined

  for (const command of section.commands) {
    // Check for cancellation between commands
    if (options.signal?.aborted) {
      sectionError = 'Cancelled'
      sectionPassed = false
      break
    }

    commandsRun++

    // Rewrite path for test isolation
    const rewrittenCommand = rewriteCommandPath(command.raw, options.testFolderName)

    // Execute the command
    let outputs: TerminalOutput[]
    try {
      outputs = await executeTerminalCommand(rewrittenCommand)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      sectionError = `Command threw: ${errorMessage} (line ${command.line})`
      sectionPassed = false

      options.onCommandExecute?.(scriptName, rewrittenCommand, [{
        id: `error-${Date.now()}`,
        type: 'error',
        content: errorMessage,
        timestamp: new Date(),
      }])
      break
    }

    options.onCommandExecute?.(scriptName, rewrittenCommand, outputs)

    // Check if this is an assertion command
    const commandName = command.raw.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
    if (ASSERT_COMMANDS.has(commandName)) {
      const { passed, message } = evaluateAssertOutput(outputs)
      assertions.push({ command: command.raw, passed, message })
      options.onAssertResult?.(scriptName, command.raw, passed, message)

      if (!passed) {
        sectionPassed = false
        break // Stop section on first assertion failure
      }
    } else {
      // For non-assert commands, check for errors but don't stop
      const hasError = outputs.some(o => o.type === 'error')
      if (hasError) {
        const errorMessages = outputs
          .filter(o => o.type === 'error')
          .map(o => o.content)
          .join('; ')

        // Log the error but continue — non-assert errors are non-fatal
        options.onCommandExecute?.(scriptName, rewrittenCommand, outputs)

        // However, if the command completely failed (e.g., unknown command),
        // we should note it but still continue
        if (!sectionError) {
          sectionError = `Non-fatal error at line ${command.line}: ${errorMessages}`
        }
      }
    }
  }

  return {
    name: section.name,
    passed: sectionPassed,
    assertions,
    commandsRun,
    error: sectionError,
  }
}

/**
 * Evaluate terminal output from an assertion command to determine pass/fail.
 *
 * Scans output lines for `PASS:` and `FAIL:` markers. If any `FAIL:` is
 * found, the assertion is considered failed. If no markers are found at
 * all, it's treated as a failure (unexpected output format).
 *
 * @param outputs - Terminal output from the assertion command
 * @returns Object with `passed` boolean and aggregated `message`
 */
function evaluateAssertOutput(
  outputs: TerminalOutput[]
): { passed: boolean; message: string } {
  const passMessages: string[] = []
  const failMessages: string[] = []

  for (const output of outputs) {
    if (output.content.includes('PASS:')) {
      passMessages.push(output.content)
    }
    if (output.content.includes('FAIL:')) {
      failMessages.push(output.content)
    }
  }

  if (failMessages.length > 0) {
    return {
      passed: false,
      message: failMessages.join('\n'),
    }
  }

  if (passMessages.length > 0) {
    return {
      passed: true,
      message: passMessages.join('\n'),
    }
  }

  // No PASS or FAIL markers found — treat as failure
  const allContent = outputs.map(o => o.content).join('\n')
  return {
    passed: false,
    message: `No assertion result found in output: ${allContent}`,
  }
}

// ============================================
// Multi-Script Runner
// ============================================

/**
 * Run multiple test scripts sequentially.
 *
 * 1. Creates the test sandbox folder via `mkdir`.
 * 2. Executes each script via `runTestScript()`.
 * 3. After all scripts complete (or on cancel): deletes the test sandbox
 *    folder from the server and local filesystem.
 * 4. Aggregates and returns combined results.
 *
 * @param scripts - Array of parsed test scripts to execute
 * @param options - Runner configuration and callbacks
 * @returns Aggregated test run result
 */
export async function runAll(
  scripts: ParsedTestScript[],
  options: TestRunnerOptions
): Promise<TestRunResult> {
  const startTime = Date.now()
  const results: ScriptResult[] = []

  // Step 1: Create the test sandbox folder
  try {
    await executeTerminalCommand(`mkdir ${options.testFolderName}`)
  } catch {
    // Folder might already exist — that's okay
  }

  // Step 2: Execute each script
  for (const script of scripts) {
    if (options.signal?.aborted) {
      results.push({
        scriptName: script.metadata.name,
        passed: false,
        sections: [],
        skipped: true,
        skipReason: 'Cancelled',
        duration: 0,
      })
      continue
    }

    const result = await runTestScript(script, options)
    results.push(result)
    options.onScriptComplete?.(result)
  }

  // Step 3: Cleanup — always delete the test folder
  try {
    await executeTerminalCommand(`delete ${options.testFolderName}`)
  } catch {
    // Best-effort cleanup — don't fail the test run if cleanup fails
  }

  // Step 4: Aggregate results
  const aggregated = aggregateResults(results, Date.now() - startTime)
  options.onComplete?.(aggregated)

  return aggregated
}

/**
 * Aggregate individual script results into a combined test run result.
 *
 * @param results  - Array of individual script results
 * @param duration - Total elapsed time in milliseconds
 * @returns Aggregated result
 */
function aggregateResults(results: ScriptResult[], duration: number): TestRunResult {
  let totalPassed = 0
  let totalFailed = 0
  let totalSkipped = 0
  let totalAssertions = 0
  let passedAssertions = 0
  let failedAssertions = 0

  for (const result of results) {
    if (result.skipped) {
      totalSkipped++
    } else if (result.passed) {
      totalPassed++
    } else {
      totalFailed++
    }

    for (const section of result.sections) {
      for (const assertion of section.assertions) {
        totalAssertions++
        if (assertion.passed) {
          passedAssertions++
        } else {
          failedAssertions++
        }
      }
    }
  }

  return {
    scripts: results,
    totalPassed,
    totalFailed,
    totalSkipped,
    totalAssertions,
    passedAssertions,
    failedAssertions,
    duration,
  }
}

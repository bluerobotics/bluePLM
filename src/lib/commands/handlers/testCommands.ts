/**
 * Test Command Handlers
 *
 * Terminal commands for running `.bptest` regression test scripts.
 *
 * Commands:
 *   run-test <script-path>   — Run a single .bptest file
 *   run-tests <folder-path>  — Run all .bptest files in a folder
 *
 * These commands integrate with the test runner engine to execute parsed
 * test scripts via the terminal command system.
 */

import { usePDMStore } from '../../../stores/pdmStore'
import { registerTerminalCommand } from '../registry'
import type { ParsedCommand, TerminalOutput } from '../parser'
import { parseTestScript } from '../testing/scriptParser'
import type { ParsedTestScript } from '../testing/scriptParser'
import { runTestScript, runAll } from '../testing/testRunner'
import type { TestRunResult, ScriptResult, TestRunnerOptions } from '../testing/testRunner'

// ============================================
// Types
// ============================================

type OutputFn = (type: TerminalOutput['type'], content: string) => void

// ============================================
// Constants
// ============================================

/** Default test folder name if not configured in settings */
const DEFAULT_TEST_FOLDER_NAME = '0 - Tests'

/** File extension for test scripts */
const BPTEST_EXTENSION = '.bptest'

// ============================================
// Helpers
// ============================================

/**
 * Read a file from the filesystem via the Electron IPC bridge.
 * Returns the decoded text content, or null on failure.
 *
 * @param path     - Absolute path to the file
 * @param addOutput - Terminal output function for error reporting
 * @returns Decoded file content, or null on failure
 */
async function readFileContent(
  path: string,
  addOutput: OutputFn
): Promise<string | null> {
  if (!window.electronAPI?.readFile) {
    addOutput('error', 'File reading not available (no Electron API)')
    return null
  }

  try {
    const result = await window.electronAPI.readFile(path)
    if (!result.success || !result.data) {
      addOutput('error', `Failed to read file: ${result.error ?? 'unknown error'}`)
      return null
    }

    // readFile returns base64-encoded data — decode it
    return atob(result.data)
  } catch (err) {
    addOutput('error', `Error reading file: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}

/**
 * Build the absolute path for a file relative to the vault root.
 *
 * @param relativePath - Path relative to vault root
 * @returns Absolute path, or null if vault path is not set
 */
function buildAbsolutePath(relativePath: string): string | null {
  const { vaultPath } = usePDMStore.getState()
  if (!vaultPath) return null

  // Normalize separators
  const normalizedVault = vaultPath.replace(/\//g, '\\')
  const normalizedRelative = relativePath.replace(/\//g, '\\').replace(/^\.[\\/]/, '')
  return `${normalizedVault}\\${normalizedRelative}`
}

/**
 * Get the test folder name from store settings, with fallback to default.
 *
 * @returns Test folder name
 */
function getTestFolderName(): string {
  // Check if there's a testFolderName in settings
  // (future: this could be a configurable setting)
  return DEFAULT_TEST_FOLDER_NAME
}

/**
 * Build standard runner options with terminal output callbacks.
 *
 * @param addOutput - Terminal output function
 * @param signal    - Optional abort signal
 * @returns TestRunnerOptions configured for terminal output
 */
function buildRunnerOptions(
  addOutput: OutputFn,
  signal?: AbortSignal
): TestRunnerOptions {
  return {
    testFolderName: getTestFolderName(),

    onSectionStart: (scriptName, sectionName) => {
      addOutput('info', `\n▸ [${scriptName}] Section: ${sectionName}`)
    },

    onCommandExecute: (_scriptName, command, outputs) => {
      // Show command being executed
      addOutput('info', `  $ ${command}`)

      // Forward any non-trivial output (skip generic "Processing N files..." messages)
      for (const output of outputs) {
        if (output.type === 'error' || output.type === 'success') {
          addOutput(output.type, `    ${output.content}`)
        }
      }
    },

    onAssertResult: (_scriptName, _command, passed, message) => {
      if (passed) {
        addOutput('success', `    ✓ ${message}`)
      } else {
        addOutput('error', `    ✗ ${message}`)
      }
    },

    onScriptComplete: (result) => {
      const icon = result.passed ? '✓' : result.skipped ? '○' : '✗'
      const status = result.passed ? 'PASSED' : result.skipped ? 'SKIPPED' : 'FAILED'
      addOutput(
        result.passed ? 'success' : 'error',
        `\n${icon} ${result.scriptName}: ${status} (${result.duration}ms)`
      )
    },

    signal,
  }
}

/**
 * Format and print a test run summary to the terminal.
 *
 * @param result    - Aggregated test run result
 * @param addOutput - Terminal output function
 */
function printSummary(result: TestRunResult, addOutput: OutputFn): void {
  addOutput('info', '\n' + '═'.repeat(50))
  addOutput('info', 'Test Run Summary')
  addOutput('info', '═'.repeat(50))

  const totalScripts = result.totalPassed + result.totalFailed + result.totalSkipped
  addOutput('info', `  Scripts:    ${result.totalPassed} passed, ${result.totalFailed} failed, ${result.totalSkipped} skipped (${totalScripts} total)`)
  addOutput('info', `  Assertions: ${result.passedAssertions} passed, ${result.failedAssertions} failed (${result.totalAssertions} total)`)
  addOutput('info', `  Duration:   ${result.duration}ms`)

  if (result.totalFailed === 0 && result.totalSkipped === 0) {
    addOutput('success', '\n  All tests passed!')
  } else if (result.totalFailed > 0) {
    addOutput('error', `\n  ${result.totalFailed} script(s) failed.`)

    // List failed scripts
    for (const script of result.scripts) {
      if (!script.passed && !script.skipped) {
        addOutput('error', `    ✗ ${script.scriptName}`)
        for (const section of script.sections) {
          for (const assertion of section.assertions) {
            if (!assertion.passed) {
              addOutput('error', `      ${assertion.message}`)
            }
          }
        }
      }
    }
  }
}

/**
 * Format and print a single-script test result summary.
 *
 * @param result    - Script execution result
 * @param addOutput - Terminal output function
 */
function printScriptSummary(result: ScriptResult, addOutput: OutputFn): void {
  addOutput('info', '\n' + '─'.repeat(40))

  let totalAssertions = 0
  let passedAssertions = 0

  for (const section of result.sections) {
    totalAssertions += section.assertions.length
    passedAssertions += section.assertions.filter(a => a.passed).length
  }

  const failedAssertions = totalAssertions - passedAssertions

  addOutput('info', `  Assertions: ${passedAssertions} passed, ${failedAssertions} failed (${totalAssertions} total)`)
  addOutput('info', `  Duration:   ${result.duration}ms`)

  if (result.passed) {
    addOutput('success', '  Result: PASSED')
  } else {
    addOutput('error', '  Result: FAILED')
  }
}

// ============================================
// Command: run-test
// ============================================

/**
 * Handle the `run-test` command.
 *
 * Reads and parses a single `.bptest` file, then executes it through
 * the test runner engine.
 *
 * @param parsed    - Parsed command (args[0] = path to .bptest file)
 * @param addOutput - Terminal output function
 */
async function handleRunTest(
  parsed: ParsedCommand,
  addOutput: OutputFn
): Promise<void> {
  const scriptPath = parsed.args[0]
  if (!scriptPath) {
    addOutput('error', 'Usage: run-test <script-path>')
    return
  }

  // Build absolute path
  const absolutePath = buildAbsolutePath(scriptPath)
  if (!absolutePath) {
    addOutput('error', 'No vault path configured. Connect to a vault first.')
    return
  }

  // Read the file
  addOutput('info', `Reading test script: ${scriptPath}`)
  const content = await readFileContent(absolutePath, addOutput)
  if (content === null) return

  // Parse the script
  const script = parseTestScript(content, scriptPath.split(/[/\\]/).pop())
  script.sourceFile = scriptPath

  addOutput('info', `Running: ${script.metadata.name} (${script.sections.length} sections, timeout: ${script.metadata.timeout}s)`)

  // Create an abort controller for timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => {
    controller.abort()
    addOutput('error', `Test timed out after ${script.metadata.timeout}s`)
  }, script.metadata.timeout * 1000)

  try {
    const options = buildRunnerOptions(addOutput, controller.signal)
    const result = await runTestScript(script, options)
    printScriptSummary(result, addOutput)
  } finally {
    clearTimeout(timeoutId)
  }
}

// ============================================
// Command: run-tests
// ============================================

/**
 * Handle the `run-tests` command.
 *
 * Discovers all `.bptest` files in a folder, parses them, and runs them
 * sequentially through the test runner engine.
 *
 * @param parsed    - Parsed command (args[0] = folder path)
 * @param addOutput - Terminal output function
 */
async function handleRunTests(
  parsed: ParsedCommand,
  addOutput: OutputFn
): Promise<void> {
  const folderPath = parsed.args[0]
  if (!folderPath) {
    addOutput('error', 'Usage: run-tests <folder-path>')
    return
  }

  const { vaultPath } = usePDMStore.getState()
  if (!vaultPath) {
    addOutput('error', 'No vault path configured. Connect to a vault first.')
    return
  }

  // Build absolute folder path
  const absoluteFolderPath = buildAbsolutePath(folderPath)
  if (!absoluteFolderPath) {
    addOutput('error', 'Could not resolve folder path.')
    return
  }

  // List files in the folder
  addOutput('info', `Scanning for .bptest files in: ${folderPath}`)

  if (!window.electronAPI?.listDirFiles) {
    addOutput('error', 'Directory listing not available (no Electron API)')
    return
  }

  let bptestFiles: Array<{ name: string; path: string }>

  try {
    const listResult = await window.electronAPI.listDirFiles(absoluteFolderPath)
    if (!listResult.success || !listResult.files) {
      addOutput('error', `Failed to list directory: ${listResult.error ?? 'unknown error'}`)
      return
    }

    bptestFiles = listResult.files
      .filter(f => f.name.toLowerCase().endsWith(BPTEST_EXTENSION))
      .map(f => ({ name: f.name, path: f.path }))
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch (err) {
    addOutput('error', `Error listing directory: ${err instanceof Error ? err.message : String(err)}`)
    return
  }

  if (bptestFiles.length === 0) {
    addOutput('info', `No .bptest files found in ${folderPath}`)
    return
  }

  addOutput('info', `Found ${bptestFiles.length} test script(s)`)

  // Parse all scripts
  const scripts: ParsedTestScript[] = []

  for (const file of bptestFiles) {
    const content = await readFileContent(file.path, addOutput)
    if (content === null) {
      addOutput('error', `Skipping ${file.name}: could not read file`)
      continue
    }

    const script = parseTestScript(content, file.name)
    script.sourceFile = `${folderPath}/${file.name}`
    scripts.push(script)
  }

  if (scripts.length === 0) {
    addOutput('error', 'No valid test scripts to run')
    return
  }

  addOutput('info', `\nRunning ${scripts.length} test script(s)...`)
  addOutput('info', '═'.repeat(50))

  // Run all scripts
  const options = buildRunnerOptions(addOutput)
  const result = await runAll(scripts, options)

  // Print combined summary
  printSummary(result, addOutput)
}

// ============================================
// Self-registration
// ============================================

registerTerminalCommand(
  {
    aliases: ['run-test'],
    description: 'Run a single .bptest test script',
    usage: 'run-test <script-path>',
    examples: ['run-test tests/smoke-test.bptest'],
    category: 'terminal',
  },
  async (parsed, _files, addOutput) => {
    await handleRunTest(parsed, addOutput)
  }
)

registerTerminalCommand(
  {
    aliases: ['run-tests'],
    description: 'Run all .bptest test scripts in a folder',
    usage: 'run-tests <folder-path>',
    examples: ['run-tests tests'],
    category: 'terminal',
  },
  async (parsed, _files, addOutput) => {
    await handleRunTests(parsed, addOutput)
  }
)

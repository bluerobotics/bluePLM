/**
 * Test Engine Types
 *
 * Minimal type stubs for the test runner UI.
 * The real test engine (being built by another agent) will either
 * use these types directly or replace them with compatible definitions.
 */

// ============================================================================
// Script Parsing Types
// ============================================================================

export interface ScriptMetadata {
  name: string
  requires: string[]
  timeout: number
}

export interface TestCommand {
  line: number
  raw: string
}

export interface TestSection {
  name: string
  commands: TestCommand[]
}

export interface ParsedTestScript {
  metadata: ScriptMetadata
  sections: TestSection[]
  teardown: TestSection | null
  sourceFile?: string
}

// ============================================================================
// Result Types
// ============================================================================

export interface AssertionResult {
  command: string
  passed: boolean
  message: string
}

export interface SectionResult {
  name: string
  passed: boolean
  assertions: AssertionResult[]
  commandsRun: number
  error?: string
}

export interface ScriptResult {
  scriptName: string
  passed: boolean
  sections: SectionResult[]
  skipped: boolean
  skipReason?: string
  duration: number
}

export interface TestRunResult {
  scripts: ScriptResult[]
  totalPassed: number
  totalFailed: number
  totalSkipped: number
  totalAssertions: number
  passedAssertions: number
  failedAssertions: number
  duration: number
}

// ============================================================================
// Runner Options
// ============================================================================

export interface TestRunnerOptions {
  testFolderName: string
  onSectionStart?: (scriptName: string, sectionName: string) => void
  onCommandExecute?: (scriptName: string, command: string, output: TerminalOutputLine[]) => void
  onAssertResult?: (scriptName: string, command: string, passed: boolean, message: string) => void
  onScriptComplete?: (result: ScriptResult) => void
  onComplete?: (results: TestRunResult) => void
  signal?: AbortSignal
}

// ============================================================================
// Terminal Output (for the test CLI view)
// ============================================================================

export interface TerminalOutputLine {
  id: string
  type: 'input' | 'success' | 'error' | 'info' | 'assert-pass' | 'assert-fail' | 'section'
  content: string
  timestamp: Date
}

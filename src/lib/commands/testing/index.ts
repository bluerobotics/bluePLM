/**
 * Testing Module — Barrel Export
 *
 * Re-exports all public types and functions from the test script parser
 * and test runner engine for use by the terminal command handlers and
 * any future UI components.
 */

// Script Parser
export { parseTestScript } from './scriptParser'
export type {
  ScriptMetadata,
  TestCommand,
  TestSection,
  ParsedTestScript,
} from './scriptParser'

// Test Runner
export { runTestScript, runAll } from './testRunner'
export type {
  TestRunnerOptions,
  AssertionResult,
  SectionResult,
  ScriptResult,
  TestRunResult,
} from './testRunner'

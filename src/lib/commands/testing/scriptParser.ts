/**
 * Test Script Parser
 *
 * Parses `.bptest` file content into structured test scripts that the
 * test runner can execute.
 *
 * ## File Format
 *
 * ```bptest
 * @name My Test Script
 * @requires vault
 * @timeout 60
 *
 * # Setup
 * mkdir _data
 * touch _data/file.txt
 * sync _data/file.txt
 *
 * # Verify initial state
 * assert _data/file.txt --status=synced --version=1
 *
 * # Teardown
 * delete _data
 * ```
 *
 * ### Syntax Rules
 * - Lines starting with `@` are metadata directives
 * - Lines starting with `#` start a new section
 * - `# Teardown` (case-insensitive) is stored separately
 * - Empty lines and lines starting with `//` are ignored
 * - All other lines are commands belonging to the current section
 * - Commands before any `#` section header go into a "default" section
 */

// ============================================
// Types
// ============================================

/**
 * Metadata extracted from `@` directives at the top of a test script.
 */
export interface ScriptMetadata {
  /** Test name from `@name`, or fallback to filename */
  name: string
  /** Required capabilities from `@requires` (e.g., ['vault', 'sw']) */
  requires: string[]
  /** Timeout in seconds from `@timeout` (default: 120) */
  timeout: number
}

/**
 * A single command line within a test section.
 */
export interface TestCommand {
  /** Original 1-based line number in the source file */
  line: number
  /** Raw command text (trimmed, no leading/trailing whitespace) */
  raw: string
}

/**
 * A named group of sequential commands within a test script.
 */
export interface TestSection {
  /** Section header text (without the leading `#`) */
  name: string
  /** Ordered list of commands in this section */
  commands: TestCommand[]
}

/**
 * Fully parsed representation of a `.bptest` test script.
 */
export interface ParsedTestScript {
  /** Script metadata extracted from `@` directives */
  metadata: ScriptMetadata
  /** All sections except teardown, in order of appearance */
  sections: TestSection[]
  /** The `# Teardown` section, if present (always run at end) */
  teardown: TestSection | null
  /** Path to the `.bptest` source file (set by the caller) */
  sourceFile?: string
}

// ============================================
// Constants
// ============================================

/** Default timeout in seconds if `@timeout` is not specified */
const DEFAULT_TIMEOUT_SECONDS = 120

/** Section name that triggers special teardown handling (case-insensitive) */
const TEARDOWN_SECTION_NAME = 'teardown'

/** Name for commands that appear before any explicit section header */
const DEFAULT_SECTION_NAME = 'default'

// ============================================
// Parser
// ============================================

/**
 * Parse the text content of a `.bptest` file into a structured test script.
 *
 * @param content   - Raw text content of the `.bptest` file
 * @param filename  - Optional filename, used as fallback for `@name`
 * @returns Parsed test script ready for the test runner
 *
 * @example
 * ```ts
 * const script = parseTestScript(fileContent, 'smoke-test.bptest')
 * console.log(script.metadata.name) // "My Test Script" or "smoke-test"
 * console.log(script.sections.length) // number of test sections
 * ```
 */
export function parseTestScript(content: string, filename?: string): ParsedTestScript {
  const lines = content.split(/\r?\n/)

  // Metadata defaults
  let name = filename ? filename.replace(/\.bptest$/i, '') : 'Unnamed Test'
  let requires: string[] = []
  let timeout = DEFAULT_TIMEOUT_SECONDS

  // Section tracking
  const sections: TestSection[] = []
  let teardown: TestSection | null = null
  let currentSection: TestSection | null = null

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1
    const raw = lines[i]
    const trimmed = raw.trim()

    // Skip empty lines
    if (trimmed === '') {
      continue
    }

    // Skip comment lines
    if (trimmed.startsWith('//')) {
      continue
    }

    // Metadata directives (@name, @requires, @timeout)
    if (trimmed.startsWith('@')) {
      parseMetadataDirective(trimmed, (key, value) => {
        switch (key) {
          case 'name':
            name = value
            break
          case 'requires':
            requires = value
              .split(/[,\s]+/)
              .map(s => s.trim())
              .filter(Boolean)
            break
          case 'timeout': {
            const parsed = parseInt(value, 10)
            if (!isNaN(parsed) && parsed > 0) {
              timeout = parsed
            }
            break
          }
          // Unknown directives are silently ignored (forward-compatible)
        }
      })
      continue
    }

    // Section headers (# Section Name)
    if (trimmed.startsWith('#')) {
      const sectionName = trimmed.replace(/^#+\s*/, '').trim()

      if (!sectionName) {
        // Bare `#` without a name — skip
        continue
      }

      const newSection: TestSection = {
        name: sectionName,
        commands: [],
      }

      if (sectionName.toLowerCase() === TEARDOWN_SECTION_NAME) {
        teardown = newSection
        currentSection = teardown
      } else {
        sections.push(newSection)
        currentSection = newSection
      }
      continue
    }

    // Command line — belongs to current section (or create default)
    if (!currentSection) {
      currentSection = { name: DEFAULT_SECTION_NAME, commands: [] }
      sections.push(currentSection)
    }

    currentSection.commands.push({
      line: lineNumber,
      raw: trimmed,
    })
  }

  return {
    metadata: { name, requires, timeout },
    sections,
    teardown,
  }
}

// ============================================
// Internal Helpers
// ============================================

/**
 * Parse a single `@key value` directive and invoke the callback.
 *
 * @param line     - Trimmed line starting with `@`
 * @param onParsed - Callback receiving (key, value) strings
 */
function parseMetadataDirective(
  line: string,
  onParsed: (key: string, value: string) => void
): void {
  // Remove the leading @
  const withoutAt = line.slice(1)

  // Split on first whitespace
  const spaceIndex = withoutAt.search(/\s/)
  if (spaceIndex === -1) {
    // Directive with no value (e.g., `@verbose`)
    onParsed(withoutAt.trim().toLowerCase(), '')
    return
  }

  const key = withoutAt.slice(0, spaceIndex).trim().toLowerCase()
  const value = withoutAt.slice(spaceIndex).trim()
  onParsed(key, value)
}

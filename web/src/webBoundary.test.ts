// BluePLM Web runs the desktop renderer (src/) in a browser. This walks the import graph from the
// web entry (static imports, re-exports and dynamic import()) and fails if any module of the Electron
// main process (electron/) is reached, or if any first-party module the web build reaches uses a
// code pattern the CSP and Trusted Types policy (web/src/app/securityHeaders.ts) blocks at runtime.
// A hit here is a feature that would break on blueplm.io: fix the code, never loosen the policy.
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { dirname, join, relative, resolve, sep } from 'path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const WEB_SRC = resolve(ROOT, 'web/src')
const ENTRY = resolve(WEB_SRC, 'main.tsx')

const FORBIDDEN_DIRS = ['electron']

// Built from parts so this file does not match its own scan.
const join2 = (a: string, b: string) => a + b
const BANNED_IN_WEB: Array<[string, RegExp]> = [
  [join2('dangerouslySet', 'InnerHTML'), new RegExp(join2('dangerouslySet', 'InnerHTML'))],
  [join2('ev', 'al('), new RegExp(join2('\\bev', 'al\\s*\\('))],
  [join2('new Func', 'tion('), new RegExp(join2('new\\s+Func', 'tion\\s*\\('))],
]
// Trusted Types sinks: enforced by the CSP, so any of these in first-party code breaks at runtime.
const BANNED_REACHABLE: Array<[string, RegExp]> = [
  ...BANNED_IN_WEB,
  [join2('inner', 'HTML'), new RegExp(join2('\\.inner', 'HTML\\s*='))],
  [join2('outer', 'HTML'), new RegExp(join2('\\.outer', 'HTML\\s*='))],
  [join2('insertAdjacent', 'HTML'), new RegExp(join2('insertAdjacent', 'HTML'))],
  [join2('document.wr', 'ite'), new RegExp(join2('document\\.wr', 'ite(ln)?\\s*\\('))],
  [join2('src', 'doc'), new RegExp(join2('\\bsrc', '[Dd]oc\\b'))],
  [join2('new Wor', 'ker('), new RegExp(join2('new\\s+(Shared)?Wor', 'ker\\s*\\('))],
  // A tag, not text such as `<script-path>` in a usage string.
  [join2('<scr', 'ipt> element'), new RegExp(join2('<scr', 'ipt[\\s>/]'))],
  [join2('ReactDOM.pre', 'init'), new RegExp(join2('\\bpre', 'init(Module)?\\s*\\('))],
]

const EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.tsx', '/index.js']

function resolveFile(base: string): string | null {
  if (existsSync(base) && statSync(base).isFile()) return base
  for (const ext of EXTENSIONS) {
    const candidate = base + ext
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

/** First-party specifier → absolute file; bare packages → null (not walked). */
function resolveSpecifier(specifier: string, fromFile: string): string | null | 'unresolved' {
  let base: string
  if (specifier.startsWith('@web/')) base = resolve(WEB_SRC, specifier.slice('@web/'.length))
  else if (specifier.startsWith('@/')) base = resolve(ROOT, 'src', specifier.slice(2))
  else if (specifier.startsWith('.')) base = resolve(dirname(fromFile), specifier)
  else return null
  // Asset imports (CSS, JSON, images) are leaves.
  if (/\.(css|json|svg|png|jpe?g|gif|ico|woff2?)$/.test(base)) return existsSync(base) ? base : 'unresolved'
  return resolveFile(base) ?? 'unresolved'
}

function stripComments(source: string): string {
  // Block comments only where one can start (line start or after whitespace), so a glob such as
  // '**/*.ts' inside a string is not taken for one.
  return source.replace(/(^|\s)\/\*[\s\S]*?\*\//g, '$1').replace(/^\s*\/\/.*$/gm, '')
}

// `import type` / `export type` are erased by the compiler and bundle nothing, so they are not
// edges (src/lib/supabase/partSuppliers.ts takes a type from src/stores/types.ts this way).
const IMPORT_PATTERNS = [
  /\b(?:import|export)\s+(?!type\s)[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
]

function importsOf(source: string): string[] {
  const code = stripComments(source)
  const found: string[] = []
  for (const pattern of IMPORT_PATTERNS) {
    for (const match of code.matchAll(pattern)) found.push(match[1])
  }
  return found
}

interface Graph {
  files: Set<string>
  parents: Map<string, string>
  unresolved: string[]
}

function walk(entry: string): Graph {
  const files = new Set<string>([entry])
  const parents = new Map<string, string>()
  const unresolved: string[] = []
  const queue = [entry]
  while (queue.length > 0) {
    const file = queue.pop()!
    if (!/\.(tsx?|m?js)$/.test(file)) continue
    for (const specifier of importsOf(readFileSync(file, 'utf8'))) {
      const target = resolveSpecifier(specifier, file)
      if (target === null) continue
      if (target === 'unresolved') {
        unresolved.push(`${rel(file)} -> ${specifier}`)
        continue
      }
      if (files.has(target)) continue
      files.add(target)
      parents.set(target, file)
      queue.push(target)
    }
  }
  return { files, parents, unresolved }
}

function rel(file: string): string {
  return relative(ROOT, file).split(sep).join('/')
}

function chain(graph: Graph, file: string): string {
  const path = [rel(file)]
  let current = graph.parents.get(file)
  while (current) {
    path.unshift(rel(current))
    current = graph.parents.get(current)
  }
  return path.join(' -> ')
}

function listSource(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...listSource(full))
    else if (/\.(tsx?|m?js)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full)
  }
  return out
}

function findBanned(files: string[], banned: Array<[string, RegExp]>): string[] {
  const hits: string[] = []
  for (const file of files) {
    if (/\.test\.tsx?$/.test(file) || !/\.(tsx?|m?js)$/.test(file)) continue
    const code = stripComments(readFileSync(file, 'utf8'))
    for (const [label, pattern] of banned) {
      if (pattern.test(code)) hits.push(`${rel(file)}: ${label}`)
    }
  }
  return hits
}

describe('BluePLM Web module boundary', () => {
  const graph = walk(ENTRY)

  it('resolves every first-party import it walks', () => {
    expect(graph.unresolved).toEqual([])
    // The whole renderer: a small graph means the walk stopped early.
    expect(graph.files.size).toBeGreaterThan(500)
  })

  it('never reaches the Electron main process', () => {
    const offending = [...graph.files]
      .filter((file) => FORBIDDEN_DIRS.some((dir) => rel(file) === dir || rel(file).startsWith(`${dir}/`)))
      .map((file) => chain(graph, file))
    expect(offending).toEqual([])
  })

  it('has no HTML injection or string evaluation anywhere in web/src', () => {
    expect(findBanned(listSource(WEB_SRC), BANNED_IN_WEB)).toEqual([])
  })

  it('has no Trusted Types sink in any first-party module the web build reaches', () => {
    expect(findBanned([...graph.files], BANNED_REACHABLE)).toEqual([])
  })

  it('renders no inline <style> element, which style-src without unsafe-inline blocks', () => {
    // Components only: a .ts module may build a standalone HTML document (rfqPdfDocument.ts).
    const components = [...graph.files].filter((file) => file.endsWith('.tsx'))
    const inlineStyle: Array<[string, RegExp]> = [[join2('<sty', 'le> in JSX'), new RegExp(join2('<sty', 'le[\\s>]'))]]
    expect(findBanned(components, inlineStyle)).toEqual([])
  })
})

describe('import scanner', () => {
  it('finds static, side-effect, re-export and dynamic imports and skips type-only imports and comments', () => {
    const source = [
      "import a from './a'",
      "import { b } from '@/lib/b'",
      "import type { C } from '@web/c'",
      "export type { F } from './typesOnly'",
      "import { type G, h } from './mixed'",
      "import './side'",
      "export { d } from './d'",
      "const e = await import('./e')",
      "// import x from './commented'",
      "/* import('./blockComment') */",
    ].join('\n')
    expect(importsOf(source).sort()).toEqual(['./a', './d', './e', './mixed', './side', '@/lib/b'].sort())
  })
})

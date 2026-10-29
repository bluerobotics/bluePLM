import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

// Static contract between the three places an IPC call is spelled out:
//
//   electron/preload.ts       what the renderer can call (ipcRenderer.invoke/send/on)
//   ipcMain.handle/on         what the main process answers, anywhere under electron/
//   src/electron.d.ts         what the renderer believes window.electronAPI looks like
//
// Every unit test mocks one side of this seam, so a channel renamed on one side
// only, or a preload method dropped while the type still promises it, passes CI
// and fails at runtime with "No handler registered" or "is not a function".
// This parses the source with the TypeScript compiler; no Electron is loaded.

const ELECTRON_DIR = __dirname
// Forward slashes because ts.createSourceFile normalizes fileName to them. With resolve()'s
// backslashes on Windows no source file matched a preload (found by the first windows-latest run).
// The extension-host window and its preload were removed in 4.8.0 (it never ran).
const PRELOADS = [resolve(ELECTRON_DIR, 'preload.ts')].map((p) => p.replace(/\\/g, '/'))
const TYPES_FILE = resolve(ELECTRON_DIR, '../src/electron.d.ts')

function listTsFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...listTsFiles(full))
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.d.ts')) {
      out.push(full)
    }
  }
  return out
}

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
}

function walk(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node)
  node.forEachChild((child) => walk(child, visit))
}

const sources = listTsFiles(ELECTRON_DIR).map(parse)

// Channel names are sometimes held in a const (`const PREWARM_CHANNEL = '...'`),
// declared in one file and imported into another. Names are unique enough across
// electron/ to resolve them from one flat table.
const stringConsts = new Map<string, string>()
for (const sf of sources) {
  walk(sf, (n) => {
    if (!ts.isVariableDeclaration(n) || !ts.isIdentifier(n.name) || !n.initializer) return
    if (ts.isStringLiteralLike(n.initializer)) stringConsts.set(n.name.text, n.initializer.text)
    else if (ts.isTemplateExpression(n.initializer) && n.initializer.head.text) {
      stringConsts.set(n.name.text, `${n.initializer.head.text}*`)
    }
  })
}

// A template channel (`extension-host:api-response:${callId}`) is matched by its
// fixed head, recorded with a trailing '*'.
function channelOf(arg: ts.Expression | undefined): string | null {
  if (!arg) return null
  if (ts.isStringLiteralLike(arg)) return arg.text
  if (ts.isIdentifier(arg)) return stringConsts.get(arg.text) ?? null
  if (ts.isTemplateExpression(arg) && arg.head.text) return `${arg.head.text}*`
  return null
}

interface CallSite {
  channel: string
  where: string
}

/** Calls of `<receiver>.<method>(channel, ...)`, e.g. ipcRenderer.invoke('x'). */
function collectCalls(
  sf: ts.SourceFile,
  receiver: string,
  methods: string[],
): { found: CallSite[]; unresolved: string[] } {
  const found: CallSite[] = []
  const unresolved: string[] = []
  walk(sf, (n) => {
    if (!ts.isCallExpression(n) || !ts.isPropertyAccessExpression(n.expression)) return
    const target = n.expression
    if (!ts.isIdentifier(target.expression) || target.expression.text !== receiver) return
    if (!methods.includes(target.name.text)) return
    const where = `${relative(ELECTRON_DIR, sf.fileName)}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`
    const channel = channelOf(n.arguments[0])
    if (channel === null) unresolved.push(where)
    else found.push({ channel, where })
  })
  return { found, unresolved }
}

/** String literals passed to a forEach-driven listener, e.g. the menu event list. */
function collectArrayListenerChannels(sf: ts.SourceFile): string[] {
  const out: string[] = []
  walk(sf, (n) => {
    if (!ts.isCallExpression(n) || !ts.isPropertyAccessExpression(n.expression)) return
    if (n.expression.name.text !== 'forEach') return
    const arrayExpr = n.expression.expression
    const callback = n.arguments[0]
    if (!callback || !callback.getText().includes('ipcRenderer.on(')) return
    let literal: ts.ArrayLiteralExpression | undefined
    if (ts.isArrayLiteralExpression(arrayExpr)) literal = arrayExpr
    else if (ts.isIdentifier(arrayExpr)) {
      // Resolve a local `const events = [...]` in the enclosing scope.
      walk(sf, (d) => {
        if (
          ts.isVariableDeclaration(d) &&
          ts.isIdentifier(d.name) &&
          d.name.text === arrayExpr.text &&
          d.initializer &&
          d.pos < n.pos &&
          ts.isArrayLiteralExpression(d.initializer)
        ) {
          literal = d.initializer
        }
      })
    }
    for (const el of literal?.elements ?? []) {
      if (ts.isStringLiteralLike(el)) out.push(el.text)
    }
  })
  return out
}

const handled = new Set<string>()
const listenedByMain = new Set<string>()
const unresolvedHandlers: string[] = []
for (const sf of sources) {
  const h = collectCalls(sf, 'ipcMain', ['handle', 'handleOnce'])
  h.found.forEach((c) => handled.add(c.channel))
  const l = collectCalls(sf, 'ipcMain', ['on', 'once'])
  l.found.forEach((c) => listenedByMain.add(c.channel))
  unresolvedHandlers.push(...h.unresolved, ...l.unresolved)
}

// Every string literal outside the preloads: a channel the renderer listens on
// must be sent from somewhere in the main process (webContents.send, sender.send,
// a menu helper), and this is the cheapest test of "somewhere" that does not miss
// helpers taking the channel as a parameter.
const mainLiterals = new Set<string>()
for (const sf of sources) {
  if (PRELOADS.includes(sf.fileName)) continue
  walk(sf, (n) => {
    if (ts.isStringLiteralLike(n)) mainLiterals.add(n.text)
    if (ts.isTemplateExpression(n) && n.head.text) mainLiterals.add(`${n.head.text}*`)
  })
}

// Renderer listeners nothing in the main process sends to. Each is dead code
// today, kept listed rather than failing so a new one still fails the test.
const LISTENERS_WITHOUT_SENDER: Record<string, string> = {
  'menu:select-all':
    'The application menu uses the built-in selectAll role, which never sends this channel.',
  'extension:update-available':
    'Extension update notifications were never implemented in the main process (protocol.ts names the channel only).',
  'extension:install-progress':
    'Extension install progress was never implemented in the main process (protocol.ts names the channel only).',
}

describe('preload ↔ ipcMain channels', () => {
  it('finds the handler registrations it is meant to check', () => {
    // Guards against the parser silently matching nothing.
    expect(handled.size).toBeGreaterThan(150)
    expect(unresolvedHandlers).toEqual([])
  })

  for (const preload of PRELOADS) {
    const sf = sources.find((s) => s.fileName === preload)
    const name = relative(ELECTRON_DIR, preload)

    it(`${name}: every ipcRenderer.invoke channel has an ipcMain.handle`, () => {
      expect(sf).toBeDefined()
      const { found, unresolved } = collectCalls(sf!, 'ipcRenderer', ['invoke'])
      expect(unresolved).toEqual([])
      const missing = found
        .filter((c) => !handled.has(c.channel))
        .map((c) => `${c.channel} (${c.where})`)
      expect(missing).toEqual([])
    })

    it(`${name}: every ipcRenderer.send channel has an ipcMain.on`, () => {
      const { found, unresolved } = collectCalls(sf!, 'ipcRenderer', ['send', 'sendSync'])
      expect(unresolved).toEqual([])
      const missing = found
        .filter((c) => !listenedByMain.has(c.channel))
        .map((c) => `${c.channel} (${c.where})`)
      expect(missing).toEqual([])
    })

    it(`${name}: every ipcRenderer.on channel is sent by the main process`, () => {
      const { found, unresolved } = collectCalls(sf!, 'ipcRenderer', ['on', 'once'])
      // The menu listener subscribes through a forEach over a literal list.
      // Its `ipcRenderer.on(event, ...)` is the one call whose channel is a variable.
      const arrayChannels = collectArrayListenerChannels(sf!)
      expect(unresolved).toHaveLength(arrayChannels.length > 0 ? 1 : 0)
      const channels = [
        ...found.map((c) => ({ channel: c.channel, where: c.where })),
        ...arrayChannels.map((channel) => ({ channel, where: `${name} (event list)` })),
      ]
      const missing = channels
        .filter((c) => !mainLiterals.has(c.channel) && !(c.channel in LISTENERS_WITHOUT_SENDER))
        .map((c) => `${c.channel} (${c.where})`)
      expect(missing).toEqual([])
    })
  }
})

describe('preload listener allowlist', () => {
  it('lists only channels that still have no sender', () => {
    expect(Object.keys(LISTENERS_WITHOUT_SENDER).filter((c) => mainLiterals.has(c))).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Exposed API keys vs the ElectronAPI type

type Shape = Map<string, Shape | null>

function shapeOfObjectLiteral(obj: ts.ObjectLiteralExpression): Shape {
  const shape: Shape = new Map()
  for (const prop of obj.properties) {
    if (ts.isSpreadAssignment(prop))
      throw new Error('spread in exposed API is not supported by this test')
    const nameNode = prop.name
    if (!nameNode) continue
    const key =
      ts.isIdentifier(nameNode) || ts.isStringLiteralLike(nameNode)
        ? nameNode.text
        : nameNode.getText()
    if (ts.isPropertyAssignment(prop) && ts.isObjectLiteralExpression(prop.initializer)) {
      shape.set(key, shapeOfObjectLiteral(prop.initializer))
    } else {
      shape.set(key, null)
    }
  }
  return shape
}

function shapeOfResolvedType(type: ts.Type, checker: ts.TypeChecker): Shape {
  if ((type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0) {
    throw new Error(`unresolved ElectronAPI type: ${checker.typeToString(type)}`)
  }
  const shape: Shape = new Map()
  const properties = checker.getPropertiesOfType(type)
  if (properties.length === 0)
    throw new Error(`empty ElectronAPI object type: ${checker.typeToString(type)}`)
  for (const property of properties) {
    const key = property.getName()
    const declaration = property.valueDeclaration ?? property.declarations?.[0]
    if (!declaration) throw new Error(`unresolved ElectronAPI member: ${key}`)
    const propertyType = checker.getTypeOfSymbolAtLocation(property, declaration)
    if ((propertyType.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0) {
      throw new Error(`unresolved ElectronAPI member type: ${checker.typeToString(propertyType)}`)
    }
    if (
      (propertyType.flags & ts.TypeFlags.Object) !== 0 &&
      propertyType.getCallSignatures().length === 0 &&
      checker.getPropertiesOfType(propertyType).length > 0
    ) {
      shape.set(key, shapeOfResolvedType(propertyType, checker))
    } else {
      shape.set(key, null)
    }
  }
  return shape
}

/** `a.b.c` paths in `left` that `right` lacks, descending only where both are objects. */
function missingPaths(left: Shape, right: Shape, prefix = ''): string[] {
  const out: string[] = []
  for (const [key, sub] of left) {
    const path = prefix ? `${prefix}.${key}` : key
    if (!right.has(key)) {
      out.push(path)
      continue
    }
    const other = right.get(key)
    if (sub && other) {
      out.push(...missingPaths(sub, other, path))
    } else if (sub !== other) {
      out.push(`${path} (object/leaf mismatch)`)
    }
  }
  return out
}

function exposedApiShape(): Shape {
  const sf = sources.find((s) => s.fileName === PRELOADS[0])!
  let shape: Shape | undefined
  walk(sf, (n) => {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === 'exposeInMainWorld' &&
      ts.isStringLiteralLike(n.arguments[0]) &&
      n.arguments[0].text === 'electronAPI' &&
      ts.isObjectLiteralExpression(n.arguments[1])
    ) {
      shape = shapeOfObjectLiteral(n.arguments[1])
    }
  })
  if (!shape)
    throw new Error("exposeInMainWorld('electronAPI', {...}) not found in electron/preload.ts")
  return shape
}

function declaredApiShapeFromProgram(program: ts.Program, declarationFile = TYPES_FILE): Shape {
  const diagnostics = ts.getPreEmitDiagnostics(program)
  if (diagnostics.length > 0) {
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCanonicalFileName: (name) => name,
        getCurrentDirectory: () => process.cwd(),
        getNewLine: () => '\n',
      }),
    )
  }
  const checker = program.getTypeChecker()
  const sf = program.getSourceFile(declarationFile)
  if (!sf) throw new Error(`could not load ${declarationFile}`)
  let shape: Shape | undefined
  walk(sf, (n) => {
    if (ts.isInterfaceDeclaration(n) && n.name.text === 'Window') {
      for (const m of n.members) {
        if (ts.isPropertySignature(m) && m.name.getText() === 'electronAPI' && m.type) {
          shape = shapeOfResolvedType(checker.getTypeAtLocation(m), checker)
        }
      }
    }
  })
  if (!shape) throw new Error('Window.electronAPI type not found in src/electron.d.ts')
  return shape
}

function declaredApiShape(): Shape {
  const program = ts.createProgram([TYPES_FILE], {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
  })
  return declaredApiShapeFromProgram(program)
}

function virtualElectronApiProgram(
  apiType: string,
  fileName: string,
): { program: ts.Program; file: string } {
  const file = resolve(ELECTRON_DIR, fileName)
  const virtualSource = [`interface Window { electronAPI: ${apiType} }`, 'export {}'].join('\n')
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
    types: [],
  }
  const host = ts.createCompilerHost(options)
  const originalFileExists = host.fileExists.bind(host)
  const originalReadFile = host.readFile.bind(host)
  const originalGetSourceFile = host.getSourceFile.bind(host)
  host.fileExists = (candidate) => resolve(candidate) === file || originalFileExists(candidate)
  host.readFile = (candidate) =>
    resolve(candidate) === file ? virtualSource : originalReadFile(candidate)
  host.getSourceFile = (candidate, languageVersion, onError, shouldCreateNewSourceFile) =>
    resolve(candidate) === file
      ? ts.createSourceFile(candidate, virtualSource, languageVersion)
      : originalGetSourceFile(candidate, languageVersion, onError, shouldCreateNewSourceFile)
  return { program: ts.createProgram([file], options, host), file }
}

describe('window.electronAPI ↔ src/electron.d.ts', () => {
  const exposed = exposedApiShape()
  const declared = declaredApiShape()

  it('parses a plausible number of members on both sides', () => {
    expect(exposed.size).toBeGreaterThan(100)
    expect(declared.size).toBeGreaterThan(100)
  })

  it('every declared member is exposed by the preload', () => {
    expect(missingPaths(declared, exposed)).toEqual([])
  })

  it('every exposed member is declared', () => {
    expect(missingPaths(exposed, declared)).toEqual([])
  })

  it('isolates the virtual fixture from ambient package types and resolves valid members', () => {
    const { program, file } = virtualElectronApiProgram(
      '{ getVersion: () => string }',
      '__valid_electron_api__.d.ts',
    )
    const ambientFiles = program
      .getSourceFiles()
      .map((sf) => sf.fileName.replace(/\\/g, '/'))
      .filter((name) => name.includes('/node_modules/@types/'))
    expect(ambientFiles).toEqual([])
    expect([...declaredApiShapeFromProgram(program, file).keys()]).toEqual(['getVersion'])
  })

  it('fails closed when an extracted API import cannot be resolved', () => {
    const { program, file } = virtualElectronApiProgram(
      "import('./missing-extracted-api').ExtensionAPI",
      '__missing_extracted_api__.d.ts',
    )
    expect(() => declaredApiShapeFromProgram(program, file)).toThrow(
      /unresolved ElectronAPI type: any/,
    )
  })

  it.each(['any', 'unknown'])('fails closed when an API member is %s', (memberType) => {
    const { program, file } = virtualElectronApiProgram(
      `{ getVersion: ${memberType} }`,
      `__member_${memberType}_electron_api__.d.ts`,
    )
    expect(() => declaredApiShapeFromProgram(program, file)).toThrow(
      `unresolved ElectronAPI member type: ${memberType}`,
    )
  })
})

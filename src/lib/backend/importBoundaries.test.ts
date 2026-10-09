import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'
import ts from 'typescript'

function namedImports(filePath: string, moduleSpecifier: string): string[] {
  const source = ts.createSourceFile(
    filePath,
    readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  )

  return source.statements.flatMap((statement) => {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== moduleSpecifier
    ) {
      return []
    }
    const clause = statement.importClause
    if (!clause?.namedBindings || !ts.isNamedImports(clause.namedBindings)) return []
    return clause.namedBindings.elements.map(
      (element) => element.propertyName?.text ?? element.name.text,
    )
  })
}

function expectNoImports(actualImports: string[], forbiddenImports: string[]): void {
  for (const forbiddenImport of forbiddenImports) {
    expect(actualImports).not.toContain(forbiddenImport)
  }
}

const authHelpers = new Set([
  'signInWithGoogle',
  'signInWithEmail',
  'signUpWithEmail',
  'signInWithPhone',
  'verifyPhoneOTP',
  'signOut',
])

function authImportViolations(sourceText: string): string[] {
  const source = ts.createSourceFile('callSite.ts', sourceText, ts.ScriptTarget.Latest, true)
  const violations: string[] = []
  const rawClients = new Set<string>()
  const isSupabaseBarrel = (module: string) => /\/supabase(?:\/index)?(?:\.ts)?$/.test(module)
  const isSupabaseAuth = (module: string) => /\/supabase\/auth(?:\/index)?(?:\.ts)?$/.test(module)

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const module = node.moduleSpecifier.text
      if (isSupabaseAuth(module)) violations.push('auth submodule import')
      if (isSupabaseBarrel(module)) {
        const clause = node.importClause
        const bindings = clause?.namedBindings
        if (clause?.name || (bindings && ts.isNamespaceImport(bindings))) {
          violations.push('unrestricted Supabase import')
        }
        if (bindings && ts.isNamedImports(bindings)) {
          for (const element of bindings.elements) {
            const originalName = element.propertyName?.text ?? element.name.text
            if (authHelpers.has(originalName)) violations.push(`direct ${originalName} import`)
            if (originalName === 'supabase') rawClients.add(element.name.text)
          }
        }
      }
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0]) &&
      (isSupabaseBarrel(node.arguments[0].text) || isSupabaseAuth(node.arguments[0].text))
    ) {
      violations.push('dynamic Supabase import')
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      rawClients.has(node.expression.text) &&
      node.name.text === 'auth'
    ) {
      violations.push('raw Supabase auth access')
    }
    ts.forEachChild(node, visit)
  }

  visit(source)
  return violations
}

describe('authentication call-site import boundaries', () => {
  it.each([
    "import { signOut as logout } from '@/lib/supabase'",
    "import { signOut } from '../../lib/supabase/auth'",
    "import * as backend from '@/lib/supabase'",
    "const { signOut: logout } = await import('@/lib/supabase')",
    "const auth = await import('@/lib/supabase/auth')",
    "import { supabase as client } from '@/lib/supabase'; client.auth.signOut()",
  ])('detects an auth bypass: %s', (sourceText) => {
    expect(authImportViolations(sourceText)).not.toEqual([])
  })

  it('rejects direct and dynamic auth bypasses at every seam call site', () => {
    const callSites = [
      'src/hooks/useAuth.ts',
      'src/hooks/useAppStartup.ts',
      'src/components/shared/Screens/WelcomeScreen.tsx',
      'src/components/shared/Screens/welcomeCredentialAuth.ts',
      'src/components/layout/MenuBar/MenuBar.tsx',
    ]
    for (const callSite of callSites) {
      expect(authImportViolations(readFileSync(resolve(process.cwd(), callSite), 'utf8'))).toEqual(
        [],
      )
    }
  })

  it('routes auth and identity operations through the backend boundary while retaining only documented Supabase helpers', () => {
    const callSites = [
      'src/hooks/useAuth.ts',
      'src/hooks/useAppStartup.ts',
      'src/components/shared/Screens/WelcomeScreen.tsx',
      'src/components/layout/MenuBar/MenuBar.tsx',
    ]
    const imports = (filePath: string, moduleSpecifier: string) =>
      namedImports(resolve(process.cwd(), filePath), moduleSpecifier)
    const useAuthImports = imports('src/hooks/useAuth.ts', '@/lib/supabase')
    const welcomeImports = imports(
      'src/components/shared/Screens/WelcomeScreen.tsx',
      '@/lib/supabase',
    )
    const menuBarImports = imports('src/components/layout/MenuBar/MenuBar.tsx', '@/lib/supabase')

    for (const callSite of callSites) {
      expect(imports(callSite, '@/lib/backend')).toContain('resolveBackend')
    }
    expectNoImports(useAuthImports, [
      'supabase',
      'isSupabaseConfigured',
      'getUserProfile',
      'linkUserToOrganization',
    ])
    expectNoImports(welcomeImports, [
      'getOrgAuthProviders',
      'signInWithGoogle',
      'isSupabaseConfigured',
      'signInWithEmail',
      'signInWithPhone',
      'signUpWithEmail',
      'verifyPhoneOTP',
    ])
    const credentialFile = 'src/components/shared/Screens/welcomeCredentialAuth.ts'
    expect(imports(credentialFile, '@/lib/backend')).toContain('getBackend')
    expect(imports(credentialFile, '@/lib/supabase')).toEqual([])
    expectNoImports(menuBarImports, [
      'isSupabaseConfigured',
      'signInWithEmail',
      'signInWithGoogle',
      'signInWithPhone',
      'signUpWithEmail',
      'verifyPhoneOTP',
    ])
  })
})

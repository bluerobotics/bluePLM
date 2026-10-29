import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { en, de, es, fr, pt, zhCN, zhTW } from './locales'
import type { TranslationDict } from './types'
import { flattenTranslations } from './utils'

const locales = { en, de, es, fr, pt, zhCN, zhTW }
const components = [
  'account/AccountSettings.tsx',
  'components/SettingsNavigation.tsx',
  'organization/AuthProvidersSettings.tsx',
  'organization/ModuleAccessSettings.tsx',
  'organization/MetadataColumnsSettings.tsx',
  'system/ExportSettings.tsx',
  'system/RFQSettings.tsx',
  'system/SerializationSettings.tsx',
]
const keys = new Set(
  components.flatMap((file) => {
    const source = readFileSync(join(process.cwd(), 'src/features/settings', file), 'utf8')
    return [...source.matchAll(/\bt\('((?:settings|accountSettings|settingsPages)\.[^']+)'/g)].map(
      (m) => m[1],
    )
  }),
)
const flat = (dict: TranslationDict) => flattenTranslations(dict)
const tokens = (value: string) => [...value.matchAll(/\{\{[^{}]+\}\}/g)].map((m) => m[0]).sort()

describe('settings localization coverage', () => {
  it('preserves case and singular forms in English', () => {
    const values = flat(en)
    expect(values['accountSettings.unknownLastSeen']).toBe('unknown')
    expect(values['accountSettings.unknown']).toBe('Unknown')
    expect(values['settingsPages.serialization.tabDigitsOptionOne']).toBe(
      '{{digits}} digit ({{first}}-{{last}})',
    )
    expect(values['settingsPages.noOrganizationSelected']).toBe('No organization selected')
  })

  it.each(Object.entries(locales))(
    'defines used keys and matching placeholders directly for %s',
    (_, dict) => {
      const english = flat(en)
      const values = flat(dict)
      for (const key of keys) {
        expect(values[key], key).toBeTypeOf('string')
        expect(values[key].trim(), key).not.toBe('')
        expect(tokens(values[key]), key).toEqual(tokens(english[key]))
      }
      for (const [key, marker] of [
        ['settingsPages.metadata.deleteConfirm', '"{{label}}"'],
        ['settingsPages.metadata.pushConfirm', values['settingsPages.metadata.pushEmphasis']],
        ['settingsPages.serialization.scannedFiles', '{{count}}'],
        ['settingsPages.serialization.tabNumbersHelp', '-104'],
        ['settingsPages.export.tokenHelp', '{{examples}}'],
      ])
        expect(values[key].split(marker).length, key).toBe(2)
    },
  )

  it.each(Object.keys(locales))('has no duplicate settings keys in %s', (locale) => {
    const source = readFileSync(join(process.cwd(), `src/lib/i18n/locales/${locale}.ts`), 'utf8')
    const file = ts.createSourceFile(`${locale}.ts`, source, ts.ScriptTarget.Latest, true)
    const duplicates: string[] = []
    const walk = (node: ts.Node, inScope = false) => {
      const scoped =
        inScope ||
        (ts.isPropertyAssignment(node) &&
          ['settings', 'accountSettings', 'settingsPages'].includes(node.name.getText(file)))
      if (scoped && ts.isObjectLiteralExpression(node)) {
        const seen = new Set<string>()
        for (const property of node.properties) {
          if (!ts.isPropertyAssignment(property)) continue
          const name = property.name.getText(file)
          if (seen.has(name)) duplicates.push(name)
          seen.add(name)
        }
      }
      ts.forEachChild(node, (child) => walk(child, scoped))
    }
    walk(file)
    expect(duplicates).toEqual([])
  })
})

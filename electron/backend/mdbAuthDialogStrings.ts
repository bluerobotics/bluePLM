import strings from './mdbAuthDialogStrings.json'

type DialogLocale = keyof typeof strings

export function mdbAuthDialogStrings(locale: string): (typeof strings)[DialogLocale] {
  const normalized = locale.toLowerCase()
  if (normalized.startsWith('zh')) {
    const traditional = /(?:^|[-_])(tw|hk|mo|hant)(?:$|[-_])/.test(normalized)
    return strings[traditional ? 'zhTW' : 'zhCN']
  }
  const primary = normalized.split(/[-_]/)[0]
  const language = (['en', 'fr', 'de', 'es', 'pt'] as const).find((value) => value === primary)
  return strings[language ?? 'en']
}

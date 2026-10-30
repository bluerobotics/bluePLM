import { useShallow } from 'zustand/react/shallow'

import { Select, Switch } from '@/components/core/ui'
import {
  SettingRow,
  SettingsGroup,
  SettingsPage,
  SettingsSection,
} from '@/features/settings/components/ui'
import { useTranslation } from '@/lib/i18n'
import { usePDMStore, type Language, type ThemeMode } from '@/stores/pdmStore'

// Only show languages that have actual translations (not English fallback)
const languageOptions: { value: Language; label: string; nativeLabel: string }[] = [
  { value: 'en', label: 'English', nativeLabel: 'English' },
  { value: 'fr', label: 'French', nativeLabel: 'Français' },
  { value: 'de', label: 'German', nativeLabel: 'Deutsch' },
  { value: 'es', label: 'Spanish', nativeLabel: 'Español' },
  { value: 'pt', label: 'Portuguese', nativeLabel: 'Português' },
  { value: 'zh-CN', label: 'Chinese (Simplified)', nativeLabel: '简体中文' },
  { value: 'zh-TW', label: 'Chinese (Traditional)', nativeLabel: '繁體中文' },
  { value: 'sindarin', label: 'Sindarin (Elvish)', nativeLabel: 'Tengwar' },
]

// A small preview of each theme: its background, side bar and accent. Static colours on purpose,
// so every swatch shows its own theme whatever theme is active.
const SWATCH: Record<ThemeMode, { bg: string; side: string; line: string; accent: string }> = {
  dark: { bg: 'bg-[#1f1f1f]', side: 'bg-[#181818]', line: 'bg-[#3b3b3b]', accent: 'bg-[#557dd8]' },
  'deep-blue': {
    bg: 'bg-[#0a1929]',
    side: 'bg-[#071320]',
    line: 'bg-[#1e3a5c]',
    accent: 'bg-[#3b82f6]',
  },
  light: { bg: 'bg-[#ffffff]', side: 'bg-[#f4f4f4]', line: 'bg-[#e0e0e0]', accent: 'bg-[#3a6bd6]' },
  system: {
    bg: 'bg-[#1f1f1f]',
    side: 'bg-[#181818]',
    line: 'bg-[#3b3b3b]',
    accent: 'bg-[#557dd8]',
  },
  kenneth: {
    bg: 'bg-[#120a1c]',
    side: 'bg-[#0d0714]',
    line: 'bg-[#2e1b45]',
    accent: 'bg-[#a855f7]',
  },
  weather: {
    bg: 'bg-[#1c1916]',
    side: 'bg-[#161310]',
    line: 'bg-[#3a3227]',
    accent: 'bg-[#f59e0b]',
  },
  christmas: {
    bg: 'bg-[#0d1117]',
    side: 'bg-[#0a0e13]',
    line: 'bg-[#1c2128]',
    accent: 'bg-[#c0392b]',
  },
  halloween: {
    bg: 'bg-[#0d0d0d]',
    side: 'bg-[#080808]',
    line: 'bg-[#242424]',
    accent: 'bg-[#f97316]',
  },
}

function ThemeSwatch({ theme, selected }: { theme: ThemeMode; selected: boolean }) {
  const c = SWATCH[theme]
  return (
    <span
      aria-hidden
      className={`relative flex h-14 w-[88px] overflow-hidden rounded-lg border ${
        selected
          ? 'border-ui-accent ring-1 ring-ui-accent'
          : 'border-ui-field-border group-hover:border-ui-fg-tertiary'
      }`}
    >
      <span className={`w-5 ${c.side}`} />
      <span className={`flex flex-1 flex-col gap-1.5 p-2 ${c.bg}`}>
        <span className={`h-1.5 w-8 rounded-full ${c.accent}`} />
        <span className={`h-1.5 w-12 rounded-full ${c.line}`} />
        <span className={`h-1.5 w-10 rounded-full ${c.line}`} />
      </span>
      {theme === 'system' && (
        <span className="absolute inset-y-0 right-0 flex w-1/2 flex-col gap-1.5 bg-[#ffffff] p-2 pl-0">
          <span className="h-1.5 w-4 rounded-r-full bg-[#3a6bd6]" />
          <span className="h-1.5 w-8 rounded-r-full bg-[#e0e0e0]" />
          <span className="h-1.5 w-6 rounded-r-full bg-[#e0e0e0]" />
        </span>
      )}
    </span>
  )
}

/** Theme, display language and interface layout: how the app looks on this machine. */
export function AppearanceSettings() {
  const { t } = useTranslation()
  const { user, theme, setTheme, language, setLanguage, tabsEnabled, setTabsEnabled } = usePDMStore(
    useShallow((s) => ({
      user: s.user,
      theme: s.theme,
      setTheme: s.setTheme,
      language: s.language,
      setLanguage: s.setLanguage,
      tabsEnabled: s.tabsEnabled,
      setTabsEnabled: s.setTabsEnabled,
    })),
  )

  const themeOptions: { value: ThemeMode; label: string; description: string }[] = [
    {
      value: 'dark',
      label: t('preferences.themeDark'),
      description: t('preferences.themeDarkDesc'),
    },
    {
      value: 'deep-blue',
      label: t('preferences.themeDeepBlue'),
      description: t('preferences.themeDeepBlueDesc'),
    },
    {
      value: 'light',
      label: t('preferences.themeLight'),
      description: t('preferences.themeLightDesc'),
    },
    {
      value: 'system',
      label: t('preferences.themeSystem'),
      description: t('preferences.themeSystemDesc'),
    },
    {
      value: 'kenneth',
      label: t('preferences.themeKenneth'),
      description: t('preferences.themeKennethDesc'),
    },
    {
      value: 'weather',
      label: t('preferences.themeWeather'),
      description: t('preferences.themeWeatherDesc'),
    },
    {
      value: 'christmas',
      label: t('preferences.themeChristmas'),
      description: t('preferences.themeChristmasDesc'),
    },
    {
      value: 'halloween',
      label: t('preferences.themeHalloween'),
      description: t('preferences.themeHalloweenDesc'),
    },
  ]

  if (!user) {
    return <div className="py-12 text-center text-[14px] text-ui-fg-secondary">Not signed in</div>
  }

  return (
    <SettingsPage>
      <SettingsSection title="Theme">
        <div role="radiogroup" aria-label="Theme" className="flex flex-wrap gap-x-4 gap-y-4 pt-3">
          {themeOptions.map((option) => {
            const isSelected = theme === option.value
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={isSelected}
                title={option.description}
                onClick={() => !isSelected && setTheme(option.value)}
                className="group flex w-[88px] flex-col items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ui-accent/50"
              >
                <ThemeSwatch theme={option.value} selected={isSelected} />
                <span
                  className={`text-[13px] ${isSelected ? 'text-ui-fg' : 'text-ui-fg-secondary group-hover:text-ui-fg'}`}
                >
                  {option.label}
                </span>
              </button>
            )
          })}
        </div>
      </SettingsSection>

      <SettingsSection title={t('preferences.language')}>
        <SettingsGroup>
          <SettingRow
            label={t('preferences.displayLanguage')}
            htmlFor="settings-display-language"
            description={
              <>
                {t('preferences.chooseLanguage')}. {t('preferences.translationsNote')}
              </>
            }
          >
            <Select
              id="settings-display-language"
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
              className="min-w-[220px]"
            >
              {languageOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.nativeLabel} ({option.label})
                </option>
              ))}
            </Select>
          </SettingRow>
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection title="Interface">
        <SettingsGroup>
          <SettingRow
            label="Browser-like Tabs"
            htmlFor="settings-browser-tabs"
            description="Enable tabs below the menu bar for multiple views. Right-click tabs for more options."
          >
            <Switch id="settings-browser-tabs" checked={tabsEnabled} onChange={setTabsEnabled} />
          </SettingRow>
        </SettingsGroup>
      </SettingsSection>
    </SettingsPage>
  )
}

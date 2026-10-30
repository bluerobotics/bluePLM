import type { ReactNode } from 'react'
import { Check, CloudSun, Crown, Ghost, Monitor, Moon, Snowflake, Sun, Waves } from 'lucide-react'
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
  { value: 'sindarin', label: 'Sindarin (Elvish)', nativeLabel: '🧝 Tengwar' },
]

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

  const themeOptions: { value: ThemeMode; label: string; icon: ReactNode; description: string }[] =
    [
      {
        value: 'dark',
        label: t('preferences.themeDark'),
        icon: <Moon size={16} />,
        description: t('preferences.themeDarkDesc'),
      },
      {
        value: 'deep-blue',
        label: t('preferences.themeDeepBlue'),
        icon: <Waves size={16} />,
        description: t('preferences.themeDeepBlueDesc'),
      },
      {
        value: 'light',
        label: t('preferences.themeLight'),
        icon: <Sun size={16} />,
        description: t('preferences.themeLightDesc'),
      },
      {
        value: 'system',
        label: t('preferences.themeSystem'),
        icon: <Monitor size={16} />,
        description: t('preferences.themeSystemDesc'),
      },
      {
        value: 'kenneth',
        label: t('preferences.themeKenneth'),
        icon: <Crown size={16} />,
        description: t('preferences.themeKennethDesc'),
      },
      {
        value: 'weather',
        label: t('preferences.themeWeather'),
        icon: <CloudSun size={16} />,
        description: t('preferences.themeWeatherDesc'),
      },
      {
        value: 'christmas',
        label: t('preferences.themeChristmas'),
        icon: <Snowflake size={16} />,
        description: t('preferences.themeChristmasDesc'),
      },
      {
        value: 'halloween',
        label: t('preferences.themeHalloween'),
        icon: <Ghost size={16} />,
        description: t('preferences.themeHalloweenDesc'),
      },
    ]

  if (!user) {
    return <div className="py-12 text-center text-[13px] text-plm-fg-muted">Not signed in</div>
  }

  return (
    <SettingsPage>
      <SettingsSection title="Theme">
        <div role="radiogroup" aria-label="Theme" className="grid grid-cols-2 gap-2">
          {themeOptions.map((option) => {
            const isSelected = theme === option.value
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => !isSelected && setTheme(option.value)}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-plm-accent/60 ${
                  isSelected
                    ? 'cursor-default border-plm-accent bg-plm-accent/10'
                    : 'border-plm-border bg-plm-bg-light/60 hover:border-plm-border-light hover:bg-plm-highlight'
                }`}
              >
                <span
                  className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md ${
                    isSelected ? 'bg-plm-accent text-white' : 'bg-plm-highlight text-plm-fg-muted'
                  }`}
                >
                  {option.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-plm-fg">{option.label}</span>
                  <span className="block truncate text-[12px] text-plm-fg-muted">
                    {option.description}
                  </span>
                </span>
                {isSelected && <Check size={16} className="flex-shrink-0 text-plm-accent" />}
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

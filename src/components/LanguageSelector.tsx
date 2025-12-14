import { useState } from 'react'
import { Globe, ChevronDown, Check } from 'lucide-react'
import { usePDMStore, Language } from '../stores/pdmStore'

const languageOptions: { value: Language; label: string; nativeLabel: string }[] = [
  { value: 'en', label: 'English', nativeLabel: 'English' },
  { value: 'fr', label: 'French', nativeLabel: 'Français' },
  { value: 'de', label: 'German', nativeLabel: 'Deutsch' },
  { value: 'es', label: 'Spanish', nativeLabel: 'Español' },
  { value: 'it', label: 'Italian', nativeLabel: 'Italiano' },
  { value: 'pt', label: 'Portuguese', nativeLabel: 'Português' },
  { value: 'nl', label: 'Dutch', nativeLabel: 'Nederlands' },
  { value: 'sv', label: 'Swedish', nativeLabel: 'Svenska' },
  { value: 'pl', label: 'Polish', nativeLabel: 'Polski' },
  { value: 'ru', label: 'Russian', nativeLabel: 'Русский' },
  { value: 'ja', label: 'Japanese', nativeLabel: '日本語' },
  { value: 'zh-CN', label: 'Chinese (Simplified)', nativeLabel: '简体中文' },
  { value: 'zh-TW', label: 'Chinese (Traditional)', nativeLabel: '繁體中文' },
  { value: 'ko', label: 'Korean', nativeLabel: '한국어' },
]

interface LanguageSelectorProps {
  /** Compact mode shows just an icon button */
  compact?: boolean
  /** Position of dropdown menu */
  dropdownPosition?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right'
}

export function LanguageSelector({ compact = false, dropdownPosition = 'bottom-right' }: LanguageSelectorProps) {
  const { language, setLanguage } = usePDMStore()
  const [isOpen, setIsOpen] = useState(false)
  
  const currentLang = languageOptions.find(l => l.value === language) || languageOptions[0]
  
  // Position classes for dropdown
  const positionClasses = {
    'bottom-left': 'top-full left-0 mt-1',
    'bottom-right': 'top-full right-0 mt-1',
    'top-left': 'bottom-full left-0 mb-1',
    'top-right': 'bottom-full right-0 mb-1',
  }
  
  return (
    <div className="relative">
      {compact ? (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 rounded-lg text-pdm-fg-muted hover:text-pdm-fg hover:bg-pdm-highlight transition-colors"
          title={`Language: ${currentLang.nativeLabel}`}
        >
          <Globe size={18} />
        </button>
      ) : (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-3 py-2 bg-pdm-bg-secondary border border-pdm-border rounded-lg hover:border-pdm-accent/50 transition-colors text-sm"
        >
          <Globe size={16} className="text-pdm-fg-muted" />
          <span className="text-pdm-fg">{currentLang.nativeLabel}</span>
          <ChevronDown size={14} className={`text-pdm-fg-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      )}
      
      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)} 
          />
          {/* Dropdown */}
          <div className={`absolute ${positionClasses[dropdownPosition]} z-50 bg-pdm-bg-secondary border border-pdm-border rounded-lg shadow-xl max-h-[320px] overflow-y-auto min-w-[200px]`}>
            {languageOptions.map((option) => {
              const isSelected = language === option.value
              return (
                <button
                  key={option.value}
                  onClick={() => {
                    setLanguage(option.value)
                    setIsOpen(false)
                  }}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors ${
                    isSelected
                      ? 'bg-pdm-accent/15 text-pdm-accent'
                      : 'text-pdm-fg hover:bg-pdm-highlight'
                  }`}
                >
                  <div>
                    <span className="font-medium">{option.nativeLabel}</span>
                    <span className="text-pdm-fg-muted text-xs ml-2">({option.label})</span>
                  </div>
                  {isSelected && <Check size={14} className="flex-shrink-0" />}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}


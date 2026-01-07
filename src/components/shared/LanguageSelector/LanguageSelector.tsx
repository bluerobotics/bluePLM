import { useState } from 'react'
import { Globe, ChevronDown, Check } from 'lucide-react'
import { usePDMStore, Language } from '@/stores/pdmStore'

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
          className="p-2 rounded-lg text-plm-fg-muted hover:text-plm-fg hover:bg-plm-highlight transition-colors"
          title={`Language: ${currentLang.nativeLabel}`}
        >
          <Globe size={18} />
        </button>
      ) : (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-3 py-2 bg-plm-bg-secondary border border-plm-border rounded-lg hover:border-plm-accent/50 transition-colors text-sm"
        >
          <Globe size={16} className="text-plm-fg-muted" />
          <span className="text-plm-fg">{currentLang.nativeLabel}</span>
          <ChevronDown size={14} className={`text-plm-fg-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      )}
      
      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)} 
          />
          {/* Dropdown - data-preserve-font keeps it readable in Elvish mode */}
          <div data-preserve-font className={`absolute ${positionClasses[dropdownPosition]} z-50 bg-plm-bg-secondary border border-plm-border rounded-lg shadow-xl max-h-[320px] overflow-y-auto min-w-[200px]`}>
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
                      ? 'bg-plm-accent/15 text-plm-accent'
                      : 'text-plm-fg hover:bg-plm-highlight'
                  }`}
                >
                  <div>
                    <span className="font-medium">{option.nativeLabel}</span>
                    <span className="text-plm-fg-muted text-xs ml-2">({option.label})</span>
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

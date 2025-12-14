import { useState } from 'react'
import { Globe, FileText, Check, ChevronRight, Shield } from 'lucide-react'
import { usePDMStore, Language } from '../stores/pdmStore'

// Language options with native names and flags
const LANGUAGES: { code: Language; name: string; nativeName: string; flag: string }[] = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
  { code: 'zh-CN', name: 'Chinese (Simplified)', nativeName: '简体中文', flag: '🇨🇳' },
  { code: 'zh-TW', name: 'Chinese (Traditional)', nativeName: '繁體中文', flag: '🇹🇼' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇧🇷' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', flag: '🇳🇱' },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska', flag: '🇸🇪' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski', flag: '🇵🇱' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺' },
]

// Translations for key onboarding text (only languages we're focusing on)
const TRANSLATIONS: Record<string, {
  welcome: string
  selectLanguage: string
  permissions: string
  logSharingTitle: string
  logSharingDesc: string
  logSharingHelp: string
  enableLogs: string
  noLogs: string
  continue: string
  getStarted: string
  step: string
  of: string
}> = {
  en: {
    welcome: 'Welcome to BluePDM',
    selectLanguage: 'Select your language',
    permissions: 'Permissions',
    logSharingTitle: 'Help improve BluePDM',
    logSharingDesc: 'Share anonymous diagnostic logs to help us identify and fix issues faster.',
    logSharingHelp: 'Logs contain error messages and performance data only. No file contents or personal data.',
    enableLogs: 'Enable log sharing',
    noLogs: 'No thanks',
    continue: 'Continue',
    getStarted: 'Get Started',
    step: 'Step',
    of: 'of',
  },
  'zh-CN': {
    welcome: '欢迎使用 BluePDM',
    selectLanguage: '选择您的语言',
    permissions: '权限设置',
    logSharingTitle: '帮助改进 BluePDM',
    logSharingDesc: '分享匿名诊断日志,帮助我们更快地发现和修复问题。',
    logSharingHelp: '日志仅包含错误信息和性能数据,不包含文件内容或个人数据。',
    enableLogs: '启用日志分享',
    noLogs: '暂不需要',
    continue: '继续',
    getStarted: '开始使用',
    step: '步骤',
    of: '/',
  },
  'zh-TW': {
    welcome: '歡迎使用 BluePDM',
    selectLanguage: '選擇您的語言',
    permissions: '權限設定',
    logSharingTitle: '幫助改進 BluePDM',
    logSharingDesc: '分享匿名診斷日誌,幫助我們更快地發現和修復問題。',
    logSharingHelp: '日誌僅包含錯誤信息和性能數據,不包含文件內容或個人數據。',
    enableLogs: '啟用日誌分享',
    noLogs: '暫不需要',
    continue: '繼續',
    getStarted: '開始使用',
    step: '步驟',
    of: '/',
  },
  ja: {
    welcome: 'BluePDMへようこそ',
    selectLanguage: '言語を選択',
    permissions: '権限設定',
    logSharingTitle: 'BluePDMの改善にご協力ください',
    logSharingDesc: '匿名の診断ログを共有して、問題の特定と修正にご協力ください。',
    logSharingHelp: 'ログにはエラーメッセージとパフォーマンスデータのみが含まれます。',
    enableLogs: 'ログ共有を有効にする',
    noLogs: 'いいえ、結構です',
    continue: '続ける',
    getStarted: '始める',
    step: 'ステップ',
    of: '/',
  },
  ko: {
    welcome: 'BluePDM에 오신 것을 환영합니다',
    selectLanguage: '언어 선택',
    permissions: '권한 설정',
    logSharingTitle: 'BluePDM 개선에 도움을 주세요',
    logSharingDesc: '익명 진단 로그를 공유하여 문제를 더 빨리 찾고 수정할 수 있도록 도와주세요.',
    logSharingHelp: '로그에는 오류 메시지와 성능 데이터만 포함됩니다.',
    enableLogs: '로그 공유 활성화',
    noLogs: '괜찮습니다',
    continue: '계속',
    getStarted: '시작하기',
    step: '단계',
    of: '/',
  },
}

// Get translations for a language, fallback to English
function getTranslations(lang: Language) {
  return TRANSLATIONS[lang] || TRANSLATIONS['en']
}

type OnboardingStep = 'language' | 'permissions'

export function OnboardingScreen() {
  const { language, setLanguage, setLogSharingEnabled, completeOnboarding } = usePDMStore()
  const [step, setStep] = useState<OnboardingStep>('language')
  const [selectedLanguage, setSelectedLanguage] = useState<Language>(language)
  const [logsEnabled, setLogsEnabled] = useState(true)
  
  const t = getTranslations(selectedLanguage)
  
  const handleLanguageSelect = (lang: Language) => {
    setSelectedLanguage(lang)
    setLanguage(lang)
  }
  
  const handleContinue = () => {
    if (step === 'language') {
      setStep('permissions')
    } else {
      setLogSharingEnabled(logsEnabled)
      completeOnboarding()
    }
  }

  return (
    <div className="h-screen flex flex-col bg-pdm-bg overflow-hidden">
      {/* Minimal title bar area */}
      <div className="h-8 flex-shrink-0 bg-pdm-bg-header border-b border-pdm-border" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />
      
      <div className="flex-1 flex items-center justify-center overflow-auto p-8">
        <div className="max-w-lg w-full">
          {/* Logo and Title */}
          <div className="text-center mb-8">
            <div className="flex justify-center items-center gap-3 mb-4">
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" className="text-pdm-accent">
                <path 
                  d="M12 2L2 7L12 12L22 7L12 2Z" 
                  stroke="currentColor" 
                  strokeWidth="2" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                />
                <path 
                  d="M2 17L12 22L22 17" 
                  stroke="currentColor" 
                  strokeWidth="2" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                />
                <path 
                  d="M2 12L12 17L22 12" 
                  stroke="currentColor" 
                  strokeWidth="2" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-pdm-fg mb-2">{t.welcome}</h1>
            
            {/* Step indicator */}
            <div className="flex items-center justify-center gap-2 text-sm text-pdm-fg-muted">
              <span>{t.step} {step === 'language' ? '1' : '2'} {t.of} 2</span>
              <div className="flex gap-1.5">
                <div className={`w-8 h-1.5 rounded-full transition-colors ${step === 'language' ? 'bg-pdm-accent' : 'bg-pdm-accent/30'}`} />
                <div className={`w-8 h-1.5 rounded-full transition-colors ${step === 'permissions' ? 'bg-pdm-accent' : 'bg-pdm-accent/30'}`} />
              </div>
            </div>
          </div>

          {/* Step 1: Language Selection */}
          {step === 'language' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-pdm-accent/20 flex items-center justify-center">
                  <Globe size={20} className="text-pdm-accent" />
                </div>
                <div>
                  <h2 className="font-semibold text-pdm-fg">{t.selectLanguage}</h2>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-2 max-h-[320px] overflow-y-auto pr-2">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => handleLanguageSelect(lang.code)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg border-2 transition-all text-left ${
                      selectedLanguage === lang.code
                        ? 'border-pdm-accent bg-pdm-accent/10'
                        : 'border-pdm-border hover:border-pdm-border-light bg-pdm-bg-light'
                    }`}
                  >
                    <span className="text-2xl">{lang.flag}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-pdm-fg truncate">{lang.nativeName}</div>
                      <div className="text-xs text-pdm-fg-muted truncate">{lang.name}</div>
                    </div>
                    {selectedLanguage === lang.code && (
                      <Check size={18} className="text-pdm-accent flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Permissions (Log Sharing) */}
          {step === 'permissions' && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-pdm-accent/20 flex items-center justify-center">
                  <Shield size={20} className="text-pdm-accent" />
                </div>
                <div>
                  <h2 className="font-semibold text-pdm-fg">{t.permissions}</h2>
                </div>
              </div>

              <div className="bg-pdm-bg-light border border-pdm-border rounded-xl p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                    <FileText size={24} className="text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-pdm-fg mb-2">{t.logSharingTitle}</h3>
                    <p className="text-sm text-pdm-fg-muted mb-3">{t.logSharingDesc}</p>
                    <p className="text-xs text-pdm-fg-dim">{t.logSharingHelp}</p>
                  </div>
                </div>

                <div className="mt-6 space-y-2">
                  <button
                    onClick={() => setLogsEnabled(true)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border-2 transition-all ${
                      logsEnabled
                        ? 'border-pdm-accent bg-pdm-accent/10'
                        : 'border-pdm-border hover:border-pdm-border-light'
                    }`}
                  >
                    <span className="font-medium text-pdm-fg">{t.enableLogs}</span>
                    {logsEnabled && <Check size={18} className="text-pdm-accent" />}
                  </button>
                  
                  <button
                    onClick={() => setLogsEnabled(false)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border-2 transition-all ${
                      !logsEnabled
                        ? 'border-pdm-accent bg-pdm-accent/10'
                        : 'border-pdm-border hover:border-pdm-border-light'
                    }`}
                  >
                    <span className="font-medium text-pdm-fg">{t.noLogs}</span>
                    {!logsEnabled && <Check size={18} className="text-pdm-accent" />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Continue Button */}
          <div className="mt-8">
            <button
              onClick={handleContinue}
              className="w-full py-4 bg-pdm-accent hover:bg-pdm-accent/90 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {step === 'permissions' ? t.getStarted : t.continue}
              <ChevronRight size={20} />
            </button>
          </div>

          {/* Footer */}
          <div className="text-center mt-8 text-xs text-pdm-fg-muted">
            Made with 💙 by Blue Robotics
          </div>
        </div>
      </div>
    </div>
  )
}


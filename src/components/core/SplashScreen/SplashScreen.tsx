/**
 * SplashScreen - Blocking splash screen during app startup
 * 
 * Displays during app initialization with four stages:
 * 1. Initializing - Store hydration, preferences
 * 2. Connecting - Auth session restore, organization loading
 * 3. Loading Vault - Auto-connecting to last vault, scanning files
 * 4. Extensions - Discover and activate startup extensions
 * 
 * Shows real-time status messages and handles extension failures gracefully.
 */
import { useState, useEffect } from 'react'
import { AlertTriangle, X } from 'lucide-react'

export interface StartupError {
  extensionId: string
  extensionName: string
  error: string
}

export interface SplashScreenProps {
  stage: 1 | 2 | 3 | 4
  stageName: string
  status: string
  errors: StartupError[]
  onContinue?: () => void
}

export function SplashScreen({ stage, stageName, status, errors, onContinue }: SplashScreenProps) {
  const [autoContinueCountdown, setAutoContinueCountdown] = useState<number | null>(null)
  const [dismissed, setDismissed] = useState(false)

  // Auto-continue after 5 seconds if there are errors
  useEffect(() => {
    if (errors.length > 0 && !dismissed) {
      setAutoContinueCountdown(5)
      const interval = setInterval(() => {
        setAutoContinueCountdown(prev => {
          if (prev === null || prev <= 1) {
            clearInterval(interval)
            onContinue?.()
            return null
          }
          return prev - 1
        })
      }, 1000)
      return () => clearInterval(interval)
    }
    return undefined
  }, [errors.length, dismissed, onContinue])

  const handleContinue = () => {
    setDismissed(true)
    setAutoContinueCountdown(null)
    onContinue?.()
  }

  return (
    <div className="h-screen flex flex-col bg-plm-bg overflow-hidden">
      {/* Minimal title bar area for dragging */}
      <div 
        className="h-8 flex-shrink-0 bg-plm-bg" 
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} 
      />
      
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        {/* Logo */}
        <div className="mb-8 animate-pulse">
          <svg width="80" height="80" viewBox="0 0 512 512" fill="none">
            <defs>
              <linearGradient id="splashBgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#0a1929"/>
                <stop offset="100%" stopColor="#0d2137"/>
              </linearGradient>
              <linearGradient id="splashIconGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#00b4d8"/>
                <stop offset="100%" stopColor="#0096c7"/>
              </linearGradient>
            </defs>
            {/* Rounded square background */}
            <rect x="0" y="0" width="512" height="512" rx="100" fill="url(#splashBgGradient)"/>
            {/* Top layer - filled */}
            <path 
              d="M256 96L96 176L256 256L416 176L256 96Z" 
              fill="url(#splashIconGradient)"
            />
            {/* Middle layer - stroked */}
            <path 
              d="M96 256L256 336L416 256" 
              stroke="url(#splashIconGradient)" 
              strokeWidth="24" 
              strokeLinecap="round" 
              strokeLinejoin="round"
              fill="none"
            />
            {/* Bottom layer - stroked */}
            <path 
              d="M96 336L256 416L416 336" 
              stroke="url(#splashIconGradient)" 
              strokeWidth="24" 
              strokeLinecap="round" 
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </div>

        {/* App name */}
        <h1 className="text-2xl font-bold text-plm-fg mb-8">BluePLM</h1>

        {/* Stage indicator */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <span className="text-sm text-plm-fg-muted">
            Stage {stage} of 4: <span className="text-plm-fg font-medium">{stageName}</span>
          </span>
        </div>

        {/* Progress bars - 4 stages */}
        <div className="flex gap-2 mb-6">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="w-14 h-1.5 rounded-full overflow-hidden bg-plm-border">
              <div 
                className={`h-full transition-all duration-500 ${
                  stage > s ? 'bg-plm-accent' : 
                  stage === s ? 'bg-plm-accent animate-pulse' : 
                  'bg-plm-border'
                }`}
                style={{ width: stage >= s ? '100%' : '0%' }}
              />
            </div>
          ))}
        </div>

        {/* Status message with fade animation */}
        <div className="h-6 flex items-center justify-center">
          <p 
            key={status}
            className="text-sm text-plm-fg-muted animate-fade-in"
          >
            {status}
          </p>
        </div>

        {/* Loading spinner */}
        {errors.length === 0 && (
          <div className="mt-8">
            <div className="w-6 h-6 border-2 border-plm-accent/30 border-t-plm-accent rounded-full animate-spin" />
          </div>
        )}

        {/* Error banner */}
        {errors.length > 0 && !dismissed && (
          <div className="mt-8 w-full max-w-md animate-slide-in-top">
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle size={20} className="text-yellow-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-plm-fg mb-1">
                    {errors.length === 1 ? 'Extension failed to load' : `${errors.length} extensions failed to load`}
                  </h3>
                  <div className="space-y-1 mb-3">
                    {errors.map((err, idx) => (
                      <p key={idx} className="text-sm text-plm-fg-muted">
                        <span className="font-medium">{err.extensionName}</span>: {err.error}
                      </p>
                    ))}
                  </div>
                  <button
                    onClick={handleContinue}
                    className="px-4 py-2 bg-plm-accent hover:bg-plm-accent/90 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Continue anyway {autoContinueCountdown !== null && `(${autoContinueCountdown}s)`}
                  </button>
                </div>
                <button 
                  onClick={handleContinue}
                  className="text-plm-fg-muted hover:text-plm-fg transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="absolute bottom-8 text-center text-xs text-plm-fg-dim">
          Made with 💙 by Blue Robotics
        </div>
      </div>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slide-in-top {
          from { opacity: 0; transform: translateY(-16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
        .animate-slide-in-top {
          animation: slide-in-top 0.3s ease-out;
        }
      `}</style>
    </div>
  )
}

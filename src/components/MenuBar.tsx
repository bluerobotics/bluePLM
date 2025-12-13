import { useState, useEffect, useRef, useCallback } from 'react'
import { LogOut, ChevronDown, Building2, Settings, Search, File, Folder, LayoutGrid, Database, ZoomIn, Minus, Plus, RotateCcw } from 'lucide-react'
import { usePDMStore } from '../stores/pdmStore'
import { signInWithGoogle, signOut, isSupabaseConfigured, linkUserToOrganization } from '../lib/supabase'
import { SettingsModal } from './SettingsModal'
import { getInitials } from '../types/pdm'
import { SystemStats } from './SystemStats'
import { DevicePresenceIndicator } from './DevicePresenceIndicator'

// Helper to log to both console and electron log file
const uiLog = (level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: unknown) => {
  const logMsg = `[MenuBar] ${message}`
  if (level === 'error') console.error(logMsg, data || '')
  else if (level === 'warn') console.warn(logMsg, data || '')
  else console.log(logMsg, data || '')
  window.electronAPI?.log?.(level, `[MenuBar] ${message}`, data)
}

// Get user's initials for avatar fallback (1-2 characters from name or email)
function getUserInitial(user: { full_name?: string | null; email?: string } | null): string {
  if (!user) return '?'
  return getInitials(user.full_name || user.email)
}

interface MenuBarProps {
  onOpenVault?: () => void
  onRefresh?: () => void
  minimal?: boolean  // Hide Sign In and Settings on welcome/signin screens
}

export function MenuBar({ minimal = false }: MenuBarProps) {
  const { 
    user, 
    organization, 
    setUser, 
    setOrganization, 
    addToast, 
    setSearchQuery, 
    searchQuery, 
    searchType, 
    setSearchType,
    connectedVaults,
    activeVaultId,
    switchVault
  } = usePDMStore()
  const [appVersion, setAppVersion] = useState('')
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showVaultDropdown, setShowVaultDropdown] = useState(false)
  const [showZoomDropdown, setShowZoomDropdown] = useState(false)
  const [zoomFactor, setZoomFactor] = useState(1)
  const vaultDropdownRef = useRef<HTMLDivElement>(null)
  const zoomDropdownRef = useRef<HTMLDivElement>(null)
  const [titleBarPadding, setTitleBarPadding] = useState(140) // Default fallback
  const [platform, setPlatform] = useState<string>('win32') // Default to Windows
  const [localSearch, setLocalSearch] = useState(searchQuery || '')
  const [availableWidth, setAvailableWidth] = useState(0)
  const menuRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const menuBarRef = useRef<HTMLDivElement>(null)

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false)
      }
      if (vaultDropdownRef.current && !vaultDropdownRef.current.contains(e.target as Node)) {
        setShowVaultDropdown(false)
      }
      if (zoomDropdownRef.current && !zoomDropdownRef.current.contains(e.target as Node)) {
        setShowZoomDropdown(false)
      }
    }
    if (showUserMenu || showVaultDropdown || showZoomDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showUserMenu, showVaultDropdown, showZoomDropdown])

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getVersion().then(setAppVersion)
      window.electronAPI.getPlatform().then(setPlatform)
      window.electronAPI.getZoomFactor?.().then(z => setZoomFactor(z || 1))
      // Get the actual titlebar overlay rect
      window.electronAPI.getTitleBarOverlayRect?.().then((rect) => {
        if (rect?.width) {
          setTitleBarPadding(rect.width + 8) // Add small margin
        }
      })
    }
  }, [])
  
  // Zoom handlers
  const handleZoomIn = useCallback(async () => {
    const newZoom = Math.min(2.0, zoomFactor + 0.1)
    const result = await window.electronAPI?.setZoomFactor?.(newZoom)
    if (result?.success && result.factor) {
      setZoomFactor(result.factor)
    }
  }, [zoomFactor])
  
  const handleZoomOut = useCallback(async () => {
    const newZoom = Math.max(0.5, zoomFactor - 0.1)
    const result = await window.electronAPI?.setZoomFactor?.(newZoom)
    if (result?.success && result.factor) {
      setZoomFactor(result.factor)
    }
  }, [zoomFactor])
  
  const handleResetZoom = useCallback(async () => {
    const result = await window.electronAPI?.setZoomFactor?.(1)
    if (result?.success && result.factor) {
      setZoomFactor(result.factor)
    }
  }, [])
  
  const handleSliderChange = useCallback(async (value: number) => {
    const result = await window.electronAPI?.setZoomFactor?.(value)
    if (result?.success && result.factor) {
      setZoomFactor(result.factor)
    }
  }, [])

  // Monitor available width for right side to collapse SystemStats when needed
  useEffect(() => {
    if (!menuBarRef.current) return

    const updateWidth = () => {
      if (menuBarRef.current) {
        const rect = menuBarRef.current.getBoundingClientRect()
        // Calculate available space for right side
        // Search bar is max-w-lg (512px) centered, so we need to ensure right side doesn't overlap
        const totalWidth = rect.width
        const leftSideWidth = platform === 'darwin' ? 200 : 150 // Approximate left side width
        const rightPadding = platform === 'darwin' ? 16 : titleBarPadding
        const searchBarHalfWidth = 256 // Half of max-w-lg (512px)
        // Available space for right side = total width - left side - search bar half - right padding
        const available = totalWidth - leftSideWidth - searchBarHalfWidth - rightPadding
        setAvailableWidth(Math.max(0, available))
      }
    }

    // Initial calculation
    updateWidth()
    
    // Use ResizeObserver for accurate measurements
    const resizeObserver = new ResizeObserver(updateWidth)
    resizeObserver.observe(menuBarRef.current)
    
    // Also listen to window resize as fallback
    window.addEventListener('resize', updateWidth)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', updateWidth)
    }
  }, [platform, titleBarPadding])

  const handleSignIn = async () => {
    uiLog('info', 'Sign in button clicked from MenuBar')
    
    if (!isSupabaseConfigured()) {
      uiLog('warn', 'Supabase not configured')
      alert('Supabase is not configured. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.')
      return
    }
    
    setIsSigningIn(true)
    uiLog('info', 'Starting Google sign-in flow from MenuBar')
    
    try {
      const { data, error } = await signInWithGoogle()
      uiLog('info', 'signInWithGoogle returned', { 
        hasData: !!data, 
        hasError: !!error,
        errorMessage: error?.message 
      })
      
      if (error) {
        uiLog('error', 'Sign in failed', { error: error.message })
        alert(`Sign in failed: ${error.message}`)
      } else {
        uiLog('info', 'Sign in completed successfully, auth state change will be handled by App')
      }
    } catch (err) {
      uiLog('error', 'Sign in exception', { error: String(err) })
      alert('Sign in failed. Check the console for details.')
    } finally {
      uiLog('info', 'Sign in flow finished, resetting state')
      setIsSigningIn(false)
    }
  }

  const handleSignOut = async () => {
    uiLog('info', 'Sign out clicked')
    const { error } = await signOut()
    if (error) {
      uiLog('error', 'Sign out error', { error: error.message })
    } else {
      uiLog('info', 'Sign out successful')
    }
    setUser(null)
    setOrganization(null)
  }

  return (
    <div ref={menuBarRef} className="h-[38px] bg-pdm-activitybar border-b border-pdm-border select-none flex-shrink-0 titlebar-drag-region relative">
      {/* Left side - Logo, Organization, and Vault (add padding on macOS for window buttons) */}
      <div 
        className="absolute left-0 top-0 h-full flex items-center"
        style={{ paddingLeft: platform === 'darwin' ? 72 : 0 }}
      >
        <div className="flex items-center gap-1 px-3 titlebar-no-drag">
          {/* BluePDM Logo */}
          <div className="flex items-center justify-center w-7 h-7 rounded hover:bg-pdm-bg-lighter transition-colors" title="BluePDM">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-pdm-accent">
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
          
          {/* Separator */}
          {!minimal && organization && <div className="w-px h-4 bg-pdm-border mx-1" />}
          
          {/* Organization (no dropdown for now - single org per user) */}
          {!minimal && organization && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded text-sm text-pdm-fg-dim">
              <Building2 size={14} className="text-pdm-fg-muted" />
              <span className="max-w-[120px] truncate">{organization.name}</span>
            </div>
          )}
          
          {/* Separator */}
          {!minimal && connectedVaults.length > 0 && <div className="w-px h-4 bg-pdm-border mx-1" />}
          
          {/* Vault Dropdown */}
          {!minimal && connectedVaults.length > 0 && (
            <div className="relative" ref={vaultDropdownRef}>
              <button
                onClick={() => setShowVaultDropdown(!showVaultDropdown)}
                className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-pdm-bg-lighter transition-colors text-sm"
              >
                <Database size={14} className="text-pdm-fg-muted" />
                <span className="text-pdm-fg max-w-[140px] truncate">
                  {connectedVaults.find(v => v.id === activeVaultId)?.name || 'Select Vault'}
                </span>
                {connectedVaults.length > 1 && (
                  <ChevronDown size={12} className={`text-pdm-fg-muted transition-transform ${showVaultDropdown ? 'rotate-180' : ''}`} />
                )}
              </button>
              
              {/* Vault Dropdown Menu */}
              {showVaultDropdown && connectedVaults.length > 1 && (
                <div className="absolute left-0 top-full mt-1 w-56 bg-pdm-bg-light border border-pdm-border rounded-lg shadow-xl overflow-hidden z-50">
                  <div className="py-1">
                    {connectedVaults.map(vault => (
                      <button
                        key={vault.id}
                        onClick={() => {
                          switchVault(vault.id, vault.localPath)
                          setShowVaultDropdown(false)
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                          vault.id === activeVaultId 
                            ? 'bg-pdm-accent/10 text-pdm-accent' 
                            : 'text-pdm-fg hover:bg-pdm-bg-lighter'
                        }`}
                      >
                        <Database size={14} className={vault.id === activeVaultId ? 'text-pdm-accent' : 'text-pdm-fg-muted'} />
                        <div className="flex-1 text-left truncate">{vault.name}</div>
                        {vault.id === activeVaultId && (
                          <div className="w-1.5 h-1.5 rounded-full bg-pdm-accent" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Center - Search bar (absolutely positioned to be truly centered) */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg px-4">
        {!minimal && (
          <div className="flex items-center gap-1 w-full titlebar-no-drag">
            {/* Search type toggle */}
            <div className="flex items-center bg-pdm-bg border border-pdm-border rounded-md h-7">
              <button
                onClick={() => setSearchType('all')}
                className={`px-2 h-full flex items-center gap-1 text-xs rounded-l-md transition-colors ${
                  searchType === 'all' 
                    ? 'bg-pdm-accent/20 text-pdm-accent' 
                    : 'text-pdm-fg-muted hover:text-pdm-fg'
                }`}
                title="Search all"
              >
                <LayoutGrid size={12} />
              </button>
              <button
                onClick={() => setSearchType('folders')}
                className={`px-2 h-full flex items-center gap-1 text-xs border-l border-pdm-border transition-colors ${
                  searchType === 'folders' 
                    ? 'bg-pdm-accent/20 text-pdm-accent' 
                    : 'text-pdm-fg-muted hover:text-pdm-fg'
                }`}
                title="Search folders"
              >
                <Folder size={12} />
              </button>
              <button
                onClick={() => setSearchType('files')}
                className={`px-2 h-full flex items-center gap-1 text-xs border-l border-pdm-border rounded-r-md transition-colors ${
                  searchType === 'files' 
                    ? 'bg-pdm-accent/20 text-pdm-accent' 
                    : 'text-pdm-fg-muted hover:text-pdm-fg'
                }`}
                title="Search files"
              >
                <File size={12} />
              </button>
            </div>
            
            {/* Search input */}
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-pdm-fg-muted" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder={searchType === 'all' ? 'Search...' : `Search ${searchType}...`}
                value={localSearch}
                onChange={(e) => {
                  setLocalSearch(e.target.value)
                  setSearchQuery(e.target.value)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setLocalSearch('')
                    setSearchQuery('')
                    searchInputRef.current?.blur()
                  }
                }}
                className="w-full h-7 pl-9 pr-8 bg-pdm-bg border border-pdm-border rounded-md text-sm text-pdm-fg placeholder:text-pdm-fg-muted focus:outline-none focus:border-pdm-accent focus:ring-1 focus:ring-pdm-accent/50 transition-colors"
              />
              {localSearch && (
                <button
                  onClick={() => {
                    setLocalSearch('')
                    setSearchQuery('')
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-pdm-fg-muted hover:text-pdm-fg p-0.5"
                >
                  <span className="text-xs">✕</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Right side - Settings and User (with padding for window controls on Windows) */}
      <div 
        className="absolute right-0 top-0 h-full flex items-center gap-2 pl-4 titlebar-no-drag max-w-[50%]"
        style={{ paddingRight: platform === 'darwin' ? 16 : titleBarPadding }}
      >
        {/* System Stats - hidden on welcome/signin screens */}
        {!minimal && <SystemStats availableWidth={availableWidth} />}
        
        {/* Separator */}
        {!minimal && <div className="w-px h-4 bg-pdm-border" />}
        
        {/* Zoom dropdown - hidden on welcome/signin screens */}
        {!minimal && (
          <div className="relative" ref={zoomDropdownRef}>
            <button
              onClick={() => setShowZoomDropdown(!showZoomDropdown)}
              className="flex items-center gap-1 px-1.5 py-1 rounded hover:bg-pdm-bg-lighter transition-colors text-pdm-fg-muted hover:text-pdm-fg"
              title={`Zoom: ${Math.round(zoomFactor * 100)}%`}
            >
              <ZoomIn size={16} />
              <span className="text-[10px] min-w-[28px] text-center">{Math.round(zoomFactor * 100)}%</span>
            </button>
            
            {/* Zoom Dropdown */}
            {showZoomDropdown && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-pdm-bg-light border border-pdm-border rounded-lg shadow-xl overflow-hidden z-50">
                <div className="p-3">
                  {/* Zoom label and reset */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-pdm-fg-dim">Zoom</span>
                    <button
                      onClick={handleResetZoom}
                      className="flex items-center gap-1 text-[10px] text-pdm-fg-muted hover:text-pdm-accent transition-colors"
                      title="Reset to 100%"
                    >
                      <RotateCcw size={10} />
                      Reset
                    </button>
                  </div>
                  
                  {/* Slider with +/- buttons */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleZoomOut}
                      className="p-1 rounded hover:bg-pdm-bg-lighter text-pdm-fg-muted hover:text-pdm-fg transition-colors"
                      title="Zoom Out"
                    >
                      <Minus size={14} />
                    </button>
                    
                    <input
                      type="range"
                      min="0.5"
                      max="2"
                      step="0.1"
                      value={zoomFactor}
                      onChange={(e) => handleSliderChange(parseFloat(e.target.value))}
                      className="flex-1 h-1.5 bg-pdm-border rounded-full appearance-none cursor-pointer accent-pdm-accent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-pdm-accent [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-sm"
                    />
                    
                    <button
                      onClick={handleZoomIn}
                      className="p-1 rounded hover:bg-pdm-bg-lighter text-pdm-fg-muted hover:text-pdm-fg transition-colors"
                      title="Zoom In"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  
                  {/* Current percentage */}
                  <div className="text-center mt-2">
                    <span className="text-sm font-medium text-pdm-fg">{Math.round(zoomFactor * 100)}%</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Settings gear - hidden on welcome/signin screens */}
        {!minimal && (
          <button
            onClick={() => setShowSettings(true)}
            className="p-1.5 rounded hover:bg-pdm-bg-lighter transition-colors text-pdm-fg-muted hover:text-pdm-fg"
            title="Settings"
          >
            <Settings size={18} />
          </button>
        )}
        
        {/* Device presence indicator - shows how many computers are online */}
        {!minimal && <DevicePresenceIndicator />}
        
        {user && !minimal ? (
          <div className="relative" ref={menuRef}>
            <button 
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 px-2 py-1 rounded hover:bg-pdm-bg-lighter transition-colors"
            >
              {user.avatar_url ? (
                <>
                  <img 
                    src={user.avatar_url} 
                    alt={user.full_name || user.email}
                    className="w-6 h-6 rounded-full"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement
                      target.style.display = 'none'
                      target.nextElementSibling?.classList.remove('hidden')
                    }}
                  />
                  <div className="w-6 h-6 rounded-full bg-pdm-accent flex items-center justify-center text-xs text-white font-semibold hidden">
                    {getUserInitial(user)}
                  </div>
                </>
              ) : (
                <div className="w-6 h-6 rounded-full bg-pdm-accent flex items-center justify-center text-xs text-white font-semibold">
                  {getUserInitial(user)}
                </div>
              )}
              <span className="text-xs text-pdm-fg-dim max-w-[120px] truncate">
                {user.full_name || user.email}
              </span>
              <ChevronDown size={12} className={`text-pdm-fg-muted transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
            </button>

            {/* Simplified Dropdown Menu */}
            {showUserMenu && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-pdm-bg-light border border-pdm-border rounded-lg shadow-xl overflow-hidden z-50">
                {/* User Info Header */}
                <div className="px-4 py-3 border-b border-pdm-border">
                  <div className="flex items-center gap-3">
                    {user.avatar_url ? (
                      <>
                        <img 
                          src={user.avatar_url} 
                          alt={user.full_name || user.email}
                          className="w-10 h-10 rounded-full"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement
                            target.style.display = 'none'
                            target.nextElementSibling?.classList.remove('hidden')
                          }}
                        />
                        <div className="w-10 h-10 rounded-full bg-pdm-accent flex items-center justify-center text-sm text-white font-semibold hidden">
                          {getUserInitial(user)}
                        </div>
                      </>
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-pdm-accent flex items-center justify-center text-sm text-white font-semibold">
                        {getUserInitial(user)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-pdm-fg truncate">
                        {user.full_name || 'No name'}
                      </div>
                      <div className="text-xs text-pdm-fg-muted truncate">
                        {user.email}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Organization Info */}
                <div className="px-4 py-2 border-b border-pdm-border">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-pdm-fg-dim">
                      <Building2 size={14} />
                      {organization ? (
                        <span>{organization.name}</span>
                      ) : (
                        <span className="text-pdm-warning">No organization</span>
                      )}
                    </div>
                    {!organization && user && (
                      <button
                        onClick={async () => {
                          const { org, error } = await linkUserToOrganization(user.id, user.email)
                          if (error) {
                            addToast('error', `Could not find org for @${user.email.split('@')[1]}`)
                          } else if (org) {
                            setOrganization(org as any)
                            addToast('success', `Linked to ${(org as any).name}`)
                            setShowUserMenu(false)
                          }
                        }}
                        className="text-xs text-pdm-accent hover:text-pdm-accent-hover"
                      >
                        Link
                      </button>
                    )}
                  </div>
                </div>

                {/* Sign Out */}
                <div className="py-1">
                  <button 
                    onClick={() => {
                      setShowUserMenu(false)
                      handleSignOut()
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-pdm-error hover:bg-red-900/20 transition-colors"
                  >
                    <LogOut size={14} />
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : !minimal ? (
          <button 
            onClick={handleSignIn}
            disabled={isSigningIn}
            className="text-xs text-pdm-accent hover:text-pdm-accent-hover transition-colors font-medium disabled:opacity-50"
          >
            {isSigningIn ? 'Signing in...' : 'Sign In with Google'}
          </button>
        ) : null}
      </div>
      
      {/* Settings Modal */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  )
}

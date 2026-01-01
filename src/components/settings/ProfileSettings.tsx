import { useState, useEffect, useRef } from 'react'
import { Mail, Loader2, ShoppingCart, GitBranch, Key, Shield, AlertTriangle, Check, RefreshCw, Camera, X } from 'lucide-react'
import { usePDMStore } from '../../stores/pdmStore'
import { getSupabaseClient, useAdminRecoveryCode, supabase } from '../../lib/supabase'
import { getInitials, getEffectiveAvatarUrl } from '../../types/pdm'
import { ContributionHistory } from './ContributionHistory'

// Get supabase client with any type cast for queries with type inference issues
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getDb = () => getSupabaseClient() as any

interface ECORecord {
  id: string
  eco_number: string
  title: string | null
  status: string
  created_at: string
  created_by: string
}

interface RFQRecord {
  id: string
  rfq_number: string
  title: string | null
  status: string
  created_at: string
  created_by: string
}

export function ProfileSettings() {
  const { user, organization, setUser, addToast } = usePDMStore()
  
  const [isLoadingECOs, setIsLoadingECOs] = useState(true)
  const [isLoadingRFQs, setIsLoadingRFQs] = useState(true)
  const [userECOs, setUserECOs] = useState<ECORecord[]>([])
  const [userRFQs, setUserRFQs] = useState<RFQRecord[]>([])
  
  // Avatar upload state
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Emergency recovery state
  const [showRecoveryInput, setShowRecoveryInput] = useState(false)
  const [recoveryCode, setRecoveryCode] = useState('')
  const [isSubmittingRecovery, setIsSubmittingRecovery] = useState(false)
  const [recoveryResult, setRecoveryResult] = useState<'success' | 'error' | null>(null)

  // Get the effective avatar URL (custom > google > null)
  const effectiveAvatarUrl = getEffectiveAvatarUrl(user)

  // Handle avatar upload
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user || !organization?.id) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      addToast('error', 'Please select an image file')
      return
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      addToast('error', 'Image must be less than 2MB')
      return
    }

    // Show preview immediately
    const previewUrl = URL.createObjectURL(file)
    setAvatarPreview(previewUrl)

    setUploadingAvatar(true)
    try {
      // Upload to vault bucket under _assets/avatars folder
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
      const filePath = `${organization.id}/_assets/avatars/${user.id}.${ext}`
      
      const { error: uploadError } = await supabase.storage
        .from('vault')
        .upload(filePath, file, { upsert: true })

      if (uploadError) throw uploadError

      // Get a signed URL (valid for 1 year)
      const { data: signedData, error: signedError } = await supabase.storage
        .from('vault')
        .createSignedUrl(filePath, 60 * 60 * 24 * 365) // 1 year

      if (signedError) throw signedError

      // Update user's custom avatar via RPC
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateError } = await (supabase as any).rpc('update_user_avatar', {
        p_custom_avatar_url: signedData.signedUrl
      })

      if (updateError) {
        console.error('[ProfileSettings] Avatar update error:', updateError)
        throw updateError
      }

      // Update local user state
      setUser({ ...user, custom_avatar_url: signedData.signedUrl })
      setAvatarPreview(null) // Clear preview since we now have the real URL
      addToast('success', 'Profile picture updated!')
    } catch (err) {
      console.error('Failed to upload avatar:', err)
      addToast('error', 'Failed to upload profile picture')
      setAvatarPreview(null) // Clear preview on error
    } finally {
      setUploadingAvatar(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // Remove custom avatar
  const handleRemoveAvatar = async () => {
    if (!user || !organization?.id) return

    setUploadingAvatar(true)
    try {
      // Delete from storage if exists
      const filePath = `${organization.id}/_assets/avatars/${user.id}`
      // Try to delete common extensions
      await Promise.allSettled([
        supabase.storage.from('vault').remove([`${filePath}.png`]),
        supabase.storage.from('vault').remove([`${filePath}.jpg`]),
        supabase.storage.from('vault').remove([`${filePath}.jpeg`]),
        supabase.storage.from('vault').remove([`${filePath}.webp`]),
      ])

      // Clear custom avatar URL via RPC
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateError } = await (supabase as any).rpc('update_user_avatar', {
        p_custom_avatar_url: ''  // Empty string clears it
      })

      if (updateError) throw updateError

      // Update local user state
      setUser({ ...user, custom_avatar_url: null })
      addToast('success', 'Custom profile picture removed')
    } catch (err) {
      console.error('Failed to remove avatar:', err)
      addToast('error', 'Failed to remove profile picture')
    } finally {
      setUploadingAvatar(false)
    }
  }

  // Load user's ECOs
  useEffect(() => {
    if (!user || !organization) return
    
    const loadECOs = async () => {
      setIsLoadingECOs(true)
      try {
        const client = getDb()
        
        // Get ECOs where user is creator or involved (via file_ecos)
        const { data: createdECOs, error: createdError } = await client
          .from('ecos')
          .select('id, eco_number, title, status, created_at, created_by')
          .eq('org_id', organization.id)
          .eq('created_by', user.id)
          .order('created_at', { ascending: false })
          .limit(10)
        
        if (createdError) {
          console.error('Error loading ECOs:', createdError)
        }
        
        // Get ECOs where user has files attached
        const { data: involvedECOs, error: involvedError } = await client
          .from('file_ecos')
          .select(`
            eco_id,
            ecos!inner (
              id,
              eco_number,
              title,
              status,
              created_at,
              created_by
            )
          `)
          .eq('created_by', user.id)
          .limit(20)
        
        if (involvedError) {
          console.error('Error loading involved ECOs:', involvedError)
        }
        
        // Combine and deduplicate
        const allECOs = [...(createdECOs || [])]
        const involvedIds = new Set(allECOs.map(e => e.id))
        
        if (involvedECOs) {
          for (const item of involvedECOs) {
            const eco = item.ecos as unknown as ECORecord
            if (eco && !involvedIds.has(eco.id)) {
              allECOs.push(eco)
              involvedIds.add(eco.id)
            }
          }
        }
        
        // Sort by created_at desc
        allECOs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        setUserECOs(allECOs.slice(0, 10))
      } catch (err) {
        console.error('Error loading ECOs:', err)
      } finally {
        setIsLoadingECOs(false)
      }
    }
    
    loadECOs()
  }, [user, organization])
  
  // Load user's RFQs
  useEffect(() => {
    if (!user || !organization) return
    
    const loadRFQs = async () => {
      setIsLoadingRFQs(true)
      try {
        const client = getSupabaseClient()
        
        const { data, error } = await client
          .from('rfqs')
          .select('id, rfq_number, title, status, created_at, created_by')
          .eq('org_id', organization.id)
          .eq('created_by', user.id)
          .order('created_at', { ascending: false })
          .limit(10)
        
        if (error) {
          console.error('Error loading RFQs:', error)
        } else {
          setUserRFQs(data || [])
        }
      } catch (err) {
        console.error('Error loading RFQs:', err)
      } finally {
        setIsLoadingRFQs(false)
      }
    }
    
    loadRFQs()
  }, [user, organization])
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
      case 'draft':
        return 'bg-sky-500/20 text-sky-400'
      case 'in_progress':
      case 'sent':
        return 'bg-amber-500/20 text-amber-400'
      case 'completed':
      case 'closed':
        return 'bg-emerald-500/20 text-emerald-400'
      case 'cancelled':
        return 'bg-rose-500/20 text-rose-400'
      default:
        return 'bg-plm-fg-muted/20 text-plm-fg-muted'
    }
  }
  
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }
  
  // Handle recovery code submission
  const handleRecoverySubmit = async () => {
    if (!recoveryCode.trim()) {
      addToast('error', 'Please enter a recovery code')
      return
    }
    
    setIsSubmittingRecovery(true)
    setRecoveryResult(null)
    
    try {
      const result = await useAdminRecoveryCode(recoveryCode.trim())
      
      if (result.success) {
        setRecoveryResult('success')
        addToast('success', 'You have been granted admin privileges!')
        
        // Update the local user state to reflect admin role
        if (user) {
          setUser({ ...user, role: 'admin' })
        }
        
        // Reload the page after a short delay to refresh all permissions
        setTimeout(() => {
          window.location.reload()
        }, 1500)
      } else {
        setRecoveryResult('error')
        addToast('error', result.error || 'Invalid or expired recovery code')
      }
    } catch (err) {
      setRecoveryResult('error')
      addToast('error', 'Failed to validate recovery code')
    } finally {
      setIsSubmittingRecovery(false)
    }
  }

  if (!user) {
    return (
      <div className="text-center py-12 text-plm-fg-muted text-base">
        Not signed in
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* User profile card */}
      <section>
        <h2 className="text-sm text-plm-fg-muted uppercase tracking-wide font-medium mb-3">
          Profile
        </h2>
        <div className="flex items-start gap-4 p-4 bg-plm-bg rounded-lg border border-plm-border">
          {/* Avatar with upload controls */}
          <div className="relative group">
            {/* Avatar display (preview > custom > google > initials) */}
            {avatarPreview || effectiveAvatarUrl ? (
              <img 
                src={avatarPreview || effectiveAvatarUrl || ''}
                alt={user.full_name || user.email}
                className="w-20 h-20 rounded-full object-cover border-2 border-plm-border"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  const target = e.target as HTMLImageElement
                  target.style.display = 'none'
                  target.nextElementSibling?.classList.remove('hidden')
                }}
              />
            ) : null}
            <div className={`w-20 h-20 rounded-full bg-plm-accent flex items-center justify-center text-2xl text-white font-semibold ${avatarPreview || effectiveAvatarUrl ? 'hidden' : ''}`}>
              {getInitials(user.full_name || user.email)}
            </div>
            
            {/* Upload overlay (shows on hover) */}
            <div 
              className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              {uploadingAvatar ? (
                <Loader2 size={24} className="text-white animate-spin" />
              ) : (
                <Camera size={24} className="text-white" />
              )}
            </div>
            
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarUpload}
              disabled={uploadingAvatar}
              className="hidden"
            />
            
            {/* Remove button (only if custom avatar exists) */}
            {user.custom_avatar_url && !uploadingAvatar && (
              <button
                onClick={handleRemoveAvatar}
                className="absolute -top-1 -right-1 p-1 bg-plm-error rounded-full text-white hover:bg-plm-error/80 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                title="Remove custom picture"
              >
                <X size={12} />
              </button>
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="text-xl font-medium text-plm-fg truncate">
              {user.full_name || 'No name'}
            </div>
            {user.job_title && (
              <div className="text-base text-plm-fg-muted">
                {user.job_title}
              </div>
            )}
            <div className="text-base text-plm-fg-muted truncate flex items-center gap-1.5">
              <Mail size={16} />
              {user.email}
            </div>
            <div className="text-sm text-plm-fg-dim mt-1">
              Role: <span className="capitalize">{user.role}</span>
            </div>
            
            {/* Avatar upload help text */}
            <div className="mt-2 text-xs text-plm-fg-dim">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="text-plm-accent hover:underline disabled:opacity-50"
              >
                {uploadingAvatar ? 'Uploading...' : 'Upload profile picture'}
              </button>
              <span className="mx-1">•</span>
              <span>PNG, JPG, or WebP, max 2MB</span>
            </div>
          </div>
        </div>
      </section>

      {/* Contribution History */}
      <ContributionHistory />

      {/* My ECOs */}
      <section>
        <h2 className="text-sm text-plm-fg-muted uppercase tracking-wide font-medium mb-3 flex items-center gap-2">
          <GitBranch size={16} />
          My ECOs
        </h2>
        <div className="bg-plm-bg rounded-lg border border-plm-border">
          {isLoadingECOs ? (
            <div className="flex items-center justify-center py-8 text-plm-fg-muted">
              <Loader2 size={20} className="animate-spin mr-2" />
              Loading ECOs...
            </div>
          ) : userECOs.length === 0 ? (
            <div className="text-center py-8 text-plm-fg-muted text-sm">
              No ECOs found
            </div>
          ) : (
            <div className="divide-y divide-plm-border">
              {userECOs.map(eco => (
                <div 
                  key={eco.id}
                  className="flex items-center gap-3 p-3 hover:bg-plm-bg-lighter transition-colors"
                >
                  <div className="p-2 rounded-lg bg-plm-bg-lighter">
                    <GitBranch size={16} className="text-plm-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-plm-fg truncate">
                      {eco.eco_number}
                      {eco.title && <span className="text-plm-fg-muted ml-2">— {eco.title}</span>}
                    </div>
                    <div className="text-xs text-plm-fg-dim">
                      Created {formatDate(eco.created_at)}
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(eco.status)}`}>
                    {eco.status.replace('_', ' ')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* My RFQs */}
      <section>
        <h2 className="text-sm text-plm-fg-muted uppercase tracking-wide font-medium mb-3 flex items-center gap-2">
          <ShoppingCart size={16} />
          My RFQs
        </h2>
        <div className="bg-plm-bg rounded-lg border border-plm-border">
          {isLoadingRFQs ? (
            <div className="flex items-center justify-center py-8 text-plm-fg-muted">
              <Loader2 size={20} className="animate-spin mr-2" />
              Loading RFQs...
            </div>
          ) : userRFQs.length === 0 ? (
            <div className="text-center py-8 text-plm-fg-muted text-sm">
              No RFQs found
            </div>
          ) : (
            <div className="divide-y divide-plm-border">
              {userRFQs.map(rfq => (
                <div 
                  key={rfq.id}
                  className="flex items-center gap-3 p-3 hover:bg-plm-bg-lighter transition-colors"
                >
                  <div className="p-2 rounded-lg bg-plm-bg-lighter">
                    <ShoppingCart size={16} className="text-violet-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-plm-fg truncate">
                      {rfq.rfq_number}
                      {rfq.title && <span className="text-plm-fg-muted ml-2">— {rfq.title}</span>}
                    </div>
                    <div className="text-xs text-plm-fg-dim">
                      Created {formatDate(rfq.created_at)}
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(rfq.status)}`}>
                    {rfq.status.replace('_', ' ')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Emergency Admin Recovery - Only show if not already admin */}
      {user.role !== 'admin' && (
        <section className="mt-12 pt-8 border-t border-plm-border">
          <div className="flex items-center gap-2 mb-3">
            <Key size={16} className="text-plm-fg-muted" />
            <h2 className="text-sm text-plm-fg-muted uppercase tracking-wide font-medium">
              Emergency Admin Recovery
            </h2>
          </div>
          
          <div className="bg-plm-bg rounded-lg border border-plm-border p-4">
            {!showRecoveryInput ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-plm-fg-muted">
                    Have a recovery code? Use it to regain admin access in emergencies.
                  </p>
                </div>
                <button
                  onClick={() => setShowRecoveryInput(true)}
                  className="px-3 py-1.5 text-sm text-plm-fg-muted hover:text-plm-fg border border-plm-border hover:border-plm-fg-muted rounded transition-colors"
                >
                  Enter Code
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Warning */}
                <div className="p-3 bg-plm-warning/10 border border-plm-warning/30 rounded flex items-start gap-2">
                  <AlertTriangle size={16} className="text-plm-warning flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-plm-warning">
                    Recovery codes are single-use and will elevate you to admin immediately. 
                    Only use if you have a valid code from your organization.
                  </p>
                </div>
                
                {/* Input */}
                <div>
                  <label className="block text-sm text-plm-fg-muted mb-2">
                    Recovery Code
                  </label>
                  <input
                    type="text"
                    value={recoveryCode}
                    onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
                    placeholder="XXXX-XXXX-XXXX-XXXX"
                    disabled={isSubmittingRecovery || recoveryResult === 'success'}
                    className="w-full px-3 py-2 bg-plm-bg-secondary border border-plm-border rounded text-plm-fg font-mono text-center tracking-wider placeholder:text-plm-fg-muted focus:outline-none focus:ring-2 focus:ring-plm-accent disabled:opacity-50"
                    maxLength={19}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isSubmittingRecovery) {
                        handleRecoverySubmit()
                      }
                    }}
                  />
                </div>
                
                {/* Result message */}
                {recoveryResult === 'success' && (
                  <div className="p-3 bg-plm-success/10 border border-plm-success/30 rounded flex items-center gap-2">
                    <Check size={16} className="text-plm-success" />
                    <p className="text-sm text-plm-success">
                      Success! You are now an admin. Reloading...
                    </p>
                  </div>
                )}
                
                {/* Actions */}
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => {
                      setShowRecoveryInput(false)
                      setRecoveryCode('')
                      setRecoveryResult(null)
                    }}
                    disabled={isSubmittingRecovery || recoveryResult === 'success'}
                    className="px-3 py-1.5 text-sm text-plm-fg-muted hover:text-plm-fg transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRecoverySubmit}
                    disabled={isSubmittingRecovery || !recoveryCode.trim() || recoveryResult === 'success'}
                    className="px-4 py-1.5 text-sm bg-plm-accent text-white rounded hover:bg-plm-accent-hover transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {isSubmittingRecovery ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        Validating...
                      </>
                    ) : (
                      <>
                        <Shield size={14} />
                        Use Code
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  )
}


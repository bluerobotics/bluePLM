import { useState, useEffect, useRef } from 'react'
import { Mail, Loader2, Key, Shield, Camera, X } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import { Badge, Button, Callout, TextInput, type BadgeTone } from '@/components/core/ui'
import {
  SettingRow,
  SettingsGroup,
  SettingsPage,
  SettingsSection,
} from '@/features/settings/components/ui'
import { isAdminUser } from '@/lib/isAdminUser'
import { log } from '@/lib/logger'
import { usePDMStore } from '@/stores/pdmStore'
import { getSupabaseClient, useAdminRecoveryCode, supabase } from '@/lib/supabase'
import { getInitials, getEffectiveAvatarUrl } from '@/lib/utils'
import { ContributionHistory } from '../system/ContributionHistory'

// Supabase v2 client type inference incomplete for RPC/advanced queries
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getDb = () => getSupabaseClient() as any // TODO: type this

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
  status: string | null
  created_at: string | null
  created_by: string | null
}

export function ProfileSettings() {
  const { user, userTeams, organization, setUser, addToast } = usePDMStore(
    useShallow((s) => ({
      user: s.user,
      userTeams: s.userTeams,
      organization: s.organization,
      setUser: s.setUser,
      addToast: s.addToast,
    })),
  )

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

      // Update user's custom avatar via RPC (RPC types not inferred in Supabase v2)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateError } = await (supabase as any).rpc('update_user_avatar', { // TODO: type this
        p_custom_avatar_url: signedData.signedUrl,
      })

      if (updateError) {
        log.error('[Profile]', 'Avatar update error', { error: updateError })
        throw updateError
      }

      // Update local user state
      setUser({ ...user, custom_avatar_url: signedData.signedUrl })
      setAvatarPreview(null) // Clear preview since we now have the real URL
      addToast('success', 'Profile picture updated!')
    } catch (error) {
      log.error('[Profile]', 'Failed to upload avatar', { error: error })
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

      // Clear custom avatar URL via RPC (RPC types not inferred in Supabase v2)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateError } = await (supabase as any).rpc('update_user_avatar', { // TODO: type this
        p_custom_avatar_url: '', // Empty string clears it
      })

      if (updateError) throw updateError

      // Update local user state
      setUser({ ...user, custom_avatar_url: null })
      addToast('success', 'Custom profile picture removed')
    } catch (error) {
      log.error('[Profile]', 'Failed to remove avatar', { error: error })
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
          log.error('[Profile]', 'Error loading created ECOs', { error: createdError })
        }

        // Get ECOs where user has files attached
        const { data: involvedECOs, error: involvedError } = await client
          .from('file_ecos')
          .select(
            `
            eco_id,
            ecos!inner (
              id,
              eco_number,
              title,
              status,
              created_at,
              created_by
            )
          `,
          )
          .eq('created_by', user.id)
          .limit(20)

        if (involvedError) {
          log.error('[Profile]', 'Error loading involved ECOs', { error: involvedError })
        }

        // Combine and deduplicate
        const allECOs = [...(createdECOs || [])]
        const involvedIds = new Set(allECOs.map((e) => e.id))

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
      } catch (error) {
        log.error('[Profile]', 'Error loading ECOs', { error: error })
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
          log.error('[Profile]', 'Error loading RFQs', { error })
        } else {
          setUserRFQs(data || [])
        }
      } catch (error) {
        log.error('[Profile]', 'Error loading RFQs (exception)', { error: error })
      } finally {
        setIsLoadingRFQs(false)
      }
    }

    loadRFQs()
  }, [user, organization])

  const statusTone = (status: string | null): BadgeTone => {
    switch (status) {
      case 'open':
      case 'draft':
        return 'info'
      case 'in_progress':
      case 'sent':
        return 'warning'
      case 'completed':
      case 'closed':
        return 'success'
      case 'cancelled':
        return 'error'
      default:
        return 'neutral'
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'unknown'
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
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
    } catch (error) {
      setRecoveryResult('error')
      addToast('error', 'Failed to validate recovery code')
    } finally {
      setIsSubmittingRecovery(false)
    }
  }

  if (!user) {
    return <div className="py-12 text-center text-[13px] text-plm-fg-muted">Not signed in</div>
  }

  const renderRecordRow = (
    key: string,
    number: string,
    title: string | null,
    createdAt: string | null,
    status: string | null,
  ) => (
    <div key={key} className="flex items-center gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-plm-fg">
          {number}
          {title && <span className="ml-2 font-normal text-plm-fg-muted">— {title}</span>}
        </div>
        <div className="text-[12px] text-plm-fg-muted">Created {formatDate(createdAt)}</div>
      </div>
      <Badge tone={statusTone(status)} className="capitalize">
        {(status || 'unknown').replace('_', ' ')}
      </Badge>
    </div>
  )

  return (
    <SettingsPage>
      {/* User profile card */}
      <SettingsGroup>
        <div className="flex items-center gap-4 px-4 py-4">
          {/* Avatar with upload controls */}
          <div className="group relative flex-shrink-0">
            {/* Avatar display (preview > custom > google > initials) */}
            {avatarPreview || effectiveAvatarUrl ? (
              <img
                src={(avatarPreview || effectiveAvatarUrl)!}
                alt={user.full_name || user.email}
                className="h-16 w-16 rounded-full border border-plm-border object-cover"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  const target = e.target as HTMLImageElement
                  target.classList.add('hidden')
                  target.nextElementSibling?.classList.remove('hidden')
                }}
              />
            ) : null}
            <div
              className={`flex h-16 w-16 items-center justify-center rounded-full bg-plm-accent text-xl font-semibold text-white ${avatarPreview || effectiveAvatarUrl ? 'hidden' : ''}`}
            >
              {getInitials(user.full_name || user.email)}
            </div>

            {/* Upload overlay (shows on hover) */}
            <div
              className="absolute inset-0 flex cursor-pointer items-center justify-center rounded-full bg-black/60 opacity-0 transition-opacity group-hover:opacity-100"
              onClick={() => fileInputRef.current?.click()}
            >
              {uploadingAvatar ? (
                <Loader2 size={20} className="animate-spin text-white" />
              ) : (
                <Camera size={20} className="text-white" />
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
                type="button"
                onClick={handleRemoveAvatar}
                className="absolute -right-1 -top-1 rounded-full bg-plm-error p-1 text-white opacity-0 shadow-lg transition-opacity hover:opacity-90 group-hover:opacity-100"
                title="Remove custom picture"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-[15px] font-semibold text-plm-fg">
                {user.full_name || 'No name'}
              </span>
              <Badge className="capitalize">{user.role}</Badge>
            </div>
            {user.job_title && (
              <div className="text-[13px] text-plm-fg-muted">{user.job_title}</div>
            )}
            <div className="flex items-center gap-1.5 truncate text-[12px] text-plm-fg-muted">
              <Mail size={12} />
              {user.email}
            </div>
            <div className="mt-1 text-[12px] text-plm-fg-muted">PNG, JPG, or WebP, max 2MB</div>
          </div>

          <Button
            size="sm"
            icon={<Camera size={12} />}
            loading={uploadingAvatar}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploadingAvatar ? 'Uploading...' : 'Upload profile picture'}
          </Button>
        </div>
      </SettingsGroup>

      {/* Contribution History */}
      <ContributionHistory />

      <SettingsSection title="My ECOs">
        <SettingsGroup>
          {isLoadingECOs ? (
            <div className="flex items-center gap-2 px-4 py-3.5 text-[13px] text-plm-fg-muted">
              <Loader2 size={14} className="animate-spin" />
              Loading ECOs...
            </div>
          ) : userECOs.length === 0 ? (
            <div className="px-4 py-3.5 text-[13px] text-plm-fg-muted">No ECOs found</div>
          ) : (
            userECOs.map((eco) =>
              renderRecordRow(eco.id, eco.eco_number, eco.title, eco.created_at, eco.status),
            )
          )}
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection title="My RFQs">
        <SettingsGroup>
          {isLoadingRFQs ? (
            <div className="flex items-center gap-2 px-4 py-3.5 text-[13px] text-plm-fg-muted">
              <Loader2 size={14} className="animate-spin" />
              Loading RFQs...
            </div>
          ) : userRFQs.length === 0 ? (
            <div className="px-4 py-3.5 text-[13px] text-plm-fg-muted">No RFQs found</div>
          ) : (
            userRFQs.map((rfq) =>
              renderRecordRow(rfq.id, rfq.rfq_number, rfq.title, rfq.created_at, rfq.status),
            )
          )}
        </SettingsGroup>
      </SettingsSection>

      {/* Emergency Admin Recovery - Only show if not already admin */}
      {!isAdminUser(user.role, userTeams) && (
        <SettingsSection title="Emergency Admin Recovery">
          <SettingsGroup>
            {!showRecoveryInput ? (
              <SettingRow
                label="Recovery Code"
                description="Have a recovery code? Use it to regain admin access in emergencies."
              >
                <Button size="sm" icon={<Key size={12} />} onClick={() => setShowRecoveryInput(true)}>
                  Enter Code
                </Button>
              </SettingRow>
            ) : (
              <div className="space-y-3 px-4 py-4">
                <Callout tone="warning">
                  Recovery codes are single-use and will elevate you to admin immediately. Only use
                  if you have a valid code from your organization.
                </Callout>

                <div>
                  <label
                    htmlFor="settings-recovery-code"
                    className="mb-1.5 block text-[12px] font-medium text-plm-fg-muted"
                  >
                    Recovery Code
                  </label>
                  <TextInput
                    id="settings-recovery-code"
                    value={recoveryCode}
                    onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
                    placeholder="XXXX-XXXX-XXXX-XXXX"
                    disabled={isSubmittingRecovery || recoveryResult === 'success'}
                    className="text-center font-mono tracking-wider"
                    maxLength={19}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isSubmittingRecovery) {
                        handleRecoverySubmit()
                      }
                    }}
                  />
                </div>

                {recoveryResult === 'success' && (
                  <Callout tone="success">Success! You are now an admin. Reloading...</Callout>
                )}

                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setShowRecoveryInput(false)
                      setRecoveryCode('')
                      setRecoveryResult(null)
                    }}
                    disabled={isSubmittingRecovery || recoveryResult === 'success'}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    icon={<Shield size={14} />}
                    loading={isSubmittingRecovery}
                    onClick={handleRecoverySubmit}
                    disabled={!recoveryCode.trim() || recoveryResult === 'success'}
                  >
                    {isSubmittingRecovery ? 'Validating...' : 'Use Code'}
                  </Button>
                </div>
              </div>
            )}
          </SettingsGroup>
        </SettingsSection>
      )}
    </SettingsPage>
  )
}

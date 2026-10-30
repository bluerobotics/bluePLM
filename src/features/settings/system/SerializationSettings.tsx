import { useState, useEffect, useMemo, useRef } from 'react'
import { log } from '@/lib/logger'
import { useTranslation } from '@/lib/i18n'
import { usePDMStore } from '@/stores/pdmStore'
import { useShallow } from 'zustand/react/shallow'
import { supabase } from '@/lib/supabase'
import { detectHighestSerialNumber, type HighestSerialScanResult } from '@/lib/serialization'
import { SerializationSettingsPresentation } from './SerializationSettingsPresentation'
import {
  DEFAULT_SERIALIZATION_SETTINGS,
  type KeepoutZone,
  type SerializationSettingsData,
} from './serializationSettingsModel'

export function SerializationSettings() {
  const { organization, addToast, getEffectiveRole } = usePDMStore(
    useShallow((s) => ({
      organization: s.organization,
      addToast: s.addToast,
      getEffectiveRole: s.getEffectiveRole,
    })),
  )
  const { t } = useTranslation()
  const isAdmin = getEffectiveRole() === 'admin'
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<SerializationSettingsData>(
    DEFAULT_SERIALIZATION_SETTINGS,
  )
  const [previewNumber, setPreviewNumber] = useState<string | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)

  // Track if we're currently saving to avoid overwriting with stale realtime data
  const savingRef = useRef(false)

  // New keepout zone form
  const [newKeepout, setNewKeepout] = useState({ start: '', end: '', description: '' })
  const [showKeepoutForm, setShowKeepoutForm] = useState(false)

  // Custom extension input
  const [customExtension, setCustomExtension] = useState('')

  // Detect highest serial number
  const [detecting, setDetecting] = useState(false)
  const [detectedResult, setDetectedResult] = useState<HighestSerialScanResult | null>(null)

  // Generate a live preview of what the serial number will look like
  const livePreview = useMemo(() => {
    if (!settings.enabled) return 'Disabled'

    let nextNumber = settings.current_counter + 1

    // Skip keepout zones
    for (const zone of settings.keepout_zones) {
      if (nextNumber >= zone.start && nextNumber <= zone.end_num) {
        nextNumber = zone.end_num + 1
      }
    }

    let serial = settings.prefix

    if (settings.letter_prefix) {
      serial += settings.letter_prefix
    }

    serial += String(nextNumber).padStart(settings.padding_digits, '0')

    // Add tab number example if enabled
    if (settings.tab_enabled) {
      serial += settings.tab_separator + '001'.padStart(settings.tab_padding_digits, '0')
    }

    serial += settings.suffix

    return serial
  }, [settings])

  // Generate base-only preview (without tab)
  const basePreview = useMemo(() => {
    if (!settings.enabled) return ''

    let nextNumber = settings.current_counter + 1

    for (const zone of settings.keepout_zones) {
      if (nextNumber >= zone.start && nextNumber <= zone.end_num) {
        nextNumber = zone.end_num + 1
      }
    }

    let serial = settings.prefix
    if (settings.letter_prefix) {
      serial += settings.letter_prefix
    }
    serial += String(nextNumber).padStart(settings.padding_digits, '0')

    return serial
  }, [settings])

  // Load current settings on mount
  useEffect(() => {
    if (!organization?.id) return

    const loadSettings = async () => {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('organization')
          .select('serialization_settings')
          .eq('id', organization.id)
          .single()

        if (error) throw error

        const rawSettings = data?.serialization_settings
        const savedSettings =
          rawSettings && typeof rawSettings === 'object' && !Array.isArray(rawSettings)
            ? (rawSettings as unknown as SerializationSettingsData)
            : DEFAULT_SERIALIZATION_SETTINGS
        // Ensure all fields exist with defaults
        setSettings({
          ...DEFAULT_SERIALIZATION_SETTINGS,
          ...savedSettings,
          keepout_zones: savedSettings.keepout_zones || [],
          auto_apply_extensions: savedSettings.auto_apply_extensions || [],
        })
      } catch (error) {
        log.error('[Serialization]', 'Failed to load settings', { error: error })
      } finally {
        setLoading(false)
      }
    }

    loadSettings()
  }, [organization?.id])

  // Sync with realtime organization changes (when another admin updates settings)
  useEffect(() => {
    // Skip if we're currently saving (to avoid overwriting our own changes)
    if (savingRef.current) return
    // Skip if still loading initial data
    if (loading) return

    // Get serialization_settings from the organization object (updated via realtime)
    const realtimeSettings = (organization as any)?.serialization_settings // TODO: type this
    if (realtimeSettings) {
      setSettings({
        ...DEFAULT_SERIALIZATION_SETTINGS,
        ...realtimeSettings,
        keepout_zones: realtimeSettings.keepout_zones || [],
        auto_apply_extensions: realtimeSettings.auto_apply_extensions || [],
      })
    }
  }, [(organization as any)?.serialization_settings]) // TODO: type this

  // Fetch preview from server
  const fetchPreview = async () => {
    if (!organization?.id) return

    setLoadingPreview(true)
    try {
      const { data, error } = await (supabase.rpc as any)('serial_number_preview_next', {
        // TODO: type this
        p_org_id: organization.id,
      })

      if (error) throw error
      setPreviewNumber(data as string)
    } catch (error) {
      log.error('[Serialization]', 'Failed to fetch preview', { error: error })
      addToast('error', 'Failed to fetch serial number preview')
    } finally {
      setLoadingPreview(false)
    }
  }

  // Save settings
  // Uses a safe RPC function that preserves the counter from the database
  // This prevents race conditions where saving settings could overwrite a counter
  // that was incremented by another user generating a serial number
  const handleSave = async () => {
    if (!organization?.id) return

    setSaving(true)
    savingRef.current = true
    try {
      // Use safe RPC that preserves the current_counter from the database
      // This prevents accidentally overwriting a counter incremented by another user
      const { error } = await (supabase.rpc as any)('org_update_serialization_settings', {
        // TODO: type this
        p_org_id: organization.id,
        p_settings: JSON.parse(JSON.stringify(settings)),
      })

      if (error) throw error
      addToast('success', 'Serialization settings saved')

      // Refresh preview after save
      fetchPreview()
    } catch (error) {
      log.error('[Serialization]', 'Failed to save settings', { error: error })
      addToast('error', 'Failed to save serialization settings')
    } finally {
      setSaving(false)
      // Small delay before allowing realtime sync again to let the update propagate
      setTimeout(() => {
        savingRef.current = false
      }, 1000)
    }
  }

  // Update a setting
  const updateSetting = <K extends keyof SerializationSettingsData>(
    key: K,
    value: SerializationSettingsData[K],
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  // Add keepout zone
  const addKeepoutZone = () => {
    const start = parseInt(newKeepout.start)
    const end = parseInt(newKeepout.end)

    if (isNaN(start) || isNaN(end) || start < 0 || end < start) {
      addToast('error', 'Invalid range: end must be greater than or equal to start')
      return
    }

    // Check for overlapping zones
    const overlaps = settings.keepout_zones.some(
      (zone) =>
        (start >= zone.start && start <= zone.end_num) ||
        (end >= zone.start && end <= zone.end_num) ||
        (start <= zone.start && end >= zone.end_num),
    )

    if (overlaps) {
      addToast('error', 'This range overlaps with an existing keepout zone')
      return
    }

    const newZone: KeepoutZone = {
      start,
      end_num: end,
      description: newKeepout.description || `Reserved range ${start}-${end}`,
    }

    updateSetting(
      'keepout_zones',
      [...settings.keepout_zones, newZone].sort((a, b) => a.start - b.start),
    )
    setNewKeepout({ start: '', end: '', description: '' })
    setShowKeepoutForm(false)
  }

  // Remove keepout zone
  const removeKeepoutZone = (index: number) => {
    const updated = settings.keepout_zones.filter((_, i) => i !== index)
    updateSetting('keepout_zones', updated)
  }

  // Toggle extension for auto-apply
  const toggleExtension = (ext: string) => {
    const normalizedExt = ext.toLowerCase().startsWith('.')
      ? ext.toLowerCase()
      : `.${ext.toLowerCase()}`
    const current = settings.auto_apply_extensions || []

    if (current.includes(normalizedExt)) {
      updateSetting(
        'auto_apply_extensions',
        current.filter((e) => e !== normalizedExt),
      )
    } else {
      updateSetting('auto_apply_extensions', [...current, normalizedExt])
    }
  }

  // Add custom extension
  const addCustomExtension = () => {
    if (!customExtension.trim()) return

    const normalizedExt = customExtension.toLowerCase().startsWith('.')
      ? customExtension.toLowerCase().trim()
      : `.${customExtension.toLowerCase().trim()}`

    const current = settings.auto_apply_extensions || []
    if (!current.includes(normalizedExt)) {
      updateSetting('auto_apply_extensions', [...current, normalizedExt])
    }
    setCustomExtension('')
  }

  // Detect highest serial number in vault
  const handleDetectHighest = async () => {
    if (!organization?.id) return

    setDetecting(true)
    setDetectedResult(null)
    try {
      const result = await detectHighestSerialNumber(organization.id)
      setDetectedResult(result)

      if (result && result.highestCounter > 0) {
        addToast(
          'success',
          `Found highest: ${result.highestPartNumber} (counter: ${result.highestCounter})`,
        )
      } else if (result) {
        addToast('info', `Scanned ${result.totalScanned} files, no matching serial numbers found`)
      }
    } catch (error) {
      log.error('[Serialization]', 'Failed to detect highest serial', { error: error })
      addToast('error', 'Failed to scan files')
    } finally {
      setDetecting(false)
    }
  }

  // Apply detected counter value
  const applyDetectedCounter = () => {
    if (detectedResult && detectedResult.highestCounter > 0) {
      updateSetting('current_counter', detectedResult.highestCounter)
      addToast('success', `Counter set to ${detectedResult.highestCounter}`)
    }
  }

  return (
    <SerializationSettingsPresentation
      bindings={{
        organization: Boolean(organization),
        loading,
        isAdmin,
        settings,
        livePreview,
        loadingPreview,
        fetchPreview,
        previewNumber,
        updateSetting,
        detecting,
        handleDetectHighest,
        detectedResult,
        applyDetectedCounter,
        basePreview,
        newKeepout,
        setNewKeepout,
        showKeepoutForm,
        setShowKeepoutForm,
        addKeepoutZone,
        removeKeepoutZone,
        customExtension,
        setCustomExtension,
        toggleExtension,
        addCustomExtension,
        t,
        saving,
        handleSave,
      }}
    />
  )
}

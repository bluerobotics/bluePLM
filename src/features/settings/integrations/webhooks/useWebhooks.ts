import { useState, useEffect, useCallback, type FormEvent } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { copyToClipboard } from '@/lib/clipboard'
import { log } from '@/lib/logger'
import { supabase } from '@/lib/supabase'
import { usePDMStore } from '@/stores/pdmStore'
import type { Webhook, WebhookDelivery, WebhookEvent, WebhookTriggerFilter } from '@/types/database'

import {
  WEBHOOK_EVENTS,
  emptyFormData,
  generateSecret,
  type WebhookFormData,
} from './webhookConstants'

// Supabase v2 type inference incomplete for webhooks table
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any // TODO: type this

/** State and database calls behind the Webhooks settings page (moved out of WebhooksSettings.tsx). */
export function useWebhooks() {
  const { user, organization, addToast, getEffectiveRole } = usePDMStore(
    useShallow((s) => ({
      user: s.user,
      organization: s.organization,
      addToast: s.addToast,
      getEffectiveRole: s.getEffectiveRole,
    })),
  )
  const isAdmin = getEffectiveRole() === 'admin'

  const [webhooks, setWebhooks] = useState<Webhook[]>([])
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([])
  const [orgUsers, setOrgUsers] = useState<
    { id: string; email: string; full_name: string | null; role: string }[]
  >([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<WebhookFormData>(emptyFormData)
  const [showSecret, setShowSecret] = useState(false)
  const [secretCopied, setSecretCopied] = useState(false)

  // Expanded states
  const [expandedWebhook, setExpandedWebhook] = useState<string | null>(null)
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    Files: true,
    Reviews: false,
    ECOs: false,
  })

  // Testing state
  const [testingWebhook, setTestingWebhook] = useState<string | null>(null)

  // Delete confirmation state
  const [deletingWebhook, setDeletingWebhook] = useState<Webhook | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Load webhooks
  const loadWebhooks = useCallback(async () => {
    if (!organization?.id) return

    try {
      const { data, error } = await supabase
        .from('webhooks')
        .select('*')
        .eq('org_id', organization.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setWebhooks(data || [])
    } catch (error) {
      log.error('[Webhooks]', 'Failed to load webhooks', { error: error })
    } finally {
      setLoading(false)
    }
  }, [organization?.id])

  // Load org users for trigger filter
  const loadOrgUsers = useCallback(async () => {
    if (!organization?.id) return

    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, full_name, role')
        .eq('org_id', organization.id)
        .order('full_name')

      if (error) throw error
      setOrgUsers(data || [])
    } catch (error) {
      log.error('[Webhooks]', 'Failed to load users', { error: error })
    }
  }, [organization?.id])

  // Load deliveries for a webhook
  const loadDeliveries = useCallback(
    async (webhookId: string) => {
      if (!organization?.id) return

      try {
        const { data, error } = await supabase
          .from('webhook_deliveries')
          .select('*')
          .eq('webhook_id', webhookId)
          .order('created_at', { ascending: false })
          .limit(20)

        if (error) throw error
        setDeliveries(data || [])
      } catch (error) {
        log.error('[Webhooks]', 'Failed to load deliveries', { error: error })
      }
    },
    [organization?.id],
  )

  useEffect(() => {
    loadWebhooks()
    loadOrgUsers()
  }, [loadWebhooks, loadOrgUsers])

  useEffect(() => {
    if (expandedWebhook) {
      loadDeliveries(expandedWebhook)
    } else {
      setDeliveries([])
    }
  }, [expandedWebhook, loadDeliveries])

  // Form handlers
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!organization?.id || !user?.id) return

    // Validation
    if (!formData.name.trim()) {
      addToast('error', 'Name is required')
      return
    }
    if (!formData.url.trim()) {
      addToast('error', 'URL is required')
      return
    }
    if (formData.events.length === 0) {
      addToast('error', 'Select at least one event')
      return
    }

    // Validate URL
    try {
      new URL(formData.url)
    } catch {
      addToast('error', 'Invalid URL format')
      return
    }

    setSaving(true)
    try {
      if (editingId) {
        // Update existing
        const { error } = await db
          .from('webhooks')
          .update({
            name: formData.name.trim(),
            description: formData.description.trim() || null,
            url: formData.url.trim(),
            events: formData.events,
            is_active: formData.is_active,
            trigger_filter: formData.trigger_filter,
            trigger_roles: formData.trigger_roles,
            trigger_user_ids: formData.trigger_user_ids,
            updated_by: user.id,
          })
          .eq('id', editingId)

        if (error) throw error
        addToast('success', 'Webhook updated')
      } else {
        // Create new
        const { error } = await db.from('webhooks').insert({
          org_id: organization.id,
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          url: formData.url.trim(),
          secret: formData.secret,
          events: formData.events,
          is_active: formData.is_active,
          trigger_filter: formData.trigger_filter,
          trigger_roles: formData.trigger_roles,
          trigger_user_ids: formData.trigger_user_ids,
          created_by: user.id,
        })

        if (error) throw error
        addToast('success', 'Webhook created')
      }

      // Reset form and reload
      setShowForm(false)
      setEditingId(null)
      setFormData({ ...emptyFormData, secret: generateSecret() })
      loadWebhooks()
    } catch (error) {
      log.error('[Webhooks]', 'Failed to save webhook', { error: error })
      addToast('error', 'Failed to save webhook')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (webhook: Webhook) => {
    setFormData({
      name: webhook.name,
      description: webhook.description || '',
      url: webhook.url,
      secret: webhook.secret,
      events: webhook.events,
      is_active: webhook.is_active,
      trigger_filter: (webhook.trigger_filter as WebhookTriggerFilter) || 'everyone',
      trigger_roles: webhook.trigger_roles || [],
      trigger_user_ids: webhook.trigger_user_ids || [],
    })
    setEditingId(webhook.id)
    setShowForm(true)
    setShowSecret(false)
  }

  const handleDelete = async () => {
    if (!deletingWebhook) return

    setIsDeleting(true)
    try {
      const { error } = await supabase.from('webhooks').delete().eq('id', deletingWebhook.id)

      if (error) throw error
      addToast('success', 'Webhook deleted')
      loadWebhooks()
    } catch (error) {
      log.error('[Webhooks]', 'Failed to delete webhook', { error: error })
      addToast('error', 'Failed to delete webhook')
    } finally {
      setIsDeleting(false)
      setDeletingWebhook(null)
    }
  }

  const handleToggleActive = async (webhook: Webhook) => {
    try {
      const { error } = await db
        .from('webhooks')
        .update({ is_active: !webhook.is_active })
        .eq('id', webhook.id)

      if (error) throw error
      addToast('success', webhook.is_active ? 'Webhook disabled' : 'Webhook enabled')
      loadWebhooks()
    } catch (error) {
      log.error('[Webhooks]', 'Failed to toggle webhook', { error: error })
      addToast('error', 'Failed to update webhook')
    }
  }

  const handleCopySecret = async () => {
    const result = await copyToClipboard(formData.secret)
    if (result.success) {
      setSecretCopied(true)
      setTimeout(() => setSecretCopied(false), 2000)
    } else {
      log.error('[Webhooks]', 'Failed to copy', { error: result.error })
    }
  }

  const handleTestWebhook = async (webhook: Webhook) => {
    setTestingWebhook(webhook.id)

    try {
      // Send a test payload
      const testPayload = {
        event: 'test',
        timestamp: new Date().toISOString(),
        organization: {
          id: organization?.id,
          name: organization?.name,
        },
        data: {
          message: 'This is a test webhook from BluePLM',
        },
      }

      // Create signature
      const encoder = new TextEncoder()
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(webhook.secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      )
      const payloadString = JSON.stringify(testPayload)
      const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadString))
      const signatureHex = Array.from(new Uint8Array(signature))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-BluePLM-Signature': `sha256=${signatureHex}`,
          'X-BluePLM-Event': 'test',
          'X-BluePLM-Delivery': crypto.randomUUID(),
        },
        body: payloadString,
        signal: AbortSignal.timeout(webhook.timeout_seconds * 1000),
      })

      if (response.ok) {
        addToast('success', `Test successful! Status: ${response.status}`)
      } else {
        addToast('warning', `Test completed with status: ${response.status}`)
      }
    } catch (error) {
      log.error('[Webhooks]', 'Test failed', { error: error })
      addToast('error', `Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setTestingWebhook(null)
    }
  }

  const toggleEvent = (event: WebhookEvent) => {
    setFormData((prev) => ({
      ...prev,
      events: prev.events.includes(event)
        ? prev.events.filter((e) => e !== event)
        : [...prev.events, event],
    }))
  }

  const toggleCategory = (_category: string, events: typeof WEBHOOK_EVENTS) => {
    const categoryEvents = events.map((e) => e.value)
    const allSelected = categoryEvents.every((e) => formData.events.includes(e))

    setFormData((prev) => ({
      ...prev,
      events: allSelected
        ? prev.events.filter((e) => !categoryEvents.includes(e))
        : [...new Set([...prev.events, ...categoryEvents])],
    }))
  }

  const openNewForm = () => {
    setFormData({ ...emptyFormData, secret: generateSecret() })
    setEditingId(null)
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingId(null)
  }

  return {
    isAdmin,
    webhooks,
    deliveries,
    orgUsers,
    loading,
    saving,
    showForm,
    editingId,
    formData,
    setFormData,
    showSecret,
    setShowSecret,
    secretCopied,
    expandedWebhook,
    setExpandedWebhook,
    expandedCategories,
    setExpandedCategories,
    testingWebhook,
    deletingWebhook,
    setDeletingWebhook,
    isDeleting,
    handleSubmit,
    handleEdit,
    handleDelete,
    handleToggleActive,
    handleCopySecret,
    handleTestWebhook,
    toggleEvent,
    toggleCategory,
    openNewForm,
    closeForm,
  }
}

export type WebhooksState = ReturnType<typeof useWebhooks>

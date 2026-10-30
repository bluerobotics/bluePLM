import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { log } from '@/lib/logger'
import { supabase } from '@/lib/supabase'
import { usePDMStore } from '@/stores/pdmStore'

import { emptyAddress, type AddressForm, type CompanyProfile, type OrgAddress } from './types'

/** State and data calls of the Company settings page: profile, logo and addresses. */
export function useCompanyProfile() {
  const { organization, addToast, getEffectiveRole } = usePDMStore(
    useShallow((s) => ({
      organization: s.organization,
      addToast: s.addToast,
      getEffectiveRole: s.getEffectiveRole,
    })),
  )
  const isAdmin = getEffectiveRole() === 'admin'
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)

  // Track if we're currently saving to avoid overwriting with stale realtime data
  const savingRef = useRef(false)

  const [profile, setProfile] = useState<CompanyProfile>({
    logo_url: null,
    logo_storage_path: null,
    phone: null,
    website: null,
    contact_email: null,
  })

  // Addresses state
  const [billingAddresses, setBillingAddresses] = useState<OrgAddress[]>([])
  const [shippingAddresses, setShippingAddresses] = useState<OrgAddress[]>([])
  const [loadingAddresses, setLoadingAddresses] = useState(true)

  // Address modal state
  const [showAddressModal, setShowAddressModal] = useState(false)
  const [editingAddress, setEditingAddress] = useState<OrgAddress | null>(null)
  const [addressForm, setAddressForm] = useState<AddressForm>(emptyAddress)
  const [savingAddress, setSavingAddress] = useState(false)
  const [deletingAddressId, setDeletingAddressId] = useState<string | null>(null)

  // Delete confirmation modal state
  const [deleteConfirmAddress, setDeleteConfirmAddress] = useState<OrgAddress | null>(null)

  // Load current profile
  useEffect(() => {
    if (!organization?.id) return

    const loadProfile = async () => {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('organization')
          .select('logo_url, logo_storage_path, phone, website, contact_email')
          .eq('id', organization.id)
          .single()

        if (error) throw error

        log.debug('[CompanyProfile]', 'Loaded from DB', {
          logo_url: data?.logo_url?.substring(0, 50) + '...',
          logo_storage_path: data?.logo_storage_path,
        })

        // If we have a storage path, get a fresh signed URL
        let logoUrl = data?.logo_url || null
        if (data?.logo_storage_path) {
          const { data: signedData, error: signedError } = await supabase.storage
            .from('vault')
            .createSignedUrl(data.logo_storage_path, 60 * 60 * 24 * 365) // 1 year

          if (signedError) {
            log.error('[CompanyProfile]', 'Failed to create signed URL', { error: signedError })
          } else if (signedData?.signedUrl) {
            log.debug('[CompanyProfile]', 'Generated fresh signed URL')
            logoUrl = signedData.signedUrl
          }
        }

        setProfile({
          logo_url: logoUrl,
          logo_storage_path: data?.logo_storage_path || null,
          phone: data?.phone || null,
          website: data?.website || null,
          contact_email: data?.contact_email || null,
        })
      } catch (error) {
        log.error('[CompanyProfile]', 'Failed to load company profile', { error: error })
      } finally {
        setLoading(false)
      }
    }

    loadProfile()
  }, [organization?.id])

  // Load addresses
  useEffect(() => {
    if (!organization?.id) return

    const loadAddresses = async () => {
      setLoadingAddresses(true)
      try {
        const { data, error } = await supabase
          .from('org_address')
          .select('*')
          .eq('org_id', organization.id)
          .order('is_default', { ascending: false })
          .order('label')

        if (error) throw error

        const addresses = (data || []) as OrgAddress[]
        setBillingAddresses(addresses.filter((a) => a.address_type === 'billing'))
        setShippingAddresses(addresses.filter((a) => a.address_type === 'shipping'))
      } catch (error) {
        log.error('[CompanyProfile]', 'Failed to load addresses', { error: error })
      } finally {
        setLoadingAddresses(false)
      }
    }

    loadAddresses()
  }, [organization?.id])

  // Sync with realtime organization changes (when another admin updates settings)
  useEffect(() => {
    // Skip if we're currently saving (to avoid overwriting our own changes)
    if (savingRef.current) return
    // Skip if still loading initial data
    if (loading) return

    // Sync company profile fields from realtime organization object
    const org = organization
    if (org) {
      log.debug('[CompanyProfile]', 'Syncing with realtime org settings')

      // Only update if there are actual changes from the store
      setProfile((prev) => ({
        logo_url: org.logo_url ?? prev.logo_url,
        logo_storage_path: org.logo_storage_path ?? prev.logo_storage_path,
        phone: org.phone ?? prev.phone,
        website: org.website ?? prev.website,
        contact_email: org.contact_email ?? prev.contact_email,
      }))
    }
  }, [
    loading,
    organization?.logo_url,
    organization?.logo_storage_path,
    organization?.phone,
    organization?.website,
    organization?.contact_email,
  ])

  // Handle logo upload
  const handleLogoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !organization?.id) return

    // Validate file
    if (!file.type.startsWith('image/')) {
      addToast('error', 'Please select an image file')
      return
    }

    if (file.size > 2 * 1024 * 1024) {
      addToast('error', 'Image must be less than 2MB')
      return
    }

    setUploadingLogo(true)
    try {
      // Upload to vault bucket under _assets folder
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
      const filePath = `${organization.id}/_assets/logo.${ext}`

      log.debug('[CompanyProfile]', 'Uploading logo', { filePath })

      const { error: uploadError } = await supabase.storage
        .from('vault')
        .upload(filePath, file, { upsert: true })

      if (uploadError) throw uploadError

      // Get a signed URL (valid for 1 year - will refresh when loading profile)
      const { data: signedData, error: signedError } = await supabase.storage
        .from('vault')
        .createSignedUrl(filePath, 60 * 60 * 24 * 365) // 1 year

      if (signedError) throw signedError

      // Update organization with signed URL and storage path using RPC function
      // (Direct updates aren't allowed due to RLS policy)
      log.debug('[CompanyProfile]', 'Saving to DB via RPC', { logoStoragePath: filePath })
      const { error: updateError } = await supabase.rpc('org_update_branding', {
        p_org_id: organization.id,
        p_logo_url: signedData.signedUrl,
        p_logo_storage_path: filePath,
      })

      if (updateError) {
        log.error('[CompanyProfile]', 'DB update error', { error: updateError })
        throw updateError
      }

      log.info('[CompanyProfile]', 'Logo saved successfully')

      setProfile((prev) => ({
        ...prev,
        logo_url: signedData.signedUrl,
        logo_storage_path: filePath,
      }))

      addToast('success', 'Logo uploaded successfully')
    } catch (error) {
      log.error('[CompanyProfile]', 'Failed to upload logo', { error: error })
      addToast('error', 'Failed to upload logo')
    } finally {
      setUploadingLogo(false)
    }
  }

  // Remove logo
  const handleRemoveLogo = async () => {
    if (!organization?.id) return

    try {
      // Delete from storage if exists
      if (profile.logo_storage_path) {
        await supabase.storage.from('vault').remove([profile.logo_storage_path])
      }

      // Update organization using RPC function (direct updates not allowed due to RLS)
      // Pass empty strings to clear the values (COALESCE in function will handle nulls)
      const { error } = await supabase.rpc('org_update_branding', {
        p_org_id: organization.id,
        p_logo_url: '',
        p_logo_storage_path: '',
      })

      if (error) throw error

      setProfile((prev) => ({
        ...prev,
        logo_url: null,
        logo_storage_path: null,
      }))

      addToast('success', 'Logo removed')
    } catch (error) {
      log.error('[CompanyProfile]', 'Failed to remove logo', { error: error })
      addToast('error', 'Failed to remove logo')
    }
  }

  // Save contact info
  const handleSave = async () => {
    if (!organization?.id) return

    setSaving(true)
    savingRef.current = true
    try {
      // Use RPC function (direct updates not allowed due to RLS). The function keeps a column on
      // NULL and clears it on '', so an emptied field is sent as '' to clear it.
      const { error } = await supabase.rpc('org_update_branding', {
        p_org_id: organization.id,
        p_phone: profile.phone ?? '',
        p_website: profile.website ?? '',
        p_contact_email: profile.contact_email ?? '',
      })

      if (error) throw error
      addToast('success', 'Contact information saved')
    } catch (error) {
      log.error('[CompanyProfile]', 'Failed to save contact info', { error: error })
      addToast('error', 'Failed to save contact information')
    } finally {
      setSaving(false)
      // Small delay before allowing realtime sync again to let the update propagate
      setTimeout(() => {
        savingRef.current = false
      }, 1000)
    }
  }

  // Update a single field
  const updateField = (field: keyof CompanyProfile, value: string | null) => {
    setProfile((prev) => ({ ...prev, [field]: value }))
  }

  // Open address modal for new address
  const openNewAddressModal = (type: 'billing' | 'shipping') => {
    setEditingAddress(null)
    setAddressForm({
      ...emptyAddress,
      address_type: type,
      is_default:
        type === 'billing' ? billingAddresses.length === 0 : shippingAddresses.length === 0,
    })
    setShowAddressModal(true)
  }

  // Open address modal for editing
  const openEditAddressModal = (address: OrgAddress) => {
    setEditingAddress(address)
    setAddressForm({
      address_type: address.address_type,
      label: address.label,
      is_default: address.is_default,
      company_name: address.company_name,
      contact_name: address.contact_name,
      address_line1: address.address_line1,
      address_line2: address.address_line2,
      city: address.city,
      state: address.state,
      postal_code: address.postal_code,
      country: address.country,
      attention_to: address.attention_to,
      phone: address.phone,
    })
    setShowAddressModal(true)
  }

  // Save address
  const handleSaveAddress = async () => {
    if (!organization?.id) return
    if (
      !addressForm.label.trim() ||
      !addressForm.address_line1.trim() ||
      !addressForm.city.trim()
    ) {
      addToast('error', 'Please fill in required fields (Label, Address Line 1, City)')
      return
    }

    setSavingAddress(true)
    try {
      if (editingAddress) {
        // Update existing
        const { error } = await supabase
          .from('org_address')
          .update({
            label: addressForm.label.trim(),
            is_default: addressForm.is_default,
            company_name: addressForm.company_name?.trim() || null,
            contact_name: addressForm.contact_name?.trim() || null,
            address_line1: addressForm.address_line1.trim(),
            address_line2: addressForm.address_line2?.trim() || null,
            city: addressForm.city.trim(),
            state: addressForm.state?.trim() || null,
            postal_code: addressForm.postal_code?.trim() || null,
            country: addressForm.country || 'USA',
            attention_to: addressForm.attention_to?.trim() || null,
            phone: addressForm.phone?.trim() || null,
          })
          .eq('id', editingAddress.id)

        if (error) throw error

        // Update local state
        const updatedAddress = { ...editingAddress, ...addressForm }
        if (addressForm.address_type === 'billing') {
          setBillingAddresses((prev) =>
            prev.map((a) =>
              a.id === editingAddress.id
                ? updatedAddress
                : addressForm.is_default
                  ? { ...a, is_default: false }
                  : a,
            ),
          )
        } else {
          setShippingAddresses((prev) =>
            prev.map((a) =>
              a.id === editingAddress.id
                ? updatedAddress
                : addressForm.is_default
                  ? { ...a, is_default: false }
                  : a,
            ),
          )
        }

        addToast('success', 'Address updated')
      } else {
        // Create new
        const { data, error } = await supabase
          .from('org_address')
          .insert({
            org_id: organization.id,
            address_type: addressForm.address_type,
            label: addressForm.label.trim(),
            is_default: addressForm.is_default,
            company_name: addressForm.company_name?.trim() || null,
            contact_name: addressForm.contact_name?.trim() || null,
            address_line1: addressForm.address_line1.trim(),
            address_line2: addressForm.address_line2?.trim() || null,
            city: addressForm.city.trim(),
            state: addressForm.state?.trim() || null,
            postal_code: addressForm.postal_code?.trim() || null,
            country: addressForm.country || 'USA',
            attention_to: addressForm.attention_to?.trim() || null,
            phone: addressForm.phone?.trim() || null,
          })
          .select()
          .single()

        if (error) throw error

        // Update local state
        const newAddress = data as OrgAddress
        if (addressForm.address_type === 'billing') {
          setBillingAddresses((prev) =>
            addressForm.is_default
              ? [newAddress, ...prev.map((a) => ({ ...a, is_default: false }))]
              : [...prev, newAddress],
          )
        } else {
          setShippingAddresses((prev) =>
            addressForm.is_default
              ? [newAddress, ...prev.map((a) => ({ ...a, is_default: false }))]
              : [...prev, newAddress],
          )
        }

        addToast('success', 'Address added')
      }

      setShowAddressModal(false)
      setEditingAddress(null)
    } catch (error) {
      log.error('[CompanyProfile]', 'Failed to save address', { error: error })
      addToast('error', 'Failed to save address')
    } finally {
      setSavingAddress(false)
    }
  }

  // Delete address - show confirmation modal
  const handleDeleteAddress = (address: OrgAddress) => {
    setDeleteConfirmAddress(address)
  }

  // Confirm and execute address deletion
  const confirmDeleteAddress = async () => {
    if (!deleteConfirmAddress) return

    setDeletingAddressId(deleteConfirmAddress.id)
    try {
      const { error } = await supabase
        .from('org_address')
        .delete()
        .eq('id', deleteConfirmAddress.id)

      if (error) throw error

      if (deleteConfirmAddress.address_type === 'billing') {
        setBillingAddresses((prev) => prev.filter((a) => a.id !== deleteConfirmAddress.id))
      } else {
        setShippingAddresses((prev) => prev.filter((a) => a.id !== deleteConfirmAddress.id))
      }

      addToast('success', 'Address deleted')
    } catch (error) {
      log.error('[CompanyProfile]', 'Failed to delete address', { error: error })
      addToast('error', 'Failed to delete address')
    } finally {
      setDeletingAddressId(null)
      setDeleteConfirmAddress(null)
    }
  }

  // Copy from another address
  const handleCopyFromAddress = (sourceAddress: OrgAddress) => {
    setAddressForm((prev) => ({
      ...prev,
      // Company name is used for both billing and shipping
      company_name: sourceAddress.company_name,
      // Only copy contact_name for billing addresses
      contact_name: prev.address_type === 'billing' ? sourceAddress.contact_name : null,
      address_line1: sourceAddress.address_line1,
      address_line2: sourceAddress.address_line2,
      city: sourceAddress.city,
      state: sourceAddress.state,
      postal_code: sourceAddress.postal_code,
      country: sourceAddress.country,
      phone: sourceAddress.phone,
      // Only copy attention_to for shipping addresses
      attention_to: prev.address_type === 'shipping' ? sourceAddress.attention_to : null,
    }))
    addToast('success', `Copied from "${sourceAddress.label}"`)
  }

  // Get addresses of the opposite type for copying
  const getSourceAddressesForCopy = () => {
    return addressForm.address_type === 'billing' ? shippingAddresses : billingAddresses
  }

  // Set address as default
  const handleSetDefault = async (address: OrgAddress) => {
    try {
      const { error } = await supabase
        .from('org_address')
        .update({ is_default: true })
        .eq('id', address.id)

      if (error) throw error

      // Update local state - the trigger handles unsetting others
      if (address.address_type === 'billing') {
        setBillingAddresses((prev) =>
          prev.map((a) => ({
            ...a,
            is_default: a.id === address.id,
          })),
        )
      } else {
        setShippingAddresses((prev) =>
          prev.map((a) => ({
            ...a,
            is_default: a.id === address.id,
          })),
        )
      }

      addToast('success', `"${address.label}" set as default`)
    } catch (error) {
      log.error('[CompanyProfile]', 'Failed to set default', { error: error })
      addToast('error', 'Failed to set default address')
    }
  }

  return {
    organization,
    isAdmin,
    loading,
    saving,
    uploadingLogo,
    profile,
    billingAddresses,
    shippingAddresses,
    loadingAddresses,
    showAddressModal,
    setShowAddressModal,
    editingAddress,
    addressForm,
    setAddressForm,
    savingAddress,
    deletingAddressId,
    deleteConfirmAddress,
    setDeleteConfirmAddress,
    handleLogoUpload,
    handleRemoveLogo,
    handleSave,
    updateField,
    openNewAddressModal,
    openEditAddressModal,
    handleSaveAddress,
    handleDeleteAddress,
    confirmDeleteAddress,
    handleCopyFromAddress,
    getSourceAddressesForCopy,
    handleSetDefault,
  }
}

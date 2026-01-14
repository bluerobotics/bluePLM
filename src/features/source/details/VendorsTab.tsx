import { useState, useEffect, useCallback } from 'react'
import { usePDMStore, LocalFile } from '@/stores/pdmStore'
import type { PartSupplier } from '@/stores/types'
import { 
  getPartSuppliers, 
  addPartSupplier, 
  updatePartSupplier, 
  removePartSupplier,
  setPreferredPartSupplier 
} from '@/lib/supabase'
import { supabase } from '@/lib/supabase'
import { log } from '@/lib/logger'
import {
  Building2,
  Plus,
  Star,
  StarOff,
  Loader2,
  ExternalLink,
  Package,
  DollarSign,
  Clock,
  Edit2,
  Trash2,
  X,
  Check,
  Hash,
  FileText,
  Link2,
  AlertCircle,
  Search,
  ChevronDown,
  ChevronUp
} from 'lucide-react'

interface VendorsTabProps {
  file: LocalFile
}

export function VendorsTab({ file }: VendorsTabProps) {
  const { organization, user, addToast, suppliers, setSuppliers, addSupplier, suppliersLoaded, setSuppliersLoading } = usePDMStore()
  
  const [partSuppliers, setPartSuppliers] = useState<PartSupplier[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [showNewVendorForm, setShowNewVendorForm] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [newVendorName, setNewVendorName] = useState('')
  const [isCreatingVendor, setIsCreatingVendor] = useState(false)
  
  // Form state for add/edit
  const [formData, setFormData] = useState({
    supplier_id: '',
    supplier_part_number: '',
    supplier_description: '',
    supplier_url: '',
    currency: 'USD',
    min_order_qty: '1',
    lead_time_days: '',
    notes: '',
    price_breaks: [] as Array<{ qty: number; price: number }>
  })
  const [showVendorDropdown, setShowVendorDropdown] = useState(false)

  const fileId = file.pdmData?.id
  const isSynced = !!fileId

  // Load part suppliers for this file
  const loadPartSuppliers = useCallback(async () => {
    if (!fileId) return
    
    setIsLoading(true)
    try {
      const { data, error } = await getPartSuppliers(fileId)
      if (error) {
        log.error('[VendorsTab]', 'Failed to load vendors', { error })
      } else {
        setPartSuppliers(data || [])
      }
    } catch (err) {
      log.error('[VendorsTab]', 'Exception loading vendors', { error: err })
    } finally {
      setIsLoading(false)
    }
  }, [fileId])

  // Load org suppliers if not already loaded
  const loadOrgSuppliers = useCallback(async () => {
    if (!organization?.id || suppliersLoaded) return
    
    setSuppliersLoading(true)
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('org_id', organization.id)
        .eq('is_active', true)
        .order('name')
      
      if (!error && data) {
        setSuppliers(data)
      }
    } catch (err) {
      log.error('[VendorsTab]', 'Failed to load suppliers', { error: err })
    } finally {
      setSuppliersLoading(false)
    }
  }, [organization?.id, suppliersLoaded, setSuppliersLoading, setSuppliers])

  useEffect(() => {
    loadPartSuppliers()
    loadOrgSuppliers()
  }, [loadPartSuppliers, loadOrgSuppliers])

  // Reset form
  const resetForm = () => {
    setFormData({
      supplier_id: '',
      supplier_part_number: '',
      supplier_description: '',
      supplier_url: '',
      currency: 'USD',
      min_order_qty: '1',
      lead_time_days: '',
      notes: '',
      price_breaks: []
    })
    setShowAddForm(false)
    setShowNewVendorForm(false)
    setShowVendorDropdown(false)
    setNewVendorName('')
    setEditingId(null)
    setSearchQuery('')
  }

  // Create a new vendor in the database
  const handleCreateNewVendor = async () => {
    if (!organization?.id || !user?.id || !newVendorName.trim()) {
      addToast('error', 'Please enter a vendor name')
      return
    }

    setIsCreatingVendor(true)
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .insert({
          org_id: organization.id,
          name: newVendorName.trim(),
          is_active: true,
          is_approved: false,
          created_by: user.id
        })
        .select('*')
        .single()

      if (error) {
        addToast('error', `Failed to create vendor: ${error.message}`)
      } else if (data) {
        // Add to suppliers list
        addSupplier(data)
        // Select the new vendor
        setFormData(prev => ({ ...prev, supplier_id: data.id }))
        setSearchQuery(data.name)
        setShowNewVendorForm(false)
        setNewVendorName('')
        addToast('success', 'Vendor created')
      }
    } catch (err) {
      addToast('error', `Failed to create vendor: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsCreatingVendor(false)
    }
  }

  // Handle add vendor
  const handleAddVendor = async () => {
    if (!fileId || !organization?.id || !user?.id || !formData.supplier_id) {
      addToast('error', 'Please select a vendor')
      return
    }

    setIsAdding(true)
    try {
      // Get base price from qty=1 break (or lowest qty break)
      const sortedBreaks = [...formData.price_breaks].sort((a, b) => a.qty - b.qty)
      const basePrice = sortedBreaks.length > 0 ? sortedBreaks[0].price : null
      
      const { data, error } = await addPartSupplier(
        organization.id,
        fileId,
        formData.supplier_id,
        {
          supplier_part_number: formData.supplier_part_number || null,
          supplier_description: formData.supplier_description || null,
          supplier_url: formData.supplier_url || null,
          unit_price: basePrice,
          currency: formData.currency,
          min_order_qty: formData.min_order_qty ? parseInt(formData.min_order_qty) : 1,
          lead_time_days: formData.lead_time_days ? parseInt(formData.lead_time_days) : null,
          notes: formData.notes || null,
          price_breaks: formData.price_breaks.length > 0 ? formData.price_breaks : null,
          is_preferred: partSuppliers.length === 0 // First vendor is preferred
        },
        user.id
      )

      if (error) {
        addToast('error', `Failed to add vendor: ${error}`)
      } else if (data) {
        setPartSuppliers(prev => [...prev, data])
        addToast('success', 'Vendor added')
        resetForm()
      }
    } catch (err) {
      addToast('error', `Failed to add vendor: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsAdding(false)
    }
  }

  // Handle edit vendor
  const handleEditVendor = async () => {
    if (!editingId || !user?.id) return

    try {
      // Get base price from qty=1 break (or lowest qty break)
      const sortedBreaks = [...formData.price_breaks].sort((a, b) => a.qty - b.qty)
      const basePrice = sortedBreaks.length > 0 ? sortedBreaks[0].price : null
      
      const { success, error } = await updatePartSupplier(
        editingId,
        {
          supplier_part_number: formData.supplier_part_number || null,
          supplier_description: formData.supplier_description || null,
          supplier_url: formData.supplier_url || null,
          unit_price: basePrice,
          currency: formData.currency,
          min_order_qty: formData.min_order_qty ? parseInt(formData.min_order_qty) : 1,
          lead_time_days: formData.lead_time_days ? parseInt(formData.lead_time_days) : null,
          notes: formData.notes || null,
          price_breaks: formData.price_breaks.length > 0 ? formData.price_breaks : null
        },
        user.id
      )

      if (!success) {
        addToast('error', `Failed to update vendor: ${error}`)
      } else {
        // Reload to get updated data
        loadPartSuppliers()
        addToast('success', 'Vendor updated')
        resetForm()
      }
    } catch (err) {
      addToast('error', `Failed to update vendor: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Handle set preferred
  const handleSetPreferred = async (partSupplierId: string) => {
    if (!fileId || !user?.id) return

    try {
      const { success, error } = await setPreferredPartSupplier(fileId, partSupplierId, user.id)
      if (!success) {
        addToast('error', `Failed to set preferred: ${error}`)
      } else {
        // Update local state
        setPartSuppliers(prev => prev.map(ps => ({
          ...ps,
          is_preferred: ps.id === partSupplierId
        })))
        addToast('success', 'Preferred vendor updated')
      }
    } catch (err) {
      addToast('error', `Failed to set preferred: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Handle remove vendor
  const handleRemoveVendor = async (partSupplierId: string) => {
    if (!user?.id) return

    try {
      const { success, error } = await removePartSupplier(partSupplierId, user.id)
      if (!success) {
        addToast('error', `Failed to remove vendor: ${error}`)
      } else {
        setPartSuppliers(prev => prev.filter(ps => ps.id !== partSupplierId))
        addToast('success', 'Vendor removed')
      }
    } catch (err) {
      addToast('error', `Failed to remove vendor: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Start editing a vendor
  const startEdit = (ps: PartSupplier) => {
    setEditingId(ps.id)
    
    // Build price breaks - if we have unit_price but no price_breaks, create one
    let breaks = ps.price_breaks || []
    if (breaks.length === 0 && ps.unit_price !== null) {
      breaks = [{ qty: 1, price: ps.unit_price }]
    }
    
    setFormData({
      supplier_id: ps.supplier_id,
      supplier_part_number: ps.supplier_part_number || '',
      supplier_description: ps.supplier_description || '',
      supplier_url: ps.supplier_url || '',
      currency: ps.currency || 'USD',
      min_order_qty: ps.min_order_qty?.toString() || '1',
      lead_time_days: ps.lead_time_days?.toString() || '',
      notes: ps.notes || '',
      price_breaks: breaks
    })
    setShowAddForm(false)
  }

  // Filter available suppliers (not already added)
  const existingSupplierIds = new Set(partSuppliers.map(ps => ps.supplier_id))
  const availableSuppliers = suppliers.filter(s => 
    !existingSupplierIds.has(s.id) &&
    (searchQuery === '' || 
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.code?.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  // Format currency
  const formatPrice = (price: number | null, currency: string | null) => {
    if (price === null) return '—'
    const currencyCode = currency || 'USD'
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 4
    }).format(price)
  }

  // Not synced state
  if (!isSynced) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <AlertCircle size={48} className="text-plm-fg-muted opacity-50 mb-4" />
        <div className="text-lg font-medium mb-2">File Not Synced</div>
        <div className="text-sm text-plm-fg-muted max-w-xs">
          Sync this file to the cloud to manage vendors
        </div>
      </div>
    )
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="animate-spin text-plm-fg-muted" size={24} />
      </div>
    )
  }

  return (
    <div className="max-w-lg space-y-3">
      {/* Header with Add button */}
      <div className="flex items-center gap-3">
        {!showAddForm && !editingId && (
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium bg-plm-accent hover:bg-plm-accent/90 text-white rounded transition-colors"
          >
            <Plus size={10} />
            Add Vendor
          </button>
        )}
        <div className="text-[10px] text-plm-fg-muted">
          {partSuppliers.length === 0 
            ? 'No vendors assigned' 
            : `${partSuppliers.length} vendor${partSuppliers.length === 1 ? '' : 's'}`}
        </div>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className="p-3 bg-plm-bg-light border border-plm-border rounded-lg space-y-2.5 max-w-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Add Vendor</span>
            <button onClick={resetForm} className="text-plm-fg-muted hover:text-plm-fg">
              <X size={14} />
            </button>
          </div>

          {/* Vendor selector with search and dropdown */}
          <div className="space-y-1.5">
            <label className="text-[10px] text-plm-fg-muted">Select Vendor</label>
            
            {/* Selected vendor display */}
            {formData.supplier_id && !showNewVendorForm && (
              <div className="flex items-center gap-1.5 p-1.5 bg-plm-accent/10 border border-plm-accent/30 rounded">
                <Building2 size={12} className="text-plm-accent" />
                <span className="text-xs font-medium">
                  {suppliers.find(s => s.id === formData.supplier_id)?.name}
                </span>
                <button 
                  onClick={() => {
                    setFormData(prev => ({ ...prev, supplier_id: '' }))
                    setShowVendorDropdown(true)
                  }}
                  className="ml-auto text-plm-fg-muted hover:text-plm-fg"
                  title="Change vendor"
                >
                  <X size={10} />
                </button>
              </div>
            )}
            
            {/* Vendor selector */}
            {!formData.supplier_id && !showNewVendorForm && (
              <div className="relative">
                <div className="flex gap-1">
                  <div className="relative flex-1">
                    <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-plm-fg-muted" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => {
                        setSearchQuery(e.target.value)
                        setShowVendorDropdown(true)
                      }}
                      onFocus={() => setShowVendorDropdown(true)}
                      placeholder="Search or select vendor..."
                      className="w-full pl-7 pr-7 py-1 bg-plm-input border border-plm-border rounded text-xs focus:outline-none focus:border-plm-accent"
                    />
                    <button
                      type="button"
                      onClick={() => setShowVendorDropdown(!showVendorDropdown)}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-plm-fg-muted hover:text-plm-fg"
                    >
                      {showVendorDropdown ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      setShowNewVendorForm(true)
                      setShowVendorDropdown(false)
                    }}
                    className="px-1.5 py-1 bg-plm-highlight hover:bg-plm-highlight/80 border border-plm-border rounded text-plm-fg-muted hover:text-plm-fg transition-colors"
                    title="Create new vendor"
                  >
                    <Plus size={12} />
                  </button>
                </div>
                
                {/* Vendor dropdown list */}
                {showVendorDropdown && (
                  <div className="absolute z-10 w-full mt-1 max-h-40 overflow-y-auto bg-plm-bg border border-plm-border rounded shadow-lg">
                    {availableSuppliers.length === 0 ? (
                      <div className="p-2 text-[10px] text-plm-fg-muted text-center">
                        {searchQuery ? 'No vendors found' : 'No available vendors'}
                      </div>
                    ) : (
                      availableSuppliers.map(vendor => (
                        <button
                          key={vendor.id}
                          onClick={() => {
                            setFormData(prev => ({ ...prev, supplier_id: vendor.id }))
                            setSearchQuery('')
                            setShowVendorDropdown(false)
                          }}
                          className="w-full p-1.5 text-left hover:bg-plm-highlight flex items-center gap-1.5 border-b border-plm-border last:border-b-0"
                        >
                          <Building2 size={12} className="text-plm-fg-muted flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs truncate">{vendor.name}</div>
                            {vendor.code && (
                              <div className="text-[9px] text-plm-fg-muted font-mono">{vendor.code}</div>
                            )}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
            
            {/* New vendor inline form */}
            {showNewVendorForm && (
              <div className="p-2 bg-plm-bg border border-plm-accent rounded space-y-1.5">
                <div className="text-[10px] text-plm-fg-muted">New Vendor</div>
                <input
                  type="text"
                  value={newVendorName}
                  onChange={e => setNewVendorName(e.target.value)}
                  placeholder="Vendor name"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleCreateNewVendor()
                    if (e.key === 'Escape') { setShowNewVendorForm(false); setNewVendorName('') }
                  }}
                  className="w-full px-2 py-1 bg-plm-input border border-plm-border rounded text-xs focus:outline-none focus:border-plm-accent"
                />
                <div className="flex gap-1">
                  <button
                    onClick={handleCreateNewVendor}
                    disabled={isCreatingVendor || !newVendorName.trim()}
                    className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-plm-accent hover:bg-plm-accent/90 text-white rounded transition-colors disabled:opacity-50"
                  >
                    {isCreatingVendor ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                    Create
                  </button>
                  <button
                    onClick={() => { setShowNewVendorForm(false); setNewVendorName('') }}
                    className="px-2 py-0.5 text-[10px] text-plm-fg-muted hover:text-plm-fg"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          <VendorFormFields formData={formData} setFormData={setFormData} />

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleAddVendor}
              disabled={isAdding || !formData.supplier_id}
              className="flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium bg-plm-accent hover:bg-plm-accent/90 text-white rounded transition-colors disabled:opacity-50"
            >
              {isAdding ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              Add
            </button>
            <button
              onClick={resetForm}
              className="px-3 py-1.5 text-xs font-medium bg-plm-highlight hover:bg-plm-highlight/80 rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Vendor List */}
      <div className="space-y-2">
        {partSuppliers.map(ps => (
          <VendorCard
            key={ps.id}
            partSupplier={ps}
            isEditing={editingId === ps.id}
            formData={formData}
            setFormData={setFormData}
            onEdit={() => startEdit(ps)}
            onSave={handleEditVendor}
            onCancel={resetForm}
            onSetPreferred={() => handleSetPreferred(ps.id)}
            onRemove={() => handleRemoveVendor(ps.id)}
            formatPrice={formatPrice}
          />
        ))}
      </div>

      {/* Empty state - simple, no duplicate button */}
      {partSuppliers.length === 0 && !showAddForm && (
        <div className="py-4 text-center">
          <Building2 size={20} className="mx-auto text-plm-fg-muted opacity-40 mb-2" />
          <p className="text-xs text-plm-fg-muted">
            Click "Add Vendor" to assign vendors to this part
          </p>
        </div>
      )}
    </div>
  )
}

// Price break type
interface PriceBreak {
  qty: number
  price: number
}

// Price Breaks Editor component - always expanded
function PriceBreaksEditor({
  priceBreaks,
  currency,
  onChangeCurrency,
  onChange
}: {
  priceBreaks: PriceBreak[]
  currency: string
  onChangeCurrency: (currency: string) => void
  onChange: (breaks: PriceBreak[]) => void
}) {
  const [newQty, setNewQty] = useState(priceBreaks.length === 0 ? '1' : '')
  const [newPrice, setNewPrice] = useState('')

  const handleAddBreak = () => {
    const qty = parseInt(newQty)
    const price = parseFloat(newPrice)
    
    if (isNaN(qty) || qty <= 0 || isNaN(price) || price < 0) return
    
    // Check if quantity already exists
    if (priceBreaks.some(b => b.qty === qty)) {
      // Update existing
      onChange(priceBreaks.map(b => b.qty === qty ? { qty, price } : b))
    } else {
      // Add new and sort by quantity
      const updated = [...priceBreaks, { qty, price }].sort((a, b) => a.qty - b.qty)
      onChange(updated)
    }
    
    setNewQty('')
    setNewPrice('')
  }

  const handleRemoveBreak = (qty: number) => {
    onChange(priceBreaks.filter(b => b.qty !== qty))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddBreak()
    }
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 4
    }).format(price)
  }

  return (
    <div className="border border-plm-border rounded">
      {/* Header with currency selector */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-plm-border bg-plm-highlight/30">
        <div className="flex items-center gap-1.5">
          <DollarSign size={10} className="text-plm-fg-muted" />
          <span className="text-[10px] font-medium">Cost Breaks</span>
        </div>
        <select
          value={currency}
          onChange={e => onChangeCurrency(e.target.value)}
          className="px-1.5 py-0.5 bg-plm-input border border-plm-border rounded text-[10px] focus:outline-none focus:border-plm-accent"
        >
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
          <option value="GBP">GBP</option>
          <option value="CNY">CNY</option>
          <option value="JPY">JPY</option>
        </select>
      </div>

      <div className="px-2 py-2 space-y-2">
        {/* Existing price breaks */}
        {priceBreaks.length > 0 && (
          <div className="space-y-1">
            {priceBreaks.map((pb, idx) => (
              <div key={idx} className="flex items-center gap-2 py-1 px-1.5 bg-plm-bg rounded text-[10px]">
                <span className="text-plm-fg-muted">@</span>
                <span className="font-medium w-12">{pb.qty.toLocaleString()}+</span>
                <span className="text-plm-fg-muted">→</span>
                <span className="font-medium text-plm-success">{formatPrice(pb.price)}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveBreak(pb.qty)}
                  className="ml-auto p-0.5 text-plm-fg-muted hover:text-plm-error rounded transition-colors"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add new break - always visible */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-plm-fg-muted">@</span>
          <input
            type="number"
            min="1"
            value={newQty}
            onChange={e => setNewQty(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={priceBreaks.length === 0 ? "1" : "Qty"}
            className="w-14 px-1.5 py-1 bg-plm-input border border-plm-border rounded text-xs focus:outline-none focus:border-plm-accent"
          />
          <span className="text-[10px] text-plm-fg-muted">→</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={newPrice}
            onChange={e => setNewPrice(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Price"
            className="w-20 px-1.5 py-1 bg-plm-input border border-plm-border rounded text-xs focus:outline-none focus:border-plm-accent"
          />
          <button
            type="button"
            onClick={handleAddBreak}
            disabled={!newQty || !newPrice}
            className="p-1 bg-plm-accent hover:bg-plm-accent/90 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Plus size={12} />
          </button>
        </div>
        
        {priceBreaks.length === 0 && (
          <div className="text-[9px] text-plm-fg-muted">
            Add your first price break (e.g., @ 1+ → $10.00)
          </div>
        )}
        {priceBreaks.length > 0 && (
          <div className="text-[9px] text-plm-fg-muted">
            Add more quantity tiers for volume discounts
          </div>
        )}
      </div>
    </div>
  )
}

// Vendor form fields component
function VendorFormFields({ 
  formData, 
  setFormData 
}: { 
  formData: {
    supplier_part_number: string
    supplier_description: string
    supplier_url: string
    currency: string
    min_order_qty: string
    lead_time_days: string
    notes: string
    price_breaks: PriceBreak[]
  }
  setFormData: React.Dispatch<React.SetStateAction<typeof formData & { supplier_id: string }>>
}) {
  return (
    <div className="space-y-2">
      {/* Vendor P/N */}
      <div>
        <label className="text-[10px] text-plm-fg-muted flex items-center gap-1 mb-0.5">
          <Hash size={9} />
          Vendor P/N
        </label>
        <input
          type="text"
          value={formData.supplier_part_number}
          onChange={e => setFormData(prev => ({ ...prev, supplier_part_number: e.target.value }))}
          placeholder="e.g. ABC-123"
          className="w-full px-2 py-1 bg-plm-input border border-plm-border rounded text-xs focus:outline-none focus:border-plm-accent"
        />
      </div>

      {/* Cost Breaks Editor - always visible */}
      <PriceBreaksEditor
        priceBreaks={formData.price_breaks}
        currency={formData.currency}
        onChangeCurrency={(currency) => setFormData(prev => ({ ...prev, currency }))}
        onChange={(breaks) => setFormData(prev => ({ ...prev, price_breaks: breaks }))}
      />

      {/* MOQ + Lead Time */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-plm-fg-muted flex items-center gap-1 mb-0.5">
            <Package size={9} />
            Min Qty
          </label>
          <input
            type="number"
            min="1"
            value={formData.min_order_qty}
            onChange={e => setFormData(prev => ({ ...prev, min_order_qty: e.target.value }))}
            className="w-20 px-2 py-1 bg-plm-input border border-plm-border rounded text-xs focus:outline-none focus:border-plm-accent"
          />
        </div>
        <div>
          <label className="text-[10px] text-plm-fg-muted flex items-center gap-1 mb-0.5">
            <Clock size={9} />
            Lead Time
          </label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min="0"
              value={formData.lead_time_days}
              onChange={e => setFormData(prev => ({ ...prev, lead_time_days: e.target.value }))}
              placeholder="—"
              className="w-16 px-2 py-1 bg-plm-input border border-plm-border rounded text-xs focus:outline-none focus:border-plm-accent"
            />
            <span className="text-[10px] text-plm-fg-muted">days</span>
          </div>
        </div>
      </div>

      {/* Row 3: Description */}
      <div>
        <label className="text-[10px] text-plm-fg-muted flex items-center gap-1 mb-0.5">
          <FileText size={9} />
          Description
        </label>
        <input
          type="text"
          value={formData.supplier_description}
          onChange={e => setFormData(prev => ({ ...prev, supplier_description: e.target.value }))}
          placeholder="Description for this part"
          className="w-full px-2 py-1 bg-plm-input border border-plm-border rounded text-xs focus:outline-none focus:border-plm-accent"
        />
      </div>

      {/* Row 4: Part Link */}
      <div>
        <label className="text-[10px] text-plm-fg-muted flex items-center gap-1 mb-0.5">
          <Link2 size={9} />
          Part Link
        </label>
        <input
          type="url"
          value={formData.supplier_url}
          onChange={e => setFormData(prev => ({ ...prev, supplier_url: e.target.value }))}
          placeholder="https://..."
          className="w-full px-2 py-1 bg-plm-input border border-plm-border rounded text-xs focus:outline-none focus:border-plm-accent"
        />
      </div>

      {/* Row 5: Notes */}
      <div>
        <label className="text-[10px] text-plm-fg-muted mb-0.5 block">Notes</label>
        <textarea
          value={formData.notes}
          onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
          rows={2}
          placeholder="Internal notes..."
          className="w-full px-2 py-1 bg-plm-input border border-plm-border rounded text-xs focus:outline-none focus:border-plm-accent resize-none"
        />
      </div>
    </div>
  )
}

// Vendor card component
function VendorCard({
  partSupplier,
  isEditing,
  formData,
  setFormData,
  onEdit,
  onSave,
  onCancel,
  onSetPreferred,
  onRemove,
  formatPrice
}: {
  partSupplier: PartSupplier
  isEditing: boolean
  formData: {
    supplier_id: string
    supplier_part_number: string
    supplier_description: string
    supplier_url: string
    currency: string
    min_order_qty: string
    lead_time_days: string
    notes: string
    price_breaks: PriceBreak[]
  }
  setFormData: React.Dispatch<React.SetStateAction<typeof formData>>
  onEdit: () => void
  onSave: () => void
  onCancel: () => void
  onSetPreferred: () => void
  onRemove: () => void
  formatPrice: (price: number | null, currency: string | null) => string
}) {
  const supplier = partSupplier.supplier

  if (isEditing) {
    return (
      <div className="p-3 bg-plm-bg-light border border-plm-accent rounded-lg space-y-2.5 max-w-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Building2 size={14} className="text-plm-accent" />
            <span className="text-xs font-medium">{supplier?.name}</span>
          </div>
          <button onClick={onCancel} className="text-plm-fg-muted hover:text-plm-fg">
            <X size={14} />
          </button>
        </div>

        <VendorFormFields formData={formData} setFormData={setFormData} />

        <div className="flex gap-2 pt-1">
          <button
            onClick={onSave}
            className="flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium bg-plm-accent hover:bg-plm-accent/90 text-white rounded transition-colors"
          >
            <Check size={12} />
            Save
          </button>
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs font-medium bg-plm-highlight hover:bg-plm-highlight/80 rounded transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`p-2.5 border rounded-lg transition-colors max-w-sm ${
      partSupplier.is_preferred 
        ? 'bg-plm-accent/5 border-plm-accent' 
        : 'bg-plm-bg-light border-plm-border hover:border-plm-border-light'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-6 h-6 rounded bg-plm-highlight flex items-center justify-center flex-shrink-0">
            <Building2 size={12} className="text-plm-fg-muted" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <span className="text-xs font-medium truncate">{supplier?.name || 'Unknown'}</span>
              {partSupplier.is_preferred && (
                <Star size={10} className="text-amber-400 fill-amber-400 flex-shrink-0" />
              )}
            </div>
            {supplier?.code && (
              <div className="text-[9px] font-mono text-plm-fg-muted">{supplier.code}</div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={onSetPreferred}
            className={`p-1 rounded transition-colors ${
              partSupplier.is_preferred 
                ? 'text-amber-400 hover:text-amber-300' 
                : 'text-plm-fg-muted hover:text-amber-400'
            }`}
            title={partSupplier.is_preferred ? 'Preferred vendor' : 'Set as preferred'}
          >
            {partSupplier.is_preferred ? <Star size={12} className="fill-current" /> : <StarOff size={12} />}
          </button>
          <button
            onClick={onEdit}
            className="p-1 text-plm-fg-muted hover:text-plm-fg rounded transition-colors"
            title="Edit"
          >
            <Edit2 size={12} />
          </button>
          <button
            onClick={onRemove}
            className="p-1 text-plm-fg-muted hover:text-plm-error rounded transition-colors"
            title="Remove"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Details - inline style */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] ml-7">
        {partSupplier.supplier_part_number && (
          <div className="flex items-center gap-1">
            <span className="text-plm-fg-muted">Vendor P/N:</span>
            <span className="font-mono">{partSupplier.supplier_part_number}</span>
          </div>
        )}
        {partSupplier.lead_time_days && (
          <div className="flex items-center gap-1">
            <span className="text-plm-fg-muted">Lead:</span>
            <span>{partSupplier.lead_time_days}d</span>
          </div>
        )}
        {partSupplier.min_order_qty && partSupplier.min_order_qty > 1 && (
          <div className="flex items-center gap-1">
            <span className="text-plm-fg-muted">MOQ:</span>
            <span>{partSupplier.min_order_qty}</span>
          </div>
        )}
        {partSupplier.supplier_url && (
          <a
            href={partSupplier.supplier_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-0.5 text-plm-accent hover:underline"
            onClick={e => {
              e.preventDefault()
              window.electronAPI?.openFile(partSupplier.supplier_url!)
            }}
          >
            <Link2 size={8} />
            Link
            <ExternalLink size={6} />
          </a>
        )}
      </div>

      {/* Cost Breaks Display - unified pricing */}
      {(() => {
        // Use price_breaks if available, otherwise fallback to unit_price
        const breaks = partSupplier.price_breaks && partSupplier.price_breaks.length > 0 
          ? partSupplier.price_breaks 
          : partSupplier.unit_price !== null 
            ? [{ qty: 1, price: partSupplier.unit_price }]
            : []
        
        if (breaks.length === 0) return null
        
        return (
          <div className="mt-1.5 ml-7">
            <div className="flex flex-wrap gap-1.5">
              {breaks.map((pb, idx) => (
                <div 
                  key={idx} 
                  className={`px-1.5 py-0.5 rounded text-[9px] flex items-center gap-1 ${
                    idx === 0 ? 'bg-plm-accent/10 border border-plm-accent/30' : 'bg-plm-highlight'
                  }`}
                >
                  <span className="font-medium">{pb.qty.toLocaleString()}+</span>
                  <span className="text-plm-fg-muted">→</span>
                  <span className={`font-medium ${idx === 0 ? 'text-plm-accent' : 'text-plm-success'}`}>
                    {formatPrice(pb.price, partSupplier.currency)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Notes */}
      {partSupplier.notes && (
        <div className="mt-1.5 ml-7 text-[9px] text-plm-fg-muted italic truncate" title={partSupplier.notes}>
          {partSupplier.notes}
        </div>
      )}
    </div>
  )
}

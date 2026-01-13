// Part-Supplier queries for managing vendors per item
import { supabase } from './client'
import { log } from '../logger'
import type { PartSupplier } from '@/stores/types'

/**
 * Get all suppliers (vendors) for a specific file/item
 */
export async function getPartSuppliers(fileId: string): Promise<{ data: PartSupplier[] | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('part_suppliers')
      .select(`
        id,
        org_id,
        file_id,
        supplier_id,
        supplier:suppliers (
          id,
          name,
          code,
          contact_email,
          contact_phone,
          website,
          city,
          state,
          country,
          is_active,
          is_approved
        ),
        supplier_part_number,
        supplier_description,
        supplier_url,
        unit_price,
        currency,
        price_unit,
        price_breaks,
        min_order_qty,
        order_multiple,
        lead_time_days,
        is_preferred,
        is_active,
        is_qualified,
        qualified_at,
        notes,
        last_price_update,
        created_at,
        updated_at
      `)
      .eq('file_id', fileId)
      .eq('is_active', true)
      .order('is_preferred', { ascending: false })
      .order('unit_price', { ascending: true, nullsFirst: false })

    if (error) {
      log.error('[PartSuppliers]', 'Failed to get part suppliers', { error })
      return { data: null, error: error.message }
    }

    // Transform the data to match PartSupplier interface
    const partSuppliers: PartSupplier[] = (data || []).map(row => ({
      ...row,
      supplier: row.supplier as unknown as PartSupplier['supplier'],
      price_breaks: row.price_breaks as PartSupplier['price_breaks']
    }))

    return { data: partSuppliers, error: null }
  } catch (err) {
    log.error('[PartSuppliers]', 'Exception getting part suppliers', { error: err })
    return { data: null, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Add a new supplier/vendor to a file/item
 */
export async function addPartSupplier(
  orgId: string,
  fileId: string,
  supplierId: string,
  data: {
    supplier_part_number?: string | null
    supplier_description?: string | null
    supplier_url?: string | null
    unit_price?: number | null
    currency?: string
    price_unit?: string
    price_breaks?: Array<{ qty: number; price: number }> | null
    min_order_qty?: number | null
    order_multiple?: number | null
    lead_time_days?: number | null
    is_preferred?: boolean
    notes?: string | null
  },
  userId: string
): Promise<{ data: PartSupplier | null; error: string | null }> {
  try {
    const { data: result, error } = await supabase
      .from('part_suppliers')
      .insert({
        org_id: orgId,
        file_id: fileId,
        supplier_id: supplierId,
        supplier_part_number: data.supplier_part_number || null,
        supplier_description: data.supplier_description || null,
        supplier_url: data.supplier_url || null,
        unit_price: data.unit_price || null,
        currency: data.currency || 'USD',
        price_unit: data.price_unit || 'each',
        price_breaks: data.price_breaks || null,
        min_order_qty: data.min_order_qty || 1,
        order_multiple: data.order_multiple || 1,
        lead_time_days: data.lead_time_days || null,
        is_preferred: data.is_preferred || false,
        is_active: true,
        notes: data.notes || null,
        created_by: userId,
        updated_by: userId,
        last_price_update: new Date().toISOString()
      })
      .select(`
        id,
        org_id,
        file_id,
        supplier_id,
        supplier:suppliers (
          id,
          name,
          code,
          contact_email,
          contact_phone,
          website,
          city,
          state,
          country,
          is_active,
          is_approved
        ),
        supplier_part_number,
        supplier_description,
        supplier_url,
        unit_price,
        currency,
        price_unit,
        price_breaks,
        min_order_qty,
        order_multiple,
        lead_time_days,
        is_preferred,
        is_active,
        is_qualified,
        qualified_at,
        notes,
        last_price_update,
        created_at,
        updated_at
      `)
      .single()

    if (error) {
      log.error('[PartSuppliers]', 'Failed to add part supplier', { error })
      return { data: null, error: error.message }
    }

    const partSupplier: PartSupplier = {
      ...result,
      supplier: result.supplier as unknown as PartSupplier['supplier'],
      price_breaks: result.price_breaks as PartSupplier['price_breaks']
    }

    return { data: partSupplier, error: null }
  } catch (err) {
    log.error('[PartSuppliers]', 'Exception adding part supplier', { error: err })
    return { data: null, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Update an existing part-supplier association
 */
export async function updatePartSupplier(
  partSupplierId: string,
  data: {
    supplier_part_number?: string | null
    supplier_description?: string | null
    supplier_url?: string | null
    unit_price?: number | null
    currency?: string
    price_unit?: string
    price_breaks?: Array<{ qty: number; price: number }> | null
    min_order_qty?: number | null
    order_multiple?: number | null
    lead_time_days?: number | null
    is_preferred?: boolean
    notes?: string | null
  },
  userId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const updateData: Record<string, unknown> = {
      updated_by: userId,
      updated_at: new Date().toISOString()
    }

    // Only include fields that are explicitly provided
    if (data.supplier_part_number !== undefined) updateData.supplier_part_number = data.supplier_part_number
    if (data.supplier_description !== undefined) updateData.supplier_description = data.supplier_description
    if (data.supplier_url !== undefined) updateData.supplier_url = data.supplier_url
    if (data.unit_price !== undefined) {
      updateData.unit_price = data.unit_price
      updateData.last_price_update = new Date().toISOString()
    }
    if (data.currency !== undefined) updateData.currency = data.currency
    if (data.price_unit !== undefined) updateData.price_unit = data.price_unit
    if (data.price_breaks !== undefined) updateData.price_breaks = data.price_breaks
    if (data.min_order_qty !== undefined) updateData.min_order_qty = data.min_order_qty
    if (data.order_multiple !== undefined) updateData.order_multiple = data.order_multiple
    if (data.lead_time_days !== undefined) updateData.lead_time_days = data.lead_time_days
    if (data.is_preferred !== undefined) updateData.is_preferred = data.is_preferred
    if (data.notes !== undefined) updateData.notes = data.notes

    const { error } = await supabase
      .from('part_suppliers')
      .update(updateData)
      .eq('id', partSupplierId)

    if (error) {
      log.error('[PartSuppliers]', 'Failed to update part supplier', { error })
      return { success: false, error: error.message }
    }

    return { success: true, error: null }
  } catch (err) {
    log.error('[PartSuppliers]', 'Exception updating part supplier', { error: err })
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Set a part-supplier as the preferred vendor (clears others)
 */
export async function setPreferredPartSupplier(
  fileId: string,
  partSupplierId: string,
  userId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    // First, clear preferred status on all suppliers for this file
    const { error: clearError } = await supabase
      .from('part_suppliers')
      .update({ 
        is_preferred: false,
        updated_by: userId,
        updated_at: new Date().toISOString()
      })
      .eq('file_id', fileId)

    if (clearError) {
      log.error('[PartSuppliers]', 'Failed to clear preferred status', { error: clearError })
      return { success: false, error: clearError.message }
    }

    // Then set the new preferred supplier
    const { error: setError } = await supabase
      .from('part_suppliers')
      .update({ 
        is_preferred: true,
        updated_by: userId,
        updated_at: new Date().toISOString()
      })
      .eq('id', partSupplierId)

    if (setError) {
      log.error('[PartSuppliers]', 'Failed to set preferred supplier', { error: setError })
      return { success: false, error: setError.message }
    }

    return { success: true, error: null }
  } catch (err) {
    log.error('[PartSuppliers]', 'Exception setting preferred supplier', { error: err })
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Remove a supplier from a file/item (soft delete - sets is_active to false)
 */
export async function removePartSupplier(
  partSupplierId: string,
  userId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const { error } = await supabase
      .from('part_suppliers')
      .update({ 
        is_active: false,
        updated_by: userId,
        updated_at: new Date().toISOString()
      })
      .eq('id', partSupplierId)

    if (error) {
      log.error('[PartSuppliers]', 'Failed to remove part supplier', { error })
      return { success: false, error: error.message }
    }

    return { success: true, error: null }
  } catch (err) {
    log.error('[PartSuppliers]', 'Exception removing part supplier', { error: err })
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Permanently delete a part-supplier association
 */
export async function deletePartSupplier(
  partSupplierId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const { error } = await supabase
      .from('part_suppliers')
      .delete()
      .eq('id', partSupplierId)

    if (error) {
      log.error('[PartSuppliers]', 'Failed to delete part supplier', { error })
      return { success: false, error: error.message }
    }

    return { success: true, error: null }
  } catch (err) {
    log.error('[PartSuppliers]', 'Exception deleting part supplier', { error: err })
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

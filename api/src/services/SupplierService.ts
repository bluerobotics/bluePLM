/**
 * Supplier Service
 *
 * Handles supplier management and part-supplier linking with costing.
 * Note: This service uses Supabase directly until supplier repositories are added.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Result } from '../core/result';
import { ok, err } from '../core/result';
import { NotFoundError, ForbiddenError } from '../core/errors';
import type { AppError } from '../core/errors/AppError';
import type { Supplier, PriceBreak } from '../core/types/entities';

export interface SupplierQueryOptions {
  activeOnly?: boolean;
  approvedOnly?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface CreateSupplierInput {
  name: string;
  code?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  paymentTerms?: string;
  defaultLeadTimeDays?: number;
  minOrderValue?: number;
  currency?: string;
  shippingAccount?: string;
  isApproved?: boolean;
  notes?: string;
  erpId?: string;
}

export interface LinkSupplierInput {
  supplierId: string;
  supplierPartNumber?: string;
  supplierDescription?: string;
  supplierUrl?: string;
  unitPrice?: number;
  currency?: string;
  priceUnit?: string;
  priceBreaks?: PriceBreak[];
  minOrderQty?: number;
  orderMultiple?: number;
  leadTimeDays?: number;
  isPreferred?: boolean;
  notes?: string;
}

export interface CostingResult {
  part: {
    id: string;
    partNumber: string | null;
    fileName: string;
    description: string | null;
    revision: string;
    state: string;
  };
  quantity: number;
  preferredSupplier: SupplierPricing | null;
  lowestCost: SupplierPricing | null;
  allSuppliers: SupplierPricing[];
}

export interface SupplierPricing {
  supplierId: string;
  supplierName: string;
  supplierCode: string | null;
  supplierPartNumber: string | null;
  unitPrice: number | null;
  totalPrice: number | null;
  currency: string;
  leadTimeDays: number | null;
  isPreferred: boolean;
  priceBreaks: PriceBreak[];
}

export class SupplierService {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * List suppliers with optional filters
   */
  async list(
    orgId: string,
    options: SupplierQueryOptions = {}
  ): Promise<{ suppliers: Supplier[]; count: number }> {
    const { activeOnly, approvedOnly, search, limit = 100, offset = 0 } = options;

    let query = this.supabase
      .from('suppliers')
      .select('*')
      .eq('org_id', orgId)
      .order('name')
      .range(offset, offset + limit - 1);

    if (activeOnly) query = query.eq('is_active', true);
    if (approvedOnly) query = query.eq('is_approved', true);
    if (search) query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%`);

    const { data, error } = await query;
    if (error) throw error;

    return {
      suppliers: this.mapSuppliers(data || []),
      count: data?.length || 0,
    };
  }

  /**
   * Get a supplier by ID
   */
  async getById(id: string, orgId: string): Promise<Result<Supplier, AppError>> {
    const { data, error } = await this.supabase
      .from('suppliers')
      .select('*')
      .eq('id', id)
      .eq('org_id', orgId)
      .single();

    if (error) throw error;
    if (!data) return err(new NotFoundError('Supplier', id));

    return ok(this.mapSupplier(data));
  }

  /**
   * Create a new supplier
   */
  async create(
    orgId: string,
    userId: string,
    userRole: string,
    input: CreateSupplierInput
  ): Promise<Result<Supplier, AppError>> {
    if (userRole === 'viewer') {
      return err(new ForbiddenError('Viewers cannot create suppliers'));
    }

    const { data, error } = await this.supabase
      .from('suppliers')
      .insert({
        org_id: orgId,
        name: input.name,
        code: input.code,
        contact_name: input.contactName,
        contact_email: input.contactEmail,
        contact_phone: input.contactPhone,
        website: input.website,
        address_line1: input.addressLine1,
        address_line2: input.addressLine2,
        city: input.city,
        state: input.state,
        postal_code: input.postalCode,
        country: input.country || 'USA',
        payment_terms: input.paymentTerms,
        default_lead_time_days: input.defaultLeadTimeDays,
        min_order_value: input.minOrderValue,
        currency: input.currency || 'USD',
        shipping_account: input.shippingAccount,
        is_approved: input.isApproved ?? false,
        notes: input.notes,
        erp_id: input.erpId,
        created_by: userId,
        updated_by: userId,
      })
      .select()
      .single();

    if (error) throw error;
    return ok(this.mapSupplier(data));
  }

  /**
   * Update a supplier
   */
  async update(
    id: string,
    orgId: string,
    userId: string,
    userRole: string,
    input: Partial<CreateSupplierInput>
  ): Promise<Result<Supplier, AppError>> {
    if (userRole === 'viewer') {
      return err(new ForbiddenError('Viewers cannot update suppliers'));
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      updated_by: userId,
    };

    // Map camelCase to snake_case
    if (input.name !== undefined) updateData.name = input.name;
    if (input.code !== undefined) updateData.code = input.code;
    if (input.contactName !== undefined) updateData.contact_name = input.contactName;
    if (input.contactEmail !== undefined) updateData.contact_email = input.contactEmail;
    if (input.contactPhone !== undefined) updateData.contact_phone = input.contactPhone;
    if (input.website !== undefined) updateData.website = input.website;
    if (input.addressLine1 !== undefined) updateData.address_line1 = input.addressLine1;
    if (input.addressLine2 !== undefined) updateData.address_line2 = input.addressLine2;
    if (input.city !== undefined) updateData.city = input.city;
    if (input.state !== undefined) updateData.state = input.state;
    if (input.postalCode !== undefined) updateData.postal_code = input.postalCode;
    if (input.country !== undefined) updateData.country = input.country;
    if (input.paymentTerms !== undefined) updateData.payment_terms = input.paymentTerms;
    if (input.defaultLeadTimeDays !== undefined) updateData.default_lead_time_days = input.defaultLeadTimeDays;
    if (input.minOrderValue !== undefined) updateData.min_order_value = input.minOrderValue;
    if (input.currency !== undefined) updateData.currency = input.currency;
    if (input.shippingAccount !== undefined) updateData.shipping_account = input.shippingAccount;
    if (input.isApproved !== undefined) updateData.is_approved = input.isApproved;
    if (input.notes !== undefined) updateData.notes = input.notes;
    if (input.erpId !== undefined) updateData.erp_id = input.erpId;

    const { data, error } = await this.supabase
      .from('suppliers')
      .update(updateData)
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .single();

    if (error) throw error;
    if (!data) return err(new NotFoundError('Supplier', id));

    return ok(this.mapSupplier(data));
  }

  /**
   * Delete a supplier (admin only)
   */
  async delete(
    id: string,
    orgId: string,
    userRole: string
  ): Promise<Result<void, AppError>> {
    if (userRole !== 'admin') {
      return err(new ForbiddenError('Only admins can delete suppliers'));
    }

    const { error } = await this.supabase
      .from('suppliers')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId);

    if (error) throw error;
    return ok(undefined);
  }

  /**
   * Get suppliers linked to a part/file
   */
  async getForPart(
    fileId: string,
    orgId: string
  ): Promise<Result<{ fileId: string; partNumber: string | null; fileName: string; suppliers: unknown[] }, AppError>> {
    // Get file info
    const { data: file, error: fileError } = await this.supabase
      .from('files')
      .select('id, file_name, part_number')
      .eq('id', fileId)
      .eq('org_id', orgId)
      .single();

    if (fileError) throw fileError;
    if (!file) return err(new NotFoundError('File', fileId));

    // Get suppliers for this part
    const { data: partSuppliers, error } = await this.supabase
      .from('part_suppliers')
      .select(`
        id, supplier_part_number, supplier_description, supplier_url,
        unit_price, currency, price_unit, price_breaks,
        min_order_qty, order_multiple, lead_time_days,
        is_preferred, is_active, is_qualified, notes,
        supplier:suppliers(*)
      `)
      .eq('file_id', fileId)
      .eq('is_active', true)
      .order('is_preferred', { ascending: false });

    if (error) throw error;

    return ok({
      fileId: file.id,
      partNumber: file.part_number,
      fileName: file.file_name,
      suppliers: partSuppliers || [],
    });
  }

  /**
   * Link a supplier to a part
   */
  async linkToPart(
    fileId: string,
    orgId: string,
    userId: string,
    userRole: string,
    input: LinkSupplierInput
  ): Promise<Result<unknown, AppError>> {
    if (userRole === 'viewer') {
      return err(new ForbiddenError('Viewers cannot link suppliers'));
    }

    // Verify file exists
    const { data: file } = await this.supabase
      .from('files')
      .select('id')
      .eq('id', fileId)
      .eq('org_id', orgId)
      .single();

    if (!file) return err(new NotFoundError('File', fileId));

    // If marking as preferred, unmark others
    if (input.isPreferred) {
      await this.supabase
        .from('part_suppliers')
        .update({ is_preferred: false })
        .eq('file_id', fileId);
    }

    const { data, error } = await this.supabase
      .from('part_suppliers')
      .insert({
        org_id: orgId,
        file_id: fileId,
        supplier_id: input.supplierId,
        supplier_part_number: input.supplierPartNumber,
        supplier_description: input.supplierDescription,
        supplier_url: input.supplierUrl,
        unit_price: input.unitPrice,
        currency: input.currency || 'USD',
        price_unit: input.priceUnit || 'each',
        price_breaks: input.priceBreaks || [],
        min_order_qty: input.minOrderQty || 1,
        order_multiple: input.orderMultiple || 1,
        lead_time_days: input.leadTimeDays,
        is_preferred: input.isPreferred || false,
        notes: input.notes,
        created_by: userId,
        updated_by: userId,
      })
      .select(`*, supplier:suppliers(*)`)
      .single();

    if (error) throw error;
    return ok(data);
  }

  /**
   * Get complete costing info for a part
   */
  async getPartCosting(
    fileId: string,
    orgId: string,
    quantity: number = 1
  ): Promise<Result<CostingResult, AppError>> {
    // Get part info
    const { data: part, error: partError } = await this.supabase
      .from('files')
      .select('id, part_number, file_name, description, revision, state')
      .eq('id', fileId)
      .eq('org_id', orgId)
      .single();

    if (partError) throw partError;
    if (!part) return err(new NotFoundError('Part', fileId));

    // Get all suppliers with pricing
    const { data: partSuppliers, error } = await this.supabase
      .from('part_suppliers')
      .select(`
        supplier_id, supplier_part_number, unit_price, currency,
        price_breaks, lead_time_days, is_preferred,
        supplier:suppliers(id, name, code, default_lead_time_days)
      `)
      .eq('file_id', fileId)
      .eq('is_active', true);

    if (error) throw error;

    // Calculate prices at quantity
    const suppliersWithPricing: SupplierPricing[] = (partSuppliers || []).map((ps: any) => {
      let effectivePrice = ps.unit_price;

      // Check price breaks for volume pricing
      if (ps.price_breaks && Array.isArray(ps.price_breaks) && ps.price_breaks.length > 0) {
        const sortedBreaks = [...ps.price_breaks].sort(
          (a: PriceBreak, b: PriceBreak) => b.qty - a.qty
        );
        for (const pb of sortedBreaks) {
          if (quantity >= pb.qty) {
            effectivePrice = pb.price;
            break;
          }
        }
      }

      return {
        supplierId: ps.supplier_id,
        supplierName: ps.supplier?.name || '',
        supplierCode: ps.supplier?.code || null,
        supplierPartNumber: ps.supplier_part_number,
        unitPrice: effectivePrice,
        totalPrice: effectivePrice ? effectivePrice * quantity : null,
        currency: ps.currency,
        leadTimeDays: ps.lead_time_days || ps.supplier?.default_lead_time_days,
        isPreferred: ps.is_preferred,
        priceBreaks: ps.price_breaks || [],
      };
    });

    // Find preferred and lowest cost
    const preferred = suppliersWithPricing.find((s) => s.isPreferred) || null;
    const withPrices = suppliersWithPricing.filter((s) => s.unitPrice !== null);
    const lowest =
      withPrices.length > 0
        ? withPrices.reduce((min, s) =>
            s.unitPrice! < min.unitPrice! ? s : min
          )
        : null;

    return ok({
      part: {
        id: part.id,
        partNumber: part.part_number,
        fileName: part.file_name,
        description: part.description,
        revision: part.revision,
        state: part.state,
      },
      quantity,
      preferredSupplier: preferred,
      lowestCost: lowest,
      allSuppliers: suppliersWithPricing,
    });
  }

  /**
   * Map database row to Supplier entity
   */
  private mapSupplier(row: any): Supplier {
    return {
      id: row.id,
      orgId: row.org_id,
      name: row.name,
      code: row.code,
      contactName: row.contact_name,
      contactEmail: row.contact_email,
      contactPhone: row.contact_phone,
      website: row.website,
      addressLine1: row.address_line1,
      addressLine2: row.address_line2,
      city: row.city,
      state: row.state,
      postalCode: row.postal_code,
      country: row.country,
      paymentTerms: row.payment_terms,
      defaultLeadTimeDays: row.default_lead_time_days,
      minOrderValue: row.min_order_value,
      currency: row.currency,
      shippingAccount: row.shipping_account,
      isActive: row.is_active,
      isApproved: row.is_approved,
      notes: row.notes,
      erpId: row.erp_id,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * Map multiple database rows to Supplier entities
   */
  private mapSuppliers(rows: any[]): Supplier[] {
    return rows.map((row) => this.mapSupplier(row));
  }
}

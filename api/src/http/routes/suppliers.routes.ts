/**
 * Supplier Routes
 *
 * Supplier management and part-supplier linking with costing.
 */

import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { UuidParams } from '../schemas';
import { NotFoundError, ForbiddenError } from '../../core/errors';

// Price break schema
const PriceBreakSchema = Type.Object({
  qty: Type.Integer(),
  price: Type.Number(),
});

// Supplier schema
const SupplierSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  code: Type.Union([Type.String(), Type.Null()]),
  contact_name: Type.Union([Type.String(), Type.Null()]),
  contact_email: Type.Union([Type.String(), Type.Null()]),
  contact_phone: Type.Union([Type.String(), Type.Null()]),
  website: Type.Union([Type.String(), Type.Null()]),
  is_active: Type.Boolean(),
  is_approved: Type.Boolean(),
});

const supplierRoutes: FastifyPluginAsync = async (fastify) => {
  // List all suppliers
  fastify.get(
    '/suppliers',
    {
      schema: {
        description: 'List all suppliers in the organization',
        tags: ['Suppliers'],
        security: [{ bearerAuth: [] }],
        querystring: Type.Object({
          active_only: Type.Optional(Type.Boolean()),
          approved_only: Type.Optional(Type.Boolean()),
          search: Type.Optional(Type.String()),
          limit: Type.Optional(Type.Integer({ default: 100 })),
          offset: Type.Optional(Type.Integer({ default: 0 })),
        }),
        response: {
          200: Type.Object({
            suppliers: Type.Array(SupplierSchema),
            count: Type.Integer(),
          }),
        },
      },
      preHandler: fastify.authenticate,
    },
    async (request) => {
      const { active_only, approved_only, search, limit = 100, offset = 0 } = request.query as {
        active_only?: boolean;
        approved_only?: boolean;
        search?: string;
        limit?: number;
        offset?: number;
      };

      const { suppliers, count } = await request.container!.supplierService.list(
        request.user!.org_id!,
        { activeOnly: active_only, approvedOnly: approved_only, search, limit, offset }
      );

      return { suppliers, count };
    }
  );

  // Get supplier by ID
  fastify.get<{ Params: { id: string } }>(
    '/suppliers/:id',
    {
      schema: {
        description: 'Get supplier by ID',
        tags: ['Suppliers'],
        security: [{ bearerAuth: [] }],
        params: UuidParams,
      },
      preHandler: fastify.authenticate,
    },
    async (request) => {
      const { id } = request.params;
      const result = await request.container!.supplierService.getById(id, request.user!.org_id!);
      if (!result.ok) throw result.error;
      return { supplier: result.value };
    }
  );

  // Create a new supplier
  fastify.post(
    '/suppliers',
    {
      schema: {
        description: 'Create a new supplier',
        tags: ['Suppliers'],
        security: [{ bearerAuth: [] }],
        body: Type.Object({
          name: Type.String(),
          code: Type.Optional(Type.String()),
          contact_name: Type.Optional(Type.String()),
          contact_email: Type.Optional(Type.String()),
          contact_phone: Type.Optional(Type.String()),
          website: Type.Optional(Type.String()),
          address_line1: Type.Optional(Type.String()),
          address_line2: Type.Optional(Type.String()),
          city: Type.Optional(Type.String()),
          state: Type.Optional(Type.String()),
          postal_code: Type.Optional(Type.String()),
          country: Type.Optional(Type.String()),
          payment_terms: Type.Optional(Type.String()),
          default_lead_time_days: Type.Optional(Type.Integer()),
          min_order_value: Type.Optional(Type.Number()),
          currency: Type.Optional(Type.String()),
          is_approved: Type.Optional(Type.Boolean()),
          notes: Type.Optional(Type.String()),
          erp_id: Type.Optional(Type.String()),
        }),
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            supplier: SupplierSchema,
          }),
        },
      },
      preHandler: fastify.authenticate,
    },
    async (request) => {
      const body = request.body as {
        name: string;
        code?: string;
        contact_name?: string;
        contact_email?: string;
        contact_phone?: string;
        website?: string;
        address_line1?: string;
        address_line2?: string;
        city?: string;
        state?: string;
        postal_code?: string;
        country?: string;
        payment_terms?: string;
        default_lead_time_days?: number;
        min_order_value?: number;
        currency?: string;
        is_approved?: boolean;
        notes?: string;
        erp_id?: string;
      };

      const result = await request.container!.supplierService.create(
        request.user!.org_id!,
        request.user!.id,
        request.user!.role,
        {
          name: body.name,
          code: body.code,
          contactName: body.contact_name,
          contactEmail: body.contact_email,
          contactPhone: body.contact_phone,
          website: body.website,
          addressLine1: body.address_line1,
          addressLine2: body.address_line2,
          city: body.city,
          state: body.state,
          postalCode: body.postal_code,
          country: body.country,
          paymentTerms: body.payment_terms,
          defaultLeadTimeDays: body.default_lead_time_days,
          minOrderValue: body.min_order_value,
          currency: body.currency,
          isApproved: body.is_approved,
          notes: body.notes,
          erpId: body.erp_id,
        }
      );

      if (!result.ok) throw result.error;
      return { success: true, supplier: result.value };
    }
  );

  // Update a supplier
  fastify.patch<{ Params: { id: string } }>(
    '/suppliers/:id',
    {
      schema: {
        description: 'Update a supplier',
        tags: ['Suppliers'],
        security: [{ bearerAuth: [] }],
        params: UuidParams,
        body: Type.Object({
          name: Type.Optional(Type.String()),
          code: Type.Optional(Type.String()),
          contact_name: Type.Optional(Type.String()),
          contact_email: Type.Optional(Type.String()),
          contact_phone: Type.Optional(Type.String()),
          website: Type.Optional(Type.String()),
          is_active: Type.Optional(Type.Boolean()),
          is_approved: Type.Optional(Type.Boolean()),
          notes: Type.Optional(Type.String()),
        }),
      },
      preHandler: fastify.authenticate,
    },
    async (request) => {
      const { id } = request.params;
      const body = request.body as {
        name?: string;
        code?: string;
        contact_name?: string;
        contact_email?: string;
        contact_phone?: string;
        website?: string;
        is_active?: boolean;
        is_approved?: boolean;
        notes?: string;
      };

      const result = await request.container!.supplierService.update(
        id,
        request.user!.org_id!,
        request.user!.id,
        request.user!.role,
        {
          name: body.name,
          code: body.code,
          contactName: body.contact_name,
          contactEmail: body.contact_email,
          contactPhone: body.contact_phone,
          website: body.website,
          isApproved: body.is_approved,
          notes: body.notes,
        }
      );

      if (!result.ok) throw result.error;
      return { success: true, supplier: result.value };
    }
  );

  // Delete a supplier (admin only)
  fastify.delete<{ Params: { id: string } }>(
    '/suppliers/:id',
    {
      schema: {
        description: 'Delete a supplier (admin only)',
        tags: ['Suppliers'],
        security: [{ bearerAuth: [] }],
        params: UuidParams,
      },
      preHandler: fastify.authenticate,
    },
    async (request) => {
      const { id } = request.params;
      const result = await request.container!.supplierService.delete(
        id,
        request.user!.org_id!,
        request.user!.role
      );
      if (!result.ok) throw result.error;
      return { success: true };
    }
  );

  // Get all suppliers and pricing for a part
  fastify.get<{ Params: { id: string } }>(
    '/files/:id/suppliers',
    {
      schema: {
        description: 'Get all suppliers and pricing for a part',
        tags: ['Suppliers'],
        security: [{ bearerAuth: [] }],
        params: UuidParams,
      },
      preHandler: fastify.authenticate,
    },
    async (request) => {
      const { id } = request.params;
      const result = await request.container!.supplierService.getForPart(id, request.user!.org_id!);
      if (!result.ok) throw result.error;

      return {
        file_id: result.value.fileId,
        part_number: result.value.partNumber,
        file_name: result.value.fileName,
        suppliers: result.value.suppliers,
      };
    }
  );

  // Link a supplier to a part with pricing info
  fastify.post<{ Params: { id: string } }>(
    '/files/:id/suppliers',
    {
      schema: {
        description: 'Link a supplier to a part with pricing info',
        tags: ['Suppliers'],
        security: [{ bearerAuth: [] }],
        params: UuidParams,
        body: Type.Object({
          supplier_id: Type.String({ format: 'uuid' }),
          supplier_part_number: Type.Optional(Type.String()),
          supplier_description: Type.Optional(Type.String()),
          supplier_url: Type.Optional(Type.String()),
          unit_price: Type.Optional(Type.Number()),
          currency: Type.Optional(Type.String()),
          price_unit: Type.Optional(Type.String()),
          price_breaks: Type.Optional(Type.Array(PriceBreakSchema)),
          min_order_qty: Type.Optional(Type.Integer()),
          order_multiple: Type.Optional(Type.Integer()),
          lead_time_days: Type.Optional(Type.Integer()),
          is_preferred: Type.Optional(Type.Boolean()),
          notes: Type.Optional(Type.String()),
        }),
      },
      preHandler: fastify.authenticate,
    },
    async (request) => {
      const { id } = request.params;
      const body = request.body as {
        supplier_id: string;
        supplier_part_number?: string;
        supplier_description?: string;
        supplier_url?: string;
        unit_price?: number;
        currency?: string;
        price_unit?: string;
        price_breaks?: Array<{ qty: number; price: number }>;
        min_order_qty?: number;
        order_multiple?: number;
        lead_time_days?: number;
        is_preferred?: boolean;
        notes?: string;
      };

      const result = await request.container!.supplierService.linkToPart(
        id,
        request.user!.org_id!,
        request.user!.id,
        request.user!.role,
        {
          supplierId: body.supplier_id,
          supplierPartNumber: body.supplier_part_number,
          supplierDescription: body.supplier_description,
          supplierUrl: body.supplier_url,
          unitPrice: body.unit_price,
          currency: body.currency,
          priceUnit: body.price_unit,
          priceBreaks: body.price_breaks,
          minOrderQty: body.min_order_qty,
          orderMultiple: body.order_multiple,
          leadTimeDays: body.lead_time_days,
          isPreferred: body.is_preferred,
          notes: body.notes,
        }
      );

      if (!result.ok) throw result.error;
      return { success: true, part_supplier: result.value };
    }
  );

  // Update supplier pricing/info for a part
  fastify.patch<{ Params: { id: string; supplierId: string } }>(
    '/files/:id/suppliers/:supplierId',
    {
      schema: {
        description: 'Update supplier pricing/info for a part',
        tags: ['Suppliers'],
        security: [{ bearerAuth: [] }],
        params: Type.Object({
          id: Type.String({ format: 'uuid' }),
          supplierId: Type.String({ format: 'uuid' }),
        }),
        body: Type.Object({
          supplier_part_number: Type.Optional(Type.String()),
          unit_price: Type.Optional(Type.Number()),
          is_preferred: Type.Optional(Type.Boolean()),
          is_active: Type.Optional(Type.Boolean()),
          lead_time_days: Type.Optional(Type.Integer()),
          notes: Type.Optional(Type.String()),
        }),
      },
      preHandler: fastify.authenticate,
    },
    async (request) => {
      const { id, supplierId } = request.params;

      if (request.user!.role === 'viewer') {
        throw new ForbiddenError('Viewers cannot update supplier info');
      }

      const body = request.body as Record<string, unknown>;

      // If marking as preferred, unmark others
      if (body.is_preferred) {
        await request.supabase!
          .from('part_suppliers')
          .update({ is_preferred: false })
          .eq('file_id', id)
          .neq('supplier_id', supplierId);
      }

      const { data, error } = await request.supabase!
        .from('part_suppliers')
        .update({
          ...body,
          updated_at: new Date().toISOString(),
          updated_by: request.user!.id,
          last_price_update:
            body.unit_price !== undefined ? new Date().toISOString() : undefined,
        })
        .eq('file_id', id)
        .eq('supplier_id', supplierId)
        .eq('org_id', request.user!.org_id)
        .select(
          `
        *,
        supplier:suppliers(*)
      `
        )
        .single();

      if (error) throw error;
      if (!data) throw new NotFoundError('Part-supplier link');

      return { success: true, part_supplier: data };
    }
  );

  // Remove supplier from a part
  fastify.delete<{ Params: { id: string; supplierId: string } }>(
    '/files/:id/suppliers/:supplierId',
    {
      schema: {
        description: 'Remove supplier from a part',
        tags: ['Suppliers'],
        security: [{ bearerAuth: [] }],
        params: Type.Object({
          id: Type.String({ format: 'uuid' }),
          supplierId: Type.String({ format: 'uuid' }),
        }),
      },
      preHandler: fastify.authenticate,
    },
    async (request) => {
      const { id, supplierId } = request.params;

      if (request.user!.role === 'viewer') {
        throw new ForbiddenError('Viewers cannot remove suppliers');
      }

      const { error } = await request.supabase!
        .from('part_suppliers')
        .delete()
        .eq('file_id', id)
        .eq('supplier_id', supplierId)
        .eq('org_id', request.user!.org_id);

      if (error) throw error;
      return { success: true };
    }
  );

  // Get complete costing info for a part
  fastify.get<{ Params: { id: string } }>(
    '/parts/:id/costing',
    {
      schema: {
        description: 'Get complete costing info for a part',
        tags: ['ERP', 'Suppliers'],
        security: [{ bearerAuth: [] }],
        params: UuidParams,
        querystring: Type.Object({
          quantity: Type.Optional(Type.Integer({ default: 1 })),
        }),
      },
      preHandler: fastify.authenticate,
    },
    async (request) => {
      const { id } = request.params;
      const { quantity = 1 } = request.query as { quantity?: number };

      const result = await request.container!.supplierService.getPartCosting(
        id,
        request.user!.org_id!,
        quantity
      );

      if (!result.ok) throw result.error;

      // Map to snake_case response format for backwards compatibility
      const { part, preferredSupplier, lowestCost, allSuppliers } = result.value;

      const mapSupplier = (s: typeof preferredSupplier) =>
        s
          ? {
              supplier_id: s.supplierId,
              supplier_name: s.supplierName,
              supplier_code: s.supplierCode,
              supplier_part_number: s.supplierPartNumber,
              unit_price: s.unitPrice,
              total_price: s.totalPrice,
              currency: s.currency,
              lead_time_days: s.leadTimeDays,
              is_preferred: s.isPreferred,
              price_breaks: s.priceBreaks,
            }
          : null;

      return {
        part: {
          id: part.id,
          part_number: part.partNumber,
          file_name: part.fileName,
          description: part.description,
          revision: part.revision,
          state: part.state,
        },
        quantity,
        preferred_supplier: mapSupplier(preferredSupplier),
        lowest_cost: mapSupplier(lowestCost),
        all_suppliers: allSuppliers.map(mapSupplier),
      };
    }
  );

  // List all parts available from a specific supplier
  fastify.get<{ Params: { id: string } }>(
    '/suppliers/:id/parts',
    {
      schema: {
        description: 'List all parts available from a specific supplier',
        tags: ['Suppliers', 'ERP'],
        security: [{ bearerAuth: [] }],
        params: UuidParams,
        querystring: Type.Object({
          limit: Type.Optional(Type.Integer({ default: 100 })),
          offset: Type.Optional(Type.Integer({ default: 0 })),
        }),
      },
      preHandler: fastify.authenticate,
    },
    async (request) => {
      const { id } = request.params;
      const { limit = 100, offset = 0 } = request.query as { limit?: number; offset?: number };

      // Verify supplier exists
      const { data: supplier, error: supplierError } = await request.supabase!
        .from('suppliers')
        .select('id, name, code')
        .eq('id', id)
        .eq('org_id', request.user!.org_id)
        .single();

      if (supplierError) throw supplierError;
      if (!supplier) throw new NotFoundError('Supplier', id);

      // Get parts from this supplier
      const { data, error } = await request.supabase!
        .from('part_suppliers')
        .select(
          `
        supplier_part_number, unit_price, currency, lead_time_days, is_preferred,
        file:files(id, part_number, file_name, description, revision, state, file_type)
      `
        )
        .eq('supplier_id', id)
        .eq('is_active', true)
        .range(offset, offset + limit - 1);

      if (error) throw error;

      return {
        supplier,
        parts: data,
        count: data?.length || 0,
      };
    }
  );
};

export default supplierRoutes;

# Agent C: Supporting Route Integration

## Overview

Integrate the supporting routes (vaults, trash, activity, suppliers, integrations) with their respective services.

**Depends on**: Agent A (container plugin must be registered)
**Directory**: `api/src/http/routes/`

---

## Tasks

### 1. Vaults Routes Integration

**File**: `api/src/http/routes/vaults.routes.ts`

**GET /vaults** (lines ~12-37)
```typescript
const result = await request.container.vaultService.list();
if (!result.ok) throw result.error;
return { vaults: result.value };
```

**GET /vaults/:id** (lines ~40-66)
```typescript
const result = await request.container.vaultService.getById(id);
if (!result.ok) throw result.error;
return { vault: result.value };
```

**GET /vaults/:id/status** (lines ~69-112)

If VaultService.getStatus was added by Agent A:
```typescript
const result = await request.container.vaultService.getStatus(
  id,
  request.user!.id,
  request.supabase!
);
if (!result.ok) throw result.error;
return { status: result.value };
```

If not, keep as-is (direct Supabase query is acceptable for aggregation).

---

### 2. Trash Routes Integration

**File**: `api/src/http/routes/trash.routes.ts`

**GET /trash** - Keep as-is (query with join for deleted_by_user)

**POST /trash/:id/restore** (lines ~51-76)
```typescript
const result = await request.container.fileService.restore(id);
if (!result.ok) throw result.error;
return { success: true, file: result.value };
```

---

### 3. Activity Routes Integration

**File**: `api/src/http/routes/activity.routes.ts`

**GET /activity** (lines ~12-48)
```typescript
const activity = await request.container.activityService.getRecent(
  request.user!.org_id!,
  { fileId: file_id, limit }
);
return { activity };
```

Note: ActivityService.getRecent returns the mapped data directly, not a Result type.

**GET /checkouts** - Keep as-is (simple query with join)

---

### 4. Suppliers Routes Integration

**File**: `api/src/http/routes/suppliers.routes.ts`

Review the file and integrate with `SupplierService` for:
- `GET /suppliers` → `supplierService.list()`
- `GET /suppliers/:id` → `supplierService.getById()`
- `POST /suppliers` → `supplierService.create()`
- `PATCH /suppliers/:id` → `supplierService.update()`
- `DELETE /suppliers/:id` → `supplierService.delete()`
- `GET /parts/:id/suppliers` → `supplierService.getForPart()`
- `POST /parts/:id/suppliers` → `supplierService.linkToPart()`
- `GET /parts/:id/costing` → `supplierService.getPartCosting()`

Pattern:
```typescript
const result = await request.container.supplierService.methodName(...);
if (!result.ok) throw result.error;
return { ... };
```

For methods returning plain data (not Result), just use directly.

---

### 5. Odoo Routes Integration

**File**: `api/src/http/routes/integrations/odoo.routes.ts`

Integrate with `OdooService` from `api/src/services/integrations/OdooService.ts`:

- `GET /integrations/odoo/settings` → `odooService.getSettings()`
- `POST /integrations/odoo/configure` → `odooService.configure()`
- `POST /integrations/odoo/test` → `odooService.testConnection()`
- `POST /integrations/odoo/sync` → `odooService.syncSuppliers()`
- `POST /integrations/odoo/disconnect` → `odooService.disconnect()`
- `GET /integrations/odoo/configs` → `odooService.listConfigs()`
- `POST /integrations/odoo/configs/:id/activate` → `odooService.activateConfig()`

Note: OdooService takes Supabase in constructor. Create instance:
```typescript
const odooService = new OdooService(request.supabase!);
```

Or add to container if frequently used.

---

### 6. WooCommerce Routes Integration

**File**: `api/src/http/routes/integrations/woocommerce.routes.ts`

Integrate with `WooCommerceService` from `api/src/services/integrations/WooCommerceService.ts`:

- `GET /integrations/woocommerce/settings` → `wooCommerceService.getSettings()`
- `POST /integrations/woocommerce/configure` → `wooCommerceService.configure()`
- `POST /integrations/woocommerce/test` → `wooCommerceService.testConnection()`
- `POST /integrations/woocommerce/sync` → `wooCommerceService.syncProducts()`
- `POST /integrations/woocommerce/disconnect` → `wooCommerceService.disconnect()`
- `GET /integrations/woocommerce/configs` → `wooCommerceService.listConfigs()`
- `POST /integrations/woocommerce/configs/:id/activate` → `wooCommerceService.activateConfig()`

Same pattern as Odoo:
```typescript
const wooCommerceService = new WooCommerceService(request.supabase!);
```

---

## Verification

```bash
cd api; npx tsc --noEmit
```

Test endpoints:
- List vaults → should return vault array
- Restore from trash → should work and trigger webhook
- Get activity → should return formatted activity entries
- Get suppliers → should return supplier list

---

## Notes

- Integration services (Odoo, WooCommerce) may need to be instantiated per-request since they take Supabase client
- Consider adding them to container if they're used frequently
- Keep response shapes backwards compatible
- Some endpoints may stay as direct Supabase if they're simple queries with joins

export type FileState = 'not_tracked' | 'wip' | 'in_review' | 'released' | 'obsolete';
export type FileType = 'part' | 'assembly' | 'drawing' | 'document' | 'other';
export type UserRole = 'admin' | 'engineer' | 'viewer';

export interface User {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  orgId: string | null;
}

export interface File {
  id: string;
  orgId: string;
  vaultId: string;
  filePath: string;
  fileName: string;
  extension: string;
  fileType: FileType;
  partNumber: string | null;
  description: string | null;
  revision: string;
  version: number;
  contentHash: string;
  fileSize: number;
  state: FileState;
  checkedOutBy: string | null;
  checkedOutAt: Date | null;
  lockMessage: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}

export interface Vault {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  createdAt: Date;
}

export interface Webhook {
  id: string;
  orgId: string;
  url: string;
  secret: string;
  events: WebhookEvent[];
  active: boolean;
  createdAt: Date;
  createdBy: string;
}

export type WebhookEvent = 
  | 'file.checkout' | 'file.checkin' | 'file.sync' 
  | 'file.delete' | 'file.restore' | 'file.state_change' | 'file.version';

export interface Supplier {
  id: string;
  orgId: string;
  name: string;
  code: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  website: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string;
  paymentTerms: string | null;
  defaultLeadTimeDays: number | null;
  minOrderValue: number | null;
  currency: string;
  shippingAccount: string | null;
  isActive: boolean;
  isApproved: boolean;
  notes: string | null;
  erpId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PriceBreak {
  qty: number;
  price: number;
}

export interface PartSupplier {
  id: string;
  orgId: string;
  fileId: string;
  supplierId: string;
  supplierPartNumber: string | null;
  supplierDescription: string | null;
  supplierUrl: string | null;
  unitPrice: number | null;
  currency: string;
  priceUnit: string;
  priceBreaks: PriceBreak[];
  minOrderQty: number;
  orderMultiple: number;
  leadTimeDays: number | null;
  isPreferred: boolean;
  isActive: boolean;
  isQualified: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

import type { File, Vault, Webhook } from './entities';

export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  hasMore: boolean;
}

export interface FileQueryOptions extends PaginationOptions {
  vaultId?: string;
  folder?: string;
  state?: string;
  search?: string;
  checkedOut?: 'me' | 'any';
  includeDeleted?: boolean;
}

export interface IFileRepository {
  findById(id: string): Promise<File | null>;
  findByPath(vaultId: string, filePath: string): Promise<File | null>;
  findMany(options: FileQueryOptions): Promise<PaginatedResult<File>>;
  checkout(id: string, userId: string, message?: string): Promise<File>;
  checkin(id: string, data: CheckinData): Promise<File>;
  undoCheckout(id: string): Promise<File>;
  softDelete(id: string, userId: string): Promise<void>;
  restore(id: string): Promise<File>;
}

export interface IVaultRepository {
  findById(id: string): Promise<Vault | null>;
  findAll(): Promise<Vault[]>;
}

export interface IWebhookRepository {
  findByOrgId(orgId: string): Promise<Webhook[]>;
  findActiveByEvent(orgId: string, event: string): Promise<Webhook[]>;
  create(data: CreateWebhookData): Promise<Webhook>;
  update(id: string, data: Partial<Webhook>): Promise<Webhook>;
  delete(id: string): Promise<void>;
}

export interface CheckinData {
  userId: string;
  contentHash?: string;
  fileSize?: number;
  newVersion?: number;
}

export interface CreateWebhookData {
  orgId: string;
  url: string;
  secret: string;
  events: string[];
  createdBy: string;
}

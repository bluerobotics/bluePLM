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

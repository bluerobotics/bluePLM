/**
 * File Service
 *
 * Handles file checkout, checkin, sync, delete, and restore operations.
 */

import type { IFileRepository } from '../core/types/repositories';
import type { File } from '../core/types/entities';
import type { Result } from '../core/result';
import { ok, err } from '../core/result';
import { NotFoundError, ConflictError, ForbiddenError } from '../core/errors';
import type { AppError } from '../core/errors/AppError';
import type { ActivityService } from './ActivityService';
import type { WebhookService } from './WebhookService';

export interface CheckinInput {
  comment?: string;
  contentHash?: string;
  fileSize?: number;
}

export interface CheckinResult {
  file: File;
  contentChanged: boolean;
}

export class FileService {
  constructor(
    private readonly fileRepo: IFileRepository,
    private readonly webhookService: WebhookService,
    private readonly activityService: ActivityService
  ) {}

  /**
   * Get a file by ID
   */
  async getById(id: string): Promise<Result<File, AppError>> {
    const file = await this.fileRepo.findById(id);
    if (!file) return err(new NotFoundError('File', id));
    return ok(file);
  }

  /**
   * Get a file by vault and path
   */
  async getByPath(vaultId: string, filePath: string): Promise<Result<File, AppError>> {
    const file = await this.fileRepo.findByPath(vaultId, filePath);
    if (!file) return err(new NotFoundError('File'));
    return ok(file);
  }

  /**
   * Check out a file for editing
   */
  async checkout(
    fileId: string,
    userId: string,
    message?: string
  ): Promise<Result<File, AppError>> {
    const file = await this.fileRepo.findById(fileId);
    if (!file) return err(new NotFoundError('File', fileId));

    // Check if already checked out by someone else
    if (file.checkedOutBy && file.checkedOutBy !== userId) {
      return err(new ConflictError('File is checked out by another user'));
    }

    const updated = await this.fileRepo.checkout(fileId, userId, message);

    // Log activity
    await this.activityService.log({
      orgId: file.orgId,
      fileId,
      userId,
      action: 'checkout',
      details: message ? { message } : {},
    });

    // Trigger webhook
    await this.webhookService.trigger(file.orgId, 'file.checkout', {
      file_id: fileId,
      file_path: file.filePath,
      file_name: file.fileName,
      user_id: userId,
    });

    return ok(updated);
  }

  /**
   * Check in a file after editing
   */
  async checkin(
    fileId: string,
    userId: string,
    input: CheckinInput
  ): Promise<Result<CheckinResult, AppError>> {
    const file = await this.fileRepo.findById(fileId);
    if (!file) return err(new NotFoundError('File', fileId));

    // Must be checked out to current user
    if (file.checkedOutBy !== userId) {
      return err(new ForbiddenError('File is not checked out to you'));
    }

    // Determine if content changed
    const contentChanged =
      input.contentHash !== undefined && input.contentHash !== file.contentHash;
    const newVersion = contentChanged ? file.version + 1 : file.version;

    const updated = await this.fileRepo.checkin(fileId, {
      userId,
      contentHash: input.contentHash,
      fileSize: input.fileSize,
      newVersion,
    });

    // Log activity
    await this.activityService.log({
      orgId: file.orgId,
      fileId,
      userId,
      action: 'checkin',
      details: { comment: input.comment, contentChanged },
    });

    // Trigger checkin webhook
    await this.webhookService.trigger(file.orgId, 'file.checkin', {
      file_id: fileId,
      file_path: file.filePath,
      file_name: file.fileName,
      content_changed: contentChanged,
      user_id: userId,
    });

    // Trigger version webhook if content changed
    if (contentChanged) {
      await this.webhookService.trigger(file.orgId, 'file.version', {
        file_id: fileId,
        file_path: file.filePath,
        file_name: file.fileName,
        version: newVersion,
        user_id: userId,
      });
    }

    return ok({ file: updated, contentChanged });
  }

  /**
   * Undo checkout (discard changes)
   */
  async undoCheckout(
    fileId: string,
    userId: string,
    userRole: string
  ): Promise<Result<File, AppError>> {
    const file = await this.fileRepo.findById(fileId);
    if (!file) return err(new NotFoundError('File', fileId));

    // Must be checked out to current user, or user is admin
    if (file.checkedOutBy !== userId && userRole !== 'admin') {
      return err(new ForbiddenError('File is not checked out to you'));
    }

    const updated = await this.fileRepo.undoCheckout(fileId);
    return ok(updated);
  }

  /**
   * Soft delete a file
   */
  async delete(
    fileId: string,
    userId: string,
    userEmail?: string
  ): Promise<Result<void, AppError>> {
    const file = await this.fileRepo.findById(fileId);
    if (!file) return err(new NotFoundError('File', fileId));

    // Cannot delete if checked out by another user
    if (file.checkedOutBy && file.checkedOutBy !== userId) {
      return err(new ConflictError('Cannot delete file checked out by another user'));
    }

    await this.fileRepo.softDelete(fileId, userId);

    // Trigger webhook
    await this.webhookService.trigger(file.orgId, 'file.delete', {
      file_id: fileId,
      file_path: file.filePath,
      file_name: file.fileName,
      user_id: userId,
      user_email: userEmail,
    });

    return ok(undefined);
  }

  /**
   * Restore a soft-deleted file
   */
  async restore(fileId: string): Promise<Result<File, AppError>> {
    const restored = await this.fileRepo.restore(fileId);

    // Trigger webhook
    await this.webhookService.trigger(restored.orgId, 'file.restore', {
      file_id: fileId,
      file_path: restored.filePath,
      file_name: restored.fileName,
    });

    return ok(restored);
  }

  /**
   * Update file state (release, obsolete, etc.)
   */
  async updateState(
    fileId: string,
    userId: string,
    userEmail: string,
    newState: string
  ): Promise<Result<{ file: File; previousState: string }, AppError>> {
    const file = await this.fileRepo.findById(fileId);
    if (!file) return err(new NotFoundError('File', fileId));

    // Cannot change state of checked out file
    if (file.checkedOutBy) {
      return err(new ConflictError('Cannot change state of a checked out file'));
    }

    const previousState = file.state;

    const updated = await this.fileRepo.updateState(fileId, newState, userId);

    // Trigger webhook
    await this.webhookService.trigger(file.orgId, 'file.state_change', {
      file_id: fileId,
      file_path: file.filePath,
      file_name: file.fileName,
      old_state: previousState,
      new_state: newState,
      user_id: userId,
      user_email: userEmail,
    });

    return ok({ 
      file: updated, 
      previousState 
    });
  }
}

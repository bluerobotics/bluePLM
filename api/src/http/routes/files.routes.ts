/**
 * File Routes
 *
 * Core file operations: list, get, checkout, checkin, sync, download, delete.
 */

import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import crypto from 'crypto';
import {
  UuidParams,
  FileSchema,
  ListFilesQuery,
  CheckoutBody,
  CheckinBody,
  SyncBody,
  UpdateMetadataBody,
  DownloadQuery,
} from '../schemas';
import { NotFoundError, ForbiddenError } from '../../core/errors';
import type { File } from '../../core/types/entities';

/**
 * Map a File entity (camelCase) to snake_case response format for backward compatibility
 */
function mapFileToResponse(file: File): Record<string, unknown> {
  return {
    id: file.id,
    org_id: file.orgId,
    vault_id: file.vaultId,
    file_path: file.filePath,
    file_name: file.fileName,
    extension: file.extension,
    file_type: file.fileType,
    part_number: file.partNumber,
    description: file.description,
    revision: file.revision,
    version: file.version,
    content_hash: file.contentHash,
    file_size: file.fileSize,
    state: file.state,
    checked_out_by: file.checkedOutBy,
    checked_out_at: file.checkedOutAt?.toISOString() ?? null,
    lock_message: file.lockMessage,
    deleted_at: file.deletedAt?.toISOString() ?? null,
    deleted_by: file.deletedBy,
    created_at: file.createdAt.toISOString(),
    updated_at: file.updatedAt.toISOString(),
    created_by: file.createdBy,
    updated_by: file.updatedBy,
  };
}

interface FileRoutesOptions {
  signedUrlExpiry: number;
}

const fileRoutes: FastifyPluginAsync<FileRoutesOptions> = async (fastify, opts) => {
  const { signedUrlExpiry } = opts;

  // Helper to compute hash
  const computeHash = (buffer: Buffer): string => {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  };

  // Helper to get file type from extension
  const getFileTypeFromExtension = (ext: string): string => {
    const lowerExt = ext.toLowerCase().replace(/^\./, '');
    const types: Record<string, string> = {
      sldprt: 'part',
      sldasm: 'assembly',
      slddrw: 'drawing',
      step: 'part',
      stp: 'part',
      iges: 'part',
      igs: 'part',
      pdf: 'document',
      doc: 'document',
      docx: 'document',
    };
    return types[lowerExt] || 'other';
  };

  // List files with optional filters
  fastify.get<{ Querystring: typeof ListFilesQuery.static }>(
    '/files',
    {
      schema: {
        description: 'List files with optional filters',
        tags: ['Files'],
        security: [{ bearerAuth: [] }],
        querystring: ListFilesQuery,
      },
      preHandler: fastify.authenticate,
    },
    async (request) => {
      const { vault_id, folder, state, search, checked_out, limit = 1000, offset = 0 } =
        request.query;

      let query = request
        .supabase!.from('files')
        .select(
          `
        id, file_path, file_name, extension, file_type,
        part_number, description, revision, version,
        content_hash, file_size, state,
        checked_out_by, checked_out_at, updated_at, created_at
      `
        )
        .eq('org_id', request.user!.org_id)
        .is('deleted_at', null)
        .order('file_path')
        .range(offset, offset + limit - 1);

      if (vault_id) query = query.eq('vault_id', vault_id);
      if (folder) query = query.ilike('file_path', `${folder}%`);
      if (state) query = query.eq('state', state);
      if (search) query = query.or(`file_name.ilike.%${search}%,part_number.ilike.%${search}%`);
      if (checked_out === 'me') query = query.eq('checked_out_by', request.user!.id);
      if (checked_out === 'any') query = query.not('checked_out_by', 'is', null);

      const { data, error } = await query;
      if (error) throw error;

      return { files: data, count: data?.length || 0 };
    }
  );

  // Get file by ID
  fastify.get<{ Params: { id: string } }>(
    '/files/:id',
    {
      schema: {
        description: 'Get file by ID',
        tags: ['Files'],
        security: [{ bearerAuth: [] }],
        params: UuidParams,
      },
      preHandler: fastify.authenticate,
    },
    async (request) => {
      const { id } = request.params;

      const { data, error } = await request.supabase!
        .from('files')
        .select(
          `
        *,
        checked_out_user:users!checked_out_by(email, full_name, avatar_url),
        created_by_user:users!created_by(email, full_name)
      `
        )
        .eq('id', id)
        .eq('org_id', request.user!.org_id)
        .single();

      if (error) throw error;
      if (!data) {
        throw new NotFoundError('File', id);
      }

      return { file: data };
    }
  );

  // Check out a file for editing
  fastify.post<{ Params: { id: string }; Body: typeof CheckoutBody.static }>(
    '/files/:id/checkout',
    {
      schema: {
        description: 'Check out a file for editing',
        tags: ['Files'],
        security: [{ bearerAuth: [] }],
        params: UuidParams,
        body: CheckoutBody,
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            file: FileSchema,
          }),
        },
      },
      preHandler: fastify.authenticate,
    },
    async (request) => {
      const { id } = request.params;
      const { message } = request.body || {};

      const result = await request.container!.fileService.checkout(
        id,
        request.user!.id,
        message
      );
      if (!result.ok) throw result.error;

      return { success: true, file: mapFileToResponse(result.value) };
    }
  );

  // Check in a file after editing
  fastify.post<{ Params: { id: string }; Body: typeof CheckinBody.static }>(
    '/files/:id/checkin',
    {
      schema: {
        description: 'Check in a file after editing',
        tags: ['Files'],
        security: [{ bearerAuth: [] }],
        params: UuidParams,
        body: CheckinBody,
      },
      preHandler: fastify.authenticate,
    },
    async (request) => {
      const { id } = request.params;
      const { comment, content_hash, file_size, content } = request.body || {};

      // Compute new hash if content is provided (storage upload logic stays here)
      let newHash: string | undefined = content_hash;
      let newFileSize: number | undefined = file_size;

      if (content) {
        const binaryContent = Buffer.from(content, 'base64');
        newHash = computeHash(binaryContent);
        newFileSize = binaryContent.length;
        const storagePath = `${request.user!.org_id}/${newHash.substring(0, 2)}/${newHash}`;

        const { error: uploadError } = await request.supabase!.storage
          .from('vault')
          .upload(storagePath, binaryContent, {
            contentType: 'application/octet-stream',
            upsert: false,
          });

        if (uploadError && !uploadError.message.includes('already exists')) {
          throw uploadError;
        }
      }

      // Delegate business logic to FileService
      const result = await request.container!.fileService.checkin(id, request.user!.id, {
        comment,
        contentHash: newHash,
        fileSize: newFileSize,
      });
      if (!result.ok) throw result.error;

      return {
        success: true,
        file: mapFileToResponse(result.value.file),
        contentChanged: result.value.contentChanged,
      };
    }
  );

  // Undo checkout (discard changes)
  fastify.post<{ Params: { id: string } }>(
    '/files/:id/undo-checkout',
    {
      schema: {
        description: 'Undo checkout (discard changes)',
        tags: ['Files'],
        security: [{ bearerAuth: [] }],
        params: UuidParams,
      },
      preHandler: fastify.authenticate,
    },
    async (request) => {
      const { id } = request.params;

      const result = await request.container!.fileService.undoCheckout(
        id,
        request.user!.id,
        request.user!.role
      );
      if (!result.ok) throw result.error;

      return { success: true, file: mapFileToResponse(result.value) };
    }
  );

  // Upload a new file or update existing
  fastify.post<{ Body: typeof SyncBody.static }>(
    '/files/sync',
    {
      schema: {
        description: 'Upload a new file or update existing',
        tags: ['Files'],
        security: [{ bearerAuth: [] }],
        body: SyncBody,
      },
      preHandler: fastify.authenticate,
    },
    async (request) => {
      const { vault_id, file_path, file_name, extension, content } = request.body;

      // Verify vault
      const { data: vault, error: vaultError } = await request.supabase!
        .from('vaults')
        .select('id')
        .eq('id', vault_id)
        .eq('org_id', request.user!.org_id)
        .single();

      if (vaultError || !vault) {
        throw new NotFoundError('Vault', vault_id);
      }

      const binaryContent = Buffer.from(content, 'base64');
      const contentHash = computeHash(binaryContent);
      const fileSize = binaryContent.length;
      const fileType = getFileTypeFromExtension(extension || '');

      // Upload to storage
      const storagePath = `${request.user!.org_id}/${contentHash.substring(0, 2)}/${contentHash}`;
      await request
        .supabase!.storage.from('vault')
        .upload(storagePath, binaryContent, {
          contentType: 'application/octet-stream',
          upsert: false,
        })
        .catch(() => {});

      // Check existing
      const { data: existing } = await request.supabase!
        .from('files')
        .select('id, version')
        .eq('vault_id', vault_id)
        .eq('file_path', file_path)
        .is('deleted_at', null)
        .single();

      let result: { file: unknown; isNew: boolean };

      if (existing) {
        const { data, error } = await request.supabase!
          .from('files')
          .update({
            content_hash: contentHash,
            file_size: fileSize,
            version: existing.version + 1,
            updated_at: new Date().toISOString(),
            updated_by: request.user!.id,
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (error) throw error;
        result = { file: data, isNew: false };
      } else {
        const { data, error } = await request.supabase!
          .from('files')
          .insert({
            org_id: request.user!.org_id,
            vault_id,
            file_path,
            file_name,
            extension: extension || '',
            file_type: fileType,
            content_hash: contentHash,
            file_size: fileSize,
            state: 'not_tracked',
            revision: 'A',
            version: 1,
            created_by: request.user!.id,
            updated_by: request.user!.id,
          })
          .select()
          .single();

        if (error) throw error;

        await request.supabase!.from('file_versions').insert({
          file_id: data.id,
          version: 1,
          revision: 'A',
          content_hash: contentHash,
          file_size: fileSize,
          state: 'not_tracked',
          created_by: request.user!.id,
        });

        result = { file: data, isNew: true };
      }

      return { success: true, ...result };
    }
  );

  // Get a signed download URL for a file
  fastify.get<{ Params: { id: string }; Querystring: typeof DownloadQuery.static }>(
    '/files/:id/download',
    {
      schema: {
        description: 'Get a signed download URL for a file (URL expires in 1 hour)',
        tags: ['Files'],
        security: [{ bearerAuth: [] }],
        params: UuidParams,
        querystring: DownloadQuery,
        response: {
          200: Type.Object({
            file_id: Type.String(),
            file_name: Type.String(),
            file_size: Type.Integer(),
            content_hash: Type.String(),
            download_url: Type.String(),
            expires_in: Type.Integer(),
          }),
        },
      },
      preHandler: fastify.authenticate,
    },
    async (request) => {
      const { id } = request.params;
      const { version } = request.query || {};

      const { data: file, error: fetchError } = await request.supabase!
        .from('files')
        .select('*')
        .eq('id', id)
        .eq('org_id', request.user!.org_id)
        .single();

      if (fetchError) throw fetchError;
      if (!file) throw new NotFoundError('File', id);

      let contentHash = file.content_hash;
      let fileSize = file.file_size;

      if (version && version !== file.version) {
        const { data: versionData } = await request.supabase!
          .from('file_versions')
          .select('content_hash, file_size')
          .eq('file_id', id)
          .eq('version', version)
          .single();

        if (!versionData) throw new NotFoundError('Version', String(version));

        contentHash = versionData.content_hash;
        fileSize = versionData.file_size;
      }

      const storagePath = `${request.user!.org_id}/${contentHash.substring(0, 2)}/${contentHash}`;

      const { data, error } = await request.supabase!.storage
        .from('vault')
        .createSignedUrl(storagePath, signedUrlExpiry, {
          download: file.file_name,
        });

      if (error) throw error;

      return {
        file_id: id,
        file_name: file.file_name,
        file_size: fileSize,
        content_hash: contentHash,
        download_url: data.signedUrl,
        expires_in: signedUrlExpiry,
      };
    }
  );

  // Get file version history
  fastify.get<{ Params: { id: string } }>(
    '/files/:id/versions',
    {
      schema: {
        description: 'Get file version history',
        tags: ['Versions'],
        security: [{ bearerAuth: [] }],
        params: UuidParams,
      },
      preHandler: fastify.authenticate,
    },
    async (request) => {
      const { id } = request.params;

      const { data, error } = await request.supabase!
        .from('file_versions')
        .select(
          `
        *,
        created_by_user:users!created_by(email, full_name)
      `
        )
        .eq('file_id', id)
        .order('version', { ascending: false });

      if (error) throw error;
      return { versions: data };
    }
  );

  // Soft delete a file
  fastify.delete<{ Params: { id: string } }>(
    '/files/:id',
    {
      schema: {
        description: 'Soft delete a file',
        tags: ['Files'],
        security: [{ bearerAuth: [] }],
        params: UuidParams,
      },
      preHandler: fastify.authenticate,
    },
    async (request) => {
      const { id } = request.params;

      const result = await request.container!.fileService.delete(
        id,
        request.user!.id,
        request.user!.email
      );
      if (!result.ok) throw result.error;

      return { success: true };
    }
  );

  // Update file metadata (state)
  fastify.patch<{ Params: { id: string }; Body: typeof UpdateMetadataBody.static }>(
    '/files/:id/metadata',
    {
      schema: {
        description: 'Update file metadata (state)',
        tags: ['Files'],
        security: [{ bearerAuth: [] }],
        params: UuidParams,
        body: UpdateMetadataBody,
      },
      preHandler: fastify.authenticate,
    },
    async (request) => {
      const { id } = request.params;
      const { state } = request.body || {};

      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
        updated_by: request.user!.id,
      };

      if (state) {
        updateData.state = state;
        updateData.state_changed_at = new Date().toISOString();
        updateData.state_changed_by = request.user!.id;
      }

      const { data, error } = await request.supabase!
        .from('files')
        .update(updateData)
        .eq('id', id)
        .eq('org_id', request.user!.org_id)
        .select()
        .single();

      if (error) throw error;
      return { success: true, file: data };
    }
  );

  // Quick release: Change file state to "released"
  fastify.post<{ Params: { id: string } }>(
    '/files/:id/release',
    {
      schema: {
        description: 'Quick release: Change file state to "released"',
        tags: ['ERP'],
        security: [{ bearerAuth: [] }],
        params: UuidParams,
        response: {
          200: Type.Object({
            success: Type.Boolean(),
            file: FileSchema,
            previous_state: Type.String(),
          }),
        },
      },
      preHandler: fastify.authenticate,
    },
    async (request) => {
      const { id } = request.params;

      const result = await request.container!.fileService.updateState(
        id,
        request.user!.id,
        request.user!.email,
        'released'
      );
      if (!result.ok) throw result.error;

      return {
        success: true,
        file: mapFileToResponse(result.value.file),
        previous_state: result.value.previousState,
      };
    }
  );

  // Quick obsolete: Change file state to "obsolete"
  fastify.post<{ Params: { id: string } }>(
    '/files/:id/obsolete',
    {
      schema: {
        description: 'Quick obsolete: Change file state to "obsolete"',
        tags: ['ERP'],
        security: [{ bearerAuth: [] }],
        params: UuidParams,
      },
      preHandler: fastify.authenticate,
    },
    async (request) => {
      const { id } = request.params;

      const result = await request.container!.fileService.updateState(
        id,
        request.user!.id,
        request.user!.email,
        'obsolete'
      );
      if (!result.ok) throw result.error;

      return {
        success: true,
        file: mapFileToResponse(result.value.file),
        previous_state: result.value.previousState,
      };
    }
  );

  // Get the associated drawing for a part or assembly
  fastify.get<{ Params: { id: string } }>(
    '/files/:id/drawing',
    {
      schema: {
        description: 'Get the associated drawing for a part or assembly',
        tags: ['ERP'],
        security: [{ bearerAuth: [] }],
        params: UuidParams,
      },
      preHandler: fastify.authenticate,
    },
    async (request) => {
      const { id } = request.params;

      // Get the source file
      const { data: sourceFile, error: sourceError } = await request.supabase!
        .from('files')
        .select('file_name, file_path, vault_id')
        .eq('id', id)
        .eq('org_id', request.user!.org_id)
        .single();

      if (sourceError) throw sourceError;
      if (!sourceFile) throw new NotFoundError('File', id);

      // Look for drawing with similar name
      const baseName = sourceFile.file_name.replace(/\.[^/.]+$/, '');

      const { data: drawings } = await request.supabase!
        .from('files')
        .select('id, file_name, file_path, revision, version, state, content_hash')
        .eq('vault_id', sourceFile.vault_id)
        .eq('org_id', request.user!.org_id)
        .eq('file_type', 'drawing')
        .is('deleted_at', null)
        .ilike('file_name', `${baseName}%`)
        .limit(1);

      if (!drawings || drawings.length === 0) {
        return { has_drawing: false, drawing: null };
      }

      const drawing = drawings[0];

      // Generate signed URL for the drawing
      const storagePath = `${request.user!.org_id}/${drawing.content_hash.substring(0, 2)}/${drawing.content_hash}`;
      const { data: urlData } = await request.supabase!.storage
        .from('vault')
        .createSignedUrl(storagePath, signedUrlExpiry, {
          download: drawing.file_name,
        });

      return {
        has_drawing: true,
        drawing: {
          id: drawing.id,
          file_name: drawing.file_name,
          file_path: drawing.file_path,
          revision: drawing.revision,
          version: drawing.version,
          state: drawing.state,
          download_url: urlData?.signedUrl || null,
          expires_in: signedUrlExpiry,
        },
      };
    }
  );

  // Get a signed upload URL
  fastify.get<{ Params: { id: string } }>(
    '/files/:id/upload-url',
    {
      schema: {
        description: 'Get a signed upload URL for updating file content',
        tags: ['Files'],
        security: [{ bearerAuth: [] }],
        params: UuidParams,
        response: {
          200: Type.Object({
            upload_url: Type.String(),
            storage_path: Type.String(),
            expires_in: Type.Integer(),
            instructions: Type.String(),
          }),
        },
      },
      preHandler: fastify.authenticate,
    },
    async (request) => {
      const { id } = request.params;

      // Verify file exists and is checked out to user
      const { data: file, error } = await request.supabase!
        .from('files')
        .select('id, checked_out_by')
        .eq('id', id)
        .eq('org_id', request.user!.org_id)
        .single();

      if (error) throw error;
      if (!file) throw new NotFoundError('File', id);

      if (file.checked_out_by !== request.user!.id) {
        throw new ForbiddenError('File must be checked out to you before uploading');
      }

      // Generate a unique path for the upload
      const uploadId = crypto.randomUUID();
      const storagePath = `${request.user!.org_id}/uploads/${uploadId}`;

      // Create signed upload URL
      const { data, error: urlError } = await request.supabase!.storage
        .from('vault')
        .createSignedUploadUrl(storagePath);

      if (urlError) throw urlError;

      return {
        upload_url: data.signedUrl,
        storage_path: storagePath,
        expires_in: signedUrlExpiry,
        instructions:
          'PUT your file content to upload_url, then call POST /files/:id/checkin with the storage_path',
      };
    }
  );
};

export default fileRoutes;

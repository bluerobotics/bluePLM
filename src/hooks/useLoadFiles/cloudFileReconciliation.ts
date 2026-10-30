// Extracted from useLoadFiles.ts per the TODO(decompose) marker that used to sit at
// its call site (originally lines ~1511-1638). Pure function: no IPC, no store
// access, and no `window.electronAPI` calls other than logging.

import { buildFullPath } from '@/lib/commands/types'
import type { CachedServerFile } from '@/lib/cache/vaultFileCache'
import type { LocalFile } from '@/stores/types'
import { isCheckoutProfileForOwner, reconcileCheckoutProfile } from '@/types/pdm'
import type { CheckoutUserProfile, PDMFile } from '@/types/pdm'
import { hasDesktop } from '@/lib/platform'

/**
 * Inputs the cloud-file reconciliation pass needs from the merge that has already
 * matched every local file it can against the server list.
 */
export interface CloudFileReconciliationParams {
  /** Every file the server currently records for this vault. */
  pdmFiles: CachedServerFile[]
  /** The merged local file list, after the primary local/server match pass. */
  localFiles: LocalFile[]
  /** Lower-cased relative paths present on local disk. */
  localPathSet: ReadonlySet<string>
  /** Lower-cased server paths already claimed by an inode-based rename match,
   * built alongside `inodeRenameMap` in `useLoadFiles.ts`. */
  inodeMatchedServerPaths: ReadonlySet<string>
  /** Reverse of `inodeMatchedServerPaths`: lower-cased server path -> the local
   * file's actual (non-lower-cased) relative path that claimed it via inode match.
   * Required to know where a `moved_away` stub should point. */
  inodeMatchedServerPathToLocalPath: ReadonlyMap<string, string>
  /** Checkout profile enrichment preserved from the previous render, keyed by
   * `files.id`, so a cloud-only or moved-away row does not lose a profile it
   * already resolved. */
  existingCheckedOutUsers: ReadonlyMap<string, CheckoutUserProfile>
  /**
   * The server row each local path carried in the store before this load (lower-cased local
   * path -> `files.id`). A local file left without a row whose path carried row F, while F now
   * sits at another server path, was moved on the server. Absent on a first load.
   */
  previousServerIdByLocalPath?: ReadonlyMap<string, string>
  /** Current user id, to distinguish "I deleted this" from a genuine cloud file. */
  userId: string | undefined
  /** Absolute vault root, for building each injected row's absolute path. */
  vaultPath: string
  /** Cooperative yield gate so a large vault does not block the main thread. */
  yieldIfSlow: () => Promise<void>
  /** Items processed between yield checks. */
  yieldCheckStride: number
}

export interface CloudFileReconciliationResult {
  /** `localFiles`, with cloud-only, moved-away, and ghost-orphan matches applied. */
  localFiles: LocalFile[]
  /** Folder paths implied by an injected cloud-only or moved-away file that do not
   * already exist locally - consumed by the caller's auto-create-folders step. */
  cloudFolders: Set<string>
}

/** Statuses of a store row with nothing on disk behind it. */
const NOT_ON_DISK: ReadonlySet<string> = new Set(['cloud', 'moved_away', 'deleted'])

/**
 * The server row each local file carried in the store (lower-cased local path -> `files.id`),
 * for `previousServerIdByLocalPath`.
 */
export function serverIdsByLocalPath(files: readonly LocalFile[]): Map<string, string> {
  const ids = new Map<string, string>()
  for (const f of files) {
    if (f.isDirectory || !f.pdmData?.id || NOT_ON_DISK.has(f.diffStatus ?? '')) continue
    ids.set(f.relativePath.toLowerCase(), f.pdmData.id)
  }
  return ids
}

/**
 * Cloud-file reconciliation — the second half of the local/server merge.
 *
 * Walks the server's file list once more, for every row the primary pass did not
 * match to a local file, and either:
 *  - Suppresses it, when a hash-based move already accounts for its content at an
 *    unknown local destination (no local evidence names *which* file claimed it).
 *  - Emits a `moved_away` stub at the server's path, when an inode-based rename
 *    match upstream *does* know the destination - so the vault's own record of
 *    this path is never silently emptied (see the plan's D1).
 *  - Otherwise adds it as a `cloud` (downloadable) or `deleted` (ghost, checked out
 *    by me but missing locally) placeholder, as before.
 *
 * Finally cross-references any remaining ghost against an orphan (local file, no
 * server match) in the same folder and extension, auto-matching the pair when
 * there is exactly one candidate on each side - a safety net for renames the
 * inode/hash passes missed.
 */
export async function reconcileCloudFiles(
  params: CloudFileReconciliationParams,
): Promise<CloudFileReconciliationResult> {
  const {
    pdmFiles,
    localPathSet,
    inodeMatchedServerPaths,
    inodeMatchedServerPathToLocalPath,
    existingCheckedOutUsers,
    userId,
    vaultPath,
    yieldIfSlow,
    yieldCheckStride,
  } = params

  let localFiles = params.localFiles
  const cloudFolders = new Set<string>()

  // Local content hashes let us recognise a hash-based move (no inode evidence)
  // and skip re-adding its old server row.
  const localContentHashes = new Set(
    localFiles.filter((f) => !f.isDirectory && f.localHash).map((f) => f.localHash),
  )

  const registerCloudFolderAncestors = (filePath: string): void => {
    const pathParts = filePath.split('/')
    let currentPath = ''
    for (let i = 0; i < pathParts.length - 1; i++) {
      currentPath = currentPath ? `${currentPath}/${pathParts[i]}` : pathParts[i]
      if (!localPathSet.has(currentPath.toLowerCase()) && !cloudFolders.has(currentPath)) {
        cloudFolders.add(currentPath)
      }
    }
  }

  const stubPdmDataFor = (pdmFile: CachedServerFile): PDMFile => {
    const preservedUserInfo = existingCheckedOutUsers.get(pdmFile.id)
    const serverFile = pdmFile as unknown as PDMFile
    return reconcileCheckoutProfile(
      serverFile,
      isCheckoutProfileForOwner(preservedUserInfo, serverFile.checked_out_by)
        ? preservedUserInfo
        : serverFile.checked_out_user,
    )
  }

  /** The record of a server path whose content now lives at `movedToRelativePath`. */
  const movedAwayStub = (pdmFile: CachedServerFile, movedToRelativePath: string): LocalFile => ({
    name: pdmFile.file_name,
    path: buildFullPath(vaultPath, pdmFile.file_path),
    relativePath: pdmFile.file_path,
    isDirectory: false,
    extension: pdmFile.extension || '',
    size: pdmFile.file_size || 0,
    modifiedTime: pdmFile.updated_at || '',
    pdmData: stubPdmDataFor(pdmFile),
    isSynced: false,
    diffStatus: 'moved_away',
    movedToRelativePath,
  })

  // Local files left without a server row, by the row their path carried before this load.
  const unmatchedById = new Map<string, LocalFile>()
  if (params.previousServerIdByLocalPath) {
    for (const f of localFiles) {
      if (f.isDirectory || f.pdmData || (f.diffStatus !== 'added' && f.diffStatus !== 'deleted_remote')) continue
      const id = params.previousServerIdByLocalPath.get(f.relativePath.toLowerCase())
      if (id) unmatchedById.set(id, f)
    }
  }

  // Server rows a local file already carries (matched by path, inode or hash upstream).
  const claimedBy = new Map<string, LocalFile>()
  for (const f of localFiles) if (!f.isDirectory && f.pdmData?.id) claimedBy.set(f.pdmData.id, f)

  // Orphans by content hash: the only local evidence of a server-side move. One orphan per hash
  // is claimed; two holders of the same bytes are ambiguous and left alone.
  const orphansByHash = new Map<string, LocalFile[]>()
  for (const f of localFiles) {
    if (f.isDirectory || f.pdmData || f.diffStatus !== 'deleted_remote' || !f.localHash) continue
    orphansByHash.set(f.localHash, [...(orphansByHash.get(f.localHash) ?? []), f])
  }
  const takeServerMoveHolder = (contentHash: string): LocalFile | null => {
    const candidates = orphansByHash.get(contentHash)
    if (!candidates || candidates.length !== 1) return null
    orphansByHash.delete(contentHash)
    return candidates[0]
  }

  let cloudScanIndex = 0
  for (const pdmFile of pdmFiles) {
    if (cloudScanIndex++ % yieldCheckStride === yieldCheckStride - 1) {
      await yieldIfSlow()
    }

    if (localPathSet.has(pdmFile.file_path.toLowerCase())) continue

    const serverPathLower = pdmFile.file_path.toLowerCase()
    const isCheckedOutByMe = pdmFile.checked_out_by === userId
    const wasMoved = pdmFile.content_hash && localContentHashes.has(pdmFile.content_hash)
    const wasInodeRenamed = inodeMatchedServerPaths.has(serverPathLower)

    // Inode evidence first: it names the destination, so the stub can point at it. A rename
    // that kept its bytes also matches by hash, and checking the hash first dropped the stub
    // for exactly the common case - and only once the main process had re-hashed the file at
    // its new path, so the stub showed on the first load after a move and vanished on the next.
    if (wasInodeRenamed) {
      const movedToRelativePath = inodeMatchedServerPathToLocalPath.get(serverPathLower)
      // inodeMatchedServerPaths and inodeMatchedServerPathToLocalPath are built
      // together upstream from the same loop, so this should always resolve. If it
      // somehow doesn't, fall back to the pre-4.3.3 suppress-only behaviour rather
      // than emit a stub with no destination to render.
      if (movedToRelativePath) {
        registerCloudFolderAncestors(pdmFile.file_path)
        localFiles.push(movedAwayStub(pdmFile, movedToRelativePath))
      }
      continue
    }

    // The local file this row belonged to a moment ago is still at its old path: the row moved
    // on the server (another machine's move or rename, or a realtime update this load now
    // confirms). By id, so it holds whatever the bytes are.
    const previousHolder = unmatchedById.get(pdmFile.id)
    if (previousHolder) {
      unmatchedById.delete(pdmFile.id)
      registerCloudFolderAncestors(pdmFile.file_path)
      previousHolder.pdmData = stubPdmDataFor(pdmFile)
      previousHolder.diffStatus = 'moved'
      previousHolder.isSynced = true
      localFiles.push(movedAwayStub(pdmFile, previousHolder.relativePath))
      continue
    }

    if (wasMoved) {
      // The same bytes are on disk at another path. A server move looks like this too: another
      // machine moved or renamed a file this machine holds at the old path, which the merge
      // found as an orphan (synced here before, its row gone). Taking that orphan for a local
      // move dropped the row, and the auto-discard then recycled the local copy, so the file
      // vanished from this machine. The orphan becomes the pending move it is, with a stub at
      // the server's path, as a local move would show.
      const holder = takeServerMoveHolder(pdmFile.content_hash!)
      if (holder) {
        registerCloudFolderAncestors(pdmFile.file_path)
        holder.pdmData = stubPdmDataFor(pdmFile)
        holder.diffStatus = 'moved'
        holder.isSynced = true
        localFiles.push(movedAwayStub(pdmFile, holder.relativePath))
        continue
      }
      // Otherwise a hash-only local move: the content exists locally at some other path and the
      // merge gave that file this row. That file is the destination, so the server path gets its
      // stub, as an inode match gives it; without one the old folder looked empty until the next
      // load found the move by inode and added it. Only a row a local file carries is left out;
      // when no file carries it, leaving it out hid a server file from this machine altogether.
      const claimant = claimedBy.get(pdmFile.id)
      if (claimant) {
        // By path, not status: a moved file with unsaved edits shows as modified, and its stub
        // is no less due.
        if (claimant.relativePath.toLowerCase() !== pdmFile.file_path.toLowerCase()) {
          registerCloudFolderAncestors(pdmFile.file_path)
          localFiles.push(movedAwayStub(pdmFile, claimant.relativePath))
        }
        continue
      }
    }

    // Neither move signal fired - a genuine cloud-only file (or, if I had it
    // checked out, a ghost of one I deleted/moved without either signal catching it).
    // BluePLM Web has no disk, so a file I have checked out is simply in the cloud there.
    const isDeletedByMe = isCheckedOutByMe && hasDesktop()

    registerCloudFolderAncestors(pdmFile.file_path)

    const preservedCloudUserInfo = existingCheckedOutUsers.get(pdmFile.id)
    const cloudPdmFile = pdmFile as unknown as PDMFile
    const cloudFilePdmData = reconcileCheckoutProfile(
      cloudPdmFile,
      isCheckoutProfileForOwner(preservedCloudUserInfo, cloudPdmFile.checked_out_by)
        ? preservedCloudUserInfo
        : cloudPdmFile.checked_out_user,
    )

    localFiles.push({
      name: pdmFile.file_name,
      path: buildFullPath(vaultPath, pdmFile.file_path),
      relativePath: pdmFile.file_path,
      isDirectory: false,
      extension: pdmFile.extension || '',
      size: pdmFile.file_size || 0,
      modifiedTime: pdmFile.updated_at || '',
      pdmData: cloudFilePdmData,
      isSynced: false, // Not synced locally
      diffStatus: isDeletedByMe ? 'deleted' : 'cloud', // Deleted if I moved/removed it, otherwise cloud
    })
  }

  // --- Ghost-orphan cross-referencing (safety net) ---
  // If inode detection missed a rename, we may have a ghost (server file, no local)
  // AND an orphan (local file, no server match) in the same folder with the same
  // extension. Auto-match them to prevent the ghost/orphan pair from persisting.
  const ghostFiles = localFiles.filter(
    (f) => f.diffStatus === 'deleted' && f.pdmData && !f.isDirectory,
  )
  const orphanFiles = localFiles.filter(
    (f) => f.diffStatus === 'deleted_remote' && !f.isDirectory,
  )

  if (ghostFiles.length > 0 && orphanFiles.length > 0) {
    const orphansByFolderExt = new Map<string, (typeof localFiles)[number][]>()
    for (const orphan of orphanFiles) {
      const folder = orphan.relativePath
        .substring(0, orphan.relativePath.lastIndexOf('/'))
        .toLowerCase()
      const ext = (orphan.extension || '').toLowerCase()
      const key = `${folder}|${ext}`
      const list = orphansByFolderExt.get(key) || []
      list.push(orphan)
      orphansByFolderExt.set(key, list)
    }

    for (const ghost of ghostFiles) {
      const folder = ghost.relativePath
        .substring(0, ghost.relativePath.lastIndexOf('/'))
        .toLowerCase()
      const ext = (ghost.extension || '').toLowerCase()
      const candidates = orphansByFolderExt.get(`${folder}|${ext}`)
      if (candidates && candidates.length === 1) {
        const orphan = candidates[0]
        window.electronAPI?.log('info', '[LoadFiles] Ghost-orphan cross-reference match', {
          ghostPath: ghost.relativePath,
          orphanPath: orphan.relativePath,
        })
        orphan.pdmData = ghost.pdmData
        orphan.diffStatus = 'moved'
        orphan.isSynced = true
        ghost.diffStatus = 'cloud'
        ghost.pdmData = { ...ghost.pdmData, _suppressedByOrphanMatch: true } as any // TODO: type this
        candidates.length = 0
      }
    }

    localFiles = localFiles.filter((f) => !(f.pdmData as any)?._suppressedByOrphanMatch) // TODO: type this
  }

  return { localFiles, cloudFolders }
}

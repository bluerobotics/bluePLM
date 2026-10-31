import type { LocalFile } from '@/stores/pdmStore'

/**
 * Why a row has no file behind it, when it has none.
 *
 * - `moved_away`: a stub at the server's recorded path; the content was renamed or moved
 *   (`movedToRelativePath` says where).
 * - `deleted`: checked out by this user but gone from disk.
 * - `cloud`: never downloaded.
 */
export type NoContentKind = 'moved_away' | 'deleted' | 'cloud'

export interface NoContentBlock {
  kind: NoContentKind
  /** Where the content now lives; set only for `moved_away`. */
  movedToRelativePath?: string
}

/**
 * Returns the reason an inline metadata edit cannot be written, or null when the row has a file.
 *
 * A metadata edit ends in a SolidWorks write against the row's path. A row with no file at that
 * path can only fail there, and an edit already stored as pending would be left marked failed.
 * Refusing up front keeps that state from being created.
 */
export function getNoContentBlock(
  file: Pick<LocalFile, 'diffStatus' | 'movedToRelativePath'>,
): NoContentBlock | null {
  switch (file.diffStatus) {
    case 'moved_away':
      return { kind: 'moved_away', movedToRelativePath: file.movedToRelativePath }
    case 'deleted':
      return { kind: 'deleted' }
    case 'cloud':
      return { kind: 'cloud' }
    default:
      return null
  }
}

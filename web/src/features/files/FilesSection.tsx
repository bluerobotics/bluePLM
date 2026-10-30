// Files: `/files` (vaults), `/files/<vaultId>?path=&q=` (folder or search), `/file/<id>` (detail).
import type { SectionProps } from '@web/shell/ui'
import { NotFound } from '@web/shell/ui'
import { FileDetail } from './FileDetail'
import { FolderView } from './FolderView'
import { VaultList } from './VaultList'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function FilesSection({ segments, query }: SectionProps) {
  if (segments[0] === 'file') {
    return segments.length === 2 && UUID.test(segments[1]) ? <FileDetail key={segments[1]} fileId={segments[1]} /> : <NotFound />
  }
  if (segments.length === 0) return <VaultList />
  if (segments.length === 1) {
    return <FolderView vaultId={segments[0]} path={query.get('path') ?? ''} query={query.get('q') ?? ''} />
  }
  return <NotFound />
}

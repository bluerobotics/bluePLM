import type { LocalFile } from '@/stores/pdmStore'
import { FileIconCard } from './FileCard'

export interface FileGridViewProps {
  files: LocalFile[]
  allFiles: LocalFile[]
  iconSize: number
  selectedFiles: string[]
  clipboard: { files: LocalFile[]; operation: 'copy' | 'cut' } | null
  processingPaths: Set<string>
  currentMachineId: string | null
  lowercaseExtensions: boolean
  userId: string | undefined
  userFullName: string | undefined
  userEmail: string | undefined
  userAvatarUrl: string | undefined
  onSelect: (e: React.MouseEvent, file: LocalFile, index: number) => void
  onDoubleClick: (file: LocalFile) => void
  onContextMenu: (e: React.MouseEvent, file: LocalFile) => void
  onDownload: (e: React.MouseEvent, file: LocalFile) => void
  onCheckout: (e: React.MouseEvent, file: LocalFile) => void
  onCheckin: (e: React.MouseEvent, file: LocalFile) => Promise<void>
  onUpload: (e: React.MouseEvent, file: LocalFile) => void
}

/**
 * Grid view for displaying files as icon cards
 */
export function FileGridView({
  files,
  allFiles,
  iconSize,
  selectedFiles,
  clipboard,
  processingPaths,
  currentMachineId,
  lowercaseExtensions,
  userId,
  userFullName,
  userEmail,
  userAvatarUrl,
  onSelect,
  onDoubleClick,
  onContextMenu,
  onDownload,
  onCheckout,
  onCheckin,
  onUpload
}: FileGridViewProps) {
  return (
    <div 
      className="p-4 grid gap-3"
      style={{ 
        gridTemplateColumns: `repeat(auto-fill, minmax(${iconSize + 24}px, 1fr))` 
      }}
    >
      {files.map((file, index) => (
        <FileIconCard
          key={file.path}
          file={file}
          iconSize={iconSize}
          isSelected={selectedFiles.includes(file.path)}
          isCut={clipboard?.operation === 'cut' && clipboard.files.some(f => f.path === file.path)}
          allFiles={allFiles}
          processingPaths={processingPaths}
          currentMachineId={currentMachineId}
          lowercaseExtensions={lowercaseExtensions}
          userId={userId}
          userFullName={userFullName}
          userEmail={userEmail}
          userAvatarUrl={userAvatarUrl}
          onClick={(e) => onSelect(e, file, index)}
          onDoubleClick={() => onDoubleClick(file)}
          onContextMenu={(e) => onContextMenu(e, file)}
          onDownload={onDownload}
          onCheckout={onCheckout}
          onCheckin={onCheckin}
          onUpload={onUpload}
        />
      ))}
    </div>
  )
}

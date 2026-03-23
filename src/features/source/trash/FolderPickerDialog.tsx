import { useState, useEffect, useCallback, useMemo } from 'react'
import { Folder, FolderOpen, FolderPlus, ChevronRight, ChevronDown, Home } from 'lucide-react'
import { usePDMStore } from '@/stores/pdmStore'

interface FolderPickerDialogProps {
  isOpen: boolean
  onClose: () => void
  title: string
  message: string
  onSelect: (relativePath: string) => void
  defaultPath?: string
  onRecreateFolders?: () => void
  missingPaths?: string[]
}

interface FolderNode {
  name: string
  relativePath: string
  children: FolderNode[]
}

function buildFolderTree(folders: Array<{ name: string; relativePath: string }>): FolderNode[] {
  const rootChildren: FolderNode[] = []
  const nodeMap = new Map<string, FolderNode>()

  const sorted = [...folders].sort((a, b) =>
    a.relativePath.toLowerCase().localeCompare(b.relativePath.toLowerCase())
  )

  for (const folder of sorted) {
    const node: FolderNode = { name: folder.name, relativePath: folder.relativePath, children: [] }
    nodeMap.set(folder.relativePath.toLowerCase(), node)

    const lastSlash = folder.relativePath.lastIndexOf('/')
    if (lastSlash === -1) {
      rootChildren.push(node)
    } else {
      const parentPath = folder.relativePath.substring(0, lastSlash)
      const parent = nodeMap.get(parentPath.toLowerCase())
      if (parent) {
        parent.children.push(node)
      } else {
        rootChildren.push(node)
      }
    }
  }

  return rootChildren
}

function FolderTreeNode({
  node,
  depth,
  selectedPath,
  onSelect,
  expanded,
  onToggleExpand
}: {
  node: FolderNode
  depth: number
  selectedPath: string
  onSelect: (path: string) => void
  expanded: Set<string>
  onToggleExpand: (path: string) => void
}) {
  const isExpanded = expanded.has(node.relativePath.toLowerCase())
  const isSelected = selectedPath.toLowerCase() === node.relativePath.toLowerCase()
  const hasChildren = node.children.length > 0

  return (
    <>
      <button
        className={`w-full flex items-center gap-1.5 px-2 py-1 text-left text-sm transition-colors hover:bg-plm-bg-light ${
          isSelected ? 'bg-plm-accent/10 text-plm-accent font-medium' : 'text-plm-fg'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelect(node.relativePath)}
        onDoubleClick={() => { if (hasChildren) onToggleExpand(node.relativePath) }}
      >
        {hasChildren ? (
          <span
            className="shrink-0 cursor-pointer"
            onClick={(e) => { e.stopPropagation(); onToggleExpand(node.relativePath) }}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        ) : (
          <span className="shrink-0 w-[14px]" />
        )}
        {isExpanded ? (
          <FolderOpen size={14} className="shrink-0 text-plm-accent" />
        ) : (
          <Folder size={14} className="shrink-0 text-plm-fg-muted" />
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {isExpanded && node.children.map(child => (
        <FolderTreeNode
          key={child.relativePath}
          node={child}
          depth={depth + 1}
          selectedPath={selectedPath}
          onSelect={onSelect}
          expanded={expanded}
          onToggleExpand={onToggleExpand}
        />
      ))}
    </>
  )
}

export function FolderPickerDialog({
  isOpen,
  onClose,
  title,
  message,
  onSelect,
  defaultPath,
  onRecreateFolders,
  missingPaths
}: FolderPickerDialogProps) {
  const [selectedPath, setSelectedPath] = useState<string>('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const files = usePDMStore(s => s.files)

  const folderTree = useMemo(() => {
    const folders = files
      .filter(f => f.isDirectory && f.diffStatus !== 'cloud')
      .map(f => ({ name: f.name, relativePath: f.relativePath }))
    return buildFolderTree(folders)
  }, [files])

  useEffect(() => {
    if (!isOpen) return
    setSelectedPath(defaultPath || '')

    // Auto-expand ancestors of the default path
    if (defaultPath) {
      const parts = defaultPath.split('/')
      const paths = new Set<string>()
      let current = ''
      for (let i = 0; i < parts.length - 1; i++) {
        current = current ? `${current}/${parts[i]}` : parts[i]
        paths.add(current.toLowerCase())
      }
      setExpanded(paths)
    } else {
      setExpanded(new Set())
    }
  }, [isOpen, defaultPath])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      onSelect(selectedPath)
    }
  }, [onClose, onSelect, selectedPath])

  useEffect(() => {
    if (!isOpen) return
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, handleKeyDown])

  const toggleExpand = useCallback((path: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      const key = path.toLowerCase()
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-plm-bg-light border border-plm-border rounded-lg p-6 max-w-md w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-plm-warning/20 flex items-center justify-center">
            <Folder size={20} className="text-plm-warning" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-plm-fg">{title}</h3>
            <p className="text-sm text-plm-fg-muted">{message}</p>
          </div>
        </div>

        {onRecreateFolders && missingPaths && missingPaths.length > 0 && (
          <div className="bg-plm-info/10 border border-plm-info/30 rounded px-3 py-2 mb-4">
            <p className="text-xs font-medium text-plm-fg mb-1">Original folder(s) to recreate:</p>
            <ul className="text-xs text-plm-fg-muted space-y-0.5">
              {missingPaths.map(p => (
                <li key={p} className="flex items-center gap-1.5 truncate" title={p}>
                  <FolderPlus size={12} className="shrink-0 text-plm-info" />
                  {p}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="bg-plm-bg rounded border border-plm-border mb-4 max-h-64 overflow-y-auto">
          <button
            className={`w-full flex items-center gap-1.5 px-2 py-1.5 text-left text-sm transition-colors hover:bg-plm-bg-light border-b border-plm-border ${
              selectedPath === '' ? 'bg-plm-accent/10 text-plm-accent font-medium' : 'text-plm-fg'
            }`}
            onClick={() => setSelectedPath('')}
          >
            <Home size={14} className="shrink-0" />
            <span>Vault Root</span>
          </button>
          {folderTree.map(node => (
            <FolderTreeNode
              key={node.relativePath}
              node={node}
              depth={0}
              selectedPath={selectedPath}
              onSelect={setSelectedPath}
              expanded={expanded}
              onToggleExpand={toggleExpand}
            />
          ))}
        </div>

        {selectedPath && (
          <div className="text-xs text-plm-fg-dim mb-3 truncate" title={selectedPath}>
            Selected: {selectedPath}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-ghost">
            Skip
          </button>
          {onRecreateFolders && (
            <button
              onClick={onRecreateFolders}
              className="btn bg-plm-success hover:bg-plm-success/80 text-white"
            >
              <FolderPlus size={14} />
              Recreate Folders
            </button>
          )}
          <button
            onClick={() => onSelect(selectedPath)}
            className="btn bg-plm-accent hover:bg-plm-accent/80 text-white"
          >
            <Folder size={14} />
            Move Here
          </button>
        </div>
      </div>
    </div>
  )
}

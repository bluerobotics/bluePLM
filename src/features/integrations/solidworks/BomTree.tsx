import { useState, useMemo, useCallback } from 'react'
import {
  ChevronRight,
  ChevronDown,
  FileBox,
  Layers,
  FilePen,
  File,
  ArrowUpRight,
  Download,
  CloudOff,
  List,
  TreeDeciduous,
  Copy,
  Check,
  CheckCircle,
  XCircle,
  AlertTriangle
} from 'lucide-react'
import { log } from '@/lib/logger'
import type { BomNodePathStatus } from '@/lib/solidworks'

// ============================================
// Types
// ============================================

export interface BomNode {
  fileId: string | null  // null if not in database
  filePath: string
  fileName: string
  fileType: 'part' | 'assembly' | 'drawing' | 'other'
  partNumber: string | null
  description: string | null
  revision: string | null
  state: string | null
  quantity: number
  configuration: string | null
  children: BomNode[]
  inDatabase: boolean
  material?: string
  level?: number  // Computed during flattening
  /** Path validation status (when SW service is running) */
  pathStatus?: BomNodePathStatus
}

export interface BomTreeProps {
  /** Root BOM nodes to display */
  nodes: BomNode[]
  /** Callback when user clicks a node to navigate */
  onNavigate?: (node: BomNode) => void
  /** Show loading state */
  isLoading?: boolean
  /** Show empty state message */
  emptyMessage?: string
  /** Additional class name */
  className?: string
  /** Whether to show export options */
  showExport?: boolean
  /** Assembly file name for export */
  assemblyName?: string
}

// ============================================
// Helper Components
// ============================================

function SWFileIcon({ fileType, size = 16 }: { fileType: BomNode['fileType']; size?: number }) {
  switch (fileType) {
    case 'part':
      return <FileBox size={size} className="text-plm-accent flex-shrink-0" />
    case 'assembly':
      return <Layers size={size} className="text-amber-400 flex-shrink-0" />
    case 'drawing':
      return <FilePen size={size} className="text-sky-300 flex-shrink-0" />
    default:
      return <File size={size} className="text-plm-fg-muted flex-shrink-0" />
  }
}

function StateIndicator({ state }: { state: string | null }) {
  if (!state) return null
  
  const stateColors: Record<string, string> = {
    'work-in-progress': 'bg-amber-500/20 text-amber-400',
    'in-review': 'bg-sky-500/20 text-sky-400',
    'released': 'bg-emerald-500/20 text-emerald-400',
    'obsolete': 'bg-rose-500/20 text-rose-400',
  }
  
  const colorClass = stateColors[state.toLowerCase()] || 'bg-plm-bg text-plm-fg-muted'
  const displayState = state.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded ${colorClass}`}>
      {displayState}
    </span>
  )
}

/**
 * Path status indicator for BOM tree nodes.
 * Shows visual indicator for path validation results from SolidWorks service.
 * 
 * - Green checkmark: Path matched (exact or suffix match)
 * - Red X: Path broken - file not found in vault
 * - Amber warning: Matched by filename only (path may differ)
 * - Amber cloud-off: File not synced to vault (existing behavior)
 */
function PathStatusIndicator({ pathStatus }: { pathStatus?: BomNodePathStatus }) {
  if (!pathStatus) return null
  
  const { status, matchMethod, tooltip } = pathStatus
  
  // Map status and match method to visual indicator
  if (status === 'valid') {
    if (matchMethod === 'exact' || matchMethod === 'suffix') {
      return (
        <span 
          className="flex items-center" 
          title={tooltip || 'Path verified'}
        >
          <CheckCircle size={12} className="text-emerald-400" />
        </span>
      )
    }
    if (matchMethod === 'filename') {
      return (
        <span 
          className="flex items-center" 
          title={tooltip || 'Matched by filename only - path may differ'}
        >
          <AlertTriangle size={12} className="text-amber-400" />
        </span>
      )
    }
  }
  
  if (status === 'broken') {
    return (
      <span 
        className="flex items-center" 
        title={tooltip || 'Path not found in vault'}
      >
        <XCircle size={12} className="text-red-400" />
      </span>
    )
  }
  
  if (status === 'not_in_vault') {
    return (
      <span 
        className="flex items-center gap-0.5 text-[10px] text-amber-400" 
        title={tooltip || 'File exists in SolidWorks but not synced to vault'}
      >
        <CloudOff size={10} />
      </span>
    )
  }
  
  // unknown status - no indicator
  return null
}

// ============================================
// BOM Tree Row Component
// ============================================

interface BomTreeRowProps {
  node: BomNode
  level: number
  isExpanded: boolean
  onToggleExpand: () => void
  onNavigate?: (node: BomNode) => void
  isFlat: boolean
}

function BomTreeRow({ 
  node, 
  level, 
  isExpanded, 
  onToggleExpand, 
  onNavigate,
  isFlat
}: BomTreeRowProps) {
  const hasChildren = node.children.length > 0
  const indentPx = isFlat ? 0 : level * 20

  return (
    <div
      className="flex items-center gap-2 py-1.5 px-2 hover:bg-plm-bg-light rounded cursor-pointer group border-b border-plm-border/20 last:border-b-0"
      style={{ paddingLeft: `${indentPx + 8}px` }}
      onClick={() => onNavigate?.(node)}
    >
      {/* Expand/Collapse Toggle */}
      {!isFlat && (
        <div className="w-5 flex-shrink-0">
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onToggleExpand()
              }}
              className="p-0.5 hover:bg-plm-bg rounded transition-colors"
            >
              {isExpanded ? (
                <ChevronDown size={14} className="text-plm-fg-muted" />
              ) : (
                <ChevronRight size={14} className="text-plm-fg-muted" />
              )}
            </button>
          ) : (
            <span className="w-4" />
          )}
        </div>
      )}

      {/* Level indicator in flat mode */}
      {isFlat && (
        <span className="w-6 text-[10px] text-plm-fg-muted text-center flex-shrink-0">
          {level}
        </span>
      )}

      {/* File Icon */}
      <SWFileIcon fileType={node.fileType} size={16} />

      {/* Path Status Indicator */}
      <PathStatusIndicator pathStatus={node.pathStatus} />

      {/* File Name */}
      <span className="flex-1 min-w-0 truncate text-sm text-plm-fg">
        {node.fileName}
      </span>

      {/* Description - hidden on narrow panels via @container query fallback */}
      <span 
        className="hidden sm:block w-[120px] text-xs text-plm-fg-muted truncate flex-shrink-0"
        title={node.description || undefined}
      >
        {node.description || '—'}
      </span>

      {/* Quantity Badge */}
      <span className="w-10 text-center text-xs text-plm-fg-muted bg-plm-bg px-1.5 py-0.5 rounded flex-shrink-0">
        ×{node.quantity}
      </span>

      {/* Part Number */}
      <span 
        className="w-[90px] text-xs text-plm-accent font-mono flex-shrink-0 truncate"
        title={node.partNumber || undefined}
      >
        {node.partNumber || '—'}
      </span>

      {/* State Indicator */}
      <span className="w-20 flex-shrink-0">
        <StateIndicator state={node.state} />
      </span>

      {/* Not in database indicator */}
      {!node.inDatabase && (
        <span className="flex items-center gap-0.5 text-[10px] text-amber-400" title="Not synced to vault">
          <CloudOff size={10} />
        </span>
      )}

      {/* Navigate button */}
      {onNavigate && node.inDatabase && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onNavigate(node)
          }}
          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-plm-accent/20 rounded transition-opacity"
          title="Navigate to file"
        >
          <ArrowUpRight size={12} className="text-plm-fg-muted" />
        </button>
      )}
    </div>
  )
}

// ============================================
// Recursive Tree Renderer
// ============================================

interface TreeNodeProps {
  node: BomNode
  level: number
  expandedNodes: Set<string>
  toggleExpanded: (key: string) => void
  onNavigate?: (node: BomNode) => void
  isFlat: boolean
}

function TreeNode({ node, level, expandedNodes, toggleExpanded, onNavigate, isFlat }: TreeNodeProps) {
  const nodeKey = `${node.filePath}-${level}`
  const isExpanded = expandedNodes.has(nodeKey)

  return (
    <>
      <BomTreeRow
        node={node}
        level={level}
        isExpanded={isExpanded}
        onToggleExpand={() => toggleExpanded(nodeKey)}
        onNavigate={onNavigate}
        isFlat={isFlat}
      />
      {isExpanded && !isFlat && node.children.map((child, idx) => (
        <TreeNode
          key={`${child.filePath}-${idx}`}
          node={child}
          level={level + 1}
          expandedNodes={expandedNodes}
          toggleExpanded={toggleExpanded}
          onNavigate={onNavigate}
          isFlat={isFlat}
        />
      ))}
    </>
  )
}

// ============================================
// Utility Functions
// ============================================

function flattenBom(nodes: BomNode[], level = 1): Array<BomNode & { level: number }> {
  const result: Array<BomNode & { level: number }> = []
  
  for (const node of nodes) {
    result.push({ ...node, level })
    if (node.children.length > 0) {
      result.push(...flattenBom(node.children, level + 1))
    }
  }
  
  return result
}

function calculateSummary(nodes: BomNode[]): {
  uniqueParts: number
  totalQuantity: number
  missingCount: number
  partSet: Set<string>
} {
  const partSet = new Set<string>()
  let totalQuantity = 0
  let missingCount = 0

  function traverse(nodeList: BomNode[], parentQty = 1) {
    for (const node of nodeList) {
      const effectiveQty = node.quantity * parentQty
      partSet.add(node.filePath.toLowerCase())
      totalQuantity += effectiveQty
      if (!node.inDatabase) missingCount++
      if (node.children.length > 0) {
        traverse(node.children, effectiveQty)
      }
    }
  }

  traverse(nodes)
  
  return {
    uniqueParts: partSet.size,
    totalQuantity,
    missingCount,
    partSet
  }
}

function bomToCsv(nodes: BomNode[], _assemblyName?: string): string {
  const flatList = flattenBom(nodes)
  const headers = ['Level', 'File Name', 'Part Number', 'Description', 'Revision', 'Quantity', 'State', 'Material', 'In Database', 'File Path']
  
  const rows = flatList.map(node => [
    node.level.toString(),
    node.fileName,
    node.partNumber || '',
    node.description || '',
    node.revision || '',
    node.quantity.toString(),
    node.state || '',
    node.material || '',
    node.inDatabase ? 'Yes' : 'No',
    node.filePath
  ])

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ].join('\n')

  return csvContent
}

// ============================================
// Main BomTree Component
// ============================================

export function BomTree({
  nodes,
  onNavigate,
  isLoading,
  emptyMessage = 'No components found',
  className = '',
  showExport = true,
  assemblyName
}: BomTreeProps) {
  const [isFlat, setIsFlat] = useState(false)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    // Auto-expand first two levels
    const initial = new Set<string>()
    nodes.forEach((node) => {
      initial.add(`${node.filePath}-0`)
      node.children.forEach((child) => {
        initial.add(`${child.filePath}-1`)
      })
    })
    return initial
  })
  const [copied, setCopied] = useState(false)

  const toggleExpanded = useCallback((key: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }, [])

  const expandAll = useCallback(() => {
    const allKeys = new Set<string>()
    function addKeys(nodeList: BomNode[], level: number) {
      nodeList.forEach(node => {
        allKeys.add(`${node.filePath}-${level}`)
        if (node.children.length > 0) {
          addKeys(node.children, level + 1)
        }
      })
    }
    addKeys(nodes, 0)
    setExpandedNodes(allKeys)
  }, [nodes])

  const collapseAll = useCallback(() => {
    setExpandedNodes(new Set())
  }, [])

  const summary = useMemo(() => calculateSummary(nodes), [nodes])

  const flatNodes = useMemo(() => 
    isFlat ? flattenBom(nodes) : [], 
    [nodes, isFlat]
  )

  const handleExportCsv = useCallback(() => {
    const csv = bomToCsv(nodes, assemblyName)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${assemblyName?.replace(/\.[^.]+$/, '') || 'bom'}_export.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, [nodes, assemblyName])

  const handleCopyToClipboard = useCallback(async () => {
    const csv = bomToCsv(nodes, assemblyName)
    try {
      await navigator.clipboard.writeText(csv)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      log.error('[SolidWorks]', 'Failed to copy BOM', { error: err })
    }
  }, [nodes, assemblyName])

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center py-8 ${className}`}>
        <div className="animate-spin h-6 w-6 border-2 border-plm-accent border-t-transparent rounded-full" />
        <span className="ml-2 text-sm text-plm-fg-muted">Loading BOM...</span>
      </div>
    )
  }

  if (nodes.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center py-8 text-plm-fg-muted ${className}`}>
        <Layers size={32} className="mb-3 opacity-30" />
        <div className="text-sm">{emptyMessage}</div>
      </div>
    )
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 mb-2 flex-shrink-0">
        {/* View Toggle */}
        <div className="flex items-center gap-1 bg-plm-bg rounded p-0.5">
          <button
            onClick={() => setIsFlat(false)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
              !isFlat ? 'bg-plm-accent/20 text-plm-accent' : 'text-plm-fg-muted hover:text-plm-fg'
            }`}
            title="Tree View"
          >
            <TreeDeciduous size={12} />
            Tree
          </button>
          <button
            onClick={() => setIsFlat(true)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
              isFlat ? 'bg-plm-accent/20 text-plm-accent' : 'text-plm-fg-muted hover:text-plm-fg'
            }`}
            title="Flat List"
          >
            <List size={12} />
            Flat
          </button>
        </div>

        {/* Expand/Collapse + Export */}
        <div className="flex items-center gap-1">
          {!isFlat && (
            <>
              <button
                onClick={expandAll}
                className="px-2 py-1 text-[10px] text-plm-fg-muted hover:text-plm-fg hover:bg-plm-bg-light rounded transition-colors"
              >
                Expand All
              </button>
              <button
                onClick={collapseAll}
                className="px-2 py-1 text-[10px] text-plm-fg-muted hover:text-plm-fg hover:bg-plm-bg-light rounded transition-colors"
              >
                Collapse All
              </button>
              <span className="w-px h-4 bg-plm-border mx-1" />
            </>
          )}

          {showExport && (
            <>
              <button
                onClick={handleCopyToClipboard}
                className="flex items-center gap-1 px-2 py-1 text-[10px] text-plm-fg-muted hover:text-plm-fg hover:bg-plm-bg-light rounded transition-colors"
                title="Copy BOM to clipboard"
              >
                {copied ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <button
                onClick={handleExportCsv}
                className="flex items-center gap-1 px-2 py-1 text-[10px] text-plm-fg-muted hover:text-plm-fg hover:bg-plm-bg-light rounded transition-colors"
                title="Export BOM to CSV"
              >
                <Download size={10} />
                CSV
              </button>
            </>
          )}
        </div>
      </div>

      {/* Column Headers */}
      <div className="flex items-center gap-2 px-2 py-1.5 bg-plm-bg-light rounded-t text-[10px] text-plm-fg-muted uppercase tracking-wide border-b border-plm-border flex-shrink-0">
        {isFlat ? (
          <span className="w-6 text-center flex-shrink-0">Lvl</span>
        ) : (
          <span className="w-5 flex-shrink-0" /> 
        )}
        <span className="w-4 flex-shrink-0" /> {/* Icon */}
        <span className="flex-1 min-w-0">File Name</span>
        <span className="hidden sm:block w-[120px] flex-shrink-0">Description</span>
        <span className="w-10 text-center flex-shrink-0">Qty</span>
        <span className="w-[90px] flex-shrink-0">Part No.</span>
        <span className="w-20 flex-shrink-0">State</span>
        <span className="w-8 flex-shrink-0" /> {/* Actions */}
      </div>

      {/* BOM Content */}
      <div className="flex-1 overflow-auto">
        {isFlat ? (
          // Flat view
          flatNodes.map((node, idx) => (
            <BomTreeRow
              key={`${node.filePath}-${idx}`}
              node={node}
              level={node.level}
              isExpanded={false}
              onToggleExpand={() => {}}
              onNavigate={onNavigate}
              isFlat={true}
            />
          ))
        ) : (
          // Tree view
          nodes.map((node, idx) => (
            <TreeNode
              key={`${node.filePath}-${idx}`}
              node={node}
              level={0}
              expandedNodes={expandedNodes}
              toggleExpanded={toggleExpanded}
              onNavigate={onNavigate}
              isFlat={false}
            />
          ))
        )}
      </div>

      {/* Summary Footer */}
      <div className="flex items-center justify-between gap-4 px-3 py-2 bg-plm-bg-light rounded-b border-t border-plm-border text-xs flex-shrink-0 mt-auto">
        <div className="flex items-center gap-4">
          <span className="text-plm-fg-muted">
            <span className="text-plm-fg font-medium">{summary.uniqueParts}</span> unique parts
          </span>
          <span className="text-plm-fg-muted">
            <span className="text-plm-fg font-medium">{summary.totalQuantity}</span> total qty
          </span>
          {summary.missingCount > 0 && (
            <span className="text-amber-400">
              <span className="font-medium">{summary.missingCount}</span> not in vault
            </span>
          )}
        </div>
        <span className="text-plm-fg-dim text-[10px]">
          {isFlat ? 'Indented BOM' : 'Multi-level BOM'}
        </span>
      </div>
    </div>
  )
}

// ============================================
// Conversion Utilities (for ContainsTab integration)
// ============================================

/**
 * Convert a flat BomItem array to BomNode array
 * Used to bridge between existing ContainsTab data and BomTree component
 */
export interface LegacyBomItem {
  fileName: string
  filePath: string
  fileType: 'Part' | 'Assembly' | 'Other'
  quantity: number
  configuration: string
  partNumber: string
  description: string
  material: string
  revision: string
  properties: Record<string, string>
  // Extended fields from database
  fileId?: string
  inDatabase?: boolean
  state?: string
}

export function convertLegacyBomToBomNodes(items: LegacyBomItem[]): BomNode[] {
  return items.map(item => ({
    fileId: item.fileId || null,
    filePath: item.filePath,
    fileName: item.fileName,
    fileType: item.fileType.toLowerCase() as 'part' | 'assembly' | 'other',
    partNumber: item.partNumber || null,
    description: item.description || null,
    revision: item.revision || null,
    state: item.state || null,
    quantity: item.quantity,
    configuration: item.configuration || null,
    children: [], // Flat list, no children
    inDatabase: item.inDatabase ?? true,
    material: item.material
  }))
}

export default BomTree

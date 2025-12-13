import { useState, useEffect } from 'react'
import { 
  FileText, 
  Plus, 
  Search, 
  ChevronRight,
  Clock,
  CheckCircle2,
  Package,
  Trash2,
  Send,
  Loader2,
  AlertCircle,
  ArrowLeft,
  Settings2,
  Building2,
  X,
  File,
  Hash,
  Layers,
  Cog
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { usePDMStore } from '@/stores/pdmStore'
import type { RFQ, RFQItem, RFQStatus, RFQSupplier } from '@/types/rfq'
import { getRFQStatusInfo } from '@/types/rfq'

// Type-safe wrapper for RFQ tables (until database.ts is regenerated)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rfqsTable = () => supabase.from('rfqs' as any)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rfqItemsTable = () => supabase.from('rfq_items' as any)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rfqSuppliersTable = () => supabase.from('rfq_suppliers' as any)

// RFQ List View
function RFQListView({ 
  onSelectRFQ, 
  onNewRFQ 
}: { 
  onSelectRFQ: (rfq: RFQ) => void
  onNewRFQ: () => void 
}) {
  const { organization } = usePDMStore()
  const [rfqs, setRfqs] = useState<RFQ[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<RFQStatus | 'all'>('all')

  // Load RFQs
  useEffect(() => {
    if (!organization?.id) return

    const loadRFQs = async () => {
      setLoading(true)
      try {
        const { data, error } = await rfqsTable()
          .select(`
            *,
            items:rfq_items(count),
            suppliers:rfq_suppliers(count)
          `)
          .eq('org_id', organization.id)
          .order('created_at', { ascending: false })

        if (error) throw error
        setRfqs((data as RFQ[]) || [])
      } catch (err) {
        console.error('Failed to load RFQs:', err)
      } finally {
        setLoading(false)
      }
    }

    loadRFQs()
  }, [organization?.id])

  // Filter RFQs
  const filteredRFQs = rfqs.filter(rfq => {
    const matchesSearch = !searchQuery || 
      rfq.rfq_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rfq.title.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === 'all' || rfq.status === statusFilter
    return matchesSearch && matchesStatus
  })

  // Group by status for summary
  const statusCounts = rfqs.reduce((acc, rfq) => {
    acc[rfq.status] = (acc[rfq.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="animate-spin text-pdm-accent" size={24} />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-pdm-border space-y-3">
        <button 
          onClick={onNewRFQ}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-pdm-accent hover:bg-pdm-accent/90 text-white rounded text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          New RFQ
        </button>
        
        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-pdm-fg-muted" />
          <input
            type="text"
            placeholder="Search RFQs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-pdm-input border border-pdm-border rounded text-sm text-pdm-fg placeholder:text-pdm-fg-muted focus:outline-none focus:border-pdm-accent"
          />
        </div>

        {/* Status filter */}
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-2 py-1 text-[10px] rounded transition-colors ${
              statusFilter === 'all' 
                ? 'bg-pdm-accent text-white' 
                : 'bg-pdm-highlight text-pdm-fg-muted hover:text-pdm-fg'
            }`}
          >
            All ({rfqs.length})
          </button>
          {(['draft', 'ready', 'sent', 'awaiting_quote', 'quoted'] as RFQStatus[]).map(status => {
            const count = statusCounts[status] || 0
            if (count === 0) return null
            const info = getRFQStatusInfo(status)
            return (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-2 py-1 text-[10px] rounded transition-colors ${
                  statusFilter === status 
                    ? 'bg-pdm-accent text-white' 
                    : 'bg-pdm-highlight text-pdm-fg-muted hover:text-pdm-fg'
                }`}
              >
                {info.label} ({count})
              </button>
            )
          })}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 border-b border-pdm-border">
        <div className="p-3 text-center border-r border-pdm-border">
          <div className="text-lg font-semibold text-pdm-fg">{rfqs.length}</div>
          <div className="text-[10px] text-pdm-fg-muted">Total</div>
        </div>
        <div className="p-3 text-center border-r border-pdm-border">
          <div className="text-lg font-semibold text-pdm-warning">
            {statusCounts.awaiting_quote || 0}
          </div>
          <div className="text-[10px] text-pdm-fg-muted">Pending</div>
        </div>
        <div className="p-3 text-center">
          <div className="text-lg font-semibold text-pdm-success">
            {(statusCounts.quoted || 0) + (statusCounts.awarded || 0)}
          </div>
          <div className="text-[10px] text-pdm-fg-muted">Quoted</div>
        </div>
      </div>

      {/* RFQ List */}
      <div className="flex-1 overflow-y-auto">
        {filteredRFQs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-pdm-fg-muted">
            <FileText size={32} className="mb-2 opacity-50" />
            <p className="text-sm">No RFQs found</p>
          </div>
        ) : (
          filteredRFQs.map((rfq) => {
            const statusInfo = getRFQStatusInfo(rfq.status)
            return (
              <div
                key={rfq.id}
                onClick={() => onSelectRFQ(rfq)}
                className="p-3 border-b border-pdm-border hover:bg-pdm-highlight/50 cursor-pointer transition-colors group"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-pdm-accent">{rfq.rfq_number}</span>
                      <ChevronRight size={12} className="text-pdm-fg-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <div className="text-sm font-medium text-pdm-fg mt-0.5">{rfq.title}</div>
                  </div>
                  <span className={`flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded ${statusInfo.color} ${statusInfo.bgColor}`}>
                    {rfq.status === 'generating' && <Loader2 size={10} className="animate-spin" />}
                    {rfq.status === 'awaiting_quote' && <Clock size={10} />}
                    {rfq.status === 'quoted' && <CheckCircle2 size={10} />}
                    {statusInfo.label}
                  </span>
                </div>
                
                <div className="flex items-center gap-4 text-[11px] text-pdm-fg-muted">
                  {rfq.due_date && (
                    <span className="flex items-center gap-1">
                      <Clock size={10} />
                      Due {new Date(rfq.due_date).toLocaleDateString()}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Package size={10} />
                    {(rfq as any).items?.[0]?.count || 0} items
                  </span>
                  <span className="flex items-center gap-1">
                    <Building2 size={10} />
                    {(rfq as any).suppliers?.[0]?.count || 0} suppliers
                  </span>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// RFQ Detail View
function RFQDetailView({ 
  rfq, 
  onBack,
  onUpdate
}: { 
  rfq: RFQ
  onBack: () => void
  onUpdate: (rfq: RFQ) => void
}) {
  const { addToast, files } = usePDMStore()
  const [items, setItems] = useState<RFQItem[]>([])
  const [suppliers, setSuppliers] = useState<RFQSupplier[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [activeTab, setActiveTab] = useState<'items' | 'suppliers' | 'settings'>('items')
  const [showAddFiles, setShowAddFiles] = useState(false)

  // Load RFQ details
  useEffect(() => {
    const loadDetails = async () => {
      setLoading(true)
      try {
        // Load items
        const { data: itemsData, error: itemsError } = await rfqItemsTable()
          .select(`
            *,
            file:files(id, file_name, file_path, part_number, description, revision, file_type, extension)
          `)
          .eq('rfq_id', rfq.id)
          .order('line_number')

        if (itemsError) throw itemsError
        setItems((itemsData as RFQItem[]) || [])

        // Load suppliers
        const { data: suppliersData, error: suppliersError } = await rfqSuppliersTable()
          .select(`
            *,
            supplier:suppliers(id, name, code, contact_email, contact_name)
          `)
          .eq('rfq_id', rfq.id)

        if (suppliersError) throw suppliersError
        setSuppliers((suppliersData as RFQSupplier[]) || [])
      } catch (err) {
        console.error('Failed to load RFQ details:', err)
        addToast('error', 'Failed to load RFQ details')
      } finally {
        setLoading(false)
      }
    }

    loadDetails()
  }, [rfq.id, addToast])

  // Add file to RFQ
  const handleAddFile = async (fileId: string) => {
    const file = files.find(f => f.pdmData?.id === fileId)
    if (!file?.pdmData) return

    const nextLineNumber = items.length + 1
    
    try {
      const { data, error } = await rfqItemsTable()
        .insert({
          rfq_id: rfq.id,
          line_number: nextLineNumber,
          file_id: fileId,
          part_number: file.pdmData.part_number || file.name,
          description: file.pdmData.description,
          revision: file.pdmData.revision,
          quantity: 1
        })
        .select(`
          *,
          file:files(id, file_name, file_path, part_number, description, revision, file_type, extension)
        `)
        .single()

      if (error) throw error
      setItems([...items, data as RFQItem])
      addToast('success', `Added ${file.name} to RFQ`)
    } catch (err) {
      console.error('Failed to add file:', err)
      addToast('error', 'Failed to add file to RFQ')
    }
  }

  // Update item quantity
  const handleUpdateQuantity = async (itemId: string, quantity: number) => {
    if (quantity < 1) return

    try {
      const { error } = await supabase
        .from('rfq_items')
        .update({ quantity })
        .eq('id', itemId)

      if (error) throw error
      setItems(items.map(i => i.id === itemId ? { ...i, quantity } : i))
    } catch (err) {
      console.error('Failed to update quantity:', err)
      addToast('error', 'Failed to update quantity')
    }
  }

  // Remove item
  const handleRemoveItem = async (itemId: string) => {
    try {
      const { error } = await supabase
        .from('rfq_items')
        .delete()
        .eq('id', itemId)

      if (error) throw error
      setItems(items.filter(i => i.id !== itemId))
      addToast('success', 'Item removed from RFQ')
    } catch (err) {
      console.error('Failed to remove item:', err)
      addToast('error', 'Failed to remove item')
    }
  }

  // Generate release files
  const handleGenerateReleaseFiles = async () => {
    if (!window.electronAPI?.solidworks) {
      addToast('error', 'SolidWorks service not available')
      return
    }

    setGenerating(true)
    let successCount = 0
    let failCount = 0

    try {
      // Update RFQ status to generating
      await supabase
        .from('rfqs')
        .update({ status: 'generating' })
        .eq('id', rfq.id)

      for (const item of items) {
        if (!item.file_id || !item.file) continue

        const filePath = item.file.file_path
        const ext = item.file.extension?.toLowerCase()

        // Generate STEP for parts/assemblies
        if (['.sldprt', '.sldasm'].includes(ext)) {
          try {
            const result = await window.electronAPI.solidworks.exportStep(filePath, { exportAllConfigs: false })
            if (result?.success) {
              await supabase
                .from('rfq_items')
                .update({
                  step_file_generated: true,
                  step_file_path: result.data?.exportedFiles?.[0]
                })
                .eq('id', item.id)
              successCount++
            } else {
              failCount++
            }
          } catch (err) {
            console.error(`STEP export failed for ${item.part_number}:`, err)
            failCount++
          }
        }

        // Generate PDF for drawings
        if (ext === '.slddrw') {
          try {
            const result = await window.electronAPI.solidworks.exportPdf(filePath)
            if (result?.success) {
              await supabase
                .from('rfq_items')
                .update({
                  pdf_file_generated: true,
                  pdf_file_path: result.data?.outputFile,
                  pdf_file_size: result.data?.fileSize
                })
                .eq('id', item.id)
              successCount++
            } else {
              failCount++
            }
          } catch (err) {
            console.error(`PDF export failed for ${item.part_number}:`, err)
            failCount++
          }
        }
      }

      // Update RFQ with generation results
      const allGenerated = failCount === 0
      await supabase
        .from('rfqs')
        .update({
          status: allGenerated ? 'ready' : 'pending_files',
          release_files_generated: allGenerated,
          release_files_generated_at: allGenerated ? new Date().toISOString() : null
        })
        .eq('id', rfq.id)

      // Reload items to get updated paths
      const { data: updatedItems } = await supabase
        .from('rfq_items')
        .select(`
          *,
          file:files(id, file_name, file_path, part_number, description, revision, file_type, extension)
        `)
        .eq('rfq_id', rfq.id)
        .order('line_number')

      if (updatedItems) setItems(updatedItems)

      if (failCount === 0) {
        addToast('success', `Generated ${successCount} release files`)
        onUpdate({ ...rfq, status: 'ready', release_files_generated: true })
      } else {
        addToast('warning', `Generated ${successCount} files, ${failCount} failed`)
        onUpdate({ ...rfq, status: 'pending_files' })
      }
    } catch (err) {
      console.error('Generation failed:', err)
      addToast('error', 'Failed to generate release files')
    } finally {
      setGenerating(false)
    }
  }

  const statusInfo = getRFQStatusInfo(rfq.status)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="animate-spin text-pdm-accent" size={24} />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-pdm-border">
        <button 
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-pdm-fg-muted hover:text-pdm-fg mb-2"
        >
          <ArrowLeft size={14} />
          Back to RFQs
        </button>
        
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono text-pdm-accent">{rfq.rfq_number}</span>
              <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${statusInfo.color} ${statusInfo.bgColor}`}>
                {statusInfo.label}
              </span>
            </div>
            <h3 className="text-sm font-medium text-pdm-fg mt-1">{rfq.title}</h3>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-pdm-border">
        <button
          onClick={() => setActiveTab('items')}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === 'items' 
              ? 'text-pdm-accent border-b-2 border-pdm-accent' 
              : 'text-pdm-fg-muted hover:text-pdm-fg'
          }`}
        >
          <Package size={14} className="inline mr-1" />
          Items ({items.length})
        </button>
        <button
          onClick={() => setActiveTab('suppliers')}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === 'suppliers' 
              ? 'text-pdm-accent border-b-2 border-pdm-accent' 
              : 'text-pdm-fg-muted hover:text-pdm-fg'
          }`}
        >
          <Building2 size={14} className="inline mr-1" />
          Suppliers ({suppliers.length})
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === 'settings' 
              ? 'text-pdm-accent border-b-2 border-pdm-accent' 
              : 'text-pdm-fg-muted hover:text-pdm-fg'
          }`}
        >
          <Settings2 size={14} className="inline mr-1" />
          Settings
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'items' && (
          <div className="p-3 space-y-3">
            {/* Add files button */}
            <button
              onClick={() => setShowAddFiles(!showAddFiles)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-pdm-border hover:border-pdm-accent text-pdm-fg-muted hover:text-pdm-fg rounded text-sm transition-colors"
            >
              <Plus size={16} />
              Add Files from Vault
            </button>

            {/* File picker */}
            {showAddFiles && (
              <div className="border border-pdm-border rounded p-2 bg-pdm-bg max-h-48 overflow-y-auto">
                <p className="text-[10px] text-pdm-fg-muted mb-2">Select files to add:</p>
                {files
                  .filter(f => !f.isDirectory && f.pdmData?.id && !items.some(i => i.file_id === f.pdmData?.id))
                  .slice(0, 20)
                  .map(file => (
                    <button
                      key={file.path}
                      onClick={() => {
                        handleAddFile(file.pdmData!.id)
                        setShowAddFiles(false)
                      }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-pdm-highlight rounded text-left"
                    >
                      <File size={14} className="text-pdm-fg-muted" />
                      <span className="text-xs text-pdm-fg truncate flex-1">{file.name}</span>
                      <span className="text-[10px] text-pdm-fg-muted">{file.pdmData?.part_number}</span>
                    </button>
                  ))}
              </div>
            )}

            {/* Items list */}
            {items.length === 0 ? (
              <div className="text-center py-8 text-pdm-fg-muted">
                <Package size={32} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">No items yet</p>
                <p className="text-xs">Add files from your vault to get started</p>
              </div>
            ) : (
              <div className="space-y-2">
                {items.map((item) => (
                  <div key={item.id} className="border border-pdm-border rounded p-2 bg-pdm-bg/50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-pdm-fg-muted">#{item.line_number}</span>
                          <span className="text-xs font-medium text-pdm-fg truncate">
                            {item.part_number}
                          </span>
                          {item.revision && (
                            <span className="text-[10px] text-pdm-fg-muted">Rev {item.revision}</span>
                          )}
                        </div>
                        {item.description && (
                          <p className="text-[11px] text-pdm-fg-muted truncate mt-0.5">
                            {item.description}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => handleRemoveItem(item.id)}
                        className="p-1 text-pdm-fg-muted hover:text-pdm-error transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    
                    <div className="flex items-center gap-3 mt-2">
                      {/* Quantity */}
                      <div className="flex items-center gap-1">
                        <Hash size={12} className="text-pdm-fg-muted" />
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => handleUpdateQuantity(item.id, parseInt(e.target.value) || 1)}
                          className="w-16 px-2 py-1 bg-pdm-input border border-pdm-border rounded text-xs text-pdm-fg focus:outline-none focus:border-pdm-accent"
                        />
                        <span className="text-[10px] text-pdm-fg-muted">{item.unit}</span>
                      </div>

                      {/* File status indicators */}
                      <div className="flex items-center gap-2 ml-auto">
                        {item.step_file_generated && (
                          <span className="flex items-center gap-1 text-[10px] text-pdm-success">
                            <Layers size={10} />
                            STEP
                          </span>
                        )}
                        {item.pdf_file_generated && (
                          <span className="flex items-center gap-1 text-[10px] text-pdm-success">
                            <FileText size={10} />
                            PDF
                          </span>
                        )}
                        {!item.step_file_generated && !item.pdf_file_generated && item.file && (
                          <span className="flex items-center gap-1 text-[10px] text-pdm-warning">
                            <AlertCircle size={10} />
                            Needs export
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Generate button */}
            {items.length > 0 && items.some(i => !i.step_file_generated && !i.pdf_file_generated && i.file) && (
              <button
                onClick={handleGenerateReleaseFiles}
                disabled={generating}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-pdm-accent hover:bg-pdm-accent/90 text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
              >
                {generating ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Generating Release Files...
                  </>
                ) : (
                  <>
                    <Cog size={16} />
                    Generate STEP & PDF Files
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {activeTab === 'suppliers' && (
          <div className="p-3">
            {suppliers.length === 0 ? (
              <div className="text-center py-8 text-pdm-fg-muted">
                <Building2 size={32} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">No suppliers assigned</p>
                <p className="text-xs">Add suppliers to send this RFQ</p>
              </div>
            ) : (
              <div className="space-y-2">
                {suppliers.map((rs) => (
                  <div key={rs.id} className="border border-pdm-border rounded p-2 bg-pdm-bg/50">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs font-medium text-pdm-fg">
                          {rs.supplier?.name}
                        </div>
                        {rs.supplier?.code && (
                          <div className="text-[10px] text-pdm-fg-muted">{rs.supplier.code}</div>
                        )}
                      </div>
                      {rs.quoted_at ? (
                        <div className="text-right">
                          <div className="text-xs text-pdm-success font-medium">
                            {formatCurrency(rs.total_quoted_amount, rs.currency)}
                          </div>
                          <div className="text-[10px] text-pdm-fg-muted">
                            {rs.lead_time_days} days
                          </div>
                        </div>
                      ) : rs.sent_at ? (
                        <span className="text-[10px] text-pdm-warning">Awaiting quote</span>
                      ) : (
                        <span className="text-[10px] text-pdm-fg-muted">Not sent</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="p-3 space-y-4">
            <div>
              <label className="text-[10px] text-pdm-fg-muted uppercase tracking-wider">Due Date</label>
              <input
                type="date"
                value={rfq.due_date || ''}
                className="w-full mt-1 px-3 py-2 bg-pdm-input border border-pdm-border rounded text-sm text-pdm-fg focus:outline-none focus:border-pdm-accent"
              />
            </div>
            <div>
              <label className="text-[10px] text-pdm-fg-muted uppercase tracking-wider">Required Date</label>
              <input
                type="date"
                value={rfq.required_date || ''}
                className="w-full mt-1 px-3 py-2 bg-pdm-input border border-pdm-border rounded text-sm text-pdm-fg focus:outline-none focus:border-pdm-accent"
              />
            </div>
            <div>
              <label className="text-[10px] text-pdm-fg-muted uppercase tracking-wider">Notes to Suppliers</label>
              <textarea
                value={rfq.supplier_notes || ''}
                rows={3}
                className="w-full mt-1 px-3 py-2 bg-pdm-input border border-pdm-border rounded text-sm text-pdm-fg focus:outline-none focus:border-pdm-accent resize-none"
                placeholder="Special instructions, requirements, etc."
              />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="samples" checked={rfq.requires_samples} className="rounded" />
              <label htmlFor="samples" className="text-xs text-pdm-fg">Requires samples</label>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="fai" checked={rfq.requires_first_article} className="rounded" />
              <label htmlFor="fai" className="text-xs text-pdm-fg">Requires first article inspection</label>
            </div>
          </div>
        )}
      </div>

      {/* Footer actions */}
      {rfq.status === 'ready' && (
        <div className="p-3 border-t border-pdm-border">
          <button className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-pdm-success hover:bg-pdm-success/90 text-white rounded text-sm font-medium transition-colors">
            <Send size={16} />
            Send to Suppliers
          </button>
        </div>
      )}
    </div>
  )
}

// New RFQ Dialog
function NewRFQDialog({ 
  onClose, 
  onCreate 
}: { 
  onClose: () => void
  onCreate: (rfq: RFQ) => void 
}) {
  const { organization, user, addToast } = usePDMStore()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)

  const handleCreate = async () => {
    if (!title.trim()) {
      addToast('error', 'Please enter a title')
      return
    }
    if (!organization?.id || !user?.id) return

    setLoading(true)
    try {
      // Generate RFQ number
      const { data: rfqNumber, error: numError } = await supabase
        .rpc('generate_rfq_number', { p_org_id: organization.id })

      if (numError) throw numError

      // Create RFQ
      const { data, error } = await supabase
        .from('rfqs')
        .insert({
          org_id: organization.id,
          rfq_number: rfqNumber,
          title: title.trim(),
          description: description.trim() || null,
          status: 'draft',
          created_by: user.id
        })
        .select()
        .single()

      if (error) throw error

      addToast('success', `Created RFQ ${rfqNumber}`)
      onCreate(data)
    } catch (err) {
      console.error('Failed to create RFQ:', err)
      addToast('error', 'Failed to create RFQ')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-pdm-bg border border-pdm-border rounded-lg w-full max-w-md mx-4 shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-pdm-border">
          <h3 className="text-sm font-medium text-pdm-fg">New RFQ</h3>
          <button onClick={onClose} className="text-pdm-fg-muted hover:text-pdm-fg">
            <X size={16} />
          </button>
        </div>
        
        <div className="p-4 space-y-4">
          <div>
            <label className="text-xs text-pdm-fg-muted block mb-1">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., CNC Parts for Assembly XYZ"
              className="w-full px-3 py-2 bg-pdm-input border border-pdm-border rounded text-sm text-pdm-fg placeholder:text-pdm-fg-muted focus:outline-none focus:border-pdm-accent"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs text-pdm-fg-muted block mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional details about this RFQ..."
              rows={3}
              className="w-full px-3 py-2 bg-pdm-input border border-pdm-border rounded text-sm text-pdm-fg placeholder:text-pdm-fg-muted focus:outline-none focus:border-pdm-accent resize-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-pdm-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-pdm-fg-muted hover:text-pdm-fg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={loading || !title.trim()}
            className="px-4 py-2 bg-pdm-accent hover:bg-pdm-accent/90 text-white text-sm font-medium rounded disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            Create RFQ
          </button>
        </div>
      </div>
    </div>
  )
}

// Main RFQ View Component
export function RFQView() {
  const [selectedRFQ, setSelectedRFQ] = useState<RFQ | null>(null)
  const [showNewDialog, setShowNewDialog] = useState(false)

  const handleRFQCreated = (rfq: RFQ) => {
    setShowNewDialog(false)
    setSelectedRFQ(rfq)
  }

  const handleRFQUpdated = (rfq: RFQ) => {
    setSelectedRFQ(rfq)
  }

  return (
    <>
      {selectedRFQ ? (
        <RFQDetailView 
          rfq={selectedRFQ} 
          onBack={() => setSelectedRFQ(null)}
          onUpdate={handleRFQUpdated}
        />
      ) : (
        <RFQListView 
          onSelectRFQ={setSelectedRFQ}
          onNewRFQ={() => setShowNewDialog(true)}
        />
      )}

      {showNewDialog && (
        <NewRFQDialog 
          onClose={() => setShowNewDialog(false)}
          onCreate={handleRFQCreated}
        />
      )}
    </>
  )
}


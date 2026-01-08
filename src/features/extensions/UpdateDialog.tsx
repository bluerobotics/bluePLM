/**
 * UpdateDialog - Extension update dialog with changelog and rollback options
 * 
 * Shows:
 * - Current and new version
 * - Changelog
 * - Breaking changes warning
 * - Update and rollback options
 */
import { useState, useEffect, useMemo } from 'react'
import {
  X, RefreshCw, CheckCircle2, XCircle, AlertTriangle, RotateCcw
} from 'lucide-react'
import { usePDMStore } from '@/stores/pdmStore'

interface UpdateDialogProps {
  extensionId: string | null
  open: boolean
  onClose: () => void
}

type UpdateState = 'review' | 'updating' | 'rolling-back' | 'success' | 'error'

export function UpdateDialog({
  extensionId,
  open,
  onClose,
}: UpdateDialogProps) {
  const [updateState, setUpdateState] = useState<UpdateState>('review')
  const [error, setError] = useState<string | null>(null)
  const [action, setAction] = useState<'update' | 'rollback'>('update')
  
  const installedExtensions = usePDMStore(s => s.installedExtensions)
  const availableUpdates = usePDMStore(s => s.availableUpdates)
  const installProgress = usePDMStore(s => s.installProgress)
  const updateExtension = usePDMStore(s => s.updateExtension)
  const rollbackExtension = usePDMStore(s => s.rollbackExtension)
  const addToast = usePDMStore(s => s.addToast)

  // Find the extension and update info
  const { installed, update } = useMemo(() => {
    if (!extensionId) return { installed: null, update: null }
    
    const installed = installedExtensions[extensionId]
    const update = availableUpdates.find(u => u.extensionId === extensionId)
    
    return { installed, update }
  }, [extensionId, installedExtensions, availableUpdates])

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setUpdateState('review')
      setError(null)
      setAction('update')
    }
  }, [open, extensionId])

  // Handle update
  const handleUpdate = async () => {
    if (!extensionId) return
    
    setAction('update')
    setUpdateState('updating')
    setError(null)
    
    try {
      const result = await updateExtension(extensionId, update?.newVersion)
      
      if (result.success) {
        setUpdateState('success')
        addToast('success', `${installed?.manifest.name || extensionId} updated successfully`)
      } else {
        setError(result.error || 'Update failed')
        setUpdateState('error')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
      setUpdateState('error')
    }
  }

  // Handle rollback
  const handleRollback = async () => {
    if (!extensionId) return
    
    setAction('rollback')
    setUpdateState('rolling-back')
    setError(null)
    
    try {
      const result = await rollbackExtension(extensionId)
      
      if (result.success) {
        setUpdateState('success')
        addToast('success', `${installed?.manifest.name || extensionId} rolled back successfully`)
      } else {
        setError(result.error || 'Rollback failed')
        setUpdateState('error')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rollback failed')
      setUpdateState('error')
    }
  }

  if (!open || !extensionId) return null

  const name = installed?.manifest.name || extensionId
  const currentVersion = update?.currentVersion || installed?.manifest.version || '0.0.0'
  const newVersion = update?.newVersion || 'Unknown'
  const isBreaking = update?.breaking || false
  const changelog = update?.changelog

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="w-full max-w-md bg-gray-900 rounded-xl shadow-2xl border border-gray-700 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-800">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-200 
              hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
          
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <RefreshCw size={24} className="text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-100">Update Extension</h2>
              <p className="text-sm text-gray-400">{name}</p>
            </div>
          </div>
        </div>
        
        {/* Content */}
        <div className="p-6">
          {/* Review state */}
          {updateState === 'review' && (
            <>
              {/* Version info */}
              <div className="flex items-center justify-center gap-4 mb-6 py-4 bg-gray-800/50 rounded-lg">
                <div className="text-center">
                  <div className="text-xs text-gray-500 uppercase">Current</div>
                  <div className="text-lg font-mono text-gray-300">v{currentVersion}</div>
                </div>
                <div className="text-2xl text-gray-600">→</div>
                <div className="text-center">
                  <div className="text-xs text-gray-500 uppercase">New</div>
                  <div className="text-lg font-mono text-blue-400">v{newVersion}</div>
                </div>
              </div>
              
              {/* Breaking changes warning */}
              {isBreaking && (
                <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <div className="flex items-center gap-2 text-amber-400 font-medium mb-1">
                    <AlertTriangle size={16} />
                    Breaking Changes
                  </div>
                  <p className="text-sm text-amber-300">
                    This update contains breaking changes. Review the changelog carefully before updating.
                  </p>
                </div>
              )}
              
              {/* Changelog */}
              {changelog && (
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    What's New
                  </h3>
                  <div className="p-3 rounded-lg bg-gray-800/50 text-sm text-gray-300 whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {changelog}
                  </div>
                </div>
              )}
              
              {/* No changelog */}
              {!changelog && (
                <div className="mb-4 text-center py-4">
                  <p className="text-sm text-gray-500">No changelog available for this update.</p>
                </div>
              )}
            </>
          )}
          
          {/* Updating state */}
          {(updateState === 'updating' || updateState === 'rolling-back') && (
            <div className="py-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-500/20 flex items-center justify-center">
                <RefreshCw size={32} className="text-blue-400 animate-spin" />
              </div>
              <h3 className="text-lg font-semibold text-gray-100 mb-2">
                {updateState === 'updating' ? 'Updating...' : 'Rolling back...'}
              </h3>
              <p className="text-sm text-gray-400">
                {installProgress?.message || 'Please wait...'}
              </p>
              {installProgress && (
                <div className="mt-4 w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${installProgress.percent}%` }}
                  />
                </div>
              )}
            </div>
          )}
          
          {/* Success state */}
          {updateState === 'success' && (
            <div className="py-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
                <CheckCircle2 size={32} className="text-green-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-100 mb-2">
                {action === 'update' ? 'Updated Successfully' : 'Rolled Back Successfully'}
              </h3>
              <p className="text-sm text-gray-400">
                {name} is now {action === 'update' ? `on version ${newVersion}` : `back to the previous version`}.
              </p>
            </div>
          )}
          
          {/* Error state */}
          {updateState === 'error' && (
            <div className="py-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
                <XCircle size={32} className="text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-100 mb-2">
                {action === 'update' ? 'Update Failed' : 'Rollback Failed'}
              </h3>
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="p-6 border-t border-gray-800 flex justify-between">
          {updateState === 'review' && (
            <>
              <button
                onClick={handleRollback}
                className="px-4 py-2 bg-gray-700/50 hover:bg-gray-700 text-gray-300 
                  rounded-lg transition-colors flex items-center gap-2"
              >
                <RotateCcw size={16} />
                Rollback
              </button>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-gray-400 hover:text-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdate}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg 
                    transition-colors flex items-center gap-2"
                >
                  <RefreshCw size={16} />
                  Update
                </button>
              </div>
            </>
          )}
          
          {(updateState === 'updating' || updateState === 'rolling-back') && (
            <div className="w-full flex justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-400 hover:text-gray-200 transition-colors"
              >
                Run in background
              </button>
            </div>
          )}
          
          {(updateState === 'success' || updateState === 'error') && (
            <div className="w-full flex justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

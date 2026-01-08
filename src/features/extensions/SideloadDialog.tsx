/**
 * SideloadDialog - Install extension from local .bpx file
 * 
 * Shows a prominent warning about sideloading risks:
 * - Extension is not verified
 * - Could contain malicious code
 * - Use at your own risk
 */
import { useState, useEffect, useCallback } from 'react'
import {
  X, Upload, CheckCircle2, XCircle, AlertTriangle, FileWarning, FolderOpen
} from 'lucide-react'
import { usePDMStore } from '@/stores/pdmStore'

interface SideloadDialogProps {
  open: boolean
  onClose: () => void
}

type SideloadState = 'select' | 'warning' | 'installing' | 'success' | 'error'

export function SideloadDialog({
  open,
  onClose,
}: SideloadDialogProps) {
  const [sideloadState, setSideloadState] = useState<SideloadState>('select')
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [warningAccepted, setWarningAccepted] = useState(false)
  
  const installProgress = usePDMStore(s => s.installProgress)
  const sideloadExtension = usePDMStore(s => s.sideloadExtension)
  const addToast = usePDMStore(s => s.addToast)

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setSideloadState('select')
      setSelectedFile(null)
      setFileName(null)
      setError(null)
      setWarningAccepted(false)
    }
  }, [open])

  // Handle file selection
  const handleSelectFile = async () => {
    try {
      const result = await window.electronAPI?.selectFiles()
      
      if (result?.success && result.files && result.files.length > 0) {
        const file = result.files[0]
        if (file.path.endsWith('.bpx')) {
          setSelectedFile(file.path)
          setFileName(file.name)
          setSideloadState('warning')
        } else {
          setError('Please select a .bpx extension package file')
          setSideloadState('error')
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to select file')
      setSideloadState('error')
    }
  }

  // Handle drag and drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    const files = e.dataTransfer.files
    if (files.length > 0) {
      const file = files[0]
      if (file.name.endsWith('.bpx')) {
        const path = window.electronAPI?.getPathForFile?.(file)
        if (path) {
          setSelectedFile(path)
          setFileName(file.name)
          setSideloadState('warning')
        }
      } else {
        setError('Please drop a .bpx extension package file')
        setSideloadState('error')
      }
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  // Handle installation
  const handleInstall = async () => {
    if (!selectedFile) return
    
    setSideloadState('installing')
    setError(null)
    
    try {
      const result = await sideloadExtension(selectedFile, true)
      
      if (result.success) {
        setSideloadState('success')
        addToast('success', `Extension installed from ${fileName}`)
      } else {
        setError(result.error || 'Installation failed')
        setSideloadState('error')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Installation failed')
      setSideloadState('error')
    }
  }

  if (!open) return null

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
            <div className="w-12 h-12 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <Upload size={24} className="text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-100">Sideload Extension</h2>
              <p className="text-sm text-gray-400">Install from a local .bpx file</p>
            </div>
          </div>
        </div>
        
        {/* Content */}
        <div className="p-6">
          {/* Select state */}
          {sideloadState === 'select' && (
            <div
              className="border-2 border-dashed border-gray-700 rounded-lg p-8 text-center 
                hover:border-gray-600 transition-colors cursor-pointer"
              onClick={handleSelectFile}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
            >
              <FolderOpen size={48} className="mx-auto mb-4 text-gray-500" />
              <p className="text-gray-300 mb-2">
                Drop a .bpx file here or click to browse
              </p>
              <p className="text-sm text-gray-500">
                Only install extensions from sources you trust
              </p>
            </div>
          )}
          
          {/* Warning state */}
          {sideloadState === 'warning' && (
            <>
              {/* Selected file */}
              <div className="mb-4 p-3 rounded-lg bg-gray-800/50 flex items-center gap-3">
                <FileWarning size={24} className="text-amber-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm text-gray-200 truncate">{fileName}</div>
                  <div className="text-xs text-gray-500 truncate">{selectedFile}</div>
                </div>
              </div>
              
              {/* Warning */}
              <div className="mb-4 p-4 rounded-lg bg-red-500/10 border border-red-500/30">
                <div className="flex items-center gap-2 text-red-400 font-semibold mb-2">
                  <AlertTriangle size={20} />
                  Security Warning
                </div>
                <ul className="space-y-2 text-sm text-red-300">
                  <li className="flex items-start gap-2">
                    <span className="text-red-500 mt-0.5">•</span>
                    <span>This extension has not been verified by Blue Robotics</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-500 mt-0.5">•</span>
                    <span>It could contain malicious code that may harm your system</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-500 mt-0.5">•</span>
                    <span>Only install extensions from developers you trust</span>
                  </li>
                </ul>
              </div>
              
              {/* Checkbox */}
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={warningAccepted}
                  onChange={e => setWarningAccepted(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded border-gray-600 bg-gray-800 text-red-600 
                    focus:ring-red-500 focus:ring-offset-gray-900"
                />
                <span className="text-sm text-gray-300">
                  I understand the risks and want to install this extension anyway
                </span>
              </label>
            </>
          )}
          
          {/* Installing state */}
          {sideloadState === 'installing' && (
            <div className="py-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-500/20 flex items-center justify-center">
                <Upload size={32} className="text-amber-400 animate-bounce" />
              </div>
              <h3 className="text-lg font-semibold text-gray-100 mb-2">Installing...</h3>
              <p className="text-sm text-gray-400">
                {installProgress?.message || 'Please wait...'}
              </p>
              {installProgress && (
                <div className="mt-4 w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-amber-500 transition-all duration-300"
                    style={{ width: `${installProgress.percent}%` }}
                  />
                </div>
              )}
            </div>
          )}
          
          {/* Success state */}
          {sideloadState === 'success' && (
            <div className="py-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
                <CheckCircle2 size={32} className="text-green-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-100 mb-2">Installed Successfully</h3>
              <p className="text-sm text-gray-400">
                The extension has been sideloaded and is ready to use.
              </p>
              <p className="text-xs text-amber-400 mt-2">
                Remember: This extension is not verified and runs at your own risk.
              </p>
            </div>
          )}
          
          {/* Error state */}
          {sideloadState === 'error' && (
            <div className="py-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
                <XCircle size={32} className="text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-100 mb-2">Installation Failed</h3>
              <p className="text-sm text-red-400">{error}</p>
              <button
                onClick={() => setSideloadState('select')}
                className="mt-4 text-sm text-blue-400 hover:text-blue-300"
              >
                Try again
              </button>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="p-6 border-t border-gray-800 flex justify-end gap-3">
          {sideloadState === 'select' && (
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-400 hover:text-gray-200 transition-colors"
            >
              Cancel
            </button>
          )}
          
          {sideloadState === 'warning' && (
            <>
              <button
                onClick={() => setSideloadState('select')}
                className="px-4 py-2 text-gray-400 hover:text-gray-200 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleInstall}
                disabled={!warningAccepted}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg 
                  transition-colors disabled:opacity-50 disabled:cursor-not-allowed 
                  flex items-center gap-2"
              >
                <Upload size={16} />
                Install Anyway
              </button>
            </>
          )}
          
          {sideloadState === 'installing' && (
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-400 hover:text-gray-200 transition-colors"
            >
              Run in background
            </button>
          )}
          
          {(sideloadState === 'success' || sideloadState === 'error') && (
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

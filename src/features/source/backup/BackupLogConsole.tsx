import { useRef, useEffect, useState } from 'react'
import { Copy, Trash2, Filter, ChevronDown } from 'lucide-react'
import type { BackupLogEntry, BackupLogFilter } from './types'

interface BackupLogConsoleProps {
  logs: BackupLogEntry[]
  filter: BackupLogFilter
  onFilterChange: (filter: BackupLogFilter) => void
  onCopy: () => void
  onClear: () => void
}

const LOG_LEVEL_STYLES: Record<string, { text: string; bg: string; label: string }> = {
  info: { text: 'text-slate-400', bg: 'bg-slate-500/10', label: 'INFO' },
  warn: { text: 'text-amber-400', bg: 'bg-amber-500/10', label: 'WARN' },
  error: { text: 'text-red-400', bg: 'bg-red-500/10', label: 'ERROR' },
  success: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'OK' },
  debug: { text: 'text-blue-400', bg: 'bg-blue-500/10', label: 'DEBUG' }
}

const FILTER_OPTIONS: { value: BackupLogFilter; label: string }[] = [
  { value: 'all', label: 'All Logs' },
  { value: 'errors', label: 'Errors & Warnings' },
  { value: 'current', label: 'Current Phase' }
]

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

/**
 * Terminal-style log console for backup operations.
 * Features auto-scroll, pause on hover, and color-coded log levels.
 */
export function BackupLogConsole({
  logs,
  filter,
  onFilterChange,
  onCopy,
  onClear
}: BackupLogConsoleProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isHovering, setIsHovering] = useState(false)
  const [showFilterMenu, setShowFilterMenu] = useState(false)
  
  // Auto-scroll to bottom when new logs arrive (unless hovering)
  useEffect(() => {
    if (containerRef.current && !isHovering) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [logs, isHovering])
  
  return (
    <div className="flex flex-col border border-plm-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-plm-bg-tertiary border-b border-plm-border">
        <span className="text-xs font-medium text-plm-fg-muted">Console Output</span>
        
        <div className="flex items-center gap-1">
          {/* Filter dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowFilterMenu(!showFilterMenu)}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-plm-bg-secondary text-plm-fg-muted hover:text-plm-fg"
            >
              <Filter className="w-3 h-3" />
              {FILTER_OPTIONS.find(o => o.value === filter)?.label}
              <ChevronDown className="w-3 h-3" />
            </button>
            
            {showFilterMenu && (
              <>
                <div 
                  className="fixed inset-0 z-10" 
                  onClick={() => setShowFilterMenu(false)} 
                />
                <div className="absolute right-0 top-full mt-1 z-20 bg-plm-bg-secondary border border-plm-border rounded-md shadow-lg py-1 min-w-[140px]">
                  {FILTER_OPTIONS.map(option => (
                    <button
                      key={option.value}
                      onClick={() => {
                        onFilterChange(option.value)
                        setShowFilterMenu(false)
                      }}
                      className={`w-full px-3 py-1.5 text-left text-xs hover:bg-plm-bg-tertiary ${
                        filter === option.value ? 'text-plm-accent' : 'text-plm-fg'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          
          {/* Copy button */}
          <button
            onClick={onCopy}
            className="p-1.5 rounded hover:bg-plm-bg-secondary text-plm-fg-muted hover:text-plm-fg"
            title="Copy logs to clipboard"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          
          {/* Clear button */}
          <button
            onClick={onClear}
            className="p-1.5 rounded hover:bg-plm-bg-secondary text-plm-fg-muted hover:text-red-400"
            title="Clear logs"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      
      {/* Log content */}
      <div
        ref={containerRef}
        className="h-48 overflow-y-auto bg-[#0d1117] font-mono text-xs p-2 space-y-0.5"
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        {logs.length === 0 ? (
          <div className="text-slate-500 italic">No logs yet...</div>
        ) : (
          logs.map((log, index) => {
            const style = LOG_LEVEL_STYLES[log.level] || LOG_LEVEL_STYLES.info
            
            return (
              <div
                key={`${log.timestamp}-${index}`}
                className={`flex gap-2 py-0.5 px-1 rounded ${style.bg}`}
              >
                {/* Timestamp */}
                <span className="text-slate-500 shrink-0">
                  {formatTimestamp(log.timestamp)}
                </span>
                
                {/* Level badge */}
                <span className={`shrink-0 w-12 text-center ${style.text}`}>
                  [{style.label}]
                </span>
                
                {/* Phase */}
                <span className="text-slate-500 shrink-0">
                  [{log.phase}]
                </span>
                
                {/* Message */}
                <span className={style.text}>
                  {log.message}
                </span>
              </div>
            )
          })
        )}
      </div>
      
      {/* Scroll hint when hovering */}
      {isHovering && logs.length > 10 && (
        <div className="text-center text-[10px] text-slate-500 py-0.5 bg-[#0d1117] border-t border-slate-800">
          Auto-scroll paused
        </div>
      )}
    </div>
  )
}

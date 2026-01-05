import { FileText, CheckCircle2, Clock, AlertTriangle } from 'lucide-react'

export function GSDView() {
  return (
    <div className="flex flex-col h-full">
      {/* Quick stats header */}
      <div className="p-4 border-b border-plm-border">
        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col items-center p-2 bg-plm-highlight rounded">
            <CheckCircle2 size={14} className="text-plm-success mb-1" />
            <span className="text-lg font-bold text-plm-fg">0</span>
            <span className="text-[9px] text-plm-fg-muted">Done</span>
          </div>
          <div className="flex flex-col items-center p-2 bg-plm-highlight rounded">
            <Clock size={14} className="text-plm-info mb-1" />
            <span className="text-lg font-bold text-plm-fg">0</span>
            <span className="text-[9px] text-plm-fg-muted">In Progress</span>
          </div>
          <div className="flex flex-col items-center p-2 bg-plm-highlight rounded">
            <AlertTriangle size={14} className="text-plm-warning mb-1" />
            <span className="text-lg font-bold text-plm-fg">0</span>
            <span className="text-[9px] text-plm-fg-muted">Blocked</span>
          </div>
        </div>
      </div>
      
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-plm-highlight flex items-center justify-center mb-4">
          <FileText size={32} className="text-plm-fg-muted" />
        </div>
        <h3 className="text-sm font-medium text-plm-fg mb-2">GSD Summary</h3>
        <p className="text-xs text-plm-fg-muted max-w-[200px]">
          Getting Stuff Done — your ECO dashboard. Track progress, blockers, and what needs attention.
        </p>
        <div className="mt-6 px-3 py-1.5 bg-plm-warning/20 text-plm-warning text-[10px] font-medium rounded">
          COMING SOON
        </div>
      </div>
    </div>
  )
}


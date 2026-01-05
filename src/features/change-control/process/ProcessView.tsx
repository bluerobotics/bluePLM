import { Network, Plus } from 'lucide-react'

export function ProcessView() {
  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-plm-border">
        <button className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-plm-accent hover:bg-plm-accent/90 text-white rounded text-sm font-medium transition-colors">
          <Plus size={16} />
          New Process
        </button>
      </div>
      
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-plm-highlight flex items-center justify-center mb-4">
          <Network size={32} className="text-plm-fg-muted" />
        </div>
        <h3 className="text-sm font-medium text-plm-fg mb-2">ECO Process Editor</h3>
        <p className="text-xs text-plm-fg-muted max-w-[200px]">
          Design and customize ECO workflows. Define stages, gates, approvers, and automation rules.
        </p>
        <div className="mt-6 px-3 py-1.5 bg-plm-warning/20 text-plm-warning text-[10px] font-medium rounded">
          COMING SOON
        </div>
      </div>
    </div>
  )
}


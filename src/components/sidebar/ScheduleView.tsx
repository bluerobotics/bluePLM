import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'

export function ScheduleView() {
  const today = new Date()
  const monthName = today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  
  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-plm-border">
        <div className="flex items-center justify-between">
          <button className="p-1 hover:bg-plm-highlight rounded text-plm-fg-muted hover:text-plm-fg">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-medium text-plm-fg">{monthName}</span>
          <button className="p-1 hover:bg-plm-highlight rounded text-plm-fg-muted hover:text-plm-fg">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-plm-highlight flex items-center justify-center mb-4">
          <Calendar size={32} className="text-plm-fg-muted" />
        </div>
        <h3 className="text-sm font-medium text-plm-fg mb-2">ECO Schedule</h3>
        <p className="text-xs text-plm-fg-muted max-w-[200px]">
          Timeline view of ECO milestones, deadlines, and release dates. Plan and track change implementation.
        </p>
        <div className="mt-6 px-3 py-1.5 bg-plm-warning/20 text-plm-warning text-[10px] font-medium rounded">
          COMING SOON
        </div>
      </div>
    </div>
  )
}


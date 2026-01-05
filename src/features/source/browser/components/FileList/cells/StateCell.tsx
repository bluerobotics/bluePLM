/**
 * State column cell renderer
 */
import type { CellRendererBaseProps } from './types'

export function StateCell({ file }: CellRendererBaseProps): React.ReactNode {
  if (file.isDirectory) return null
  
  const workflowState = file.pdmData?.workflow_state
  if (!workflowState) {
    return <span className="text-plm-fg-muted text-xs">—</span>
  }
  
  return (
    <span 
      className="px-2 py-0.5 rounded text-xs font-medium"
      style={{ 
        backgroundColor: workflowState.color + '30',
        color: workflowState.color
      }}
      title={`${workflowState.label || workflowState.name}${workflowState.is_editable ? ' (editable)' : ' (locked)'}`}
    >
      {workflowState.label || workflowState.name}
    </span>
  )
}

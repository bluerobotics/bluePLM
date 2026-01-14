/**
 * Checked Out By column cell renderer
 */
import { Monitor } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { NotifiableCheckoutAvatar } from '@/components/shared/Avatar'
import { useFilePaneContext } from '../../../context'
import type { CellRendererBaseProps } from './types'

export function CheckedOutByCell({ file }: CellRendererBaseProps): React.ReactNode {
  const { user, currentMachineId } = useFilePaneContext()
  
  if (file.isDirectory || !file.pdmData?.checked_out_by) return ''
  
  const checkedOutUser = file.pdmData?.checked_out_user
  const avatarUrl = checkedOutUser?.avatar_url
  const fullName = checkedOutUser?.full_name
  const email = checkedOutUser?.email
  const displayName = fullName || email?.split('@')[0] || 'Unknown'
  const tooltipName = fullName || email || 'Unknown'
  const isMe = user?.id === file.pdmData.checked_out_by
  const coMachineId = file.pdmData.checked_out_by_machine_id
  const coMachineName = file.pdmData.checked_out_by_machine_name
  const onDifferentMachine = isMe && coMachineId && currentMachineId && coMachineId !== currentMachineId
  
  // For other users' checkouts, show the interactive avatar that can send notifications
  if (!isMe && file.pdmData.id && checkedOutUser) {
    return (
      <span className="flex items-center gap-2 text-plm-fg">
        <NotifiableCheckoutAvatar
          user={{
            id: file.pdmData.checked_out_by,
            email: email,
            full_name: fullName,
            avatar_url: avatarUrl
          }}
          fileId={file.pdmData.id}
          fileName={file.name}
          size={20}
        />
        <span className="truncate">{displayName}</span>
      </span>
    )
  }
  
  // For own checkouts, show the standard display
  return (
    <span 
      className={`flex items-center gap-2 ${isMe ? (onDifferentMachine ? 'text-plm-warning' : 'text-plm-warning') : 'text-plm-fg'}`} 
      title={onDifferentMachine ? `Checked out by you on ${coMachineName || 'another computer'}` : tooltipName}
    >
      <div className="relative w-5 h-5 flex-shrink-0">
        {avatarUrl ? (
          <img 
            src={avatarUrl} 
            alt={displayName}
            title={tooltipName}
            className="w-5 h-5 rounded-full object-cover"
            referrerPolicy="no-referrer"
            onError={(e) => {
              const target = e.target as HTMLImageElement
              target.style.display = 'none'
              target.nextElementSibling?.classList.remove('hidden')
            }}
          />
        ) : null}
        <div 
          className={`w-5 h-5 rounded-full ${onDifferentMachine ? 'bg-plm-warning/30' : 'bg-plm-accent/30'} flex items-center justify-center text-xs absolute inset-0 ${avatarUrl ? 'hidden' : ''}`}
          title={tooltipName}
        >
          {getInitials(displayName)}
        </div>
        {/* Machine indicator for different machine */}
        {onDifferentMachine && (
          <div 
            className="absolute -bottom-0.5 -right-0.5 bg-plm-warning rounded-full flex items-center justify-center"
            style={{ width: 10, height: 10 }}
            title={`Checked out on ${coMachineName || 'another computer'}`}
          >
            <Monitor size={7} className="text-plm-bg" />
          </div>
        )}
      </div>
      <span className="truncate">{displayName}</span>
      {onDifferentMachine && (
        <span className="text-[10px] text-plm-warning opacity-75">({coMachineName || 'other PC'})</span>
      )}
    </span>
  )
}

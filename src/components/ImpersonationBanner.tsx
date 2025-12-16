import { UserCog, X, Shield, Wrench, Eye } from 'lucide-react'
import { usePDMStore } from '@/stores/pdmStore'

const roleInfo = {
  admin: { icon: Shield, label: 'Admin', color: 'text-violet-400' },
  engineer: { icon: Wrench, label: 'Engineer', color: 'text-blue-400' },
  viewer: { icon: Eye, label: 'Viewer', color: 'text-emerald-400' },
} as const

export function ImpersonationBanner() {
  const { impersonatedRole, setImpersonatedRole, user } = usePDMStore()
  
  // Only show banner when impersonating a role
  if (!impersonatedRole) return null
  
  const role = roleInfo[impersonatedRole]
  const Icon = role.icon
  
  return (
    <div className="flex items-center justify-center gap-3 px-4 py-1.5 bg-amber-500/15 border-b border-amber-500/30 text-amber-200 text-sm">
      <UserCog size={14} className="text-amber-400" />
      <span>
        Viewing as <Icon size={12} className={`inline ${role.color} mx-1`} />
        <span className="font-medium">{role.label}</span>
        <span className="text-amber-200/60 ml-1">
          (your actual role: {user?.role ?? 'unknown'})
        </span>
      </span>
      <button
        onClick={() => setImpersonatedRole(null)}
        className="ml-2 p-1 rounded hover:bg-amber-500/20 transition-colors text-amber-400 hover:text-amber-300"
        title="Stop impersonating"
      >
        <X size={14} />
      </button>
    </div>
  )
}


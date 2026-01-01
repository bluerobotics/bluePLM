import { X, Shield, User, Database, Users } from 'lucide-react'
import { usePDMStore } from '@/stores/pdmStore'

export function ImpersonationBanner() {
  const { 
    impersonatedUser, 
    stopUserImpersonation 
  } = usePDMStore()
  
  if (!impersonatedUser) return null
  
  const isAdmin = impersonatedUser.role === 'admin'
  const teamCount = impersonatedUser.teams.length
  const vaultCount = impersonatedUser.vaultIds.length
  const permCount = Object.keys(impersonatedUser.permissions).filter(k => k !== '__admin__').length
  
  return (
    <div className="flex items-center justify-center gap-3 px-4 py-1.5 bg-cyan-500/15 border-b border-cyan-500/30 text-cyan-200 text-sm">
      <User size={14} className="text-cyan-400" />
      <span>
        Viewing as{' '}
        <span className="font-medium text-cyan-100">
          {impersonatedUser.full_name || impersonatedUser.email}
        </span>
        {isAdmin && (
          <span className="text-cyan-200/60 ml-1.5">
            <Shield size={12} className="inline text-violet-400 mx-0.5" />
            Admin
          </span>
        )}
      </span>
      
      {/* Permission summary badges */}
      <span className="flex items-center gap-2 ml-2 text-cyan-200/50">
        <span className="flex items-center gap-1" title={`${teamCount} team${teamCount !== 1 ? 's' : ''}`}>
          <Users size={11} />
          {teamCount}
        </span>
        {vaultCount > 0 && (
          <span className="flex items-center gap-1" title={`${vaultCount} vault${vaultCount !== 1 ? 's' : ''} accessible`}>
            <Database size={11} />
            {vaultCount}
          </span>
        )}
        {vaultCount === 0 && (
          <span className="flex items-center gap-1 text-cyan-200/30" title="All vaults accessible">
            <Database size={11} />
            all
          </span>
        )}
        {permCount > 0 && (
          <span className="flex items-center gap-1" title={`${permCount} resource permission${permCount !== 1 ? 's' : ''}`}>
            <Shield size={11} />
            {permCount}
          </span>
        )}
      </span>
      
      <button
        onClick={stopUserImpersonation}
        className="ml-2 p-1 rounded hover:bg-cyan-500/20 transition-colors text-cyan-400 hover:text-cyan-300"
        title="Stop viewing as this user"
      >
        <X size={14} />
      </button>
    </div>
  )
}

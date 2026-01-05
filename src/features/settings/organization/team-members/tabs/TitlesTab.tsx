/**
 * TitlesTab - Displays and manages job titles
 * 
 * Shows a list of job titles with assigned users and admin actions
 * for editing and deleting titles.
 */
import * as LucideIcons from 'lucide-react'
import { Briefcase, Plus, Pencil, Trash2 } from 'lucide-react'
import { getInitials, getEffectiveAvatarUrl } from '@/types/pdm'
import { useTeamMembersContext } from '../context'

export function TitlesTab() {
  const {
    jobTitles,
    orgUsers,
    searchQuery,
    isAdmin,
    openEditJobTitle,
    openCreateJobTitle,
    handleDeleteJobTitle
  } = useTeamMembersContext()

  const filteredTitles = jobTitles.filter(t => 
    !searchQuery || t.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (filteredTitles.length === 0) {
    return (
      <div className="space-y-3">
        <div className="text-center py-8 border border-dashed border-plm-border rounded-lg">
          <Briefcase size={36} className="mx-auto text-plm-fg-muted mb-3 opacity-50" />
          <p className="text-sm text-plm-fg-muted mb-4">
            {searchQuery ? 'No matching job titles' : 'No job titles yet'}
          </p>
          {isAdmin && !searchQuery && (
            <button
              onClick={openCreateJobTitle}
              className="btn btn-primary btn-sm"
            >
              <Plus size={14} className="mr-1" />
              Create First Title
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="border border-plm-border rounded-lg overflow-hidden bg-plm-bg/50">
        <div className="divide-y divide-plm-border/50">
          {filteredTitles.map(title => {
            const TitleIcon = (LucideIcons as unknown as Record<string, React.ComponentType<{ size?: number }>>)[title.icon] || Briefcase
            const usersWithTitle = orgUsers.filter(u => u.job_title?.id === title.id)
            
            return (
              <div
                key={title.id}
                className="flex items-center gap-3 p-3 hover:bg-plm-highlight/30 transition-colors group"
              >
                {/* Title icon */}
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${title.color}15`, color: title.color }}
                >
                  <TitleIcon size={20} />
                </div>
                
                {/* Title info */}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-plm-fg">{title.name}</div>
                  <div className="text-xs text-plm-fg-muted">
                    {usersWithTitle.length} user{usersWithTitle.length !== 1 ? 's' : ''}
                  </div>
                </div>
                
                {/* Users with this title */}
                {usersWithTitle.length > 0 && (
                  <div className="flex -space-x-2 flex-shrink-0">
                    {usersWithTitle.slice(0, 4).map(u => (
                      getEffectiveAvatarUrl(u) ? (
                        <img
                          key={u.id}
                          src={getEffectiveAvatarUrl(u) || ''}
                          alt={u.full_name || u.email}
                          className="w-7 h-7 rounded-full border-2 border-plm-bg-light object-cover"
                          title={u.full_name || u.email}
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div
                          key={u.id}
                          className="w-7 h-7 rounded-full bg-plm-fg-muted/20 flex items-center justify-center text-[10px] font-medium border-2 border-plm-bg-light"
                          title={u.full_name || u.email}
                        >
                          {getInitials(u.full_name || u.email)}
                        </div>
                      )
                    ))}
                    {usersWithTitle.length > 4 && (
                      <div className="w-7 h-7 rounded-full bg-plm-fg-muted/20 flex items-center justify-center text-[10px] font-medium border-2 border-plm-bg-light">
                        +{usersWithTitle.length - 4}
                      </div>
                    )}
                  </div>
                )}
                
                {/* Actions */}
                {isAdmin && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openEditJobTitle(title)}
                      className="p-1.5 text-plm-fg-muted hover:text-plm-accent hover:bg-plm-accent/10 rounded transition-colors"
                      title="Edit title"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteJobTitle(title)}
                      className="p-1.5 text-plm-fg-muted hover:text-plm-error hover:bg-plm-error/10 rounded transition-colors"
                      title="Delete title"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
      
      {/* Info footer */}
      <p className="text-xs text-plm-fg-muted">
        Job titles are display-only labels. Editing a title updates it for all users who have it assigned.
        All permissions come from teams.
      </p>
    </div>
  )
}

// Export props type for backward compatibility (can be removed later)
export type TitlesTabProps = Record<string, never>

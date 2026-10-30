import { useState, type ReactNode } from 'react'
import { FileText, FolderOpen, GitPullRequest, LogOut, Menu, Settings, Shield, X } from 'lucide-react'
import { Link } from '@web/lib/router'
import { useReadyAuth } from '@web/auth/AuthProvider'
import { useT } from '@web/i18n'
import { useReviewBadgeCount } from '@web/features/reviews/useReviewBadgeCount'

export type Section = 'files' | 'reviews' | 'changeControl' | 'admin' | 'account'

const SECTION_PATHS: Record<Section, string> = {
  files: '/files',
  reviews: '/reviews',
  changeControl: '/eco',
  admin: '/admin',
  account: '/account',
}

export function Layout({ section, children }: { section: Section | null; children: ReactNode }) {
  const t = useT()
  const auth = useReadyAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const reviewCount = useReviewBadgeCount()

  const items: Array<{ id: Section; icon: ReactNode; show: boolean }> = [
    { id: 'files', icon: <FolderOpen size={16} />, show: true },
    { id: 'reviews', icon: <FileText size={16} />, show: true },
    { id: 'changeControl', icon: <GitPullRequest size={16} />, show: true },
    { id: 'admin', icon: <Shield size={16} />, show: auth.isAdmin },
    { id: 'account', icon: <Settings size={16} />, show: true },
  ]

  const nav = (
    <nav className="flex flex-col gap-0.5 p-2">
      {items
        .filter((item) => item.show)
        .map((item) => (
          <Link
            key={item.id}
            to={SECTION_PATHS[item.id]}
            onClick={() => setMenuOpen(false)}
            aria-current={section === item.id ? 'page' : undefined}
            className={`flex items-center gap-2 rounded px-3 py-2 text-sm ${
              section === item.id
                ? 'bg-plm-selection text-plm-fg'
                : 'text-plm-fg-dim hover:bg-plm-bg-lighter hover:text-plm-fg'
            }`}
          >
            {item.icon}
            {t(`shell.nav.${item.id}`)}
            {item.id === 'reviews' && !!reviewCount && (
              <span className="ml-auto rounded-full bg-plm-accent px-1.5 text-xxs font-medium text-white">
                {reviewCount > 99 ? '99+' : reviewCount}
              </span>
            )}
          </Link>
        ))}
    </nav>
  )

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-plm-border bg-plm-activitybar px-3">
        <button
          type="button"
          className="rounded p-1 text-plm-fg-dim hover:bg-plm-bg-lighter md:hidden"
          aria-label={t('shell.openMenu')}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
        <span className="font-semibold text-plm-fg">BluePLM</span>
        <span className="truncate text-sm text-plm-fg-muted">{auth.organization.name}</span>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden truncate text-sm text-plm-fg-dim sm:inline">
            {auth.profile.full_name || auth.profile.email}
          </span>
          <button
            type="button"
            onClick={() => void auth.signOut()}
            className="flex items-center gap-1 rounded px-2 py-1 text-sm text-plm-fg-dim hover:bg-plm-bg-lighter hover:text-plm-fg"
          >
            <LogOut size={14} />
            <span className="hidden sm:inline">{t('auth.signOut')}</span>
          </button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-52 shrink-0 border-r border-plm-border bg-plm-sidebar md:block">{nav}</aside>
        {menuOpen && (
          <aside className="absolute inset-x-0 top-11 z-20 border-b border-plm-border bg-plm-sidebar md:hidden">
            {nav}
          </aside>
        )}
        <main className="min-w-0 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  )
}

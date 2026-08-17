import { Link, useLocation } from 'react-router-dom'
import { useEffect, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'

interface Tab {
  to: string
  label: string
  icon: string
}

export function TabBarLayout({ tabs, children }: { tabs: Tab[]; children: ReactNode }) {
  const { pathname } = useLocation()
  const { user, signOutUser } = useAuth()

  return (
    <div className="min-h-full flex flex-col bg-slate-950">
      <header className="app-header safe-top px-4 py-3 flex items-center justify-between border-b border-slate-900">
        <div className="app-header-brand flex items-center gap-2">
          <span className="text-2xl">🪙</span>
          <span className="font-semibold">Chore Coin</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-400 hidden sm:inline">{user?.displayName}</span>
          <button onClick={signOutUser} className="text-sm text-slate-400 hover:text-slate-200">
            Sign out
          </button>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto px-4 py-4 pb-24">{children}</main>
      <nav
        className="fixed bottom-0 inset-x-0 z-10 border-t border-slate-800 bg-slate-950/95 backdrop-blur
                   safe-bottom"
      >
        <div className="mx-auto max-w-2xl flex">
          {tabs.map((t) => {
            const active = pathname === t.to || (t.to !== '/' && pathname.startsWith(t.to))
            return (
              <Link
                key={t.to}
                to={t.to}
                className={`flex-1 flex flex-col items-center justify-center py-2 text-xs
                            ${active ? 'text-brand-500' : 'text-slate-400 hover:text-slate-200'}`}
              >
                <span className="text-2xl leading-tight">{t.icon}</span>
                <span>{t.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className="text-sm text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

/**
 * Centered modal overlay used by the parent Manage* pages for the
 * "click Edit → full-form modal → Save" pattern. Click the backdrop or
 * press Escape to close; the inner card stops propagation so clicks
 * inside the form don't close it.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onEsc)
    // Prevent body scroll while modal is open so the underlying page
    // doesn't move around when the user scrolls the modal itself.
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onEsc)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 sticky top-0 bg-slate-900">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            className="text-slate-400 hover:text-slate-200 text-2xl leading-none w-8 h-8 flex items-center justify-center"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="p-6 space-y-4">{children}</div>
      </div>
    </div>
  )
}

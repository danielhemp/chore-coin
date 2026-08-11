/**
 * "Enable notifications" card — used on both ParentDashboard and KidHome.
 * Prompts for OS permission, subscribes via the browser push service, and
 * POSTs the subscription to the /api/custom/push-subscribe hook.
 */
import { useEffect, useState } from 'react'
import {
  getPushState,
  subscribeToPush,
  unsubscribeFromPush,
  type PushState,
} from '../lib/push'

export function PushCard({ label = 'notifications' }: { label?: string }) {
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    getPushState()
      .then(setState)
      .catch(() => setState('unsupported'))
  }, [])

  if (state === null || state === 'unsupported') return null

  const enable = async () => {
    setBusy(true)
    setErr(null)
    try {
      setState(await subscribeToPush())
    } catch (e: any) {
      setErr(e?.message || `Could not enable ${label}.`)
    } finally {
      setBusy(false)
    }
  }
  const disable = async () => {
    setBusy(true)
    setErr(null)
    try {
      setState(await unsubscribeFromPush())
    } catch (e: any) {
      setErr(e?.message || `Could not turn off ${label}.`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card mb-4 border-brand-800/60 bg-slate-900/70">
      {state === 'subscribed' ? (
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-semibold text-brand-300">🔔 Notifications on</div>
            <div className="text-xs text-slate-400">
              You'll get pinged when there's something to see here.
            </div>
          </div>
          <button className="btn-ghost text-sm" disabled={busy} onClick={disable}>
            Turn off
          </button>
        </div>
      ) : state === 'needs-install' ? (
        <div>
          <div className="font-semibold text-slate-100 mb-1">🔔 Enable {label}</div>
          <div className="text-xs text-slate-400">
            On iPhone, tap the Share button in Safari → <b>Add to Home Screen</b> first. Open
            Chore Coin from that home-screen icon and come back here to enable.
          </div>
        </div>
      ) : state === 'denied' ? (
        <div>
          <div className="font-semibold text-slate-100 mb-1">Notifications blocked</div>
          <div className="text-xs text-slate-400">
            You've blocked notifications for this site. Turn them on in your browser's site
            settings, then reload.
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-semibold text-slate-100">🔔 Enable {label}</div>
            <div className="text-xs text-slate-400">
              Get a native alert when something new happens.
            </div>
          </div>
          <button className="btn-primary" disabled={busy} onClick={enable}>
            {busy ? 'Enabling…' : 'Enable'}
          </button>
        </div>
      )}
      {err && <div className="text-xs text-red-400 mt-2">{err}</div>}
    </div>
  )
}

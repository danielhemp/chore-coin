import { useState } from 'react'
import { Link } from 'react-router-dom'
import { TabBarLayout, PageHeader } from '../../components/Layout'
import { PushCard } from '../../components/PushCard'
import {
  useBalance,
  useDailyStatus,
  useKids,
  useLocalDate,
  usePendingCompletions,
  usePendingRewardRequests,
} from '../../hooks/data'
import { adjustCoins } from '../../lib/actions'
import { formatShortDate } from '../../lib/dates'
import type { KidRecord } from '../../lib/types'

export const PARENT_TABS = [
  { to: '/', label: 'Home', icon: '🏠' },
  { to: '/approvals', label: 'Approve', icon: '✅' },
  { to: '/bonus-chores', label: 'Chores', icon: '📋' },
  { to: '/redemptions', label: 'Redeem', icon: '🪙' },
  { to: '/history', label: 'History', icon: '📜' },
]

function KidSummary({ kid }: { kid: KidRecord }) {
  const today = useLocalDate()
  const { balance } = useBalance(kid.id)
  const { status } = useDailyStatus(kid.id, today)
  const avail =
    (status?.baseScreenTimeGrantedMinutes ?? 0) +
    (status?.carryOverMinutes ?? 0) -
    (status?.baseScreenTimeUsedMinutes ?? 0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [flash, setFlash] = useState<'gain' | 'loss' | null>(null)

  const giveBonus = async () => {
    setBusy(true)
    setErr(null)
    try {
      await adjustCoins(kid.id, 1, 'Bonus')
      setFlash('gain')
      window.setTimeout(() => setFlash(null), 800)
    } catch (e: any) {
      setErr(e?.message || 'Could not award coin.')
    } finally {
      setBusy(false)
    }
  }

  const takeCoin = async () => {
    if (balance <= 0) return
    setBusy(true)
    setErr(null)
    try {
      await adjustCoins(kid.id, -1, 'Deduction')
      setFlash('loss')
      window.setTimeout(() => setFlash(null), 800)
    } catch (e: any) {
      setErr(e?.message || 'Could not deduct coin.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={`card transition-colors ${
        flash === 'gain'
          ? 'border-emerald-500 bg-emerald-950/30'
          : flash === 'loss'
            ? 'border-red-500 bg-red-950/30'
            : ''
      }`}
    >
      <div className="flex items-center gap-3">
        <Link
          to={`/kids/${kid.id}`}
          className="flex items-center gap-3 flex-1 min-w-0 -m-1 p-1 rounded hover:bg-slate-800/50"
        >
          <span className="text-4xl">{kid.avatarEmoji}</span>
          <div className="min-w-0">
            <div className="font-semibold truncate">{kid.displayName}</div>
            <div className="text-xs text-slate-400">
              {status?.baseAwarded ? 'Base earned today' : 'Base not earned yet'}
            </div>
          </div>
        </Link>
        <div className="text-right shrink-0">
          <div className="text-lg font-semibold">🪙 {balance}</div>
          <div className="text-xs text-slate-400">📺 {avail}m</div>
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <button
            onClick={giveBonus}
            disabled={busy}
            className="btn-success px-3 py-2"
            title="Award a bonus chore coin"
            aria-label={`Give ${kid.displayName} a bonus coin`}
          >
            +🪙
          </button>
          <button
            onClick={takeCoin}
            disabled={busy || balance <= 0}
            className="btn-danger px-3 py-2"
            title="Take away a chore coin"
            aria-label={`Take a coin from ${kid.displayName}`}
          >
            −🪙
          </button>
        </div>
      </div>
      {err && <div className="mt-2 text-xs text-red-400">{err}</div>}
    </div>
  )
}

export default function ParentDashboard() {
  const { data: kids, loading } = useKids()
  const { data: pending } = usePendingCompletions()
  const { data: pendingRewards } = usePendingRewardRequests()
  const today = useLocalDate()

  const totalPending = pending.length + pendingRewards.length

  return (
    <TabBarLayout tabs={PARENT_TABS}>
      <PageHeader title="Family" subtitle={formatShortDate(today)} />

      <PushCard label="notifications" />

      {totalPending > 0 && (
        <Link
          to="/approvals"
          className="card mb-4 flex items-center justify-between border-amber-800 bg-amber-950/30"
        >
          <div>
            <div className="font-semibold text-amber-200">
              {totalPending} item{totalPending === 1 ? '' : 's'} waiting for approval
            </div>
            <div className="text-xs text-amber-300/80">
              {pending.length > 0 && `${pending.length} chore${pending.length === 1 ? '' : 's'}`}
              {pending.length > 0 && pendingRewards.length > 0 && ' · '}
              {pendingRewards.length > 0 &&
                `${pendingRewards.length} reward${pendingRewards.length === 1 ? '' : 's'}`}
              {' · tap to review'}
            </div>
          </div>
          <div className="text-2xl">⏳</div>
        </Link>
      )}

      {loading ? (
        <div className="text-slate-400">Loading kids…</div>
      ) : kids.length === 0 ? (
        <div className="card text-center">
          <div className="text-lg font-semibold mb-2">No kids yet</div>
          <div className="text-sm text-slate-400 mb-4">
            Add a kid to get started. You can add base chores and bonus chores after.
          </div>
          <Link to="/kids" className="btn-primary">
            Manage kids
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {kids.map((k) => (
            <KidSummary key={k.id} kid={k} />
          ))}
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3">
        <Link to="/kids" className="btn-secondary">
          👦 Manage kids
        </Link>
        <Link to="/bonus-chores" className="btn-secondary">
          🎯 Bonus chores
        </Link>
        <Link to="/dashboard" className="btn-secondary col-span-2">
          📺 Family dashboard (wall display)
        </Link>
        <Link to="/settings" className="btn-secondary col-span-2">
          ⚙️ Settings — license + backup
        </Link>
      </div>
    </TabBarLayout>
  )
}

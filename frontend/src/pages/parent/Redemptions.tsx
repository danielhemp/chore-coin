import { Link } from 'react-router-dom'
import { TabBarLayout, PageHeader } from '../../components/Layout'
import { PARENT_TABS } from './ParentDashboard'
import { useAllRecentLedger, useKids } from '../../hooks/data'
import { formatShortDate, formatTime, parsePbDate } from '../../lib/dates'
import { COIN_TO_CENTS, COIN_TO_SCREEN_MINUTES } from '../../lib/types'

const KIND_LABEL: Record<string, string> = {
  spend_coin_cash: '💵 Cash',
  spend_coin_screen: '📺 Screen time',
  spend_coin_reward: '🎁 Reward',
}

export default function Redemptions() {
  const { data: ledger, loading } = useAllRecentLedger(200)
  const { data: kids } = useKids(true)
  const nameById = Object.fromEntries(
    kids.map((k) => [k.id, `${k.avatarEmoji} ${k.displayName}`]),
  )

  const redemptions = ledger.filter(
    (l) =>
      l.type === 'spend_coin_screen' ||
      l.type === 'spend_coin_cash' ||
      l.type === 'spend_coin_reward',
  )
  const totalCents = redemptions
    .filter((r) => r.type === 'spend_coin_cash')
    .reduce((sum, r) => sum + Math.abs(r.amount) * COIN_TO_CENTS, 0)
  const totalScreen = redemptions
    .filter((r) => r.type === 'spend_coin_screen')
    .reduce((sum, r) => sum + Math.abs(r.amount) * COIN_TO_SCREEN_MINUTES, 0)
  const rewardCount = redemptions.filter((r) => r.type === 'spend_coin_reward').length

  return (
    <TabBarLayout tabs={PARENT_TABS}>
      <PageHeader
        title="Redemptions"
        subtitle="Everything the kids have cashed out."
        action={
          <Link to="/" className="btn-ghost">
            ← Home
          </Link>
        }
      />

      <Link to="/rewards" className="btn-primary w-full mb-4">
        🎁 Manage rewards catalog
      </Link>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="card">
          <div className="text-xs text-slate-400">Cash owed</div>
          <div className="text-xl font-bold">${(totalCents / 100).toFixed(2)}</div>
        </div>
        <div className="card">
          <div className="text-xs text-slate-400">Screen minutes</div>
          <div className="text-xl font-bold">{totalScreen}m</div>
        </div>
        <div className="card">
          <div className="text-xs text-slate-400">Rewards</div>
          <div className="text-xl font-bold">{rewardCount}</div>
        </div>
      </div>

      {loading ? (
        <div className="text-slate-400">Loading…</div>
      ) : redemptions.length === 0 ? (
        <div className="card text-center text-slate-400">No redemptions yet.</div>
      ) : (
        <ul className="space-y-2">
          {redemptions.map((r) => {
            const d = parsePbDate(r.created)
            return (
              <li key={r.id} className="card flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium break-words">
                    {KIND_LABEL[r.type] ?? r.type} — {nameById[r.kidId] ?? r.kidId}
                  </div>
                  <div className="text-xs text-slate-400 break-words">{r.note}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    {formatShortDate(d.toISOString().slice(0, 10))} · {formatTime(d)}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-red-400 font-semibold">{r.amount} 🪙</div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </TabBarLayout>
  )
}

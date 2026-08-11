import { Link } from 'react-router-dom'
import { TabBarLayout, PageHeader } from '../../components/Layout'
import { PARENT_TABS } from './ParentDashboard'
import { useAllRecentLedger, useKids } from '../../hooks/data'
import { formatShortDate, formatTime, parsePbDate } from '../../lib/dates'
import type { LedgerType } from '../../lib/types'

const TYPE_LABEL: Record<LedgerType, string> = {
  earn_coin: '🪙 Earned',
  spend_coin_screen: '📺 Screen redeem',
  spend_coin_cash: '💵 Cash out',
  spend_coin_reward: '🎁 Reward',
  grant_base_screen: '⭐ Base earned',
  spend_base_screen: '📺 Base used',
  adjust_coin: '⚖️ Coin adj.',
  adjust_base_screen: '⚖️ Screen adj.',
  carryover_base_screen: '↪︎ Carry over',
}

export default function History() {
  const { data, loading } = useAllRecentLedger(200)
  const { data: kids } = useKids(true)
  const nameById = Object.fromEntries(
    kids.map((k) => [k.id, `${k.avatarEmoji} ${k.displayName}`]),
  )

  return (
    <TabBarLayout tabs={PARENT_TABS}>
      <PageHeader
        title="History"
        subtitle="Last 200 ledger entries."
        action={
          <Link to="/" className="btn-ghost">
            ← Home
          </Link>
        }
      />

      {loading ? (
        <div className="text-slate-400">Loading…</div>
      ) : data.length === 0 ? (
        <div className="card text-slate-400 text-center">No activity yet.</div>
      ) : (
        <ul className="space-y-1 text-sm">
          {data.map((l) => {
            const isMinutes =
              l.type === 'grant_base_screen' ||
              l.type === 'spend_base_screen' ||
              l.type === 'adjust_base_screen' ||
              l.type === 'carryover_base_screen'
            const d = parsePbDate(l.created)
            return (
              <li key={l.id} className="card py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div>
                      <span className="text-slate-300">{TYPE_LABEL[l.type]}</span>{' '}
                      <span className={l.amount >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                        {l.amount >= 0 ? '+' : ''}
                        {l.amount} {isMinutes ? 'min' : 'coin'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 truncate">
                      {nameById[l.kidId] ?? l.kidId} · {l.note ?? ''}
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 shrink-0 text-right">
                    <div>{formatShortDate(d.toISOString().slice(0, 10))}</div>
                    <div>{formatTime(d)}</div>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </TabBarLayout>
  )
}

import { Link } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { TabBarLayout } from '../../components/Layout'
import { PushCard } from '../../components/PushCard'
import { useAuth } from '../../auth/AuthContext'
import {
  useActiveBonusChores,
  useActiveRewardItems,
  useBalance,
  useBaseChores,
  useDailyStatus,
  useKid,
  useLocalDate,
  usePendingRewardRequestsForKid,
  useRecentCompletionsForKid,
} from '../../hooks/data'
import {
  cancelRewardRequest,
  markChoreDone,
  requestReward,
  spendBaseScreenTime,
} from '../../lib/actions'
import { dayOfWeekFromLocalDate, formatShortDate } from '../../lib/dates'
import { BASE_REWARD_MINUTES, type CompletionRecord } from '../../lib/types'

const KID_TABS = [
  { to: '/', label: 'Chores', icon: '✅' },
  { to: '/redeem', label: 'Redeem', icon: '🪙' },
]

export default function KidHome() {
  const { user } = useAuth()
  const kidId = user?.kidId
  const { data: kid } = useKid(kidId)
  const { balance } = useBalance(kidId)
  const today = useLocalDate()
  const { status } = useDailyStatus(kidId, today)
  const { data: baseChores, loading: baseLoading } = useBaseChores(kidId)
  const { data: bonusChores, loading: bonusLoading } = useActiveBonusChores()
  const { data: recent } = useRecentCompletionsForKid(kidId, 30)
  const { data: rewards } = useActiveRewardItems()
  const { data: pendingRewards } = usePendingRewardRequestsForKid(kidId)

  const [busyChoreId, setBusyChoreId] = useState<string | null>(null)
  const [screenBusy, setScreenBusy] = useState(false)
  const [screenErr, setScreenErr] = useState<string | null>(null)
  const [rewardBusyId, setRewardBusyId] = useState<string | null>(null)
  const [rewardErr, setRewardErr] = useState<string | null>(null)
  const [rewardMsg, setRewardMsg] = useState<string | null>(null)

  const todayDow = dayOfWeekFromLocalDate(today)
  const bonusForMe = useMemo(
    () =>
      bonusChores.filter((c) => {
        // Day-of-week filter — empty array means "every day".
        const dows = Array.isArray(c.daysOfWeek) ? c.daysOfWeek : []
        if (dows.length > 0 && dows.length < 7 && !dows.includes(todayDow)) return false
        if (c.assignedTo === 'all') return true
        if (Array.isArray(c.assignedTo) && kidId) return c.assignedTo.includes(kidId)
        return false
      }),
    [bonusChores, kidId, todayDow],
  )

  // Derive per-chore status: pending trumps rejected; rejection is only shown when
  // there's no fresher pending submission for the same chore.
  const { pendingByChoreId, latestByChoreId, todayApprovedBonusCount } = useMemo(() => {
    const pending: Record<string, boolean> = {}
    const latest: Record<string, CompletionRecord> = {}
    const bonusCount: Record<string, number> = {}
    for (const c of recent) {
      if (c.status === 'pending') pending[c.choreId] = true
      if (!latest[c.choreId]) latest[c.choreId] = c
      if (
        c.choreType === 'bonus' &&
        c.status === 'approved' &&
        c.forDate === today
      ) {
        bonusCount[c.choreId] = (bonusCount[c.choreId] || 0) + 1
      }
    }
    return {
      pendingByChoreId: pending,
      latestByChoreId: latest,
      todayApprovedBonusCount: bonusCount,
    }
  }, [recent, today])

  const rejectionFor = (choreId: string) => {
    if (pendingByChoreId[choreId]) return null
    const latest = latestByChoreId[choreId]
    if (latest && latest.status === 'rejected') return latest
    return null
  }

  const activeBase = baseChores.filter((c) => c.active !== false)
  const approvedBase = status?.approvedBaseChores ?? {}
  const doneCount = activeBase.filter((c) => c.id in approvedBase).length
  const totalCount = activeBase.length
  // Show todo chores first, then approved ones — keeps the actionable stuff at the top.
  const orderedBase = [
    ...activeBase.filter((c) => !(c.id in approvedBase)),
    ...activeBase.filter((c) => c.id in approvedBase),
  ]
  const baseGranted = status?.baseScreenTimeGrantedMinutes ?? 0
  const baseCarry = status?.carryOverMinutes ?? 0
  const baseUsed = status?.baseScreenTimeUsedMinutes ?? 0
  const baseAvailable = baseGranted + baseCarry - baseUsed

  const submitBase = async (choreId: string, title: string) => {
    if (!kidId) return
    setBusyChoreId(choreId)
    try {
      await markChoreDone({
        kidId,
        choreType: 'base',
        choreId,
        choreTitle: title,
        forDate: today,
      })
    } finally {
      setBusyChoreId(null)
    }
  }

  const submitBonus = async (choreId: string, title: string, coinValue: number) => {
    if (!kidId) return
    setBusyChoreId(choreId)
    try {
      await markChoreDone({
        kidId,
        choreType: 'bonus',
        choreId,
        choreTitle: title,
        coinValue,
        // Stamp the local day so the server can enforce per-day caps by forDate.
        forDate: today,
      })
    } finally {
      setBusyChoreId(null)
    }
  }

  const spendScreen = async (minutes: number) => {
    if (!kidId) return
    if (!window.confirm(`Use ${minutes} minutes of screen time now?`)) return
    setScreenBusy(true)
    setScreenErr(null)
    try {
      await spendBaseScreenTime(kidId, minutes, today)
    } catch (e: any) {
      setScreenErr(e?.message || 'Could not use that time.')
    } finally {
      setScreenBusy(false)
    }
  }

  const pendingRewardIds = new Set(pendingRewards.map((r) => r.rewardId))

  const doRequestReward = async (rewardId: string, title: string) => {
    if (!kidId) return
    setRewardBusyId(rewardId)
    setRewardMsg(null)
    setRewardErr(null)
    try {
      await requestReward(kidId, rewardId)
      setRewardMsg(`Asked for "${title}" — waiting for a parent to approve.`)
    } catch (e: any) {
      setRewardErr(e?.message || 'Request failed')
    } finally {
      setRewardBusyId(null)
    }
  }

  const doCancelReward = async (requestId: string) => {
    setRewardBusyId(requestId)
    setRewardErr(null)
    try {
      await cancelRewardRequest(requestId)
    } catch (e: any) {
      setRewardErr(e?.message || 'Cancel failed')
    } finally {
      setRewardBusyId(null)
    }
  }

  if (!kidId) {
    return (
      <TabBarLayout tabs={KID_TABS}>
        <div className="text-center text-slate-400 p-8">
          Your account isn't linked to a kid profile yet.
        </div>
      </TabBarLayout>
    )
  }

  return (
    <TabBarLayout tabs={KID_TABS}>
      <div className="mb-4">
        <div className="flex items-center gap-3">
          <span className="text-4xl">{kid?.avatarEmoji ?? '👦'}</span>
          <div>
            <h1 className="text-2xl font-bold">Hi, {kid?.displayName ?? '…'}!</h1>
            <p className="text-xs text-slate-400">{formatShortDate(today)}</p>
          </div>
        </div>
      </div>

      <PushCard label="chore updates" />

      <div className="card mb-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400">Coins</div>
            <div className="text-3xl font-bold">🪙 {balance}</div>
          </div>
          <Link to="/redeem" className="btn-secondary">
            Redeem →
          </Link>
        </div>
      </div>

      <section className="card mb-5 border-brand-800/60 bg-slate-900">
        <div className="flex items-center justify-between mb-1">
          <div className="text-sm text-slate-300">📺 Screen time today</div>
          <div className="text-4xl font-bold text-brand-300">{baseAvailable}m</div>
        </div>
        <div className="text-xs text-slate-500 mb-3">
          {status?.baseAwarded
            ? `${baseGranted} earned${baseCarry ? ` + ${baseCarry} saved` : ''}${baseUsed ? ` − ${baseUsed} used` : ''}`
            : `Finish your chores to earn ${BASE_REWARD_MINUTES} min · ${doneCount}/${totalCount || '?'} done`}
        </div>
        {baseAvailable > 0 && (
          <>
            <div className="text-xs text-slate-400 mb-2">Tap when you use some time:</div>
            <div className="grid grid-cols-4 gap-2">
              {[5, 15, 30, 60].map((m) => (
                <button
                  key={m}
                  className="btn-secondary py-3"
                  disabled={screenBusy || baseAvailable < m}
                  onClick={() => spendScreen(m)}
                >
                  −{m}m
                </button>
              ))}
            </div>
          </>
        )}
        {screenErr && <div className="text-xs text-red-400 mt-2">{screenErr}</div>}
      </section>

      {(() => {
        // When all base chores for the day are approved, sink the whole Base section
        // below the Bonus section so the actionable "you could earn coins" list is
        // what the kid sees first.
        const allBaseDone = totalCount > 0 && doneCount === totalCount

        const baseSection = (
          <section className="mb-6" key="base">
            <h2 className="text-lg font-semibold mb-2">
              Base chores{allBaseDone ? ' — all done! 🎉' : ''}
            </h2>
            <p className="text-xs text-slate-400 mb-3">
              {allBaseDone
                ? `You earned ${BASE_REWARD_MINUTES} minutes of screen time today.`
                : `Finish all of them today to earn ${BASE_REWARD_MINUTES} minutes of screen time.`}
            </p>
            {baseLoading ? (
              <div className="text-slate-500 text-sm">Loading…</div>
            ) : activeBase.length === 0 ? (
              <div className="card text-slate-400 text-sm">
                No base chores yet — ask a parent to add some.
              </div>
            ) : (
              <ul className="space-y-2">
                {orderedBase.map((c) => {
                  const approved = c.id in approvedBase
                  const isPending = !!pendingByChoreId[c.id]
                  const rejection = !approved ? rejectionFor(c.id) : null
                  return (
                    <li
                      key={c.id}
                      className={`card flex items-center justify-between gap-3 ${
                        approved
                          ? 'border-emerald-800 bg-emerald-950/40'
                          : rejection
                            ? 'border-red-900/60 bg-red-950/20'
                            : ''
                      }`}
                    >
                      <div className="min-w-0">
                        <div
                          className={`font-medium ${approved ? 'line-through text-emerald-300' : ''}`}
                        >
                          {c.title}
                        </div>
                        {isPending && !approved && (
                          <div className="text-xs text-amber-400">Waiting for parent…</div>
                        )}
                        {approved && (
                          <div className="text-xs text-emerald-400">Approved ✓</div>
                        )}
                        {rejection && !isPending && (
                          <div className="text-xs text-red-300">
                            Rejected
                            {rejection.rejectionNote ? `: ${rejection.rejectionNote}` : ''}
                          </div>
                        )}
                      </div>
                      {approved ? (
                        <span className="text-emerald-500 text-2xl">✓</span>
                      ) : isPending ? (
                        <span className="pill">Pending</span>
                      ) : (
                        <button
                          className="btn-primary"
                          disabled={busyChoreId === c.id}
                          onClick={() => submitBase(c.id, c.title)}
                        >
                          {rejection ? 'Try again' : 'I did it!'}
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )

        const bonusSection = (
          <section className="mb-6" key="bonus">
            <h2 className="text-lg font-semibold mb-2">Bonus chores</h2>
            <p className="text-xs text-slate-400 mb-3">Earn coins for extra work.</p>
            {bonusLoading ? (
              <div className="text-slate-500 text-sm">Loading…</div>
            ) : bonusForMe.length === 0 ? (
              <div className="card text-slate-400 text-sm">
                No bonus chores available right now.
              </div>
            ) : (
              <ul className="space-y-2">
                {bonusForMe.map((c) => {
                  const isPending = !!pendingByChoreId[c.id]
                  const rejection = rejectionFor(c.id)
                  const cap = c.maxPerDay ?? 0
                  const doneToday = todayApprovedBonusCount[c.id] ?? 0
                  const capReached = cap > 0 && doneToday >= cap
                  return (
                    <li
                      key={c.id}
                      className={`card flex items-center justify-between gap-3 ${
                        capReached
                          ? 'border-slate-800 bg-slate-900/40 opacity-60'
                          : rejection && !isPending
                            ? 'border-red-900/60 bg-red-950/20'
                            : ''
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">{c.title}</div>
                        <div className="text-xs text-slate-400">
                          🪙 {c.coinValue}
                          {cap > 0 ? ` · ${doneToday}/${cap} today` : ''}
                        </div>
                        {isPending && (
                          <div className="text-xs text-amber-400">Waiting for parent…</div>
                        )}
                        {rejection && !isPending && !capReached && (
                          <div className="text-xs text-red-300">
                            Rejected
                            {rejection.rejectionNote ? `: ${rejection.rejectionNote}` : ''}
                          </div>
                        )}
                      </div>
                      {capReached ? (
                        <span className="pill">Done for today ✓</span>
                      ) : isPending ? (
                        <span className="pill">Pending</span>
                      ) : (
                        <button
                          className="btn-primary"
                          disabled={busyChoreId === c.id}
                          onClick={() => submitBonus(c.id, c.title, c.coinValue)}
                        >
                          {rejection ? 'Try again' : 'I did it!'}
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )

        return allBaseDone ? (
          <>
            {bonusSection}
            {baseSection}
          </>
        ) : (
          <>
            {baseSection}
            {bonusSection}
          </>
        )
      })()}

      {/* Redemption options — appears only when the kid actually has coins. */}
      {balance > 0 && (
        <section className="mb-6">
          <h2 className="text-lg font-semibold mb-2">Turn in your 🪙 {balance} coins?</h2>
          <p className="text-xs text-slate-400 mb-3">
            Ask a parent for a reward, or head to the Redeem tab for screen time or cash.
          </p>

          {rewards.length > 0 && (
            <ul className="space-y-2 mb-3">
              {rewards.map((r) => {
                const canAfford = balance >= r.coinCost
                const alreadyPending = pendingRewardIds.has(r.id)
                return (
                  <li key={r.id} className={`card ${!canAfford ? 'opacity-70' : ''}`}>
                    <div className="flex items-start gap-3">
                      <span className="text-3xl leading-none">{r.emoji || '🎁'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium break-words">{r.title}</div>
                        {r.description && (
                          <div className="text-xs text-slate-400 mt-1 break-words">
                            {r.description}
                          </div>
                        )}
                        <div className="text-xs text-slate-500 mt-1">🪙 {r.coinCost}</div>
                      </div>
                      <button
                        className="btn-primary !py-2 !px-3 text-sm shrink-0"
                        disabled={rewardBusyId === r.id || alreadyPending || !canAfford}
                        onClick={() => doRequestReward(r.id, r.title)}
                      >
                        {alreadyPending ? 'Requested' : canAfford ? 'Ask' : 'Not enough'}
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {pendingRewards.length > 0 && (
            <ul className="space-y-2 mb-3">
              {pendingRewards.map((p) => (
                <li
                  key={p.id}
                  className="card flex items-center gap-3 border-amber-800/60 bg-amber-950/20"
                >
                  <span className="text-2xl">{p.rewardEmoji || '🎁'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium break-words">{p.rewardTitle}</div>
                    <div className="text-xs text-amber-300">Waiting for parent · 🪙 {p.coinCost}</div>
                  </div>
                  <button
                    className="btn-ghost !py-2 !px-3 text-sm text-red-400 shrink-0"
                    disabled={rewardBusyId === p.id}
                    onClick={() => doCancelReward(p.id)}
                  >
                    Cancel
                  </button>
                </li>
              ))}
            </ul>
          )}

          <Link to="/redeem" className="btn-secondary w-full">
            📺💵 Trade for screen time or cash →
          </Link>

          {rewardMsg && (
            <div className="mt-3 card border-emerald-800 bg-emerald-950/40 text-emerald-200 text-sm">
              {rewardMsg}
            </div>
          )}
          {rewardErr && (
            <div className="mt-3 card border-red-800 bg-red-950/40 text-red-200 text-sm">
              {rewardErr}
            </div>
          )}
        </section>
      )}
    </TabBarLayout>
  )
}

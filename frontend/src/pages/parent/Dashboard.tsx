/**
 * Family wall dashboard / interactive kiosk — designed for an always-on tablet.
 *
 * Signed in as a parent, this becomes the single-tap surface any family
 * member can walk up to and use: kids mark their chores done (base + bonus),
 * spend base screen-time as they use it, and see live coin balances. Parents
 * still approve pending submissions from their own device.
 *
 * Route: /dashboard (parent-only session; the tablet's login carries the
 * parent role that lets it act on every kid).
 */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import {
  useActiveBonusChores,
  useActiveGoals,
  useActiveRewardItems,
  useApprovedContributionsForGoal,
  useBalance,
  useBaseChores,
  useDailyStatus,
  useKids,
  useLocalDate,
  usePendingCompletions,
  usePendingRewardRequestsForKid,
  useRecentCompletionsForKid,
} from '../../hooks/data'
import {
  cancelRewardRequest,
  contributeToGoal,
  markChoreDone,
  requestReward,
  requestScreenTime,
  spendBaseScreenTime,
} from '../../lib/actions'
import { formatShortDate } from '../../lib/dates'
import {
  BASE_REWARD_MINUTES,
  type BonusChoreRecord,
  type CompletionRecord,
  type GoalRecord,
  type KidRecord,
} from '../../lib/types'

function useNowTicker() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

/** Keeps the screen awake on tablets that support the Wake Lock API. */
function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const nav = navigator as unknown as {
      wakeLock?: { request: (t: string) => Promise<{ release?: () => void }> }
    }
    if (!nav.wakeLock) return
    let sentinel: { release?: () => void } | null = null
    let cancelled = false
    const acquire = async () => {
      try {
        sentinel = await nav.wakeLock!.request('screen')
      } catch {
        // Denied — nothing we can do.
      }
    }
    acquire()
    const onVis = () => {
      if (!cancelled && document.visibilityState === 'visible' && !sentinel) acquire()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVis)
      if (sentinel && typeof sentinel.release === 'function') sentinel.release()
    }
  }, [enabled])
}

/**
 * A single goal row inside a KidTile. Own hook subscription per goal so
 * progress bars update live as contributions get approved. Contribute
 * buttons hide once the goal is reached / completed, so the kid sees the
 * finish line but can't overshoot.
 */
function GoalTile({
  goal,
  balance,
  busy,
  onContribute,
}: {
  goal: GoalRecord
  balance: number
  busy: string | null
  onContribute: (coins: number) => Promise<void> | void
}) {
  const { data: contribs } = useApprovedContributionsForGoal(goal.id)
  const totalContrib = contribs.reduce((s, c) => s + c.coinAmount, 0)
  const totalMatch = contribs.reduce((s, c) => s + (c.matchAmount ?? 0), 0)
  const total = totalContrib + totalMatch
  const pct = Math.min(100, Math.round((total / goal.coinTarget) * 100))
  const reached = goal.status === 'reached'
  const remainingCoinsForKid = Math.max(
    0,
    Math.ceil((goal.coinTarget - total) / (1 + (goal.matchRate ?? 0))),
  )

  // Quick-tap options — 1, 5, and "top it off" (exactly enough to reach the
  // target given match rate). Skip options over the kid's balance or over the
  // remaining needed amount so buttons don't overshoot.
  const options: number[] = []
  const candidates = [1, 5, 10]
  for (const c of candidates) {
    if (c <= balance && c <= remainingCoinsForKid && !options.includes(c)) options.push(c)
  }
  if (
    remainingCoinsForKid > 0 &&
    remainingCoinsForKid <= balance &&
    !options.includes(remainingCoinsForKid)
  ) {
    options.push(remainingCoinsForKid)
  }

  return (
    <li
      className={`rounded-xl border p-3 ${
        reached
          ? 'border-emerald-800/60 bg-emerald-950/20'
          : 'border-slate-800 bg-slate-950/40'
      }`}
    >
      <div className="flex items-center gap-2 mb-2 min-w-0">
        <span className="text-xl leading-none shrink-0">{goal.emoji || '🎯'}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{goal.title}</div>
          <div className="text-[10px] text-slate-400">
            {!goal.ownerKidId && 'Family · '}
            {goal.matchRate > 0 && `${goal.matchRate}× match · `}
            {goal.approvalRequired && 'needs approval · '}
            🪙 {total}/{goal.coinTarget}
          </div>
        </div>
        <span
          className={`text-xs shrink-0 ${
            reached ? 'text-emerald-300 font-medium' : 'text-slate-400'
          }`}
        >
          {pct}%
        </span>
      </div>
      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden mb-2">
        <div
          className={`h-full rounded-full ${reached ? 'bg-emerald-500' : 'bg-brand-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {reached ? (
        <div className="text-[10px] text-emerald-300 text-center">
          🎉 Target hit — waiting on parent
        </div>
      ) : options.length === 0 ? (
        <div className="text-[10px] text-slate-500 text-center">
          {balance === 0 ? 'Earn some coins to save toward this' : 'Balance too low to contribute'}
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {options.map((coins) => (
            <button
              key={coins}
              className="btn-primary text-xs px-2 py-1 flex-1 min-w-0"
              disabled={busy !== null}
              onClick={() => onContribute(coins)}
              title={
                coins === remainingCoinsForKid && remainingCoinsForKid > 1
                  ? `Reach the target with ${coins} 🪙`
                  : `Contribute ${coins} 🪙`
              }
            >
              +{coins}🪙
              {coins === remainingCoinsForKid && remainingCoinsForKid > 1 && ' 🎯'}
            </button>
          ))}
        </div>
      )}
    </li>
  )
}

function KidTile({ kid }: { kid: KidRecord }) {
  const today = useLocalDate()
  const { balance } = useBalance(kid.id)
  const { status } = useDailyStatus(kid.id, today)
  const { data: baseChores } = useBaseChores(kid.id)
  const { data: bonusChores } = useActiveBonusChores()
  const { data: recent } = useRecentCompletionsForKid(kid.id, 30)
  const { data: rewards } = useActiveRewardItems()
  const { data: pendingRewards } = usePendingRewardRequestsForKid(kid.id)
  const { data: allGoals } = useActiveGoals()

  // Goals shown on this kid's tile: their own goals (individual with owner ==
  // this kid) plus every family goal. Private goals never show on tiles — those
  // are parents-only. Reached goals stay visible so the kid can see the finish
  // line but the contribute buttons hide.
  const goalsForThisKid = useMemo<GoalRecord[]>(
    () =>
      allGoals.filter((g) => {
        if (g.visibility === 'private') return false
        if (!g.ownerKidId) return true // family goal
        return g.ownerKidId === kid.id
      }),
    [allGoals, kid.id],
  )

  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const baseGranted = status?.baseScreenTimeGrantedMinutes ?? 0
  const baseCarry = status?.carryOverMinutes ?? 0
  const baseUsed = status?.baseScreenTimeUsedMinutes ?? 0
  const baseAvailable = baseGranted + baseCarry - baseUsed
  const awarded = status?.baseAwarded
  const approvedBase = status?.approvedBaseChores ?? {}

  const bonusForMe: BonusChoreRecord[] = useMemo(
    () =>
      bonusChores.filter((c) => {
        if (c.assignedTo === 'all') return true
        if (Array.isArray(c.assignedTo)) return c.assignedTo.includes(kid.id)
        return false
      }),
    [bonusChores, kid.id],
  )

  // Latest completion per chore + pending map (matches KidHome logic).
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
    const l = latestByChoreId[choreId]
    return l && l.status === 'rejected' ? l : null
  }

  const activeBase = baseChores.filter((c) => c.active !== false)
  const doneCount = activeBase.filter((c) => c.id in approvedBase).length
  const totalCount = activeBase.length
  // Sort so actionable chores (nothing pending, nothing approved) come first,
  // then pending, then approved — matching KidHome so kids see "what can I do
  // right now" at the top of their tile.
  const choreState = (choreId: string): 0 | 1 | 2 =>
    choreId in approvedBase ? 2 : pendingByChoreId[choreId] ? 1 : 0
  const orderedBase = [...activeBase].sort((a, b) => choreState(a.id) - choreState(b.id))
  // When nothing in the base list is actionable (all approved or pending),
  // drop the Base block below Bonus so the kid sees what they *can* do first.
  const noActionableBase = activeBase.length > 0 && activeBase.every((c) => choreState(c.id) > 0)

  const runWithBusy = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key)
    setErr(null)
    try {
      await fn()
    } catch (e: any) {
      setErr(e?.message || 'Something went wrong.')
    } finally {
      setBusy(null)
    }
  }

  const submitBase = (chore: { id: string; title: string }) =>
    runWithBusy(`b-${chore.id}`, () =>
      markChoreDone({
        kidId: kid.id,
        choreType: 'base',
        choreId: chore.id,
        choreTitle: chore.title,
        forDate: today,
      }),
    )

  const submitBonus = (chore: BonusChoreRecord) =>
    runWithBusy(`x-${chore.id}`, () =>
      markChoreDone({
        kidId: kid.id,
        choreType: 'bonus',
        choreId: chore.id,
        choreTitle: chore.title,
        coinValue: chore.coinValue,
        forDate: today,
      }),
    )

  const spendScreen = (minutes: number) => {
    if (!window.confirm(`Use ${minutes} minutes of ${kid.displayName}'s screen time?`)) return
    return runWithBusy(`s-${minutes}`, () => spendBaseScreenTime(kid.id, minutes, today))
  }

  const pendingRewardIds = new Set(pendingRewards.map((r) => r.rewardId))

  const askReward = (rewardId: string, title: string) =>
    runWithBusy(`r-${rewardId}`, async () => {
      await requestReward(kid.id, rewardId)
      // Confirmation happens implicitly — the request will appear in the pending
      // list below and in the parent's approvals queue.
      void title
    })

  const askScreenTime = (coins: number) =>
    runWithBusy(`st-${coins}`, () => requestScreenTime(kid.id, coins))

  const cancelReward = (requestId: string) =>
    runWithBusy(`rc-${requestId}`, () => cancelRewardRequest(requestId))

  const contribute = (goalId: string, coins: number) =>
    runWithBusy(`g-${goalId}-${coins}`, () => contributeToGoal(goalId, kid.id, coins))

  // Standard screen-time asks — 4 quick-tap buttons matching the "spend base"
  // grid (5/15/30/60 min) so families have a consistent set of increments.
  // 1 coin = 5 minutes (COIN_TO_SCREEN_MINUTES).
  const SCREEN_TIME_ASKS = [
    { coins: 1, mins: 5 },
    { coins: 3, mins: 15 },
    { coins: 6, mins: 30 },
    { coins: 12, mins: 60 },
  ]

  return (
    <div
      className="rounded-3xl border border-slate-800 bg-slate-900 shadow-xl flex flex-col overflow-hidden"
      style={{ maxHeight: 'calc(100vh - 8rem)' }}
    >
      {/* Sticky header — always visible so you never lose track of whose card this is */}
      <div className="flex items-center gap-4 px-5 py-4 border-b border-slate-800 bg-slate-900 shrink-0">
        <span className="text-5xl leading-none">{kid.avatarEmoji || '👦'}</span>
        <div className="min-w-0 flex-1">
          <div className="text-2xl font-bold truncate">{kid.displayName}</div>
          <div className="text-xs text-slate-400">
            {awarded
              ? 'Base earned ✓'
              : totalCount > 0
                ? `${doneCount}/${totalCount} base done`
                : 'No base chores set'}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-bold">🪙 {balance}</div>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
      {/* Screen time */}
      <div className="rounded-2xl bg-slate-950/60 border border-brand-800/60 p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm text-slate-300">📺 Screen time</div>
          <div className="text-3xl font-bold text-brand-300">{baseAvailable}m</div>
        </div>
        <div className="text-xs text-slate-500 mb-2">
          {baseGranted + baseCarry > 0
            ? `${baseUsed}m used · ${baseGranted + baseCarry}m today`
            : `Finish all base chores to earn ${BASE_REWARD_MINUTES}m`}
        </div>
        {baseAvailable > 0 && (
          <div className="grid grid-cols-4 gap-2">
            {[5, 15, 30, 60].map((m) => (
              <button
                key={m}
                className="btn-secondary py-2 text-sm"
                disabled={busy !== null || baseAvailable < m}
                onClick={() => spendScreen(m)}
              >
                −{m}m
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Chores — flip base/bonus order when nothing in Base is actionable, so the
          kid sees things they CAN do at the top of the tile. */}
      {(() => {
        const baseBlock = (
          <div key="base">
            <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">
              Base chores
              {noActionableBase && activeBase.length > 0 ? ' — all done for now 🎉' : ''}
            </div>
            {activeBase.length === 0 ? (
              <div className="text-xs text-slate-500 italic">None set up.</div>
            ) : (
              <ul className="space-y-2">
                {orderedBase.map((c) => {
                  const approved = c.id in approvedBase
                  const isPending = !!pendingByChoreId[c.id]
                  const rejection = !approved ? rejectionFor(c.id) : null
                  return (
                    <li
                      key={c.id}
                      className={`rounded-xl border p-3 flex items-center justify-between gap-2 ${
                        approved
                          ? 'border-emerald-800 bg-emerald-950/40'
                          : rejection
                            ? 'border-red-900/60 bg-red-950/20'
                            : 'border-slate-800 bg-slate-950/40'
                      }`}
                    >
                      <div className="min-w-0">
                        <div
                          className={`font-medium ${
                            approved ? 'line-through text-emerald-300' : ''
                          }`}
                        >
                          {c.title}
                        </div>
                        {isPending && !approved && (
                          <div className="text-xs text-amber-400">Waiting…</div>
                        )}
                        {rejection && !isPending && (
                          <div className="text-xs text-red-300">
                            Rejected
                            {rejection.rejectionNote ? `: ${rejection.rejectionNote}` : ''}
                          </div>
                        )}
                      </div>
                      {approved ? (
                        <span className="text-emerald-500 text-xl">✓</span>
                      ) : isPending ? (
                        <span className="pill text-xs">Pending</span>
                      ) : (
                        <button
                          className="btn-primary text-sm px-3 py-2"
                          disabled={busy !== null}
                          onClick={() => submitBase(c)}
                        >
                          {rejection ? 'Try again' : 'I did it!'}
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )

        const bonusBlock =
          bonusForMe.length > 0 ? (
            <div key="bonus">
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">
                Bonus (earn coins)
              </div>
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
                      className={`rounded-xl border p-3 flex items-center justify-between gap-2 ${
                        capReached
                          ? 'border-slate-800 bg-slate-900/40 opacity-60'
                          : rejection && !isPending
                            ? 'border-red-900/60 bg-red-950/20'
                            : 'border-slate-800 bg-slate-950/40'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">{c.title}</div>
                        <div className="text-xs text-slate-400">
                          🪙 {c.coinValue}
                          {cap > 0 ? ` · ${doneToday}/${cap} today` : ''}
                        </div>
                        {isPending && (
                          <div className="text-xs text-amber-400">Waiting…</div>
                        )}
                        {rejection && !isPending && !capReached && (
                          <div className="text-xs text-red-300">
                            Rejected
                            {rejection.rejectionNote ? `: ${rejection.rejectionNote}` : ''}
                          </div>
                        )}
                      </div>
                      {capReached ? (
                        <span className="pill text-xs">Done ✓</span>
                      ) : isPending ? (
                        <span className="pill text-xs">Pending</span>
                      ) : (
                        <button
                          className="btn-primary text-sm px-3 py-2"
                          disabled={busy !== null}
                          onClick={() => submitBonus(c)}
                        >
                          {rejection ? 'Try again' : 'I did it!'}
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null

        return noActionableBase ? (
          <>
            {bonusBlock}
            {baseBlock}
          </>
        ) : (
          <>
            {baseBlock}
            {bonusBlock}
          </>
        )
      })()}

      {/* Savings goals — the kid's own goals and any family goal. */}
      {goalsForThisKid.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">
            💰 Savings goals
          </div>
          <ul className="space-y-2">
            {goalsForThisKid.map((g) => (
              <GoalTile
                key={g.id}
                goal={g}
                balance={balance}
                busy={busy}
                onContribute={(coins) => contribute(g.id, coins)}
              />
            ))}
          </ul>
        </div>
      )}

      {/* Redemption options — only when this kid has coins to spend. */}
      {balance > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">
            Redeem 🪙 {balance}
          </div>

          {/* Screen-time asks — quick-tap grid for the common increments.
              Each tap creates a pending reward_request (kind=screen_time)
              that a parent approves from their phone. On approval the coins
              deduct AND the minutes credit to today's available time. */}
          <div className="rounded-xl border border-brand-800/60 bg-brand-950/30 p-3 mb-2">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium">📺 Ask for screen time</div>
              <div className="text-[10px] text-slate-400">1🪙 = 5m · parent approves</div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {SCREEN_TIME_ASKS.map(({ coins, mins }) => (
                <button
                  key={coins}
                  className="btn-primary py-2 leading-tight flex flex-col items-center disabled:opacity-40"
                  disabled={busy !== null || balance < coins}
                  onClick={() => askScreenTime(coins)}
                  title={`Ask for ${mins} minutes (spends ${coins} coin${coins === 1 ? '' : 's'})`}
                >
                  <span className="text-base font-bold">{mins}m</span>
                  <span className="text-[10px] opacity-90">−{coins}🪙</span>
                </button>
              ))}
            </div>
          </div>

          {rewards.length > 0 && (
            <ul className="space-y-2 mb-2">
              {rewards.map((r) => {
                const canAfford = balance >= r.coinCost
                const alreadyPending = pendingRewardIds.has(r.id)
                return (
                  <li
                    key={r.id}
                    className={`rounded-xl border border-slate-800 bg-slate-950/40 p-3 flex items-center gap-3 ${
                      !canAfford ? 'opacity-60' : ''
                    }`}
                  >
                    <span className="text-2xl leading-none">{r.emoji || '🎁'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{r.title}</div>
                      <div className="text-xs text-slate-400">🪙 {r.coinCost}</div>
                    </div>
                    <button
                      className="btn-primary text-sm px-3 py-2"
                      disabled={busy !== null || alreadyPending || !canAfford}
                      onClick={() => askReward(r.id, r.title)}
                    >
                      {alreadyPending ? 'Requested' : canAfford ? 'Ask' : 'Not enough'}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {pendingRewards.length > 0 && (
            <ul className="space-y-2">
              {pendingRewards.map((p) => (
                <li
                  key={p.id}
                  className="rounded-xl border border-amber-800/60 bg-amber-950/20 p-3 flex items-center gap-3"
                >
                  <span className="text-xl leading-none">{p.rewardEmoji || '🎁'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{p.rewardTitle}</div>
                    <div className="text-xs text-amber-300">Waiting · 🪙 {p.coinCost}</div>
                  </div>
                  <button
                    className="btn-ghost text-sm text-red-400 px-3 py-2"
                    disabled={busy !== null}
                    onClick={() => cancelReward(p.id)}
                  >
                    Cancel
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {err && (
        <div className="text-xs text-red-400 border border-red-900/50 rounded-lg px-3 py-2">
          {err}
        </div>
      )}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { user, signOutUser } = useAuth()
  const { data: kids, loading } = useKids()
  const { data: pending } = usePendingCompletions()
  const now = useNowTicker()

  const [awake, setAwake] = useState(false)
  useWakeLock(awake)

  const today = useLocalDate()
  const isKiosk = user?.role === 'dashboard'

  const clock = useMemo(
    () =>
      new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      }).format(now),
    [now],
  )

  const goFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
      }
      setAwake(true)
    } catch {
      /* denied */
    }
  }

  return (
    <div className="min-h-full bg-slate-950 text-slate-100 flex flex-col safe-top safe-bottom">
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-900">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🪙</span>
          <div>
            <div className="text-lg font-semibold">Chore Coin — Family</div>
            <div className="text-xs text-slate-400">
              {formatShortDate(today)} · {clock}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {pending.length > 0 && (
            <div className="pill bg-amber-900/60 text-amber-100">
              ⏳ {pending.length} waiting
            </div>
          )}
          <button className="btn-secondary" onClick={goFullscreen}>
            📺 Fullscreen
          </button>
          {isKiosk ? (
            <button className="btn-ghost" onClick={signOutUser}>
              Sign out
            </button>
          ) : (
            <Link to="/" className="btn-ghost">
              Exit
            </Link>
          )}
        </div>
      </header>

      <main className="flex-1 p-6 overflow-hidden flex flex-col">
        {loading ? (
          <div className="text-slate-400">Loading…</div>
        ) : kids.length === 0 ? (
          <div className="text-slate-400 text-center py-20">
            No kids yet. Add some from the parent home page.
          </div>
        ) : (
          // Horizontal scroller — every kid tile is a fixed-width column;
          // when there are more kids than fit on the screen the parent /
          // dashboard user swipes left-right instead of the layout wrapping
          // onto multiple rows. Better for a wall-mounted tablet where a
          // vertical scroll makes each tile shorter than it needs to be.
          // The container's `flex-1 overflow-x-auto` keeps the height in
          // check so each tile's own scrollable body still works.
          <div
            className="flex gap-6 overflow-x-auto pb-4 snap-x snap-mandatory flex-1"
            style={{ scrollbarGutter: 'stable' }}
          >
            {kids.map((k) => (
              <div
                key={k.id}
                className="shrink-0 snap-start"
                style={{ width: kids.length === 1 ? 600 : 380 }}
              >
                <KidTile kid={k} />
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

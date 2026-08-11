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
  useActiveRewardItems,
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
  markChoreDone,
  requestReward,
  spendBaseScreenTime,
} from '../../lib/actions'
import { formatShortDate } from '../../lib/dates'
import {
  BASE_REWARD_MINUTES,
  type BonusChoreRecord,
  type CompletionRecord,
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

function KidTile({ kid }: { kid: KidRecord }) {
  const today = useLocalDate()
  const { balance } = useBalance(kid.id)
  const { status } = useDailyStatus(kid.id, today)
  const { data: baseChores } = useBaseChores(kid.id)
  const { data: bonusChores } = useActiveBonusChores()
  const { data: recent } = useRecentCompletionsForKid(kid.id, 30)
  const { data: rewards } = useActiveRewardItems()
  const { data: pendingRewards } = usePendingRewardRequestsForKid(kid.id)

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

  const cancelReward = (requestId: string) =>
    runWithBusy(`rc-${requestId}`, () => cancelRewardRequest(requestId))

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

      {/* Redemption options — only when this kid has coins to spend. */}
      {balance > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">
            Redeem 🪙 {balance}
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

      <main className="flex-1 p-6 overflow-auto">
        {loading ? (
          <div className="text-slate-400">Loading…</div>
        ) : kids.length === 0 ? (
          <div className="text-slate-400 text-center py-20">
            No kids yet. Add some from the parent home page.
          </div>
        ) : (
          <div
            className="grid gap-6"
            style={{
              gridTemplateColumns: `repeat(auto-fit, minmax(${
                kids.length === 1 ? '600px' : '360px'
              }, 1fr))`,
            }}
          >
            {kids.map((k) => (
              <KidTile key={k.id} kid={k} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

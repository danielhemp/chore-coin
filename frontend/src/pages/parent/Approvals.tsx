import { useState } from 'react'
import { TabBarLayout, PageHeader } from '../../components/Layout'
import { PARENT_TABS } from './ParentDashboard'
import {
  useAllGoals,
  useGoalsAwaitingApproval,
  useKids,
  usePendingCompletions,
  usePendingGoalContributions,
  usePendingRewardRequests,
} from '../../hooks/data'
import {
  approveCompletion,
  approveGoalContribution,
  approveRewardRequest,
  completeGoal,
  denyGoalContribution,
  denyRewardRequest,
  rejectCompletion,
} from '../../lib/actions'
import { parsePbDate, formatTime } from '../../lib/dates'

export default function Approvals() {
  const { data: pending, loading } = usePendingCompletions()
  const { data: pendingRewards, loading: loadingRewards } = usePendingRewardRequests()
  const { data: pendingGoalContribs, loading: loadingGoalContribs } =
    usePendingGoalContributions()
  const { data: reachedGoals, loading: loadingGoals } = useGoalsAwaitingApproval()
  const { data: kids } = useKids(true)
  const { data: allGoals } = useAllGoals()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const kidById = Object.fromEntries(kids.map((k) => [k.id, k]))
  const goalById = Object.fromEntries(allGoals.map((g) => [g.id, g]))

  const doApprove = async (id: string) => {
    setBusyId(id)
    setErr(null)
    try {
      await approveCompletion(id)
    } catch (e: any) {
      setErr(e?.message || 'Approve failed')
    } finally {
      setBusyId(null)
    }
  }

  const doReject = async (id: string) => {
    const note = window.prompt('Reason (optional):') || undefined
    setBusyId(id)
    setErr(null)
    try {
      await rejectCompletion(id, note)
    } catch (e: any) {
      setErr(e?.message || 'Reject failed')
    } finally {
      setBusyId(null)
    }
  }

  const doApproveReward = async (id: string) => {
    setBusyId(id)
    setErr(null)
    try {
      await approveRewardRequest(id)
    } catch (e: any) {
      setErr(e?.message || 'Approve failed')
    } finally {
      setBusyId(null)
    }
  }

  const doDenyReward = async (id: string) => {
    const note = window.prompt('Reason (optional):') || undefined
    setBusyId(id)
    setErr(null)
    try {
      await denyRewardRequest(id, note)
    } catch (e: any) {
      setErr(e?.message || 'Deny failed')
    } finally {
      setBusyId(null)
    }
  }

  const doApproveGoalContrib = async (id: string) => {
    setBusyId(id)
    setErr(null)
    try {
      await approveGoalContribution(id)
    } catch (e: any) {
      setErr(e?.message || 'Approve failed')
    } finally {
      setBusyId(null)
    }
  }

  const doDenyGoalContrib = async (id: string) => {
    const note = window.prompt('Reason (optional):') || undefined
    setBusyId(id)
    setErr(null)
    try {
      await denyGoalContribution(id, note)
    } catch (e: any) {
      setErr(e?.message || 'Deny failed')
    } finally {
      setBusyId(null)
    }
  }

  const doCompleteGoal = async (id: string) => {
    const goal = goalById[id]
    if (
      !window.confirm(
        `Cash out "${goal?.title ?? 'this goal'}"? Marks it completed and closes the goal.`,
      )
    )
      return
    setBusyId(id)
    setErr(null)
    try {
      await completeGoal(id)
    } catch (e: any) {
      setErr(e?.message || 'Complete failed')
    } finally {
      setBusyId(null)
    }
  }

  const totalPending =
    pending.length + pendingRewards.length + pendingGoalContribs.length + reachedGoals.length
  const anythingLoading = loading || loadingRewards || loadingGoalContribs || loadingGoals

  return (
    <TabBarLayout tabs={PARENT_TABS}>
      <PageHeader title="Approvals" subtitle={`${totalPending} pending`} />
      {err && <div className="card mb-3 border-red-800 bg-red-950/40 text-red-200">{err}</div>}

      {anythingLoading ? (
        <div className="text-slate-400">Loading…</div>
      ) : totalPending === 0 ? (
        <div className="card text-center text-slate-400">🎉 All caught up!</div>
      ) : (
        <>
          {/* Chore completions -------------------------------------------- */}
          {pending.length > 0 && (
            <>
              <h2 className="text-sm uppercase tracking-wide text-slate-500 mb-2">
                Chores ({pending.length})
              </h2>
              <ul className="space-y-3 mb-6">
                {pending.map((p) => {
                  const kid = kidById[p.kidId]
                  return (
                    <li key={p.id} className="card">
                      <div className="flex items-start gap-3">
                        <span className="text-2xl">{kid?.avatarEmoji ?? '👤'}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium break-words">{p.choreTitle}</div>
                          <div className="text-xs text-slate-400">
                            {kid?.displayName ?? p.kidId} ·{' '}
                            {p.choreType === 'base'
                              ? 'Base chore'
                              : `Bonus 🪙 ${p.coinValue ?? 0}`}
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            {formatTime(parsePbDate(p.created))}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          className="btn-success"
                          disabled={busyId === p.id}
                          onClick={() => doApprove(p.id)}
                        >
                          Approve
                        </button>
                        <button
                          className="btn-danger"
                          disabled={busyId === p.id}
                          onClick={() => doReject(p.id)}
                        >
                          Reject
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </>
          )}

          {/* Reward requests --------------------------------------------- */}
          {pendingRewards.length > 0 && (
            <>
              <h2 className="text-sm uppercase tracking-wide text-slate-500 mb-2">
                🎁 Rewards &amp; screen time ({pendingRewards.length})
              </h2>
              <ul className="space-y-3 mb-6">
                {pendingRewards.map((r) => {
                  const kid = kidById[r.kidId]
                  return (
                    <li key={r.id} className="card">
                      <div className="flex items-start gap-3">
                        <span className="text-2xl">{r.rewardEmoji || '🎁'}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium break-words">{r.rewardTitle}</div>
                          <div className="text-xs text-slate-400">
                            {kid?.avatarEmoji} {kid?.displayName ?? r.kidId} · 🪙 {r.coinCost}
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            {formatTime(parsePbDate(r.created))}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          className="btn-success"
                          disabled={busyId === r.id}
                          onClick={() => doApproveReward(r.id)}
                        >
                          Approve · −🪙{r.coinCost}
                        </button>
                        <button
                          className="btn-danger"
                          disabled={busyId === r.id}
                          onClick={() => doDenyReward(r.id)}
                        >
                          Deny
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </>
          )}

          {/* Goal contributions awaiting approval ------------------------ */}
          {pendingGoalContribs.length > 0 && (
            <>
              <h2 className="text-sm uppercase tracking-wide text-slate-500 mb-2">
                🎯 Goal contributions ({pendingGoalContribs.length})
              </h2>
              <ul className="space-y-3 mb-6">
                {pendingGoalContribs.map((c) => {
                  const kid = kidById[c.kidId]
                  const goal = goalById[c.goalId]
                  return (
                    <li key={c.id} className="card">
                      <div className="flex items-start gap-3">
                        <span className="text-2xl">{goal?.emoji || '🎯'}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium break-words">
                            {goal?.title || 'Goal'}
                          </div>
                          <div className="text-xs text-slate-400">
                            {kid?.avatarEmoji} {kid?.displayName ?? c.kidId} · wants to
                            contribute 🪙 {c.coinAmount}
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            {formatTime(parsePbDate(c.created))}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          className="btn-success"
                          disabled={busyId === c.id}
                          onClick={() => doApproveGoalContrib(c.id)}
                        >
                          Approve · −🪙{c.coinAmount}
                        </button>
                        <button
                          className="btn-danger"
                          disabled={busyId === c.id}
                          onClick={() => doDenyGoalContrib(c.id)}
                        >
                          Deny
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </>
          )}

          {/* Goals reached, awaiting final cash-out ---------------------- */}
          {reachedGoals.length > 0 && (
            <>
              <h2 className="text-sm uppercase tracking-wide text-slate-500 mb-2">
                🎉 Goals reached — ready to cash out ({reachedGoals.length})
              </h2>
              <ul className="space-y-3">
                {reachedGoals.map((g) => {
                  const kid = g.ownerKidId ? kidById[g.ownerKidId] : undefined
                  return (
                    <li key={g.id} className="card border-emerald-800/60 bg-emerald-950/20">
                      <div className="flex items-start gap-3">
                        <span className="text-2xl">{g.emoji || '🎯'}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium break-words">{g.title}</div>
                          <div className="text-xs text-slate-400">
                            {g.ownerKidId
                              ? `${kid?.avatarEmoji ?? ''} ${kid?.displayName ?? 'Kid'}`
                              : '👨‍👩‍👧 Family'}{' '}
                            · target hit — 🪙 {g.coinTarget}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3">
                        <button
                          className="btn-success w-full"
                          disabled={busyId === g.id}
                          onClick={() => doCompleteGoal(g.id)}
                        >
                          {busyId === g.id ? 'Completing…' : '🎉 Cash out & close'}
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </>
      )}
    </TabBarLayout>
  )
}

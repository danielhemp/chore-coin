import { useState } from 'react'
import { TabBarLayout, PageHeader } from '../../components/Layout'
import { PARENT_TABS } from './ParentDashboard'
import {
  useKids,
  usePendingCompletions,
  usePendingRewardRequests,
} from '../../hooks/data'
import {
  approveCompletion,
  approveRewardRequest,
  denyRewardRequest,
  rejectCompletion,
} from '../../lib/actions'
import { parsePbDate, formatTime } from '../../lib/dates'

export default function Approvals() {
  const { data: pending, loading } = usePendingCompletions()
  const { data: pendingRewards, loading: loadingRewards } = usePendingRewardRequests()
  const { data: kids } = useKids(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const kidById = Object.fromEntries(kids.map((k) => [k.id, k]))

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

  const totalPending = pending.length + pendingRewards.length
  const anythingLoading = loading || loadingRewards

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
                🎁 Reward requests ({pendingRewards.length})
              </h2>
              <ul className="space-y-3">
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
        </>
      )}
    </TabBarLayout>
  )
}

import { useState } from 'react'
import { TabBarLayout } from '../../components/Layout'
import { useAuth } from '../../auth/AuthContext'
import {
  useActiveRewardItems,
  useBalance,
  useKid,
  usePendingRewardRequestsForKid,
} from '../../hooks/data'
import {
  cancelRewardRequest,
  redeemCoinsForCash,
  redeemCoinsForScreen,
  requestReward,
} from '../../lib/actions'
import { COIN_TO_CENTS, COIN_TO_SCREEN_MINUTES } from '../../lib/types'

const KID_TABS = [
  { to: '/', label: 'Chores', icon: '✅' },
  { to: '/redeem', label: 'Redeem', icon: '🪙' },
]

export default function KidRedeem() {
  const { user } = useAuth()
  const kidId = user?.kidId
  const { data: kid } = useKid(kidId)
  const { balance } = useBalance(kidId)
  const { data: rewards } = useActiveRewardItems()
  const { data: pendingRequests } = usePendingRewardRequestsForKid(kidId)

  const [amount, setAmount] = useState(1)
  const [busy, setBusy] = useState<'screen' | 'cash' | null>(null)
  const [rewardBusyId, setRewardBusyId] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const canRedeem = amount > 0 && amount <= balance

  const doRedeem = async (kind: 'screen' | 'cash') => {
    if (!kidId) return
    setBusy(kind)
    setMsg(null)
    setErr(null)
    try {
      if (kind === 'screen') {
        await redeemCoinsForScreen(kidId, amount)
        setMsg(
          `Redeemed ${amount} coins for ${amount * COIN_TO_SCREEN_MINUTES} minutes of screen time. Ask a parent to unlock it for you!`,
        )
      } else {
        await redeemCoinsForCash(kidId, amount)
        setMsg(
          `Cashed out ${amount} coins for $${((amount * COIN_TO_CENTS) / 100).toFixed(2)}. A parent will pay you soon!`,
        )
      }
    } catch (e: any) {
      setErr(e?.message || 'Redemption failed')
    } finally {
      setBusy(null)
    }
  }

  const pendingRewardIds = new Set(pendingRequests.map((r) => r.rewardId))

  const doRequestReward = async (rewardId: string, title: string) => {
    if (!kidId) return
    setRewardBusyId(rewardId)
    setMsg(null)
    setErr(null)
    try {
      await requestReward(kidId, rewardId)
      setMsg(`Asked for "${title}" — waiting for a parent to approve.`)
    } catch (e: any) {
      setErr(e?.message || 'Request failed')
    } finally {
      setRewardBusyId(null)
    }
  }

  const doCancel = async (requestId: string) => {
    setRewardBusyId(requestId)
    setErr(null)
    try {
      await cancelRewardRequest(requestId)
    } catch (e: any) {
      setErr(e?.message || 'Cancel failed')
    } finally {
      setRewardBusyId(null)
    }
  }

  return (
    <TabBarLayout tabs={KID_TABS}>
      <div className="mb-4 flex items-center gap-3">
        <span className="text-4xl">{kid?.avatarEmoji ?? '👦'}</span>
        <div>
          <h1 className="text-2xl font-bold">Redeem coins</h1>
          <p className="text-sm text-slate-400">Balance: 🪙 {balance}</p>
        </div>
      </div>

      <div className="card mb-4">
        <label className="block text-sm text-slate-400 mb-2">How many coins?</label>
        <div className="flex items-center gap-2">
          <button
            className="btn-secondary"
            onClick={() => setAmount((a) => Math.max(1, a - 1))}
            disabled={amount <= 1}
          >
            −
          </button>
          <input
            className="input text-center text-2xl font-bold"
            type="number"
            min={1}
            max={balance}
            value={amount}
            onChange={(e) =>
              setAmount(Math.max(1, Math.min(balance, Number(e.target.value) || 1)))
            }
          />
          <button
            className="btn-secondary"
            onClick={() => setAmount((a) => Math.min(balance, a + 1))}
            disabled={amount >= balance}
          >
            +
          </button>
        </div>
        <div className="mt-2 text-xs text-slate-500 text-center">
          {balance === 0 ? 'Do some chores to earn coins!' : `Up to ${balance}`}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <button
          className="btn-primary py-6 text-left flex-col items-start"
          onClick={() => doRedeem('screen')}
          disabled={!canRedeem || busy !== null}
        >
          <div className="text-2xl font-bold">📺 {amount * COIN_TO_SCREEN_MINUTES} minutes</div>
          <div className="text-sm text-brand-100 opacity-90">of extra screen time</div>
        </button>
        <button
          className="btn-success py-6 text-left flex-col items-start"
          onClick={() => doRedeem('cash')}
          disabled={!canRedeem || busy !== null}
        >
          <div className="text-2xl font-bold">💵 ${((amount * COIN_TO_CENTS) / 100).toFixed(2)}</div>
          <div className="text-sm text-emerald-100 opacity-90">cash on payday</div>
        </button>
      </div>

      {/* Reward catalog ---------------------------------------------------- */}
      {rewards.length > 0 && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold mb-2">🎁 Rewards</h2>
          <p className="text-xs text-slate-400 mb-3">
            Tap to ask a parent — they'll approve or deny.
          </p>
          <ul className="space-y-2">
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
                      disabled={
                        rewardBusyId === r.id || alreadyPending || !canAfford
                      }
                      onClick={() => doRequestReward(r.id, r.title)}
                    >
                      {alreadyPending ? 'Requested' : canAfford ? 'Ask' : 'Not enough'}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* Pending requests (kid can cancel) --------------------------------- */}
      {pendingRequests.length > 0 && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold mb-2">⏳ Waiting for approval</h2>
          <ul className="space-y-2">
            {pendingRequests.map((p) => (
              <li key={p.id} className="card flex items-center gap-3">
                <span className="text-2xl">{p.rewardEmoji || '🎁'}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium break-words">{p.rewardTitle}</div>
                  <div className="text-xs text-slate-400">🪙 {p.coinCost}</div>
                </div>
                <button
                  className="btn-ghost !py-2 !px-3 text-sm text-red-400 shrink-0"
                  disabled={rewardBusyId === p.id}
                  onClick={() => doCancel(p.id)}
                >
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {msg && (
        <div className="mt-4 card border-emerald-800 bg-emerald-950/40 text-emerald-200">{msg}</div>
      )}
      {err && (
        <div className="mt-4 card border-red-800 bg-red-950/40 text-red-200">{err}</div>
      )}
    </TabBarLayout>
  )
}

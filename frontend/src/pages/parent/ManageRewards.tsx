import { useState } from 'react'
import { Link } from 'react-router-dom'
import { TabBarLayout, PageHeader } from '../../components/Layout'
import { PARENT_TABS } from './ParentDashboard'
import { useAllRewardItems } from '../../hooks/data'
import {
  createRewardItem,
  deleteRewardItem,
  updateRewardItem,
} from '../../lib/actions'
import type { RewardItemFields } from '../../lib/types'

export default function ManageRewards() {
  const { data: rewards, loading } = useAllRewardItems()
  const [title, setTitle] = useState('')
  const [emoji, setEmoji] = useState('🎁')
  const [description, setDescription] = useState('')
  const [coinCost, setCoinCost] = useState('10')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    const cost = Math.max(1, Math.floor(Number(coinCost)) || 1)
    setBusy(true)
    setErr(null)
    try {
      await createRewardItem({
        title: title.trim(),
        emoji: emoji.trim() || '🎁',
        description: description.trim(),
        coinCost: cost,
        active: true,
      })
      setTitle('')
      setEmoji('🎁')
      setDescription('')
      setCoinCost('10')
    } catch (e: any) {
      setErr(e?.message || 'Failed to add reward')
    } finally {
      setBusy(false)
    }
  }

  const patch = async (id: string, p: Partial<RewardItemFields>) => {
    await updateRewardItem(id, p)
  }

  const remove = async (id: string) => {
    if (!window.confirm('Delete this reward? Past redemptions stay in history.')) return
    await deleteRewardItem(id)
  }

  return (
    <TabBarLayout tabs={PARENT_TABS}>
      <PageHeader
        title="Rewards"
        subtitle="Pre-set activities kids can spend coins on."
        action={
          <Link to="/redemptions" className="btn-ghost">
            ← Redemptions
          </Link>
        }
      />

      <form onSubmit={add} className="card mb-6 space-y-3">
        <input
          className="input"
          placeholder="Reward title (e.g. Movie night)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Emoji</label>
            <input
              className="input text-center text-xl"
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              maxLength={4}
              placeholder="🎁"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-slate-400 mb-1">Cost (coins)</label>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              min={1}
              value={coinCost}
              onChange={(e) => setCoinCost(e.target.value)}
              onBlur={() => {
                const n = Math.max(1, Math.floor(Number(coinCost)) || 1)
                setCoinCost(String(n))
              }}
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">
            Description (optional — what does the kid get?)
          </label>
          <input
            className="input"
            placeholder="e.g. Pick the movie + popcorn"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        {err && <div className="text-sm text-red-400">{err}</div>}
        <button className="btn-primary w-full" disabled={busy || !title.trim()}>
          Add reward
        </button>
      </form>

      {loading ? (
        <div className="text-slate-400">Loading…</div>
      ) : rewards.length === 0 ? (
        <div className="card text-slate-400 text-center">
          No rewards yet. Add one above — kids can request it from the Redeem tab.
        </div>
      ) : (
        <ul className="space-y-2">
          {rewards.map((r) => (
            <li key={r.id} className={`card ${!r.active ? 'opacity-60' : ''}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 sm:flex-1 flex items-start gap-3">
                  <span className="text-3xl leading-none">{r.emoji || '🎁'}</span>
                  <div className="min-w-0">
                    <div className="font-medium break-words">{r.title}</div>
                    {r.description && (
                      <div className="text-xs text-slate-400 mt-1 break-words">
                        {r.description}
                      </div>
                    )}
                    <div className="text-xs text-slate-500 mt-1">🪙 {r.coinCost}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 justify-end sm:justify-start shrink-0">
                  <button
                    className="btn-ghost !px-3 !py-2 text-sm"
                    aria-label="Rename"
                    title="Rename"
                    onClick={() => {
                      const t = window.prompt('New title', r.title)
                      if (t?.trim()) patch(r.id, { title: t.trim() })
                    }}
                  >
                    ✎
                  </button>
                  <button
                    className="btn-ghost !px-3 !py-2 text-sm"
                    aria-label="Edit cost"
                    title="Edit cost"
                    onClick={() => {
                      const v = window.prompt('New coin cost', String(r.coinCost))
                      const n = Number(v)
                      if (v && Number.isFinite(n) && n > 0) patch(r.id, { coinCost: Math.floor(n) })
                    }}
                  >
                    🪙
                  </button>
                  <button
                    className="btn-ghost !px-3 !py-2 text-sm"
                    aria-label="Edit description"
                    title="Edit description"
                    onClick={() => {
                      const d = window.prompt('Description', r.description ?? '')
                      if (d !== null) patch(r.id, { description: d })
                    }}
                  >
                    📝
                  </button>
                  <button
                    className="btn-ghost !px-3 !py-2 text-sm"
                    onClick={() => patch(r.id, { active: !r.active })}
                  >
                    {r.active ? 'Pause' : 'Resume'}
                  </button>
                  <button
                    className="btn-ghost !px-3 !py-2 text-sm text-red-400"
                    aria-label="Delete"
                    title="Delete"
                    onClick={() => remove(r.id)}
                  >
                    🗑
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </TabBarLayout>
  )
}

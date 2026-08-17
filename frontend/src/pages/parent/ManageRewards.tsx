import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { TabBarLayout, PageHeader, Modal } from '../../components/Layout'
import { PARENT_TABS } from './ParentDashboard'
import { useAllRewardItems } from '../../hooks/data'
import {
  createRewardItem,
  deleteRewardItem,
  updateRewardItem,
} from '../../lib/actions'
import type { RewardItemFields, RewardItemRecord } from '../../lib/types'

export default function ManageRewards() {
  const { data: rewards, loading } = useAllRewardItems()
  const [title, setTitle] = useState('')
  const [emoji, setEmoji] = useState('🎁')
  const [description, setDescription] = useState('')
  const [coinCost, setCoinCost] = useState('10')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [editing, setEditing] = useState<RewardItemRecord | null>(null)

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

  const toggleActive = (r: RewardItemRecord) => updateRewardItem(r.id, { active: !r.active })

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
                    onClick={() => setEditing(r)}
                  >
                    ✎ Edit
                  </button>
                  <button
                    className="btn-ghost !px-3 !py-2 text-sm"
                    onClick={() => toggleActive(r)}
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

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit reward">
        {editing && (
          <EditRewardForm
            reward={editing}
            onSaved={() => setEditing(null)}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>
    </TabBarLayout>
  )
}

/**
 * Full-field edit form for a reward item. Every field the create form
 * has is editable here — title, emoji, coin cost, description, active.
 * Local state seeds from the record on mount; Save calls updateRewardItem
 * with the full field set and then closes the modal via onSaved().
 */
function EditRewardForm({
  reward,
  onSaved,
  onCancel,
}: {
  reward: RewardItemRecord
  onSaved: () => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(reward.title)
  const [emoji, setEmoji] = useState(reward.emoji || '🎁')
  const [description, setDescription] = useState(reward.description || '')
  const [coinCost, setCoinCost] = useState(String(reward.coinCost))
  const [active, setActive] = useState<boolean>(reward.active !== false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Re-seed if a different reward is passed in.
  useEffect(() => {
    setTitle(reward.title)
    setEmoji(reward.emoji || '🎁')
    setDescription(reward.description || '')
    setCoinCost(String(reward.coinCost))
    setActive(reward.active !== false)
  }, [reward])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const t = title.trim()
    if (!t) {
      setErr('Title is required.')
      return
    }
    const patch: Partial<RewardItemFields> = {
      title: t,
      emoji: emoji.trim() || '🎁',
      description: description.trim(),
      coinCost: Math.max(1, Math.floor(Number(coinCost)) || 1),
      active,
    }
    setBusy(true)
    setErr(null)
    try {
      await updateRewardItem(reward.id, patch)
      onSaved()
    } catch (e: any) {
      setErr(e?.message || 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <div>
        <label className="block text-xs text-slate-400 mb-1">Title</label>
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Emoji</label>
          <input
            className="input text-center text-xl"
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            maxLength={4}
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
        <label className="block text-xs text-slate-400 mb-1">Description</label>
        <input
          className="input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div>
        <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="w-4 h-4"
          />
          Active (kids can see + ask for this reward)
        </label>
      </div>
      {err && <div className="text-sm text-red-400">{err}</div>}
      <div className="flex gap-2 pt-2">
        <button
          type="button"
          className="btn-secondary flex-1"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
        <button className="btn-primary flex-1" type="submit" disabled={busy || !title.trim()}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  )
}

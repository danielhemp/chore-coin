import { useState } from 'react'
import { Link } from 'react-router-dom'
import { TabBarLayout, PageHeader } from '../../components/Layout'
import { PARENT_TABS } from './ParentDashboard'
import { useAllBonusChores, useKids } from '../../hooks/data'
import { createBonusChore, deleteBonusChore, updateBonusChore } from '../../lib/actions'
import type { BonusAssigned, BonusChoreFields, BonusRecurring } from '../../lib/types'

export default function ManageBonusChores() {
  const { data: chores, loading } = useAllBonusChores()
  const { data: kids } = useKids()
  const [title, setTitle] = useState('')
  // Kept as strings so the fields can be temporarily empty while the user
  // is typing (e.g. clearing the default before entering a new number).
  // They're parsed & validated on submit.
  const [coinValue, setCoinValue] = useState('1')
  const [assigned, setAssigned] = useState<BonusAssigned>('all')
  const [recurring, setRecurring] = useState<BonusRecurring>('anytime')
  const [maxPerDay, setMaxPerDay] = useState('0')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    const parsedCoin = Math.max(1, Math.floor(Number(coinValue)) || 1)
    const parsedMax = Math.max(0, Math.floor(Number(maxPerDay)) || 0)
    setBusy(true)
    setErr(null)
    try {
      await createBonusChore({
        title: title.trim(),
        coinValue: parsedCoin,
        assignedTo: assigned,
        recurring,
        maxPerDay: parsedMax,
        active: true,
      })
      setTitle('')
      setCoinValue('1')
      setAssigned('all')
      setRecurring('anytime')
      setMaxPerDay('0')
    } catch (e: any) {
      setErr(e?.message || 'Failed to add chore')
    } finally {
      setBusy(false)
    }
  }

  const patch = async (id: string, p: Partial<BonusChoreFields>) => {
    await updateBonusChore(id, p)
  }

  const remove = async (id: string) => {
    if (!window.confirm('Delete this bonus chore? History stays intact.')) return
    await deleteBonusChore(id)
  }

  const kidNameById = Object.fromEntries(kids.map((k) => [k.id, k.displayName]))

  return (
    <TabBarLayout tabs={PARENT_TABS}>
      <PageHeader
        title="Bonus chores"
        subtitle="Each coin = 5 min screen time OR $0.25 cash."
        action={
          <Link to="/" className="btn-ghost">
            ← Home
          </Link>
        }
      />

      <form onSubmit={add} className="card mb-6 space-y-3">
        <input
          className="input"
          placeholder="Chore title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Coins</label>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              min={1}
              value={coinValue}
              onChange={(e) => setCoinValue(e.target.value)}
              onBlur={() => {
                // Snap back to a valid value only when the user leaves the field.
                const n = Math.max(1, Math.floor(Number(coinValue)) || 1)
                setCoinValue(String(n))
              }}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Frequency</label>
            <select
              className="input"
              value={recurring}
              onChange={(e) => setRecurring(e.target.value as BonusRecurring)}
            >
              <option value="anytime">Anytime (repeatable)</option>
              <option value="daily">Once per day</option>
              <option value="once">One-time</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">
            Max approvals per kid per day (0 = no cap)
          </label>
          <input
            className="input"
            type="number"
            inputMode="numeric"
            min={0}
            value={maxPerDay}
            onChange={(e) => setMaxPerDay(e.target.value)}
            onBlur={() => {
              const n = Math.max(0, Math.floor(Number(maxPerDay)) || 0)
              setMaxPerDay(String(n))
            }}
            placeholder="0 = unlimited"
          />
          <div className="text-xs text-slate-500 mt-1">
            Once a kid hits this many approvals for the day, this chore hides for them until
            tomorrow.
          </div>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Who can do it?</label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setAssigned('all')}
              className={`pill ${assigned === 'all' ? 'bg-brand-600 text-white' : ''}`}
            >
              Everyone
            </button>
            {kids.map((k) => {
              const selected = Array.isArray(assigned) && assigned.includes(k.id)
              return (
                <button
                  type="button"
                  key={k.id}
                  onClick={() => {
                    const cur = Array.isArray(assigned) ? assigned : []
                    setAssigned(selected ? cur.filter((x) => x !== k.id) : [...cur, k.id])
                  }}
                  className={`pill ${selected ? 'bg-brand-600 text-white' : ''}`}
                >
                  {k.avatarEmoji} {k.displayName}
                </button>
              )
            })}
          </div>
        </div>
        {err && <div className="text-sm text-red-400">{err}</div>}
        <button className="btn-primary w-full" disabled={busy || !title.trim()}>
          Add bonus chore
        </button>
      </form>

      {loading ? (
        <div className="text-slate-400">Loading…</div>
      ) : chores.length === 0 ? (
        <div className="card text-slate-400 text-center">No bonus chores yet.</div>
      ) : (
        <ul className="space-y-2">
          {chores.map((c) => (
            <li key={c.id} className={`card ${!c.active ? 'opacity-60' : ''}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 sm:flex-1">
                  <div className="font-medium break-words">{c.title}</div>
                  <div className="text-xs text-slate-400 mt-1">
                    🪙 {c.coinValue} · {c.recurring}
                    {c.maxPerDay && c.maxPerDay > 0 ? ` · max ${c.maxPerDay}/day` : ''} ·{' '}
                    {c.assignedTo === 'all'
                      ? 'Everyone'
                      : (c.assignedTo as string[])
                          .map((id) => kidNameById[id] ?? '?')
                          .join(', ') || 'No one'}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 justify-end sm:justify-start shrink-0">
                  <button
                    className="btn-ghost !px-3 !py-2 text-sm"
                    aria-label="Rename"
                    title="Rename"
                    onClick={() => {
                      const t = window.prompt('New title', c.title)
                      if (t?.trim()) patch(c.id, { title: t.trim() })
                    }}
                  >
                    ✎
                  </button>
                  <button
                    className="btn-ghost !px-3 !py-2 text-sm"
                    aria-label="Edit coin value"
                    title="Edit coin value"
                    onClick={() => {
                      const v = window.prompt('New coin value', String(c.coinValue))
                      const n = Number(v)
                      if (v && Number.isFinite(n) && n > 0) patch(c.id, { coinValue: n })
                    }}
                  >
                    🪙
                  </button>
                  <button
                    className="btn-ghost !px-3 !py-2 text-sm"
                    aria-label="Set daily cap"
                    title="Set daily cap"
                    onClick={() => {
                      const v = window.prompt(
                        'Max approvals per kid per day (0 = no cap)',
                        String(c.maxPerDay ?? 0),
                      )
                      const n = Number(v)
                      if (v !== null && Number.isFinite(n) && n >= 0)
                        patch(c.id, { maxPerDay: n })
                    }}
                  >
                    #/day
                  </button>
                  <button
                    className="btn-ghost !px-3 !py-2 text-sm"
                    onClick={() => patch(c.id, { active: !c.active })}
                  >
                    {c.active ? 'Pause' : 'Resume'}
                  </button>
                  <button
                    className="btn-ghost !px-3 !py-2 text-sm text-red-400"
                    aria-label="Delete"
                    title="Delete"
                    onClick={() => remove(c.id)}
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

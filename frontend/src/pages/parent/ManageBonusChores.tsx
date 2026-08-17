import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { TabBarLayout, PageHeader, Modal } from '../../components/Layout'
import { PARENT_TABS } from './ParentDashboard'
import { useAllBonusChores, useKids } from '../../hooks/data'
import { createBonusChore, deleteBonusChore, updateBonusChore } from '../../lib/actions'
import type {
  BonusAssigned,
  BonusChoreFields,
  BonusChoreRecord,
  BonusRecurring,
  KidRecord,
} from '../../lib/types'

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

  const [editing, setEditing] = useState<BonusChoreRecord | null>(null)

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

  const toggleActive = (c: BonusChoreRecord) => updateBonusChore(c.id, { active: !c.active })

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
          <AssignPicker kids={kids} value={assigned} onChange={setAssigned} />
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
                    onClick={() => setEditing(c)}
                  >
                    ✎ Edit
                  </button>
                  <button
                    className="btn-ghost !px-3 !py-2 text-sm"
                    onClick={() => toggleActive(c)}
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

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit bonus chore">
        {editing && (
          <EditBonusChoreForm
            chore={editing}
            kids={kids}
            onSaved={() => setEditing(null)}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>
    </TabBarLayout>
  )
}

/**
 * Full-field edit form for a bonus chore. Rendered inside the Modal from
 * the parent Manage page. Every field the create form has is editable
 * here — title, coin value, frequency, per-day cap, and who can do it.
 * Local state seeds from the record on mount; Save calls updateBonusChore
 * with the full field set and then closes the modal via onSaved().
 */
function EditBonusChoreForm({
  chore,
  kids,
  onSaved,
  onCancel,
}: {
  chore: BonusChoreRecord
  kids: KidRecord[]
  onSaved: () => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(chore.title)
  const [coinValue, setCoinValue] = useState(String(chore.coinValue))
  const [assigned, setAssigned] = useState<BonusAssigned>(chore.assignedTo)
  const [recurring, setRecurring] = useState<BonusRecurring>(chore.recurring)
  const [maxPerDay, setMaxPerDay] = useState(String(chore.maxPerDay ?? 0))
  const [active, setActive] = useState<boolean>(chore.active !== false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Re-seed if the parent passes a different chore into the same open modal
  // (defensive — shouldn't happen with the current flow but avoids stale
  // state if this component is later reused).
  useEffect(() => {
    setTitle(chore.title)
    setCoinValue(String(chore.coinValue))
    setAssigned(chore.assignedTo)
    setRecurring(chore.recurring)
    setMaxPerDay(String(chore.maxPerDay ?? 0))
    setActive(chore.active !== false)
  }, [chore])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const t = title.trim()
    if (!t) {
      setErr('Title is required.')
      return
    }
    const patch: Partial<BonusChoreFields> = {
      title: t,
      coinValue: Math.max(1, Math.floor(Number(coinValue)) || 1),
      assignedTo: assigned,
      recurring,
      maxPerDay: Math.max(0, Math.floor(Number(maxPerDay)) || 0),
      active,
    }
    setBusy(true)
    setErr(null)
    try {
      await updateBonusChore(chore.id, patch)
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
        />
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">Who can do it?</label>
        <AssignPicker kids={kids} value={assigned} onChange={setAssigned} />
      </div>
      <div>
        <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="w-4 h-4"
          />
          Active (kids can see + submit this chore)
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

/**
 * The pill-picker for "Everyone" vs individual kids. Shared between the
 * create form and the edit modal so the two places stay visually identical.
 */
function AssignPicker({
  kids,
  value,
  onChange,
}: {
  kids: KidRecord[]
  value: BonusAssigned
  onChange: (v: BonusAssigned) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onChange('all')}
        className={`pill ${value === 'all' ? 'bg-brand-600 text-white' : ''}`}
      >
        Everyone
      </button>
      {kids.map((k) => {
        const selected = Array.isArray(value) && value.includes(k.id)
        return (
          <button
            type="button"
            key={k.id}
            onClick={() => {
              const cur = Array.isArray(value) ? value : []
              onChange(selected ? cur.filter((x) => x !== k.id) : [...cur, k.id])
            }}
            className={`pill ${selected ? 'bg-brand-600 text-white' : ''}`}
          >
            {k.avatarEmoji} {k.displayName}
          </button>
        )
      })}
    </div>
  )
}

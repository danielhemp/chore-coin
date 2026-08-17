import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { TabBarLayout, PageHeader, Modal } from '../../components/Layout'
import { PARENT_TABS } from './ParentDashboard'
import { useBaseChores, useKid } from '../../hooks/data'
import {
  createBaseChore,
  deleteBaseChore,
  updateBaseChore,
} from '../../lib/actions'
import type { BaseChoreFields, BaseChoreRecord } from '../../lib/types'

export default function ManageBaseChores() {
  const { kidId } = useParams<{ kidId: string }>()
  const { data: kid } = useKid(kidId)
  const { data: chores, loading } = useBaseChores(kidId)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [editing, setEditing] = useState<BaseChoreRecord | null>(null)

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!kidId || !title.trim()) return
    setBusy(true)
    setErr(null)
    try {
      const nextOrder = (chores.at(-1)?.order ?? 0) + 10
      await createBaseChore(kidId, title.trim(), nextOrder)
      setTitle('')
    } catch (e: any) {
      setErr(e?.message || 'Failed to add chore')
    } finally {
      setBusy(false)
    }
  }

  const toggle = (c: BaseChoreRecord) => updateBaseChore(c.id, { active: !c.active })

  const remove = async (id: string) => {
    if (!window.confirm('Delete this chore? History stays intact.')) return
    await deleteBaseChore(id)
  }

  const move = async (id: string, direction: -1 | 1) => {
    const idx = chores.findIndex((c) => c.id === id)
    const other = chores[idx + direction]
    if (!other) return
    const chore = chores[idx]
    await updateBaseChore(chore.id, { order: other.order })
    await updateBaseChore(other.id, { order: chore.order })
  }

  return (
    <TabBarLayout tabs={PARENT_TABS}>
      <PageHeader
        title={`${kid?.displayName ?? 'Kid'} — base chores`}
        subtitle="Complete every active chore to earn today's screen time."
        action={
          <Link to={`/kids/${kidId}`} className="btn-ghost">
            ← Back
          </Link>
        }
      />

      <form onSubmit={add} className="card mb-6 flex gap-2">
        <input
          className="input"
          placeholder="e.g. Make bed"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button className="btn-primary" disabled={busy || !title.trim()}>
          Add
        </button>
      </form>
      {err && <div className="card mb-3 border-red-800 bg-red-950/40 text-red-200">{err}</div>}

      {loading ? (
        <div className="text-slate-400">Loading…</div>
      ) : chores.length === 0 ? (
        <div className="card text-slate-400 text-center">No base chores yet.</div>
      ) : (
        <ul className="space-y-2">
          {chores.map((c, i) => (
            <li
              key={c.id}
              className={`card flex flex-col gap-3 sm:flex-row sm:items-center ${!c.active ? 'opacity-60' : ''}`}
            >
              <div className="min-w-0 sm:flex-1">
                <div className="font-medium break-words">{c.title}</div>
                <div className="text-xs text-slate-500">order {c.order}</div>
              </div>
              <div className="flex flex-wrap gap-1 justify-end sm:justify-start shrink-0">
                <button
                  className="btn-ghost !px-3 !py-2 text-sm"
                  aria-label="Move up"
                  title="Move up"
                  onClick={() => move(c.id, -1)}
                  disabled={i === 0}
                >
                  ↑
                </button>
                <button
                  className="btn-ghost !px-3 !py-2 text-sm"
                  aria-label="Move down"
                  title="Move down"
                  onClick={() => move(c.id, 1)}
                  disabled={i === chores.length - 1}
                >
                  ↓
                </button>
                <button
                  className="btn-ghost !px-3 !py-2 text-sm"
                  onClick={() => setEditing(c)}
                >
                  ✎ Edit
                </button>
                <button
                  className="btn-ghost !px-3 !py-2 text-sm"
                  onClick={() => toggle(c)}
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
            </li>
          ))}
        </ul>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit base chore">
        {editing && (
          <EditBaseChoreForm
            chore={editing}
            onSaved={() => setEditing(null)}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>
    </TabBarLayout>
  )
}

/**
 * Edit form for a base chore. Title + active are the only field-level
 * attributes worth editing here; order is handled inline by the ↑/↓
 * buttons on the list itself so the parent can see the resulting order
 * as they change it.
 */
function EditBaseChoreForm({
  chore,
  onSaved,
  onCancel,
}: {
  chore: BaseChoreRecord
  onSaved: () => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(chore.title)
  const [active, setActive] = useState<boolean>(chore.active !== false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    setTitle(chore.title)
    setActive(chore.active !== false)
  }, [chore])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const t = title.trim()
    if (!t) {
      setErr('Title is required.')
      return
    }
    const patch: Partial<BaseChoreFields> = { title: t, active }
    setBusy(true)
    setErr(null)
    try {
      await updateBaseChore(chore.id, patch)
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
      <div>
        <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="w-4 h-4"
          />
          Active (counts toward today's screen time when completed)
        </label>
      </div>
      <div className="text-xs text-slate-500">
        To reorder chores, use the ↑ and ↓ buttons on the list itself.
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

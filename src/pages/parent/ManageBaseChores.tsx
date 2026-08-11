import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { TabBarLayout, PageHeader } from '../../components/Layout'
import { PARENT_TABS } from './ParentDashboard'
import { useBaseChores, useKid } from '../../hooks/data'
import {
  createBaseChore,
  deleteBaseChore,
  updateBaseChore,
} from '../../lib/actions'

export default function ManageBaseChores() {
  const { kidId } = useParams<{ kidId: string }>()
  const { data: kid } = useKid(kidId)
  const { data: chores, loading } = useBaseChores(kidId)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

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

  const toggle = async (id: string, active: boolean) => {
    await updateBaseChore(id, { active: !active })
  }

  const rename = async (id: string, currentTitle: string) => {
    const t = window.prompt('New title', currentTitle)
    if (!t?.trim()) return
    await updateBaseChore(id, { title: t.trim() })
  }

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
                  aria-label="Rename"
                  title="Rename"
                  onClick={() => rename(c.id, c.title)}
                >
                  ✎
                </button>
                <button
                  className="btn-ghost !px-3 !py-2 text-sm"
                  onClick={() => toggle(c.id, c.active)}
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
    </TabBarLayout>
  )
}

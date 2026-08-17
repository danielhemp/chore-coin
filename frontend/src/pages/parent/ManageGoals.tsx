/**
 * Parent Manage Goals — create, edit, cancel, and complete savings goals.
 *
 * A goal is either:
 *  - Individual (ownerKidId set) — one kid contributes, only they benefit
 *  - Family (ownerKidId null) — anyone can contribute, whole family benefits
 *
 * Contribution / completion happens elsewhere:
 *  - Kids/dashboard contribute from the family dashboard's KidTile
 *  - Parents approve reached goals from the Approvals page
 * This page is the parent's control surface for the goal itself.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { TabBarLayout, PageHeader, Modal } from '../../components/Layout'
import { PARENT_TABS } from './ParentDashboard'
import { useAllGoals, useApprovedContributionsForGoal, useKids } from '../../hooks/data'
import { cancelGoal, completeGoal, createGoal, updateGoal } from '../../lib/actions'
import type { GoalRecord, GoalVisibility, KidRecord } from '../../lib/types'

/**
 * Category presets — each is a tag with a suggested visibility, emoji, and
 * match rate. Parents can pick a category and the form auto-fills; every
 * field remains editable so the parent can override any suggestion. Adding
 * a new category is a one-line change here (no migration).
 */
const CATEGORIES: Record<
  string,
  { label: string; emoji: string; defaultVisibility: GoalVisibility; defaultMatchRate: number }
> = {
  individual: { label: 'Individual — a kid saves', emoji: '⭐', defaultVisibility: 'owner_only', defaultMatchRate: 0 },
  family: { label: 'Family — everyone contributes', emoji: '👨‍👩‍👧', defaultVisibility: 'family', defaultMatchRate: 1 },
  travel: { label: 'Travel / vacation', emoji: '✈️', defaultVisibility: 'family', defaultMatchRate: 2 },
  membership: { label: 'Membership (pool, gym, etc.)', emoji: '🎫', defaultVisibility: 'owner_only', defaultMatchRate: 0.5 },
  experience: { label: 'Experience (event, class)', emoji: '🎪', defaultVisibility: 'family', defaultMatchRate: 0.5 },
  toy: { label: 'Toy / thing', emoji: '🎮', defaultVisibility: 'owner_only', defaultMatchRate: 0 },
  charity: { label: 'Charity / gift', emoji: '❤️', defaultVisibility: 'family', defaultMatchRate: 1 },
  other: { label: 'Other', emoji: '🎯', defaultVisibility: 'owner_only', defaultMatchRate: 0 },
}

export default function ManageGoals() {
  const { data: goals, loading } = useAllGoals()
  const { data: kids } = useKids()

  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<GoalRecord | null>(null)

  const kidById = Object.fromEntries(kids.map((k) => [k.id, k]))

  const active = goals.filter((g) => g.status === 'active' || g.status === 'reached')
  const inactive = goals.filter((g) => g.status === 'completed' || g.status === 'cancelled')

  return (
    <TabBarLayout tabs={PARENT_TABS}>
      <PageHeader
        title="Savings goals"
        subtitle="Kids (or the whole family) save toward something. You approve the cash-out."
        action={
          <Link to="/" className="btn-ghost">
            ← Home
          </Link>
        }
      />

      <button className="btn-primary w-full mb-6" onClick={() => setShowCreate(true)}>
        + New goal
      </button>

      {loading ? (
        <div className="text-slate-400">Loading…</div>
      ) : active.length === 0 ? (
        <div className="card text-slate-400 text-center">
          No active goals yet. Tap "New goal" above to add one.
        </div>
      ) : (
        <ul className="space-y-3">
          {active.map((g) => (
            <GoalRow
              key={g.id}
              goal={g}
              ownerKid={g.ownerKidId ? kidById[g.ownerKidId] : undefined}
              onEdit={() => setEditing(g)}
            />
          ))}
        </ul>
      )}

      {inactive.length > 0 && (
        <details className="mt-8">
          <summary className="text-sm text-slate-500 cursor-pointer hover:text-slate-300">
            History ({inactive.length} completed / cancelled)
          </summary>
          <ul className="space-y-2 mt-3 opacity-70">
            {inactive.map((g) => (
              <li key={g.id} className="card">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{g.emoji || '🎯'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{g.title}</div>
                    <div className="text-xs text-slate-500">
                      {g.status === 'completed' ? 'Completed' : 'Cancelled'} ·{' '}
                      {g.ownerKidId
                        ? kidById[g.ownerKidId]?.displayName ?? 'Kid'
                        : 'Family'}{' '}
                      · Target 🪙 {g.coinTarget}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="New savings goal"
      >
        <GoalForm
          kids={kids}
          onSaved={() => setShowCreate(false)}
          onCancel={() => setShowCreate(false)}
        />
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit goal">
        {editing && (
          <GoalForm
            kids={kids}
            existing={editing}
            onSaved={() => setEditing(null)}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>
    </TabBarLayout>
  )
}

/**
 * Row in the active-goals list. Shows title/emoji/owner + progress toward
 * target using approved contributions. Parent can Edit, Cancel (with
 * refund), or if the goal has 'reached' status, tap Approve to complete.
 */
function GoalRow({
  goal,
  ownerKid,
  onEdit,
}: {
  goal: GoalRecord
  ownerKid?: KidRecord
  onEdit: () => void
}) {
  const { data: contribs } = useApprovedContributionsForGoal(goal.id)
  const totalContrib = contribs.reduce((sum, c) => sum + c.coinAmount, 0)
  const totalMatch = contribs.reduce((sum, c) => sum + (c.matchAmount ?? 0), 0)
  const total = totalContrib + totalMatch
  const pct = Math.min(100, Math.round((total / goal.coinTarget) * 100))
  const reached = goal.status === 'reached'
  const contributorCount = new Set(contribs.map((c) => c.kidId)).size

  const [busy, setBusy] = useState<string | null>(null)

  const doCancel = async () => {
    if (
      !window.confirm(
        `Cancel "${goal.title}"? Any contributions will be refunded back to the kids who made them.`,
      )
    )
      return
    setBusy('cancel')
    try {
      await cancelGoal(goal.id)
    } finally {
      setBusy(null)
    }
  }

  const doComplete = async () => {
    if (!window.confirm(`Mark "${goal.title}" as completed and closed out?`)) return
    setBusy('complete')
    try {
      await completeGoal(goal.id)
    } finally {
      setBusy(null)
    }
  }

  return (
    <li
      className={`card ${
        reached ? 'border-amber-800/60 bg-amber-950/20' : ''
      }`}
    >
      <div className="flex items-start gap-3 mb-3">
        <span className="text-3xl leading-none">{goal.emoji || '🎯'}</span>
        <div className="flex-1 min-w-0">
          <div className="font-medium break-words">{goal.title}</div>
          <div className="text-xs text-slate-400 mt-0.5">
            {goal.ownerKidId
              ? `${ownerKid?.avatarEmoji ?? ''} ${ownerKid?.displayName ?? 'Kid'}`
              : '👨‍👩‍👧 Family'}
            {goal.matchRate > 0 && ` · ${goal.matchRate}× match`}
            {goal.approvalRequired && ' · contributions need approval'}
            {goal.category && ` · ${goal.category}`}
          </div>
          {goal.description && (
            <div className="text-xs text-slate-500 mt-1 break-words">{goal.description}</div>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-2">
        <div className="flex items-baseline justify-between text-xs mb-1">
          <span className="text-slate-300">
            🪙 {totalContrib} saved
            {totalMatch > 0 && (
              <span className="text-emerald-400"> + {totalMatch} match</span>
            )}
            <span className="text-slate-500"> / {goal.coinTarget} target</span>
          </span>
          <span className={reached ? 'text-emerald-300 font-medium' : 'text-slate-400'}>
            {pct}%
          </span>
        </div>
        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${
              reached ? 'bg-emerald-500' : 'bg-brand-500'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="text-[10px] text-slate-500 mt-1">
          {contributorCount > 0
            ? `${contributorCount} contributor${contributorCount === 1 ? '' : 's'}`
            : 'No contributions yet'}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 mt-3">
        {reached && (
          <button
            className="btn-success text-sm flex-1"
            onClick={doComplete}
            disabled={busy !== null}
          >
            {busy === 'complete' ? 'Completing…' : '🎉 Approve completion'}
          </button>
        )}
        <button
          className="btn-secondary text-sm"
          onClick={onEdit}
          disabled={busy !== null || reached}
          title={reached ? 'Cannot edit a reached goal' : 'Edit'}
        >
          ✎ Edit
        </button>
        <button
          className="btn-ghost text-sm text-red-400"
          onClick={doCancel}
          disabled={busy !== null}
        >
          {busy === 'cancel' ? 'Cancelling…' : '🗑 Cancel'}
        </button>
      </div>
    </li>
  )
}

/**
 * Create + edit form for a savings goal, shared between the "new goal"
 * and "edit goal" modals. When `existing` is provided it seeds from that
 * record; without it, an empty create form.
 */
function GoalForm({
  kids,
  existing,
  onSaved,
  onCancel,
}: {
  kids: KidRecord[]
  existing?: GoalRecord
  onSaved: () => void
  onCancel: () => void
}) {
  // Guess category from an existing goal, or default to 'individual' for new.
  const initialCategory =
    existing?.category ||
    (existing?.ownerKidId ? 'individual' : existing ? 'family' : 'individual')
  const initialPreset = CATEGORIES[initialCategory] || CATEGORIES.other

  const [category, setCategory] = useState(initialCategory)
  const [title, setTitle] = useState(existing?.title ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [emoji, setEmoji] = useState(existing?.emoji || initialPreset.emoji)
  const [coinTarget, setCoinTarget] = useState(String(existing?.coinTarget ?? 100))
  const [matchRate, setMatchRate] = useState(
    String(existing?.matchRate ?? initialPreset.defaultMatchRate),
  )
  const [visibility, setVisibility] = useState<GoalVisibility>(
    existing?.visibility ?? initialPreset.defaultVisibility,
  )
  const [ownerKidId, setOwnerKidId] = useState(existing?.ownerKidId ?? '')
  const [approvalRequired, setApprovalRequired] = useState(!!existing?.approvalRequired)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // When user picks a different category (in create mode), auto-fill the
  // emoji + visibility + matchRate to the preset. In edit mode we don't
  // clobber the parent's existing choices.
  useEffect(() => {
    if (existing) return
    const preset = CATEGORIES[category]
    if (!preset) return
    setEmoji(preset.emoji)
    setVisibility(preset.defaultVisibility)
    setMatchRate(String(preset.defaultMatchRate))
    // Family/individual categories imply owner slot behavior:
    if (category === 'family') setOwnerKidId('')
  }, [category, existing])

  const isFamily = !ownerKidId

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const t = title.trim()
    if (!t) return setErr('Title is required.')
    const ct = Math.max(1, Math.floor(Number(coinTarget) || 0))
    const mr = Math.max(0, Number(matchRate) || 0)
    setBusy(true)
    setErr(null)
    try {
      if (existing) {
        await updateGoal(existing.id, {
          title: t,
          description: description.trim(),
          emoji: emoji.trim(),
          category,
          ownerKidId: ownerKidId || undefined,
          coinTarget: ct,
          matchRate: mr,
          visibility,
          approvalRequired,
        })
      } else {
        await createGoal({
          title: t,
          description: description.trim(),
          emoji: emoji.trim(),
          category,
          ownerKidId: ownerKidId || undefined,
          coinTarget: ct,
          matchRate: mr,
          visibility,
          approvalRequired,
        })
      }
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
        <label className="block text-xs text-slate-400 mb-1">Category</label>
        <select
          className="input"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {Object.entries(CATEGORIES).map(([key, c]) => (
            <option key={key} value={key}>
              {c.emoji} {c.label}
            </option>
          ))}
        </select>
        <div className="text-xs text-slate-500 mt-1">
          Sets sensible defaults for visibility + match. Override any of them below.
        </div>
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1">Title</label>
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Swimming pool membership"
          required
        />
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1">Description (optional)</label>
        <input
          className="input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this for? Where does it happen?"
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
          <label className="block text-xs text-slate-400 mb-1">Coin target</label>
          <input
            className="input"
            type="number"
            inputMode="numeric"
            min={1}
            value={coinTarget}
            onChange={(e) => setCoinTarget(e.target.value)}
            onBlur={() =>
              setCoinTarget(String(Math.max(1, Math.floor(Number(coinTarget)) || 1)))
            }
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1">Owner</label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`pill ${isFamily ? 'bg-brand-600 text-white' : ''}`}
            onClick={() => setOwnerKidId('')}
          >
            👨‍👩‍👧 Family (everyone contributes)
          </button>
          {kids.map((k) => (
            <button
              type="button"
              key={k.id}
              className={`pill ${ownerKidId === k.id ? 'bg-brand-600 text-white' : ''}`}
              onClick={() => setOwnerKidId(k.id)}
            >
              {k.avatarEmoji} {k.displayName}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1">
          Parent match rate ({(Number(matchRate) || 0).toFixed(1)}×)
        </label>
        <div className="flex flex-wrap gap-2">
          {[0, 0.25, 0.5, 1, 2, 3].map((r) => (
            <button
              type="button"
              key={r}
              className={`pill ${Number(matchRate) === r ? 'bg-brand-600 text-white' : ''}`}
              onClick={() => setMatchRate(String(r))}
            >
              {r === 0 ? 'No match' : `${r}×`}
            </button>
          ))}
        </div>
        <input
          className="input mt-2"
          type="number"
          step="any"
          min={0}
          value={matchRate}
          onChange={(e) => setMatchRate(e.target.value)}
        />
        <div className="text-xs text-slate-500 mt-1">
          Every 🪙 the kid contributes, you add {(Number(matchRate) || 0).toFixed(1)} 🪙
          from the parent "match pool" (virtual — doesn't come from anyone's real balance).
        </div>
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1">Visibility</label>
        <select
          className="input"
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as GoalVisibility)}
        >
          <option value="owner_only">Owner + parents only</option>
          <option value="family">Whole family can see + contribute</option>
          <option value="private">Parents only (kids can't see)</option>
        </select>
      </div>

      <div>
        <label className="flex items-start gap-2 text-sm text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={approvalRequired}
            onChange={(e) => setApprovalRequired(e.target.checked)}
            className="w-4 h-4 mt-0.5"
          />
          <span>
            Contributions need parent approval
            <span className="block text-xs text-slate-500">
              Coins stay on the kid's balance until you approve each contribution. Useful
              for younger kids or high-cost goals.
            </span>
          </span>
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
          {busy ? 'Saving…' : existing ? 'Save changes' : 'Create goal'}
        </button>
      </div>
    </form>
  )
}

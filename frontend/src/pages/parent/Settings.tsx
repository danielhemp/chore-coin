// Parent Settings — license, backup, dashboards, feedback.
//
// Four independent panels:
//   1. License    — view/set/release the Chore Coin license key stored on
//                   this install. Value comes from /api/custom/license.
//   2. Backup     — a big button that hits GET /api/custom/backup, which
//                   triggers app.CreateBackup() on the Go side and streams
//                   the resulting zip back as a file download.
//   3. Dashboards — create/manage kiosk logins for family wall tablets
//                   (Chromebook, iPad, etc.). Dashboard users can view all
//                   family data + create pending completions + spend base
//                   screen time, but cannot approve, adjust, or manage.
//                   Backed by /api/custom/create-dashboard, delete-dashboard,
//                   reset-dashboard-pin.
//   4. Feedback   — three mailto buttons (bug / feature / question) that
//                   pre-fill an email to daniel@turnersystems.com with the
//                   install ID + timezone + timestamp so replies can be
//                   correlated back to this specific instance.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { TabBarLayout, PageHeader } from '../../components/Layout'
import { PARENT_TABS } from './ParentDashboard'
import { useAuth } from '../../auth/AuthContext'
import { pb, callCustom, LOCAL_TZ } from '../../pb'
import { useDashboards, useParents } from '../../hooks/data'
import {
  changeMyPassword,
  createDashboard,
  deleteDashboard,
  resetDashboardPin,
  resetParentPassword,
} from '../../lib/actions'

const FEEDBACK_EMAIL = 'daniel@turnersystems.com'

interface LicenseState {
  licenseKey: string
  licenseActivatedAt: string
  installId: string
}

export default function Settings() {
  const [license, setLicense] = useState<LicenseState | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [keyInput, setKeyInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [releasing, setReleasing] = useState(false)
  const [licMsg, setLicMsg] = useState<string | null>(null)
  const [licErr, setLicErr] = useState<string | null>(null)

  const [downloading, setDownloading] = useState(false)
  const [bakErr, setBakErr] = useState<string | null>(null)

  const load = async () => {
    try {
      const r = await callCustom<LicenseState>('license')
      setLicense(r)
      setKeyInput('')
    } catch (e: any) {
      setLoadErr(e?.message || 'Failed to load license info')
    }
  }

  useEffect(() => {
    load()
  }, [])

  const setKey = async () => {
    setLicMsg(null)
    setLicErr(null)
    setSaving(true)
    try {
      await callCustom('license/set', { licenseKey: keyInput.trim().toUpperCase() })
      setLicMsg('License activated.')
      await load()
    } catch (e: any) {
      setLicErr(e?.message || 'Could not apply the license key.')
    } finally {
      setSaving(false)
    }
  }

  const releaseKey = async () => {
    if (
      !window.confirm(
        'Release this license? You will be able to apply it to another machine, ' +
          'but this install will not have an active license until you enter one again. ' +
          'Your family data is not affected.',
      )
    ) {
      return
    }
    setLicMsg(null)
    setLicErr(null)
    setReleasing(true)
    try {
      await callCustom('license/release')
      setLicMsg('License released. You can now activate it on another install.')
      await load()
    } catch (e: any) {
      setLicErr(e?.message || 'Release failed.')
    } finally {
      setReleasing(false)
    }
  }

  const downloadBackup = async () => {
    setBakErr(null)
    setDownloading(true)
    try {
      // Build a URL with the parent's auth token so PB accepts the GET
      // without going through the SDK (which would try to parse the zip
      // body as JSON and fail).
      const token = pb.authStore.token
      const resp = await fetch('/api/custom/backup', {
        method: 'GET',
        headers: { Authorization: token },
      })
      if (!resp.ok) {
        const t = await resp.text().catch(() => '')
        throw new Error(t || `HTTP ${resp.status}`)
      }
      // Extract filename from Content-Disposition, fall back to a stamp.
      const cd = resp.headers.get('Content-Disposition') || ''
      const match = cd.match(/filename="?([^"]+)"?/)
      const filename = match?.[1] || `chorecoin-backup-${Date.now()}.zip`
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      setBakErr(e?.message || 'Backup failed.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <TabBarLayout tabs={PARENT_TABS}>
      <PageHeader
        title="Settings"
        subtitle="License + backup — everything else stays where it lives."
        action={
          <Link to="/" className="btn-ghost">
            ← Home
          </Link>
        }
      />

      {loadErr && (
        <div className="card mb-4 border-red-800 bg-red-950/40 text-red-200">{loadErr}</div>
      )}

      {/* ---- License panel -------------------------------------------- */}
      <section className="card mb-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">License</h2>
          <p className="text-xs text-slate-400 mt-1">
            One license per install. Release it here to move it to a new
            machine — your data stays put either way.
          </p>
        </div>

        {license?.licenseKey ? (
          <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 space-y-2">
            <div className="text-xs uppercase tracking-wide text-slate-500">Active license</div>
            <div className="font-mono text-lg break-all">{license.licenseKey}</div>
            {license.licenseActivatedAt && (
              <div className="text-xs text-slate-500">
                Activated {new Date(license.licenseActivatedAt).toLocaleString()}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-amber-800/60 bg-amber-950/20 p-4 text-sm text-amber-200">
            No license active on this install. Enter your key below.
          </div>
        )}

        <div>
          <label className="block text-xs uppercase tracking-wide text-slate-500 mb-1">
            {license?.licenseKey ? 'Replace license key' : 'Enter license key'}
          </label>
          <div className="flex items-stretch gap-2">
            <input
              className="input font-mono"
              placeholder="CHRC-XXXX-XXXX-XXXX-XXXX"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value.toUpperCase())}
              maxLength={24}
              autoCapitalize="characters"
              spellCheck={false}
            />
            <button
              className="btn-primary shrink-0"
              disabled={saving || keyInput.trim().length < 5}
              onClick={setKey}
            >
              {saving ? 'Saving…' : 'Activate'}
            </button>
          </div>
        </div>

        {license?.licenseKey && (
          <button
            className="btn-ghost text-red-400 w-full"
            disabled={releasing}
            onClick={releaseKey}
          >
            {releasing ? 'Releasing…' : 'Release this license'}
          </button>
        )}

        {licMsg && (
          <div className="text-sm rounded-lg px-4 py-3 bg-emerald-950/50 border border-emerald-800 text-emerald-200">
            {licMsg}
          </div>
        )}
        {licErr && (
          <div className="text-sm rounded-lg px-4 py-3 bg-red-950/50 border border-red-800 text-red-200">
            {licErr}
          </div>
        )}
      </section>

      {/* ---- Backup panel --------------------------------------------- */}
      <section className="card space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Family backup</h2>
          <p className="text-xs text-slate-400 mt-1">
            One file containing every kid, chore, coin balance, and history
            entry. Save it somewhere safe — restore it on a new install
            during the setup wizard.
          </p>
        </div>

        <button
          className="btn-primary w-full"
          disabled={downloading}
          onClick={downloadBackup}
        >
          {downloading ? 'Preparing backup…' : '📦 Download family backup'}
        </button>

        <p className="text-xs text-slate-500">
          Downloads a <code className="text-slate-300">.zip</code> file that Chore Coin can restore.
          Nothing is uploaded — the backup goes straight from this server to
          your browser.
        </p>

        {bakErr && (
          <div className="text-sm rounded-lg px-4 py-3 bg-red-950/50 border border-red-800 text-red-200">
            {bakErr}
          </div>
        )}
      </section>

      {/* ---- Dashboards panel ----------------------------------------- */}
      <DashboardsPanel />

      {/* ---- Account / password panel --------------------------------- */}
      <AccountPanel />

      {/* ---- Feedback panel ------------------------------------------- */}
      <section className="card mt-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Feedback</h2>
          <p className="text-xs text-slate-400 mt-1">
            We build Chore Coin based on what real families ask for.
            Bug reports, feature requests, questions — pick a button and
            your default email opens with a pre-filled message. If email
            isn't set up on this device, write to{' '}
            <a href={`mailto:${FEEDBACK_EMAIL}`} className="text-brand-400 underline">
              {FEEDBACK_EMAIL}
            </a>{' '}
            directly.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <a
            href={buildFeedbackMailto('bug', license?.installId)}
            className="btn-secondary text-center"
          >
            🐛 Report a bug
          </a>
          <a
            href={buildFeedbackMailto('feature', license?.installId)}
            className="btn-secondary text-center"
          >
            ✨ Suggest a feature
          </a>
          <a
            href={buildFeedbackMailto('question', license?.installId)}
            className="btn-secondary text-center"
          >
            💬 Ask a question
          </a>
        </div>

        <p className="text-xs text-slate-500">
          Your email is the only thing we get — no automatic phone-home,
          no data from your install. The install ID below helps us find
          the specific instance you're on if you send follow-up messages.
        </p>
      </section>

      {license?.installId && (
        <p className="mt-8 text-xs text-slate-600 text-center">
          Install ID: <code className="text-slate-500">{license.installId}</code>
        </p>
      )}
    </TabBarLayout>
  )
}

/**
 * Build a mailto: URL with a subject line tagged by kind and a body
 * pre-populated with the install ID + timezone + timestamp so replies
 * can be correlated back to this specific instance. All fields are
 * user-editable — nothing is sent automatically, they still click Send
 * in their email client.
 */
function buildFeedbackMailto(
  kind: 'bug' | 'feature' | 'question',
  installId: string | undefined,
): string {
  const subjectByKind = {
    bug: 'Chore Coin — bug report',
    feature: 'Chore Coin — feature request',
    question: 'Chore Coin — question',
  }
  const promptByKind = {
    bug: 'Please describe what went wrong, and what you expected instead.',
    feature: 'Please describe what you would like Chore Coin to do.',
    question: 'What would you like to know?',
  }

  const installFragment = installId ? installId.slice(0, 8) : 'unknown'
  const subject = `${subjectByKind[kind]} [${installFragment}]`

  const body = [
    promptByKind[kind],
    '',
    '',
    '',
    '',
    '---',
    '(Below this line: technical details that help us find your install.',
    'Feel free to leave them in — nothing personal is included.)',
    `Install ID: ${installId || 'not available'}`,
    `Timezone:   ${LOCAL_TZ}`,
    `Sent at:    ${new Date().toISOString()}`,
    `User agent: ${typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'}`,
  ].join('\n')

  return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

/**
 * Dashboards panel — list existing kiosk accounts, add a new one, delete or
 * reset PIN. Dashboard accounts sign in with a username + PIN (no email), and
 * live only in the `users` collection with role='dashboard'. Backend endpoints
 * live in pb_hooks/main.pb.js (create-dashboard, delete-dashboard,
 * reset-dashboard-pin). Kept as its own component so the render tree is easier
 * to reason about — every piece of local state (form inputs, busy flags,
 * last-created copy chip) belongs to this component and is scoped away from
 * the License + Backup + Feedback panels.
 */
function DashboardsPanel() {
  const { data: dashboards, loading } = useDashboards()

  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [creating, setCreating] = useState(false)
  const [createErr, setCreateErr] = useState<string | null>(null)
  const [justCreated, setJustCreated] = useState<{ username: string; pin: string } | null>(
    null,
  )

  const [rowBusyId, setRowBusyId] = useState<string | null>(null)
  const [rowErr, setRowErr] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setCreateErr(null)
    setJustCreated(null)
    try {
      const res = await createDashboard({
        displayName: displayName.trim(),
        username: username.trim(),
        pin,
      })
      // Surface a copy-friendly chip so the parent can text/email these creds
      // to themselves and type them into the Chromebook without re-navigating.
      setJustCreated({ username: res.username, pin })
      setDisplayName('')
      setUsername('')
      setPin('')
    } catch (e: any) {
      setCreateErr(e?.message || 'Could not create dashboard.')
    } finally {
      setCreating(false)
    }
  }

  const doDelete = async (userId: string, name: string) => {
    if (!window.confirm(`Delete "${name}"? The tablet using it will be signed out.`)) return
    setRowBusyId(userId)
    setRowErr(null)
    try {
      await deleteDashboard(userId)
    } catch (e: any) {
      setRowErr(e?.message || 'Delete failed.')
    } finally {
      setRowBusyId(null)
    }
  }

  const doResetPin = async (userId: string, name: string) => {
    const newPin = window.prompt(`New PIN for "${name}" (4+ characters):`)
    if (!newPin) return
    if (newPin.length < 4) {
      alert('PIN must be at least 4 characters.')
      return
    }
    setRowBusyId(userId)
    setRowErr(null)
    try {
      await resetDashboardPin(userId, newPin)
      alert(`PIN reset. Sign the tablet in again using: ${newPin}`)
    } catch (e: any) {
      setRowErr(e?.message || 'Reset failed.')
    } finally {
      setRowBusyId(null)
    }
  }

  const copyCreds = () => {
    if (!justCreated) return
    const line = `Chore Coin dashboard sign-in — username: ${justCreated.username}  PIN: ${justCreated.pin}`
    if (navigator.clipboard) {
      navigator.clipboard.writeText(line).catch(() => {})
    }
  }

  return (
    <section className="card mt-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Dashboards</h2>
        <p className="text-xs text-slate-400 mt-1">
          Kiosk accounts for a family wall tablet (Chromebook, iPad,
          old iPhone on the fridge). They can see the family view and
          submit chores on behalf of any kid, but can't approve or change
          anything.
        </p>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-slate-500 text-sm">Loading…</div>
      ) : dashboards.length === 0 ? (
        <div className="text-xs text-slate-500">No dashboards yet.</div>
      ) : (
        <ul className="space-y-2">
          {dashboards.map((d) => (
            <li
              key={d.id}
              className="rounded-xl bg-slate-950 border border-slate-800 p-3 flex items-center gap-3"
            >
              <span className="text-2xl">{d.avatarEmoji || '📺'}</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{d.displayName}</div>
                <div className="text-xs text-slate-500">
                  username: <code className="text-slate-300">{(d as any).username || '—'}</code>
                </div>
              </div>
              <button
                className="btn-ghost text-sm"
                disabled={rowBusyId === d.id}
                onClick={() => doResetPin(d.id, d.displayName)}
                title="Change PIN"
              >
                🔑
              </button>
              <button
                className="btn-ghost text-sm text-red-400"
                disabled={rowBusyId === d.id}
                onClick={() => doDelete(d.id, d.displayName)}
                title="Delete"
              >
                🗑
              </button>
            </li>
          ))}
        </ul>
      )}
      {rowErr && (
        <div className="text-sm rounded-lg px-4 py-3 bg-red-950/50 border border-red-800 text-red-200">
          {rowErr}
        </div>
      )}

      {/* Add form */}
      <form onSubmit={submit} className="space-y-2 rounded-xl border border-slate-800 p-3">
        <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
          Add a dashboard
        </div>
        <input
          className="input"
          placeholder="Name (e.g. Kitchen tablet)"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
        />
        <input
          className="input"
          placeholder="Username (e.g. kitchen)"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          required
          minLength={2}
        />
        <input
          className="input"
          placeholder="PIN (4+ characters)"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          autoComplete="off"
          required
          minLength={4}
        />
        {createErr && <div className="text-sm text-red-400">{createErr}</div>}
        <button
          className="btn-primary w-full"
          type="submit"
          disabled={creating || !displayName.trim() || username.trim().length < 2 || pin.length < 4}
        >
          {creating ? 'Adding…' : 'Add dashboard'}
        </button>
      </form>

      {/* Just-created chip so the parent can text themselves the creds */}
      {justCreated && (
        <div className="rounded-xl bg-emerald-950/40 border border-emerald-800 p-3 text-sm">
          <div className="text-emerald-200 mb-2">
            Sign the tablet in with:
          </div>
          <div className="font-mono text-slate-100 mb-2">
            username: {justCreated.username}
            <br />
            PIN: {justCreated.pin}
          </div>
          <button className="btn-secondary text-xs" onClick={copyCreds}>
            📋 Copy sign-in details
          </button>
        </div>
      )}
    </section>
  )
}

/**
 * Account panel — parent password management.
 *
 * Two use cases:
 *   1. "Change my password" — for the signed-in parent who knows their
 *      current password and just wants to rotate it. Uses PB's built-in
 *      users.update with oldPassword, which re-issues a token — we then
 *      re-authenticate with the new password so the session stays alive.
 *   2. "Reset another parent's password" — for the "mom got locked out,
 *      dad resets it from his phone" flow. Only shown to parents about
 *      OTHER parents on this install; the caller's own row uses the
 *      change-with-old-password form above. Goes through the
 *      /reset-parent-password hook which doesn't need the old password.
 */
function AccountPanel() {
  const { user, signOutUser } = useAuth()
  const { data: parents, loading } = useParents()

  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPassword2, setNewPassword2] = useState('')
  const [changing, setChanging] = useState(false)
  const [changeErr, setChangeErr] = useState<string | null>(null)
  const [changeMsg, setChangeMsg] = useState<string | null>(null)

  const [rowBusyId, setRowBusyId] = useState<string | null>(null)
  const [rowErr, setRowErr] = useState<string | null>(null)
  const [rowMsg, setRowMsg] = useState<string | null>(null)

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setChangeErr(null)
    setChangeMsg(null)
    if (newPassword !== newPassword2) {
      setChangeErr("New passwords don't match.")
      return
    }
    if (newPassword.length < 8) {
      setChangeErr('New password must be at least 8 characters.')
      return
    }
    setChanging(true)
    try {
      await changeMyPassword(oldPassword, newPassword)
      setOldPassword('')
      setNewPassword('')
      setNewPassword2('')
      setChangeMsg('Password changed. Your session is still active.')
    } catch (e: any) {
      // PB returns 400 with a data blob on wrong-old-password; surface a nice hint.
      const raw = e?.message || 'Password change failed.'
      setChangeErr(
        raw.toLowerCase().includes('validation')
          ? 'Check that your current password is right and the new one is at least 8 characters.'
          : raw,
      )
    } finally {
      setChanging(false)
    }
  }

  const doResetOtherParent = async (userId: string, name: string) => {
    const newPw = window.prompt(
      `Set a new password for "${name}" (8+ characters).\n\n` +
        'They can sign in with this password immediately and change it themselves ' +
        'from Settings.',
    )
    if (newPw === null) return
    if (newPw.length < 8) {
      alert('Password must be at least 8 characters.')
      return
    }
    setRowBusyId(userId)
    setRowErr(null)
    setRowMsg(null)
    try {
      await resetParentPassword(userId, newPw)
      setRowMsg(`Password reset for ${name}. Share it with them privately.`)
    } catch (e: any) {
      setRowErr(e?.message || 'Reset failed.')
    } finally {
      setRowBusyId(null)
    }
  }

  const others = parents.filter((p) => p.id !== user?.id)

  return (
    <section className="card mt-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Your account</h2>
        <p className="text-xs text-slate-400 mt-1">
          Change your own password, or reset another parent's password if
          they got locked out. Kid PINs are managed on each kid's page
          (Kids → open a kid → Reset PIN).
        </p>
      </div>

      {/* ---- Change my password ------------------------------------- */}
      <form onSubmit={changePassword} className="space-y-3">
        <div className="text-sm font-medium text-slate-200">Change my password</div>
        <div className="text-xs text-slate-500">
          Signed in as{' '}
          <code className="text-slate-300">{(user as any)?.email || user?.displayName}</code>.
        </div>
        <input
          className="input"
          type="password"
          autoComplete="current-password"
          placeholder="Current password"
          value={oldPassword}
          onChange={(e) => setOldPassword(e.target.value)}
          required
        />
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          placeholder="New password (8+ characters)"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          minLength={8}
          required
        />
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          placeholder="Confirm new password"
          value={newPassword2}
          onChange={(e) => setNewPassword2(e.target.value)}
          minLength={8}
          required
        />
        {changeErr && <div className="text-sm text-red-400">{changeErr}</div>}
        {changeMsg && <div className="text-sm text-emerald-400">{changeMsg}</div>}
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-primary"
            type="submit"
            disabled={
              changing ||
              !oldPassword ||
              !newPassword ||
              newPassword !== newPassword2 ||
              newPassword.length < 8
            }
          >
            {changing ? 'Changing…' : 'Change my password'}
          </button>
          <button type="button" className="btn-ghost text-sm" onClick={signOutUser}>
            Sign out
          </button>
        </div>
      </form>

      {/* ---- Reset another parent's password ------------------------ */}
      <div className="pt-4 border-t border-slate-800 space-y-3">
        <div className="text-sm font-medium text-slate-200">Other parents on this install</div>
        <p className="text-xs text-slate-500">
          For "mom forgot her password → dad resets it." The other parent
          can sign in with the new password right away and change it
          themselves.
        </p>
        {loading ? (
          <div className="text-xs text-slate-500">Loading…</div>
        ) : others.length === 0 ? (
          <div className="text-xs text-slate-500">
            You're the only parent on this install. If you lock yourself out,
            you'll need to reset your password from the PocketBase admin UI
            at <code className="text-slate-400">/_/</code> on your home server.
          </div>
        ) : (
          <ul className="space-y-2">
            {others.map((p) => (
              <li
                key={p.id}
                className="rounded-xl bg-slate-950 border border-slate-800 p-3 flex items-center gap-3"
              >
                <span className="text-2xl">{p.avatarEmoji || '👤'}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{p.displayName || 'Parent'}</div>
                  <div className="text-xs text-slate-500 truncate">
                    <code className="text-slate-300">{(p as any).email || '—'}</code>
                  </div>
                </div>
                <button
                  className="btn-ghost text-sm"
                  disabled={rowBusyId === p.id}
                  onClick={() => doResetOtherParent(p.id, p.displayName || 'Parent')}
                  title="Set a new password for this parent"
                >
                  {rowBusyId === p.id ? 'Resetting…' : '🔑 Reset password'}
                </button>
              </li>
            ))}
          </ul>
        )}
        {rowErr && <div className="text-sm text-red-400">{rowErr}</div>}
        {rowMsg && <div className="text-sm text-emerald-400">{rowMsg}</div>}
      </div>
    </section>
  )
}

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { TabBarLayout, PageHeader } from '../../components/Layout'
import { PARENT_TABS } from './ParentDashboard'
import { useKids } from '../../hooks/data'
import { createKid, updateKid } from '../../lib/actions'

const EMOJI_CHOICES = ['👦', '👧', '🧒', '🦸‍♂️', '🦸‍♀️', '🐻', '🐶', '🐱', '🦊', '🦖', '🚀', '⚽', '🎨']

type LoginMode = 'username' | 'email' | 'none'

export default function ManageKids() {
  const nav = useNavigate()
  const { data: kids, loading } = useKids(true)
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('👦')
  const [loginMode, setLoginMode] = useState<LoginMode>('username')
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      const id = await createKid({
        displayName: name.trim(),
        avatarEmoji: emoji,
        kidUsername: loginMode === 'username' ? username.trim() || undefined : undefined,
        kidPin: loginMode === 'username' ? pin || undefined : undefined,
        kidUserEmail: loginMode === 'email' ? email.trim() || undefined : undefined,
        kidUserPassword: loginMode === 'email' ? password || undefined : undefined,
      })
      setName('')
      setEmoji('👦')
      setLoginMode('username')
      setUsername('')
      setPin('')
      setEmail('')
      setPassword('')
      nav(`/kids/${id}`)
    } catch (e: any) {
      setErr(e?.message || 'Failed to create kid')
    } finally {
      setBusy(false)
    }
  }

  const toggleActive = async (kidId: string, active: boolean) => {
    await updateKid(kidId, { active: !active })
  }

  return (
    <TabBarLayout tabs={PARENT_TABS}>
      <PageHeader
        title="Kids"
        subtitle="Add a kid, then set up their base chores."
        action={
          <Link to="/" className="btn-ghost">
            ← Home
          </Link>
        }
      />

      <form onSubmit={submit} className="card mb-6 space-y-3">
        <div>
          <label className="block text-sm text-slate-400 mb-1">Name</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="e.g. Sam"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Avatar</label>
          <div className="flex flex-wrap gap-2">
            {EMOJI_CHOICES.map((e) => (
              <button
                type="button"
                key={e}
                onClick={() => setEmoji(e)}
                className={`text-2xl w-10 h-10 rounded-lg border ${
                  emoji === e ? 'border-brand-500 bg-slate-800' : 'border-slate-700'
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2 rounded-xl border border-slate-800 p-3">
          <div className="text-xs text-slate-400 mb-1">Login for this kid</div>
          <div className="flex gap-2 mb-2">
            <button
              type="button"
              onClick={() => setLoginMode('username')}
              className={`pill ${loginMode === 'username' ? 'bg-brand-600 text-white' : ''}`}
            >
              Username + PIN
            </button>
            <button
              type="button"
              onClick={() => setLoginMode('email')}
              className={`pill ${loginMode === 'email' ? 'bg-brand-600 text-white' : ''}`}
            >
              Email + password
            </button>
            <button
              type="button"
              onClick={() => setLoginMode('none')}
              className={`pill ${loginMode === 'none' ? 'bg-brand-600 text-white' : ''}`}
            >
              Add later
            </button>
          </div>

          {loginMode === 'username' && (
            <>
              <input
                className="input"
                type="text"
                placeholder="Username (e.g. sam) — kid types this to sign in"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
              />
              <input
                className="input"
                type="text"
                placeholder="PIN (4+ digits/characters)"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                autoComplete="off"
                inputMode="numeric"
                minLength={pin ? 4 : 0}
              />
              <div className="text-xs text-slate-500">
                Kid signs in at the login page by typing their username in the email field and
                their PIN in the password field.
              </div>
            </>
          )}

          {loginMode === 'email' && (
            <>
              <input
                className="input"
                type="email"
                placeholder="Kid's email (fake ok — e.g. sam@family.local)"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="off"
              />
              <input
                className="input"
                type="text"
                placeholder="Password (at least 4 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="off"
                minLength={password ? 4 : 0}
              />
            </>
          )}

          {loginMode === 'none' && (
            <div className="text-xs text-slate-500">
              You can add a login later from the PocketBase admin UI, or by re-creating the kid.
            </div>
          )}
        </div>
        {err && <div className="text-sm text-red-400">{err}</div>}
        <button className="btn-primary w-full" type="submit" disabled={busy || !name.trim()}>
          {busy ? 'Adding…' : 'Add kid'}
        </button>
      </form>

      {loading ? (
        <div className="text-slate-400">Loading…</div>
      ) : (
        <ul className="space-y-2">
          {kids.map((k) => (
            <li
              key={k.id}
              className={`card flex items-center gap-3 ${!k.active ? 'opacity-60' : ''}`}
            >
              <span className="text-3xl">{k.avatarEmoji}</span>
              <div className="flex-1">
                <div className="font-semibold">{k.displayName}</div>
                <div className="text-xs text-slate-400">
                  {k.userId ? `Login linked (user ${k.userId.slice(0, 6)}…)` : 'No login linked'}
                </div>
              </div>
              <Link to={`/kids/${k.id}`} className="btn-secondary">
                Open
              </Link>
              <button
                onClick={() => toggleActive(k.id, k.active)}
                className="btn-ghost"
                title={k.active ? 'Archive' : 'Restore'}
              >
                {k.active ? '📥' : '↩︎'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </TabBarLayout>
  )
}

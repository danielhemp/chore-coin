// First-run setup wizard.
//
// Rendered by App.tsx when GET /api/custom/setup-status returns
// { needsSetup: true }. Creates the PocketBase superuser (for /_/ admin UI)
// AND the first parent user (for the app) in one atomic call to
// POST /api/custom/setup. The backend endpoint locks itself after the first
// successful run, so this component is never shown again on the same install.
import { useState, type FormEvent } from 'react'
import { pb, callCustom } from '../pb'
import { LOCAL_TZ } from '../pb'

const EMOJI_CHOICES = [
  '👤', '👨', '👩', '🧑', '👨‍🦰', '👩‍🦰', '👨‍🦱', '👩‍🦱',
  '👨‍🦳', '👩‍🦳', '🧔', '👵', '👴', '🦸', '🦹', '🧙',
]

export default function Setup({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<'welcome' | 'admin' | 'parent' | 'submitting' | 'done'>('welcome')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [parentName, setParentName] = useState('')
  const [parentEmail, setParentEmail] = useState('')
  const [parentPassword, setParentPassword] = useState('')
  const [parentPassword2, setParentPassword2] = useState('')
  const [avatarEmoji, setAvatarEmoji] = useState('👤')
  const [err, setErr] = useState<string | null>(null)

  const goAdmin = (e: FormEvent) => {
    e.preventDefault()
    setErr(null)
    setStep('admin')
  }

  const goParent = (e: FormEvent) => {
    e.preventDefault()
    setErr(null)
    if (!adminEmail || !adminPassword) return setErr('Both admin fields are required.')
    if (adminPassword.length < 10) return setErr('Admin password must be at least 10 characters.')
    setStep('parent')
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErr(null)
    if (!parentName.trim()) return setErr('Your display name is required.')
    if (!parentEmail) return setErr('Your email is required.')
    if (parentPassword.length < 8) return setErr('Your password must be at least 8 characters.')
    if (parentPassword !== parentPassword2) return setErr('Passwords do not match.')

    setStep('submitting')
    try {
      await callCustom('setup', {
        adminEmail,
        adminPassword,
        parentEmail,
        parentPassword,
        parentName: parentName.trim(),
        avatarEmoji,
        timezone: LOCAL_TZ,
      })
      // Auto-login as the new parent so the user lands on the app, not the login screen.
      await pb.collection('users').authWithPassword(parentEmail, parentPassword)
      setStep('done')
      // Give the animation a moment before handing off to the parent router.
      window.setTimeout(onDone, 800)
    } catch (e: any) {
      setErr(e?.message || 'Setup failed. Try again in a moment.')
      setStep('parent')
    }
  }

  return (
    <div className="min-h-full flex items-center justify-center p-6 safe-top safe-bottom bg-slate-950">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="text-6xl mb-3">🪙</div>
          <h1 className="text-3xl font-bold">Welcome to Chore Coin</h1>
          <p className="text-slate-400 text-sm mt-2">
            Let's set up your family's server. Takes about a minute.
          </p>
        </div>

        {step === 'welcome' && (
          <form onSubmit={goAdmin} className="card space-y-4">
            <p className="text-sm text-slate-300">
              You'll create two accounts:
            </p>
            <ol className="text-sm text-slate-400 space-y-2 list-decimal list-inside">
              <li>
                <span className="text-slate-200 font-medium">Admin</span> —
                for the underlying database (rarely used, but you'll need it
                if anything ever needs a manual fix).
              </li>
              <li>
                <span className="text-slate-200 font-medium">Your parent
                account</span> — what you'll use every day to approve chores,
                manage kids, and see the dashboard.
              </li>
            </ol>
            <button className="btn-primary w-full" type="submit">
              Get started →
            </button>
          </form>
        )}

        {step === 'admin' && (
          <form onSubmit={goParent} className="card space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Step 1 of 2 — Admin account</h2>
              <p className="text-xs text-slate-400 mt-1">
                This is only for the low-level database admin UI. Use any
                email — it doesn't need to be real. Save the password
                somewhere safe; you'll rarely need it.
              </p>
            </div>
            <input
              className="input"
              type="email"
              autoComplete="off"
              placeholder="Admin email (e.g. admin@family.local)"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              required
            />
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              placeholder="Admin password (10+ chars)"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              minLength={10}
              required
            />
            {err && <div className="text-sm text-red-400">{err}</div>}
            <div className="flex gap-2">
              <button
                className="btn-secondary flex-1"
                type="button"
                onClick={() => setStep('welcome')}
              >
                Back
              </button>
              <button className="btn-primary flex-1" type="submit">
                Next →
              </button>
            </div>
          </form>
        )}

        {step === 'parent' && (
          <form onSubmit={submit} className="card space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Step 2 of 2 — Your parent account</h2>
              <p className="text-xs text-slate-400 mt-1">
                This is what you'll use every day. Add other parents later
                from the app.
              </p>
            </div>
            <input
              className="input"
              type="text"
              autoComplete="name"
              placeholder="Your name (e.g. Daniel)"
              value={parentName}
              onChange={(e) => setParentName(e.target.value)}
              required
            />
            <input
              className="input"
              type="email"
              autoComplete="email"
              placeholder="Your email"
              value={parentEmail}
              onChange={(e) => setParentEmail(e.target.value)}
              required
            />
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              placeholder="Password (8+ chars)"
              value={parentPassword}
              onChange={(e) => setParentPassword(e.target.value)}
              minLength={8}
              required
            />
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              placeholder="Confirm password"
              value={parentPassword2}
              onChange={(e) => setParentPassword2(e.target.value)}
              minLength={8}
              required
            />
            <div>
              <label className="text-xs text-slate-400 mb-1 block">
                Pick an avatar
              </label>
              <div className="flex flex-wrap gap-2">
                {EMOJI_CHOICES.map((e) => (
                  <button
                    type="button"
                    key={e}
                    onClick={() => setAvatarEmoji(e)}
                    className={`text-2xl w-10 h-10 rounded-lg border ${
                      avatarEmoji === e
                        ? 'border-brand-500 bg-slate-800'
                        : 'border-slate-700'
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
            {err && <div className="text-sm text-red-400">{err}</div>}
            <div className="flex gap-2">
              <button
                className="btn-secondary flex-1"
                type="button"
                onClick={() => setStep('admin')}
              >
                Back
              </button>
              <button className="btn-primary flex-1" type="submit">
                Finish setup
              </button>
            </div>
          </form>
        )}

        {step === 'submitting' && (
          <div className="card text-center py-10">
            <div className="text-4xl mb-4 animate-pulse">🪙</div>
            <p className="text-slate-300">Setting up your server…</p>
          </div>
        )}

        {step === 'done' && (
          <div className="card text-center py-10 border-emerald-800 bg-emerald-950/30">
            <div className="text-5xl mb-3">🎉</div>
            <h2 className="text-xl font-semibold text-emerald-300">
              All set!
            </h2>
            <p className="text-sm text-slate-400 mt-2">
              Taking you to the app…
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

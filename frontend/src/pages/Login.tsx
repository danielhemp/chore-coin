import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { Modal } from '../components/Layout'

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showForgot, setShowForgot] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    setBusy(true)
    try {
      await signIn(email.trim(), password)
    } catch (e: any) {
      setErr(e?.message || 'Sign-in failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-full flex items-center justify-center p-6 safe-top safe-bottom">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
        <div className="text-center">
          <div className="text-5xl mb-2">🪙</div>
          <h1 className="text-2xl font-bold">Chore Coin</h1>
          <p className="text-slate-400 text-sm">Sign in to continue</p>
        </div>
        <div className="space-y-3 card">
          <input
            className="input"
            type="text"
            autoComplete="username"
            autoCapitalize="off"
            autoCorrect="off"
            placeholder="Email or username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            placeholder="Password or PIN"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {err && <div className="text-sm text-red-400">{err}</div>}
          <button className="btn-primary w-full" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <div className="text-center pt-1">
            <button
              type="button"
              className="text-xs text-slate-400 hover:text-slate-200 underline underline-offset-2"
              onClick={() => setShowForgot(true)}
            >
              Forgot password / PIN?
            </button>
          </div>
        </div>
      </form>

      <Modal open={showForgot} onClose={() => setShowForgot(false)} title="Forgot password?">
        <div className="space-y-4 text-sm text-slate-300">
          <div>
            <div className="text-slate-100 font-medium mb-1">If you're a kid</div>
            <p className="text-slate-400">
              Ask a parent to reset your PIN or password. They can do it on
              their phone: <span className="text-slate-200">Kids → open you → Reset PIN</span>.
            </p>
          </div>

          <div>
            <div className="text-slate-100 font-medium mb-1">If you're a parent</div>
            <p className="text-slate-400">
              Ask another parent on your family to reset it. They can do it
              from{' '}
              <span className="text-slate-200">Settings → Your account → Other parents</span>.
              You'll be able to sign in with the new password right away and
              change it yourself.
            </p>
            <p className="mt-2 text-slate-400">
              If you're the only parent on this install, you'll need to reset
              it from the PocketBase admin UI at{' '}
              <code className="text-slate-300">/_/</code> on the computer
              running Chore Coin at your home.
            </p>
          </div>

          <div>
            <div className="text-slate-100 font-medium mb-1">If you're a family dashboard</div>
            <p className="text-slate-400">
              A parent can reset the dashboard PIN from{' '}
              <span className="text-slate-200">Settings → Dashboards</span> on their phone.
            </p>
          </div>

          <div className="pt-2">
            <button className="btn-secondary w-full" onClick={() => setShowForgot(false)}>
              Got it
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

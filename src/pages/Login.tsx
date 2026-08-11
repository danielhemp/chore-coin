import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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
        </div>
      </form>
    </div>
  )
}

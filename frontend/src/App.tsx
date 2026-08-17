import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import { pb, callCustom } from './pb'
import Login from './pages/Login'
import Setup from './pages/Setup'
import KidHome from './pages/kid/KidHome'
import KidRedeem from './pages/kid/KidRedeem'
import ParentDashboard from './pages/parent/ParentDashboard'
import Approvals from './pages/parent/Approvals'
import ManageKids from './pages/parent/ManageKids'
import ManageBaseChores from './pages/parent/ManageBaseChores'
import ManageBonusChores from './pages/parent/ManageBonusChores'
import ManageRewards from './pages/parent/ManageRewards'
import ManageGoals from './pages/parent/ManageGoals'
import Redemptions from './pages/parent/Redemptions'
import Settings from './pages/parent/Settings'
import History from './pages/parent/History'
import KidDetail from './pages/parent/KidDetail'
import Dashboard from './pages/parent/Dashboard'

function LoadingScreen() {
  return (
    <div className="min-h-full flex items-center justify-center bg-slate-950 text-slate-300">
      <div className="text-center">
        <div className="text-4xl mb-3 animate-pulse">🪙</div>
        <div className="text-sm">Loading…</div>
      </div>
    </div>
  )
}

export default function App() {
  const { user, loading } = useAuth()
  // Setup-wizard gate. null = still checking, true = show wizard, false = normal flow.
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    callCustom<{ needsSetup: boolean }>('setup-status')
      .then((r) => {
        if (!cancelled) setNeedsSetup(!!r.needsSetup)
      })
      .catch(() => {
        // If the endpoint isn't reachable (older backend, network blip),
        // fall back to the normal login flow — old family instances stay
        // functional even if they haven't picked up the new hook yet.
        if (!cancelled) setNeedsSetup(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (loading || needsSetup === null) return <LoadingScreen />

  if (needsSetup) {
    return <Setup onDone={() => setNeedsSetup(false)} />
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  if (!user.role) {
    return (
      <div className="min-h-full flex items-center justify-center p-6 text-center">
        <div className="max-w-sm space-y-4">
          <div className="text-4xl">🤔</div>
          <div className="text-lg font-semibold">No role assigned</div>
          <div className="text-sm text-slate-400">
            Your login worked, but your user record has no <code>role</code> field. A parent
            needs to set your role (parent or kid) in the PocketBase admin UI.
          </div>
          <button className="btn-secondary" onClick={() => pb.authStore.clear()}>
            Sign out
          </button>
        </div>
      </div>
    )
  }

  if (user.role === 'parent') {
    return (
      <Routes>
        <Route path="/" element={<ParentDashboard />} />
        <Route path="/approvals" element={<Approvals />} />
        <Route path="/kids" element={<ManageKids />} />
        <Route path="/kids/:kidId" element={<KidDetail />} />
        <Route path="/kids/:kidId/base-chores" element={<ManageBaseChores />} />
        <Route path="/bonus-chores" element={<ManageBonusChores />} />
        <Route path="/rewards" element={<ManageRewards />} />
        <Route path="/goals" element={<ManageGoals />} />
        <Route path="/redemptions" element={<Redemptions />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/history" element={<History />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    )
  }

  if (user.role === 'dashboard') {
    return (
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    )
  }

  // Kid
  return (
    <Routes>
      <Route path="/" element={<KidHome />} />
      <Route path="/redeem" element={<KidRedeem />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

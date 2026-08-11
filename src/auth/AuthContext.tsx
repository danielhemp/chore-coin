import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { pb } from '../pb'
import type { UserRecord } from '../lib/types'

interface AuthState {
  loading: boolean
  user: UserRecord | null
  signIn: (email: string, password: string) => Promise<void>
  signOutUser: () => void
}

const AuthContext = createContext<AuthState | null>(null)

function currentUser(): UserRecord | null {
  const m = pb.authStore.model as UserRecord | null
  return m && pb.authStore.isValid ? m : null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserRecord | null>(currentUser)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // PB fires onChange whenever the token or user record changes.
    // Passing true triggers an immediate synchronous call so we always seed state.
    return pb.authStore.onChange(() => {
      setUser(currentUser())
    }, true)
  }, [])

  // Refresh the auth record on mount so any server-side profile edits appear.
  useEffect(() => {
    if (pb.authStore.isValid && pb.authStore.model) {
      pb.collection('users').authRefresh().catch(() => {
        pb.authStore.clear()
      })
    }
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      loading,
      user,
      signIn: async (email, password) => {
        setLoading(true)
        try {
          await pb.collection('users').authWithPassword(email.trim(), password)
        } finally {
          setLoading(false)
        }
      },
      signOutUser: () => pb.authStore.clear(),
    }),
    [loading, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

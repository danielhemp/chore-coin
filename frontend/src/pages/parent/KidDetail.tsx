import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { TabBarLayout, PageHeader } from '../../components/Layout'
import { PARENT_TABS } from './ParentDashboard'
import {
  useBalance,
  useDailyStatus,
  useKid,
  useLedger,
  useLocalDate,
  useKidsRecentDailyStatuses,
} from '../../hooks/data'
import {
  adjustBaseScreenTime,
  adjustCoins,
  carryOverBaseMinutes,
  deleteKid,
  redeemCoinsForCash,
  redeemCoinsForScreen,
  setKidLogin,
  spendBaseScreenTime,
  updateKid,
} from '../../lib/actions'
import { pb } from '../../pb'
import { formatShortDate, formatTime, parsePbDate } from '../../lib/dates'
import { COIN_TO_CENTS, COIN_TO_SCREEN_MINUTES } from '../../lib/types'

const EMOJI_CHOICES = ['👦', '👧', '🧒', '🦸‍♂️', '🦸‍♀️', '🐻', '🐶', '🐱', '🦊', '🦖', '🚀', '⚽', '🎨']

export default function KidDetail() {
  const { kidId } = useParams<{ kidId: string }>()
  const nav = useNavigate()
  const { data: kid, loading: kidLoading } = useKid(kidId)
  const today = useLocalDate()
  const { balance } = useBalance(kidId)
  const { status } = useDailyStatus(kidId, today)
  const { data: ledger } = useLedger(kidId, 25)
  const { data: recentDays } = useKidsRecentDailyStatuses(kidId, 7)

  const [coinAdj, setCoinAdj] = useState({ amount: 1, note: '' })
  const [minAdj, setMinAdj] = useState({ amount: 15, note: '' })
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  // Editable profile
  const [editName, setEditName] = useState('')
  const [editEmoji, setEditEmoji] = useState('👦')
  useEffect(() => {
    if (kid) {
      setEditName(kid.displayName)
      setEditEmoji(kid.avatarEmoji || '👦')
    }
  }, [kid?.id])

  // Auth user (if linked) — fetched separately so we can show the current username.
  const [kidAuthUsername, setKidAuthUsername] = useState<string>('')
  useEffect(() => {
    let cancelled = false
    if (kid?.userId) {
      pb.collection('users')
        .getOne(kid.userId)
        .then((u: any) => {
          if (!cancelled) setKidAuthUsername(u.username || u.email || '')
        })
        .catch(() => {
          if (!cancelled) setKidAuthUsername('')
        })
    } else {
      setKidAuthUsername('')
    }
    return () => {
      cancelled = true
    }
  }, [kid?.userId])

  // Reset-login form state
  const [newUsername, setNewUsername] = useState('')
  const [newPin, setNewPin] = useState('')
  const [showLoginForm, setShowLoginForm] = useState(false)

  if (!kidId) return null

  const avail =
    (status?.baseScreenTimeGrantedMinutes ?? 0) +
    (status?.carryOverMinutes ?? 0) -
    (status?.baseScreenTimeUsedMinutes ?? 0)

  const doWithBusy = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key)
    setErr(null)
    try {
      await fn()
    } catch (e: any) {
      setErr(e?.message || 'Action failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <TabBarLayout tabs={PARENT_TABS}>
      <PageHeader
        title={kid?.displayName ?? 'Kid'}
        subtitle={formatShortDate(today)}
        action={
          <Link to="/" className="btn-ghost">
            ← Home
          </Link>
        }
      />

      {kidLoading ? (
        <div className="text-slate-400">Loading…</div>
      ) : !kid ? (
        <div className="text-slate-400">Kid not found.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="card">
              <div className="text-xs text-slate-400">Coins</div>
              <div className="text-3xl font-bold">🪙 {balance}</div>
            </div>
            <div className="card">
              <div className="text-xs text-slate-400">Base screen time today</div>
              <div className="text-3xl font-bold">📺 {avail}m</div>
              <div className="text-xs text-slate-400">
                {status?.baseScreenTimeUsedMinutes ?? 0}m used ·{' '}
                {status?.baseScreenTimeGrantedMinutes ?? 0}m granted +{' '}
                {status?.carryOverMinutes ?? 0}m carry
              </div>
            </div>
          </div>

          {err && (
            <div className="card mb-3 border-red-800 bg-red-950/40 text-red-200">{err}</div>
          )}

          <section className="card mb-4">
            <h3 className="font-semibold mb-2">Base chores</h3>
            <Link to={`/kids/${kidId}/base-chores`} className="btn-secondary w-full">
              Edit base chore list
            </Link>
          </section>

          <section className="card mb-4">
            <h3 className="font-semibold mb-2">Base screen time — adjust</h3>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {[15, 30, 60].map((m) => (
                <button
                  key={m}
                  className="btn-secondary"
                  disabled={busy !== null}
                  onClick={() =>
                    doWithBusy(`used-${m}`, () => spendBaseScreenTime(kidId, m, today))
                  }
                >
                  − {m}m used
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button
                className="btn-secondary"
                disabled={busy !== null || avail <= 0}
                onClick={() => doWithBusy('carry', () => carryOverBaseMinutes(kidId, avail))}
              >
                Carry {avail}m to tomorrow
              </button>
              <button
                className="btn-primary"
                disabled={busy !== null}
                onClick={() =>
                  doWithBusy('grant15', () =>
                    adjustBaseScreenTime(kidId, 15, 'Parent bonus', today),
                  )
                }
              >
                + 15m bonus today
              </button>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="block text-xs text-slate-400 mb-1">Custom (min)</label>
                <input
                  className="input"
                  type="number"
                  value={minAdj.amount}
                  onChange={(e) => setMinAdj({ ...minAdj, amount: Number(e.target.value) })}
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-slate-400 mb-1">Note</label>
                <input
                  className="input"
                  value={minAdj.note}
                  onChange={(e) => setMinAdj({ ...minAdj, note: e.target.value })}
                  placeholder="Optional"
                />
              </div>
              <button
                className="btn-primary"
                disabled={busy !== null || !minAdj.amount}
                onClick={() =>
                  doWithBusy('adj-min', () =>
                    adjustBaseScreenTime(
                      kidId,
                      minAdj.amount,
                      minAdj.note || 'Parent adjustment',
                      today,
                    ),
                  )
                }
              >
                Apply
              </button>
            </div>
          </section>

          <section className="card mb-4">
            <h3 className="font-semibold mb-2">Coins — adjust</h3>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="block text-xs text-slate-400 mb-1">Amount (± coins)</label>
                <input
                  className="input"
                  type="number"
                  value={coinAdj.amount}
                  onChange={(e) => setCoinAdj({ ...coinAdj, amount: Number(e.target.value) })}
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-slate-400 mb-1">Note</label>
                <input
                  className="input"
                  value={coinAdj.note}
                  onChange={(e) => setCoinAdj({ ...coinAdj, note: e.target.value })}
                  placeholder="Reason"
                />
              </div>
              <button
                className="btn-primary"
                disabled={busy !== null || !coinAdj.amount || !coinAdj.note.trim()}
                onClick={() =>
                  doWithBusy('adj-coin', () =>
                    adjustCoins(kidId, coinAdj.amount, coinAdj.note.trim() || 'Parent adjustment'),
                  )
                }
              >
                Apply
              </button>
            </div>
          </section>

          <section className="card mb-4">
            <h3 className="font-semibold mb-2">Redeem for the kid</h3>
            <p className="text-xs text-slate-400 mb-3">
              Use these when you're granting the reward in person and want to debit their balance.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[1, 5, 10, 20].map((n) => (
                <button
                  key={`s-${n}`}
                  className="btn-secondary"
                  disabled={busy !== null || balance < n}
                  onClick={() => doWithBusy(`s-${n}`, () => redeemCoinsForScreen(kidId, n))}
                >
                  −{n}🪙 → {n * COIN_TO_SCREEN_MINUTES}m 📺
                </button>
              ))}
              {[1, 4, 10, 20].map((n) => (
                <button
                  key={`c-${n}`}
                  className="btn-success"
                  disabled={busy !== null || balance < n}
                  onClick={() => doWithBusy(`c-${n}`, () => redeemCoinsForCash(kidId, n))}
                >
                  −{n}🪙 → ${((n * COIN_TO_CENTS) / 100).toFixed(2)}
                </button>
              ))}
            </div>
          </section>

          <section className="card mb-4">
            <h3 className="font-semibold mb-2">Last 7 days</h3>
            <ul className="text-sm space-y-1">
              {recentDays.length === 0 ? (
                <li className="text-slate-500">Nothing recorded yet.</li>
              ) : (
                recentDays.map((d) => (
                  <li key={d.date} className="flex justify-between">
                    <span>{formatShortDate(d.date)}</span>
                    <span className="text-slate-400">
                      {d.baseAwarded ? '✅ earned' : '—'} · used{' '}
                      {d.baseScreenTimeUsedMinutes ?? 0}m
                    </span>
                  </li>
                ))
              )}
            </ul>
          </section>

          <section className="card mb-4">
            <h3 className="font-semibold mb-2">Profile</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Name</label>
                <input
                  className="input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Avatar</label>
                <div className="flex flex-wrap gap-2">
                  {EMOJI_CHOICES.map((e) => (
                    <button
                      type="button"
                      key={e}
                      onClick={() => setEditEmoji(e)}
                      className={`text-2xl w-10 h-10 rounded-lg border ${
                        editEmoji === e ? 'border-brand-500 bg-slate-800' : 'border-slate-700'
                      }`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
              <button
                className="btn-primary w-full"
                disabled={
                  busy !== null ||
                  !editName.trim() ||
                  (editName === kid.displayName && editEmoji === kid.avatarEmoji)
                }
                onClick={() =>
                  doWithBusy('save-profile', () =>
                    updateKid(kidId, { displayName: editName.trim(), avatarEmoji: editEmoji }),
                  )
                }
              >
                Save profile
              </button>
            </div>
          </section>

          <section className="card mb-4">
            <h3 className="font-semibold mb-2">Login</h3>
            {kid.userId ? (
              <p className="text-sm text-slate-400 mb-3">
                Signs in as <span className="text-slate-100 font-medium">{kidAuthUsername || '…'}</span>.
              </p>
            ) : (
              <p className="text-sm text-slate-400 mb-3">No login attached yet.</p>
            )}

            {!showLoginForm ? (
              <button
                className="btn-secondary w-full"
                onClick={() => {
                  setNewUsername(kidAuthUsername || kid.displayName.toLowerCase())
                  setNewPin('')
                  setShowLoginForm(true)
                }}
              >
                {kid.userId ? 'Change username / reset PIN' : 'Add login'}
              </button>
            ) : (
              <div className="space-y-2">
                <input
                  className="input"
                  placeholder="Username (lowercase; kid types this)"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  autoCapitalize="off"
                  autoCorrect="off"
                />
                <input
                  className="input"
                  placeholder="New PIN (4+ characters)"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  inputMode="numeric"
                />
                <div className="grid grid-cols-2 gap-2">
                  <button
                    className="btn-secondary"
                    onClick={() => setShowLoginForm(false)}
                    disabled={busy !== null}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn-primary"
                    disabled={busy !== null || !newUsername.trim() || newPin.length < 4}
                    onClick={() =>
                      doWithBusy('save-login', async () => {
                        await setKidLogin({
                          kidId,
                          username: newUsername.trim(),
                          pin: newPin,
                        })
                        setShowLoginForm(false)
                      })
                    }
                  >
                    Save login
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="card">
            <h3 className="font-semibold mb-2">Recent activity</h3>
            <ul className="text-sm space-y-1">
              {ledger.length === 0 ? (
                <li className="text-slate-500">No entries yet.</li>
              ) : (
                ledger.map((l) => (
                  <li key={l.id} className="flex justify-between gap-2">
                    <span className="truncate">
                      <span className={l.amount >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                        {l.amount >= 0 ? '+' : ''}
                        {l.amount}
                      </span>{' '}
                      {l.type.startsWith('spend_base') ||
                      l.type === 'grant_base_screen' ||
                      l.type === 'adjust_base_screen' ||
                      l.type === 'carryover_base_screen'
                        ? 'min'
                        : 'coin'}{' '}
                      · {l.note}
                    </span>
                    <span className="text-slate-500 shrink-0">
                      {formatTime(parsePbDate(l.created))}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </section>

          <section className="card mt-4 border-red-900/50">
            <h3 className="font-semibold mb-2 text-red-300">Danger zone</h3>
            <p className="text-xs text-slate-400 mb-3">
              Deletes {kid.displayName} plus their chores, balance, ledger, and login. This can't
              be undone.
            </p>
            <button
              className="btn-danger w-full"
              disabled={busy !== null}
              onClick={async () => {
                const first = window.prompt(
                  `Type ${kid.displayName} to permanently delete this kid:`,
                )
                if (first?.trim() !== kid.displayName) return
                await doWithBusy('delete', async () => {
                  await deleteKid(kidId)
                  nav('/kids', { replace: true })
                })
              }}
            >
              🗑 Delete {kid.displayName}
            </button>
          </section>
        </>
      )}
    </TabBarLayout>
  )
}

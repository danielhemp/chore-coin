import { LOCAL_TZ } from '../pb'

/** YYYY-MM-DD in LOCAL_TZ. Handles DST correctly via Intl. */
export function todayLocal(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: LOCAL_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function yesterdayLocal(today: string = todayLocal()): string {
  const [y, m, d] = today.split('-').map(Number)
  const asUtc = new Date(Date.UTC(y, m - 1, d, 12))
  asUtc.setUTCDate(asUtc.getUTCDate() - 1)
  return todayLocal(asUtc)
}

export function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const asUtc = new Date(Date.UTC(y, m - 1, d, 12))
  return new Intl.DateTimeFormat('en-US', {
    timeZone: LOCAL_TZ,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(asUtc)
}

export function formatTime(ts: Date | string): string {
  const d = typeof ts === 'string' ? new Date(ts) : ts
  return new Intl.DateTimeFormat('en-US', {
    timeZone: LOCAL_TZ,
    hour: 'numeric',
    minute: '2-digit',
  }).format(d)
}

/** Parse a PocketBase timestamp string (e.g. "2026-07-31 14:30:00.000Z") into a Date. */
export function parsePbDate(s: string): Date {
  // PB returns "YYYY-MM-DD HH:mm:ss.SSSZ" — JS Date needs 'T' between date and time.
  return new Date(s.replace(' ', 'T'))
}

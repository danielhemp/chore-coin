/**
 * Realtime data hooks backed by PocketBase.
 *
 * Each hook:
 *  1. Fetches an initial list/record via getFullList()/getOne().
 *  2. Subscribes to the collection for realtime deltas.
 *  3. Applies deltas to the local cache with a filter matching the initial query.
 *
 * PB subscriptions deliver every change in the collection; we filter client-side
 * to keep the code simple. For a family of four this is trivially cheap.
 */
import { useEffect, useState } from 'react'
import { pb } from '../pb'
import type {
  BalanceRecord,
  BaseChoreRecord,
  BonusChoreRecord,
  CompletionRecord,
  DailyStatusRecord,
  GoalContributionRecord,
  GoalRecord,
  KidRecord,
  LedgerRecord,
  RewardItemRecord,
  RewardRequestRecord,
  UserRecord,
} from '../lib/types'
import { todayLocal } from '../lib/dates'

/**
 * Returns today's local calendar date (YYYY-MM-DD) and re-renders on midnight
 * roll over so pages that key off "today" (kid home, dashboard, kid detail)
 * pick up the new day without a manual reload. Polls every 30 seconds — cheap
 * and eliminates the need to compute exact ms-until-midnight.
 */
export function useLocalDate(): string {
  const [date, setDate] = useState<string>(() => todayLocal())
  useEffect(() => {
    const check = () => {
      const now = todayLocal()
      setDate((prev) => (prev !== now ? now : prev))
    }
    const id = window.setInterval(check, 30_000)
    // Also re-check whenever the tab regains focus (kid picks the tablet back up).
    const onVis = () => {
      if (document.visibilityState === 'visible') check()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])
  return date
}

type Pred<T> = (r: T) => boolean

type WithId = { id: string }
function upsert<T extends WithId>(list: T[], item: T): T[] {
  const idx = list.findIndex((x) => x.id === item.id)
  if (idx === -1) return [...list, item]
  const copy = list.slice()
  copy[idx] = item
  return copy
}
function removeById<T extends WithId>(list: T[], id: string): T[] {
  return list.filter((x) => x.id !== id)
}

/** Live-collection hook. */
function useLive<T extends WithId>(
  collection: string,
  opts: {
    filter?: string
    sort?: string
    /** Client-side predicate applied to inbound realtime deltas (in addition to filter). */
    matches?: Pred<T>
    /** Post-fetch sorter for stable ordering when applying deltas. */
    sortBy?: (a: T, b: T) => number
    /** Set to false to disable the hook. */
    enabled?: boolean
  } = {},
): { data: T[]; loading: boolean; error: string | null } {
  const { filter, sort, matches, sortBy, enabled = true } = opts
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState<boolean>(enabled)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) {
      setData([])
      setLoading(false)
      return
    }
    let cancelled = false
    let unsub: (() => void) | null = null

    const applySort = (arr: T[]) => (sortBy ? [...arr].sort(sortBy) : arr)

    ;(async () => {
      try {
        // Build options with only defined values — the PB JS SDK forwards
        // `undefined` as the literal string "undefined" in the query string,
        // which then hits PB and returns a 400 (e.g. sort=undefined).
        const listOpts: { filter?: string; sort?: string } = {}
        if (filter) listOpts.filter = filter
        if (sort) listOpts.sort = sort
        const initial = (await pb
          .collection(collection)
          .getFullList<T>(listOpts)) as T[]
        if (cancelled) return
        setData(applySort(initial))
        setLoading(false)

        const unsubPromise = pb.collection(collection).subscribe<T>('*', (e) => {
          setData((prev) => {
            if (e.action === 'delete') return removeById(prev, e.record.id)
            const rec = e.record as T
            // If an update makes the record fall out of our filter (e.g. a
            // pending completion just got approved), drop it from the list.
            // Previously we returned `prev` and the stale row stayed, causing
            // "Completion is not pending" on the next click.
            if (matches && !matches(rec)) return removeById(prev, e.record.id)
            return applySort(upsert(prev, rec))
          })
        })
        const off = await unsubPromise
        if (cancelled) {
          off()
          return
        }
        unsub = off
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Failed to load')
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
      if (unsub) unsub()
    }
  }, [collection, filter, sort, enabled])

  return { data, loading, error }
}

/** Live single-record hook. */
function useLiveOne<T extends WithId>(
  collection: string,
  id: string | undefined,
): { data: T | null; loading: boolean; error: string | null } {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState<boolean>(!!id)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) {
      setData(null)
      setLoading(false)
      return
    }
    let cancelled = false
    let unsub: (() => void) | null = null

    ;(async () => {
      try {
        const rec = (await pb.collection(collection).getOne<T>(id)) as T
        if (cancelled) return
        setData(rec)
        setLoading(false)
        const off = await pb.collection(collection).subscribe<T>(id, (e) => {
          if (e.action === 'delete') setData(null)
          else setData(e.record as T)
        })
        if (cancelled) {
          off()
          return
        }
        unsub = off
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Failed to load')
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
      if (unsub) unsub()
    }
  }, [collection, id])

  return { data, loading, error }
}

// ---- domain hooks -------------------------------------------------------

const byName = <T extends { displayName: string }>(a: T, b: T) =>
  a.displayName.localeCompare(b.displayName)

const byTitle = <T extends { title: string }>(a: T, b: T) => a.title.localeCompare(b.title)

const byOrder = <T extends { order: number }>(a: T, b: T) => a.order - b.order

const byCreatedDesc = <T extends { created: string }>(a: T, b: T) =>
  b.created.localeCompare(a.created)

export function useKids(includeInactive = false) {
  return useLive<KidRecord>('kids', {
    filter: includeInactive ? '' : 'active = true',
    sortBy: byName,
    matches: (r) => (includeInactive ? true : r.active !== false),
  })
}

export function useKid(kidId: string | undefined) {
  return useLiveOne<KidRecord>('kids', kidId)
}

export function useBaseChores(kidId: string | undefined) {
  return useLive<BaseChoreRecord>('base_chores', {
    enabled: !!kidId,
    filter: kidId ? `kidId = "${kidId}"` : '',
    sortBy: byOrder,
    matches: (r) => r.kidId === kidId,
  })
}

export function useActiveBonusChores() {
  return useLive<BonusChoreRecord>('bonus_chores', {
    filter: 'active = true',
    sortBy: byTitle,
    matches: (r) => !!r.active,
  })
}

export function useAllBonusChores() {
  return useLive<BonusChoreRecord>('bonus_chores', { sortBy: byTitle })
}

export function useBalance(kidId: string | undefined) {
  const { data, loading } = useLive<BalanceRecord>('balances', {
    enabled: !!kidId,
    filter: kidId ? `kidId = "${kidId}"` : '',
    matches: (r) => r.kidId === kidId,
  })
  const bal = data[0]?.coinBalance ?? 0
  return { balance: bal, loading }
}

export function useDailyStatus(kidId: string | undefined, date: string = todayLocal()) {
  const { data, loading } = useLive<DailyStatusRecord>('daily_status', {
    enabled: !!kidId,
    filter: kidId ? `kidId = "${kidId}" && date = "${date}"` : '',
    matches: (r) => r.kidId === kidId && r.date === date,
  })
  return { status: data[0] ?? null, loading }
}

export function usePendingCompletionsForKid(kidId: string | undefined) {
  return useLive<CompletionRecord>('completions', {
    enabled: !!kidId,
    filter: kidId ? `kidId = "${kidId}" && status = "pending"` : '',
    matches: (r) => r.kidId === kidId && r.status === 'pending',
  })
}

/**
 * Recent completions for a kid regardless of status. Used by KidHome to surface
 * rejection notes ("Sorry, try again — bed still messy") alongside the chore so
 * the kid sees why their submission was rejected and can retry.
 */
export function useRecentCompletionsForKid(kidId: string | undefined, count = 30) {
  const res = useLive<CompletionRecord>('completions', {
    enabled: !!kidId,
    filter: kidId ? `kidId = "${kidId}"` : '',
    sort: '-created',
    matches: (r) => r.kidId === kidId,
    sortBy: (a, b) => b.created.localeCompare(a.created),
  })
  return { data: res.data.slice(0, count), loading: res.loading }
}

export function usePendingCompletions() {
  return useLive<CompletionRecord>('completions', {
    filter: 'status = "pending"',
    sort: 'created',
    matches: (r) => r.status === 'pending',
    sortBy: (a, b) => a.created.localeCompare(b.created),
  })
}

export function useKidsRecentDailyStatuses(kidId: string | undefined, count = 14) {
  const res = useLive<DailyStatusRecord>('daily_status', {
    enabled: !!kidId,
    filter: kidId ? `kidId = "${kidId}"` : '',
    sort: '-date',
    matches: (r) => r.kidId === kidId,
    sortBy: (a, b) => b.date.localeCompare(a.date),
  })
  return { data: res.data.slice(0, count), loading: res.loading }
}

export function useLedger(kidId: string | undefined, count = 50) {
  const res = useLive<LedgerRecord>('ledger', {
    enabled: !!kidId,
    filter: kidId ? `kidId = "${kidId}"` : '',
    sort: '-created',
    matches: (r) => r.kidId === kidId,
    sortBy: byCreatedDesc,
  })
  return { data: res.data.slice(0, count), loading: res.loading }
}

export function useAllRecentLedger(count = 100) {
  const res = useLive<LedgerRecord>('ledger', {
    sort: '-created',
    sortBy: byCreatedDesc,
  })
  return { data: res.data.slice(0, count), loading: res.loading }
}

// ---- reward items + requests --------------------------------------------

export function useActiveRewardItems() {
  return useLive<RewardItemRecord>('reward_items', {
    filter: 'active = true',
    sortBy: (a, b) => a.coinCost - b.coinCost || a.title.localeCompare(b.title),
    matches: (r) => !!r.active,
  })
}

export function useAllRewardItems() {
  return useLive<RewardItemRecord>('reward_items', {
    sortBy: (a, b) => a.coinCost - b.coinCost || a.title.localeCompare(b.title),
  })
}

export function usePendingRewardRequests() {
  return useLive<RewardRequestRecord>('reward_requests', {
    filter: 'status = "pending"',
    sort: 'created',
    matches: (r) => r.status === 'pending',
    sortBy: (a, b) => a.created.localeCompare(b.created),
  })
}

export function usePendingRewardRequestsForKid(kidId: string | undefined) {
  return useLive<RewardRequestRecord>('reward_requests', {
    enabled: !!kidId,
    filter: kidId ? `kidId = "${kidId}" && status = "pending"` : '',
    matches: (r) => r.kidId === kidId && r.status === 'pending',
    sortBy: (a, b) => a.created.localeCompare(b.created),
  })
}

export function useRecentRewardRequestsForKid(kidId: string | undefined, count = 20) {
  const res = useLive<RewardRequestRecord>('reward_requests', {
    enabled: !!kidId,
    filter: kidId ? `kidId = "${kidId}"` : '',
    sort: '-created',
    matches: (r) => r.kidId === kidId,
    sortBy: (a, b) => b.created.localeCompare(a.created),
  })
  return { data: res.data.slice(0, count), loading: res.loading }
}

// ---- dashboards (kiosk accounts for family wall tablets) ---------------

export function useDashboards() {
  return useLive<UserRecord>('users', {
    filter: 'role = "dashboard"',
    sortBy: byName,
    matches: (r) => r.role === 'dashboard',
  })
}

/** All parent accounts on this install — used in Settings to reset each other's passwords. */
export function useParents() {
  return useLive<UserRecord>('users', {
    filter: 'role = "parent"',
    sortBy: byName,
    matches: (r) => r.role === 'parent',
  })
}

// ---- goals + contributions ---------------------------------------------

/** All active + reached goals (parents/dashboard see everything; kids see per collection rules). */
export function useActiveGoals() {
  return useLive<GoalRecord>('goals', {
    filter: 'status = "active" || status = "reached"',
    sort: '-created',
    matches: (r) => r.status === 'active' || r.status === 'reached',
    sortBy: (a, b) => b.created.localeCompare(a.created),
  })
}

/** All goals in every status — used on the parent Manage page. */
export function useAllGoals() {
  return useLive<GoalRecord>('goals', {
    sort: '-created',
    sortBy: (a, b) => b.created.localeCompare(a.created),
  })
}

/** Goals reached but not yet completed — parent approval queue. */
export function useGoalsAwaitingApproval() {
  return useLive<GoalRecord>('goals', {
    filter: 'status = "reached"',
    sort: 'created',
    matches: (r) => r.status === 'reached',
    sortBy: (a, b) => a.created.localeCompare(b.created),
  })
}

/**
 * Approved contributions for a goal — used to compute the progress bar
 * total (sum of coinAmount + matchAmount over the returned rows).
 * Family-visibility goals return contribs across all kids; individual
 * goals filter server-side to the owner.
 */
export function useApprovedContributionsForGoal(goalId: string | undefined) {
  return useLive<GoalContributionRecord>('goal_contributions', {
    enabled: !!goalId,
    filter: goalId ? `goalId = "${goalId}" && status = "approved"` : '',
    matches: (r) => r.goalId === goalId && r.status === 'approved',
    sortBy: (a, b) => a.created.localeCompare(b.created),
  })
}

/** Pending contributions across all goals — parent approval queue. */
export function usePendingGoalContributions() {
  return useLive<GoalContributionRecord>('goal_contributions', {
    filter: 'status = "pending"',
    sort: 'created',
    matches: (r) => r.status === 'pending',
    sortBy: (a, b) => a.created.localeCompare(b.created),
  })
}

/**
 * Types mirror the PocketBase collections defined in pb_migrations/1700000000_init.js.
 * Every record has PB's built-in `id`, `created`, `updated` — added by `WithMeta<T>` below.
 */

export interface Meta {
  id: string
  created: string
  updated: string
  collectionId?: string
  collectionName?: string
}

export type WithMeta<T> = T & Meta

export type Role = 'parent' | 'kid' | 'dashboard'

export interface UserFields {
  email: string
  role: Role
  displayName: string
  kidId?: string
  avatarEmoji?: string
  verified?: boolean
}

export type UserRecord = WithMeta<UserFields>

export interface KidFields {
  displayName: string
  avatarEmoji: string
  userId?: string
  active: boolean
}

export type KidRecord = WithMeta<KidFields>

export interface BaseChoreFields {
  kidId: string
  title: string
  order: number
  active: boolean
}

export type BaseChoreRecord = WithMeta<BaseChoreFields>

export type BonusRecurring = 'once' | 'daily' | 'anytime'
export type BonusAssigned = string[] | 'all'

export interface BonusChoreFields {
  title: string
  coinValue: number
  assignedTo: BonusAssigned
  recurring: BonusRecurring
  /** 0 or missing = no per-day cap. >=1 = max approvals per kid per local day. */
  maxPerDay?: number
  active: boolean
}

export type BonusChoreRecord = WithMeta<BonusChoreFields>

export type CompletionStatus = 'pending' | 'approved' | 'rejected'
export type ChoreType = 'base' | 'bonus'

export interface CompletionFields {
  kidId: string
  choreType: ChoreType
  choreId: string
  choreTitle: string
  coinValue?: number
  forDate?: string
  status: CompletionStatus
  approvedBy?: string
  approvedAt?: string
  rejectionNote?: string
}

export type CompletionRecord = WithMeta<CompletionFields>

export interface DailyStatusFields {
  kidId: string
  date: string
  approvedBaseChores: Record<string, string>
  baseAwarded: boolean
  baseScreenTimeGrantedMinutes: number
  baseScreenTimeUsedMinutes: number
  carryOverMinutes: number
}

export type DailyStatusRecord = WithMeta<DailyStatusFields>

export interface BalanceFields {
  kidId: string
  coinBalance: number
}

export type BalanceRecord = WithMeta<BalanceFields>

export type LedgerType =
  | 'earn_coin'
  | 'spend_coin_screen'
  | 'spend_coin_cash'
  | 'spend_coin_reward'
  | 'grant_base_screen'
  | 'spend_base_screen'
  | 'adjust_coin'
  | 'adjust_base_screen'
  | 'carryover_base_screen'

// ---- Reward items + requests -----------------------------------------------

export interface RewardItemFields {
  title: string
  description?: string
  emoji?: string
  coinCost: number
  active: boolean
}

export type RewardItemRecord = WithMeta<RewardItemFields>

export type RewardRequestStatus = 'pending' | 'approved' | 'denied' | 'cancelled'

/**
 * A reward request is either an item from the parent-defined catalog
 * (kind='item') or a coin-for-screen-time redemption (kind='screen_time').
 * Legacy pre-migration rows have empty kind and are treated as 'item' in code.
 */
export type RewardRequestKind = 'item' | 'screen_time' | ''

export interface RewardRequestFields {
  kidId: string
  /** Empty on legacy rows; treat as 'item'. */
  kind?: RewardRequestKind
  /** Empty on screen_time requests (no reward_items row backing them). */
  rewardId?: string
  rewardTitle: string
  rewardEmoji?: string
  coinCost: number
  /** Only populated for kind='screen_time'; server derives from coinCost. */
  screenTimeMinutes?: number
  status: RewardRequestStatus
  approvedBy?: string
  approvedAt?: string
  denialNote?: string
}

export type RewardRequestRecord = WithMeta<RewardRequestFields>

export interface LedgerFields {
  kidId: string
  type: LedgerType
  amount: number
  note?: string
  refId?: string
  by?: string
}

export type LedgerRecord = WithMeta<LedgerFields>

/** Business constants — must stay in sync with pb_hooks/lib.js. */
export const COIN_TO_SCREEN_MINUTES = 5
export const COIN_TO_CENTS = 25
export const BASE_REWARD_MINUTES = 60

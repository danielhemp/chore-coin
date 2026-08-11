/**
 * Every mutation the app performs.
 *
 * Multi-record operations (approve, redeem, adjust, carry-over) go through
 * custom PocketBase endpoints in pb_hooks/main.pb.js so they run in a single
 * transaction with the ledger. Single-record edits (chore CRUD, kid rename)
 * write through PocketBase's default collection API.
 */
import { pb, callCustom } from '../pb'
import type {
  BaseChoreFields,
  BonusChoreFields,
  ChoreType,
  KidFields,
  RewardItemFields,
} from './types'

// ---- chore submissions (kid or parent) ----------------------------------

export async function markChoreDone(params: {
  kidId: string
  choreType: ChoreType
  choreId: string
  choreTitle: string
  coinValue?: number
  forDate?: string
}) {
  const { kidId, choreType, choreId, choreTitle, coinValue, forDate } = params
  const body: Record<string, unknown> = {
    kidId,
    choreType,
    choreId,
    choreTitle,
    status: 'pending',
  }
  if (coinValue !== undefined) body.coinValue = coinValue
  if (forDate) body.forDate = forDate
  await pb.collection('completions').create(body)
}

// ---- approvals (parent, atomic via hook) --------------------------------

export function approveCompletion(completionId: string) {
  return callCustom('approve', { completionId })
}

export function rejectCompletion(completionId: string, note?: string) {
  return callCustom('reject', { completionId, note })
}

// ---- redemptions (kid or parent) ----------------------------------------

export function redeemCoinsForScreen(kidId: string, coins: number) {
  return callCustom('redeem', { kidId, coins, kind: 'screen' })
}

export function redeemCoinsForCash(kidId: string, coins: number) {
  return callCustom('redeem', { kidId, coins, kind: 'cash' })
}

// ---- parent adjustments -------------------------------------------------

export function adjustCoins(kidId: string, amount: number, note: string) {
  return callCustom('adjust-coins', { kidId, amount, note })
}

export function spendBaseScreenTime(kidId: string, minutes: number, date?: string) {
  return callCustom('spend-base', { kidId, minutes, date })
}

export function adjustBaseScreenTime(
  kidId: string,
  minutes: number,
  note: string,
  date?: string,
) {
  return callCustom('adjust-base', { kidId, minutes, note, date })
}

export function carryOverBaseMinutes(kidId: string, minutes: number, toDate?: string) {
  return callCustom('carry-over', { kidId, minutes, toDate })
}

// ---- kids management ----------------------------------------------------

/**
 * Creates a new kid record (and optionally a matching kid auth user)
 * atomically via the /create-kid hook. Returns the new kid id.
 *
 * Login can be attached two ways:
 *   - username + pin (for young kids who don't have email)
 *   - email + password (for older kids)
 * Provide neither to skip the login for now.
 */
export async function createKid(params: {
  displayName: string
  avatarEmoji?: string
  kidUsername?: string
  kidPin?: string
  kidUserEmail?: string
  kidUserPassword?: string
}): Promise<string> {
  const res = await callCustom<{ ok: boolean; kidId: string }>('create-kid', {
    displayName: params.displayName,
    avatarEmoji: params.avatarEmoji || '',
    kidUsername: params.kidUsername || '',
    kidPin: params.kidPin || '',
    kidUserEmail: params.kidUserEmail || '',
    kidUserPassword: params.kidUserPassword || '',
  })
  return res.kidId
}

export async function updateKid(kidId: string, patch: Partial<KidFields>) {
  await pb.collection('kids').update(kidId, patch)
}

/** Reset the login attached to a kid (username+PIN OR email+password). */
export function setKidLogin(params: {
  kidId: string
  username?: string
  pin?: string
  email?: string
  password?: string
}) {
  return callCustom('set-kid-login', {
    kidId: params.kidId,
    username: params.username || '',
    pin: params.pin || '',
    email: params.email || '',
    password: params.password || '',
  })
}

/** Permanently delete a kid + every record that references them + their auth user. */
export function deleteKid(kidId: string) {
  return callCustom('delete-kid', { kidId })
}

// ---- base chores CRUD (parent) ------------------------------------------

export async function createBaseChore(kidId: string, title: string, order: number) {
  return pb.collection('base_chores').create({ kidId, title, order, active: true })
}

export async function updateBaseChore(id: string, patch: Partial<BaseChoreFields>) {
  return pb.collection('base_chores').update(id, patch)
}

export async function deleteBaseChore(id: string) {
  return pb.collection('base_chores').delete(id)
}

// ---- bonus chores CRUD (parent) -----------------------------------------

export async function createBonusChore(fields: BonusChoreFields) {
  return pb.collection('bonus_chores').create(fields)
}

export async function updateBonusChore(id: string, patch: Partial<BonusChoreFields>) {
  return pb.collection('bonus_chores').update(id, patch)
}

export async function deleteBonusChore(id: string) {
  return pb.collection('bonus_chores').delete(id)
}

// ---- reward items CRUD (parent) -----------------------------------------

export async function createRewardItem(fields: RewardItemFields) {
  return pb.collection('reward_items').create(fields)
}

export async function updateRewardItem(id: string, patch: Partial<RewardItemFields>) {
  return pb.collection('reward_items').update(id, patch)
}

export async function deleteRewardItem(id: string) {
  return pb.collection('reward_items').delete(id)
}

// ---- reward requests (kid or parent, atomic via hook) -------------------

export function requestReward(kidId: string, rewardId: string) {
  return callCustom<{ ok: boolean; id: string }>('request-reward', { kidId, rewardId })
}

export function approveRewardRequest(requestId: string) {
  return callCustom('approve-reward', { requestId })
}

export function denyRewardRequest(requestId: string, note?: string) {
  return callCustom('deny-reward', { requestId, note })
}

export function cancelRewardRequest(requestId: string) {
  return callCustom('cancel-reward', { requestId })
}

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

/**
 * Kid asks for `coins` worth of screen time. Creates a pending reward_request
 * (kind=screen_time) that shows up in the parent's approvals inbox. Approval
 * atomically deducts the coins and credits today's available screen minutes.
 */
export function requestScreenTime(kidId: string, coins: number) {
  return callCustom<{ ok: boolean; id: string }>('request-screen-time', { kidId, coins })
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

// ---- dashboards (parent) ------------------------------------------------

/**
 * Create a kiosk login for a family wall tablet. Returns the new user id +
 * normalized username (lowercased, non-[a-z0-9_] replaced with underscores).
 * The dashboard user has read-all + create-pending-completions +
 * spend-own-base-time permissions but cannot approve or manage.
 */
export function createDashboard(params: {
  displayName: string
  username: string
  pin: string
}) {
  return callCustom<{ ok: boolean; id: string; username: string }>('create-dashboard', {
    displayName: params.displayName,
    username: params.username,
    pin: params.pin,
  })
}

export function deleteDashboard(userId: string) {
  return callCustom('delete-dashboard', { userId })
}

export function resetDashboardPin(userId: string, pin: string) {
  return callCustom('reset-dashboard-pin', { userId, pin })
}

// ---- Parent account password management ---------------------------------

/**
 * Change the currently-signed-in user's password. PB's built-in update
 * requires the old password — no hook needed. After success the auth token
 * is invalidated server-side, so we refresh the session with the new
 * password so the caller stays signed in.
 */
export async function changeMyPassword(oldPassword: string, newPassword: string) {
  const me = pb.authStore.model
  if (!me) throw new Error('Not signed in.')
  if (newPassword.length < 8) throw new Error('New password must be at least 8 characters.')
  await pb.collection('users').update(me.id, {
    oldPassword,
    password: newPassword,
    passwordConfirm: newPassword,
  })
  // PB revokes the old token when the password changes; re-authenticate so
  // the user isn't kicked to the login screen mid-session.
  const email = (me as any).email as string | undefined
  if (email) {
    await pb.collection('users').authWithPassword(email, newPassword)
  }
}

/**
 * Reset another parent's password. Caller must be a parent; target must be
 * a parent. For the "mom forgot her password → dad resets it from his
 * phone" flow. Goes through the /reset-parent-password hook which does not
 * require the old password.
 */
export function resetParentPassword(userId: string, newPassword: string) {
  return callCustom('reset-parent-password', { userId, password: newPassword })
}

// ---- Savings goals (parent + kid) ---------------------------------------

/**
 * Create a new savings goal. ownerKidId=undefined means family goal.
 */
export function createGoal(fields: {
  title: string
  description?: string
  emoji?: string
  category?: string
  ownerKidId?: string
  coinTarget: number
  matchRate?: number
  visibility: 'owner_only' | 'family' | 'private'
  approvalRequired?: boolean
}) {
  return callCustom<{ ok: boolean; id: string }>('create-goal', {
    title: fields.title,
    description: fields.description ?? '',
    emoji: fields.emoji ?? '',
    category: fields.category ?? '',
    ownerKidId: fields.ownerKidId ?? '',
    coinTarget: fields.coinTarget,
    matchRate: fields.matchRate ?? 0,
    visibility: fields.visibility,
    approvalRequired: fields.approvalRequired ?? false,
  })
}

export function updateGoal(
  goalId: string,
  patch: {
    title?: string
    description?: string
    emoji?: string
    category?: string
    ownerKidId?: string
    coinTarget?: number
    matchRate?: number
    visibility?: 'owner_only' | 'family' | 'private'
    approvalRequired?: boolean
  },
) {
  return callCustom('update-goal', {
    goalId,
    title: patch.title ?? '',
    description: patch.description ?? '',
    emoji: patch.emoji ?? '',
    category: patch.category ?? '',
    ownerKidId: patch.ownerKidId ?? '',
    coinTarget: patch.coinTarget ?? 0,
    matchRate: patch.matchRate ?? -1,
    visibility: patch.visibility ?? '',
    approvalRequired: patch.approvalRequired ?? false,
  })
}

export function cancelGoal(goalId: string) {
  return callCustom('cancel-goal', { goalId })
}

export function completeGoal(goalId: string) {
  return callCustom('complete-goal', { goalId })
}

/**
 * Kid contributes coins toward a goal. If the goal's approvalRequired is
 * on, the contribution is created as pending (coins stay on the balance).
 * Otherwise coins leave immediately, match is applied, and the goal may
 * auto-flip to 'reached'.
 */
export function contributeToGoal(goalId: string, kidId: string, coins: number) {
  return callCustom<{ ok: boolean; reached: boolean; pending: boolean }>(
    'contribute-to-goal',
    { goalId, kidId, coins },
  )
}

export function approveGoalContribution(contributionId: string) {
  return callCustom<{ ok: boolean; reached: boolean }>('approve-goal-contribution', {
    contributionId,
  })
}

export function denyGoalContribution(contributionId: string, note?: string) {
  return callCustom('deny-goal-contribution', { contributionId, note })
}

/// <reference path="../pb_data/types.d.ts" />

/**
 * Chore Coin — server-side atomic operations.
 *
 * Each route callback runs in an isolated goja Runtime, so we require()
 * shared helpers from lib.js at the top of every handler. Multi-record
 * mutations run inside $app.dao().runInTransaction() for true atomicity.
 */

// -----------------------------------------------------------------------------
// Push notification on new pending completion → tells parents "chore ready to
// approve." Uses ntfy (https://ntfy.sh) via NTFY_URL + NTFY_TOPIC env vars.
// -----------------------------------------------------------------------------
onRecordAfterCreateRequest((e) => {
  const { sendNtfy, sendWebPushToAllParents } = require(`${__hooks}/lib.js`)
  try {
    const rec = e.record
    if (!rec) return
    if (rec.getString('status') !== 'pending') return

    // Look up the kid's display name (relation → kids.displayName).
    let kidName = 'A kid'
    try {
      const kid = $app.dao().findRecordById('kids', rec.getString('kidId'))
      if (kid) kidName = kid.getString('displayName') || kidName
    } catch (_ignored) {}

    const isBonus = rec.getString('choreType') === 'bonus'
    const title = isBonus
      ? `${kidName} did a bonus chore`
      : `${kidName} finished a chore`
    const message = isBonus
      ? `"${rec.getString('choreTitle')}" — ${rec.getInt('coinValue') || 0} 🪙 if approved`
      : `"${rec.getString('choreTitle')}" — needs your approval`

    // Deliver via BOTH ntfy (if configured) and Web Push (if configured). Each
    // is a no-op when its env vars aren't set, so users can pick either or both.
    sendNtfy(title, message, {
      priority: 'default',
      tags: isBonus ? 'coin,star' : 'white_check_mark',
    })
    sendWebPushToAllParents(title, message, {
      tag: 'chore-coin-pending',
      clickUrl: '/approvals',
    })
  } catch (err) {
    $app.logger().warn('completion notify failed', 'error', String(err))
  }
}, 'completions')

// -----------------------------------------------------------------------------
// Web Push: parents subscribe their browser to native OS push. Frontend obtains
// a PushSubscription from the browser's push service (Apple's on iOS 16.4+,
// Chrome's push service on Android), then POSTs the JSON here.
// -----------------------------------------------------------------------------

// POST /api/custom/push-vapid-key  →  { key } (unauth: needed pre-subscribe)
routerAdd('GET', '/api/custom/push-vapid-key', (c) => {
  const key = ($os.getenv('WEBPUSH_VAPID_PUBLIC_KEY') || '').trim()
  return c.json(200, { key })
})

// -----------------------------------------------------------------------------
// First-run setup wizard endpoints.
// -----------------------------------------------------------------------------

// GET /api/custom/setup-status  →  { needsSetup: bool }  (unauth, public)
// The frontend polls this on startup. If needsSetup=true it renders the
// setup wizard instead of the normal login page. Setup is considered
// complete once ANY user with role="parent" exists in the users collection.
routerAdd('GET', '/api/custom/setup-status', (c) => {
  let needsSetup = true
  try {
    const parents = $app.dao().findRecordsByFilter(
      'users',
      'role = "parent"',
      '',
      1,
      0,
    )
    needsSetup = parents.length === 0
  } catch (_e) {
    // On any error assume setup is incomplete so the wizard can try again.
    needsSetup = true
  }
  return c.json(200, { needsSetup })
})

// POST /api/custom/setup  { adminEmail, adminPassword, parentEmail,
//                          parentPassword, parentName, avatarEmoji?, timezone? }
//
// One-shot bootstrap: creates the PocketBase superuser (for /_/ admin UI)
// AND the first parent user (for the app), atomically. Refuses to run if
// any parent user already exists — the endpoint locks itself the moment
// setup is complete.
//
// Unauth on purpose: the whole point is that new self-hosters can complete
// this from the browser without ever touching a terminal.
routerAdd('POST', '/api/custom/setup', (c) => {
  const { requireBody } = require(`${__hooks}/lib.js`)
  const body = requireBody(c, {
    adminEmail: '',
    adminPassword: '',
    parentEmail: '',
    parentPassword: '',
    parentName: '',
    avatarEmoji: '',
    timezone: '',
  })

  // Refuse if setup already completed.
  const existingParents = $app.dao().findRecordsByFilter(
    'users',
    'role = "parent"',
    '',
    1,
    0,
  )
  if (existingParents.length > 0) {
    throw new BadRequestError('Setup has already been completed on this server.')
  }

  // Basic validation (frontend also validates, but never trust it).
  if (!body.adminEmail || !body.adminPassword) {
    throw new BadRequestError('Admin email and password are required.')
  }
  if (!body.parentEmail || !body.parentPassword) {
    throw new BadRequestError('Parent email and password are required.')
  }
  if (!body.parentName) {
    throw new BadRequestError('Parent display name is required.')
  }
  if (body.adminPassword.length < 10) {
    throw new BadRequestError('Admin password must be at least 10 characters.')
  }
  if (body.parentPassword.length < 8) {
    throw new BadRequestError('Parent password must be at least 8 characters.')
  }

  $app.dao().runInTransaction((txDao) => {
    // 1) Superuser (PocketBase admin) — accesses /_/ admin UI.
    const admin = new Admin()
    admin.email = body.adminEmail
    admin.setPassword(body.adminPassword)
    txDao.saveAdmin(admin)

    // 2) First parent user — logs into the app itself.
    // Our users collection allows username-based auth, so every record needs
    // a username. Derive one from the local-part of the email, plus a
    // random suffix to guarantee uniqueness. Users log in with either the
    // email or the generated username.
    const emailLocal = String(body.parentEmail)
      .split('@')[0]
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
    const username = emailLocal + '_' + $security.randomString(6).toLowerCase()

    const usersCol = txDao.findCollectionByNameOrId('users')
    const parent = new Record(usersCol, {
      username,
      email: body.parentEmail,
      role: 'parent',
      displayName: body.parentName,
      avatarEmoji: body.avatarEmoji || '👤',
      emailVisibility: false,
      verified: true,
    })
    parent.setPassword(body.parentPassword)
    txDao.saveRecord(parent)
  })

  return c.json(200, { ok: true })
})

// POST /api/custom/push-subscribe  { endpoint, p256dh, auth, userAgent? }
routerAdd('POST', '/api/custom/push-subscribe', (c) => {
  const { requireBody, findOrNull } = require(`${__hooks}/lib.js`)
  const info = $apis.requestInfo(c)
  const user = info.authRecord
  if (!user) throw new ForbiddenError('Sign in first.')
  const role = user.getString('role')
  if (role !== 'parent' && role !== 'kid') {
    throw new ForbiddenError('Push notifications are for parent + kid accounts.')
  }
  const body = requireBody(c, { endpoint: '', p256dh: '', auth: '', userAgent: '' })
  if (!body.endpoint || !body.p256dh || !body.auth) {
    throw new BadRequestError('endpoint, p256dh, and auth are required.')
  }

  const col = $app.dao().findCollectionByNameOrId('push_subscriptions')
  // Upsert on endpoint: if this browser already subscribed, refresh keys +
  // reattach to this user (in case of a re-login).
  const existing = findOrNull(() =>
    $app.dao().findFirstRecordByFilter('push_subscriptions', 'endpoint = {:e}', {
      e: body.endpoint,
    }),
  )
  if (existing) {
    existing.set('userId', user.id)
    existing.set('p256dh', body.p256dh)
    existing.set('auth', body.auth)
    if (body.userAgent) existing.set('userAgent', body.userAgent)
    $app.dao().saveRecord(existing)
    return c.json(200, { ok: true, id: existing.id })
  }
  const rec = new Record(col, {
    userId: user.id,
    endpoint: body.endpoint,
    p256dh: body.p256dh,
    auth: body.auth,
    userAgent: body.userAgent || '',
  })
  $app.dao().saveRecord(rec)
  return c.json(200, { ok: true, id: rec.id })
})

// POST /api/custom/push-unsubscribe  { endpoint }
routerAdd('POST', '/api/custom/push-unsubscribe', (c) => {
  const { requireBody, findOrNull } = require(`${__hooks}/lib.js`)
  const info = $apis.requestInfo(c)
  const user = info.authRecord
  if (!user) throw new ForbiddenError('Sign in first.')
  const body = requireBody(c, { endpoint: '' })
  if (!body.endpoint) throw new BadRequestError('endpoint required.')
  const existing = findOrNull(() =>
    $app.dao().findFirstRecordByFilter(
      'push_subscriptions',
      'endpoint = {:e} && userId = {:u}',
      { e: body.endpoint, u: user.id },
    ),
  )
  if (existing) $app.dao().deleteRecord(existing)
  return c.json(200, { ok: true })
})

// POST /api/custom/approve  { completionId }
routerAdd('POST', '/api/custom/approve', (c) => {
  const {
    requireParent,
    requireBody,
    localDate,
    findOrNull,
    ensureDailyStatus,
    ensureBalance,
    writeLedger,
    sendWebPushToKid,
    BASE_REWARD_MINUTES,
  } = require(`${__hooks}/lib.js`)

  const user = requireParent(c)
  const body = requireBody(c, { completionId: '' })
  if (!body.completionId) throw new BadRequestError('completionId required.')

  // Captured inside the tx; fired after successful commit so no notification is
  // sent for a rolled-back approval.
  let notify = null

  $app.dao().runInTransaction((txDao) => {
    const comp = txDao.findRecordById('completions', body.completionId)
    if (comp.getString('status') !== 'pending') {
      throw new BadRequestError('Completion is not pending.')
    }
    const kidId = comp.getString('kidId')
    const choreType = comp.getString('choreType')

    if (choreType === 'bonus') {
      // Re-derive coin value from the current chore to prevent client tampering.
      const chore = findOrNull(() =>
        txDao.findRecordById('bonus_chores', comp.getString('choreId')),
      )
      const value = chore ? chore.getInt('coinValue') : comp.getInt('coinValue')

      // Enforce per-day cap (if the chore has one). Cap counts approved
      // completions for the same (kidId, choreId) on the same forDate (local
      // day the kid submitted for). Pending completions don't count — only
      // approved ones — which is why the enforcement lives here, not on submit.
      const cap = chore ? chore.getInt('maxPerDay') : 0
      if (cap && cap > 0) {
        const day = comp.getString('forDate') || localDate()
        const priorApproved = txDao.findRecordsByFilter(
          'completions',
          'kidId = {:k} && choreId = {:c} && choreType = "bonus" && status = "approved" && forDate = {:d}',
          '',
          100,
          0,
          { k: kidId, c: comp.getString('choreId'), d: day },
        )
        if (priorApproved.length >= cap) {
          throw new BadRequestError(
            `Already approved ${priorApproved.length}/${cap} of "${comp.getString('choreTitle')}" for ${day}.`,
          )
        }
      }

      const bal = ensureBalance(txDao, kidId)
      bal.set('coinBalance', bal.getInt('coinBalance') + value)
      txDao.saveRecord(bal)
      writeLedger(txDao, {
        kidId,
        type: 'earn_coin',
        amount: value,
        note: comp.getString('choreTitle'),
        refId: comp.id,
        by: user.id,
      })
      comp.set('coinValue', value)
      notify = {
        kidId,
        title: '🪙 You earned coins!',
        message: `${value} 🪙 for "${comp.getString('choreTitle')}"`,
      }
    } else if (choreType === 'base') {
      const date = comp.getString('forDate') || localDate()
      const status = ensureDailyStatus(txDao, kidId, date)
      // JSON fields come back as raw bytes from .get(); .getString() gives us
      // the JSON string we can parse into a real JS object.
      const rawJson = status.getString('approvedBaseChores')
      const approved = rawJson ? JSON.parse(rawJson) : {}
      approved[comp.getString('choreId')] = comp.id
      status.set('approvedBaseChores', approved)

      const activeChores = txDao.findRecordsByFilter(
        'base_chores',
        'kidId = {:k} && active = true',
        '',
        200,
        0,
        { k: kidId },
      )
      const allDone =
        activeChores.length > 0 &&
        activeChores.every((c) => approved[c.id])

      if (allDone && !status.getBool('baseAwarded')) {
        status.set('baseAwarded', true)
        status.set(
          'baseScreenTimeGrantedMinutes',
          status.getInt('baseScreenTimeGrantedMinutes') + BASE_REWARD_MINUTES,
        )
        writeLedger(txDao, {
          kidId,
          type: 'grant_base_screen',
          amount: BASE_REWARD_MINUTES,
          note: 'All base chores complete',
          refId: comp.id,
          by: user.id,
        })
        notify = {
          kidId,
          title: '⭐ You earned screen time!',
          message: `You finished all your base chores — ${BASE_REWARD_MINUTES} minutes today!`,
        }
      } else {
        notify = {
          kidId,
          title: '✅ Chore approved',
          message: `"${comp.getString('choreTitle')}" — nice work!`,
        }
      }
      txDao.saveRecord(status)
    } else {
      throw new BadRequestError('Unknown choreType.')
    }

    comp.set('status', 'approved')
    comp.set('approvedBy', user.id)
    comp.set('approvedAt', new Date().toISOString())
    txDao.saveRecord(comp)
  })

  if (notify) {
    sendWebPushToKid(notify.kidId, notify.title, notify.message, { tag: 'chore-coin-kid' })
  }
  return c.json(200, { ok: true })
})

// POST /api/custom/reject  { completionId, note? }
routerAdd('POST', '/api/custom/reject', (c) => {
  const { requireParent, requireBody, sendWebPushToKid } = require(`${__hooks}/lib.js`)
  const user = requireParent(c)
  const body = requireBody(c, { completionId: '', note: '' })
  if (!body.completionId) throw new BadRequestError('completionId required.')

  let notify = null
  $app.dao().runInTransaction((txDao) => {
    const comp = txDao.findRecordById('completions', body.completionId)
    if (comp.getString('status') !== 'pending') {
      throw new BadRequestError('Completion is not pending.')
    }
    comp.set('status', 'rejected')
    comp.set('approvedBy', user.id)
    comp.set('approvedAt', new Date().toISOString())
    if (body.note) comp.set('rejectionNote', body.note)
    txDao.saveRecord(comp)
    notify = {
      kidId: comp.getString('kidId'),
      title: '😔 Try again',
      message: body.note
        ? `"${comp.getString('choreTitle')}": ${body.note}`
        : `"${comp.getString('choreTitle')}" wasn't approved — you can try again.`,
    }
  })
  if (notify) {
    sendWebPushToKid(notify.kidId, notify.title, notify.message, { tag: 'chore-coin-kid' })
  }
  return c.json(200, { ok: true })
})

// -----------------------------------------------------------------------------
// Reward requests: kid asks for an item from the parent-defined catalog. Parent
// approves (coins deducted atomically + ledger entry) or denies (no balance
// change, denial note optional). Kid can cancel their own pending request.
// -----------------------------------------------------------------------------

// POST /api/custom/request-reward  { kidId, rewardId }
routerAdd('POST', '/api/custom/request-reward', (c) => {
  const { requireAuthedForKid, requireBody, findOrNull, sendWebPushToAllParents } =
    require(`${__hooks}/lib.js`)
  const body = requireBody(c, { kidId: '', rewardId: '' })
  if (!body.kidId) throw new BadRequestError('kidId required.')
  if (!body.rewardId) throw new BadRequestError('rewardId required.')
  const user = requireAuthedForKid(c, body.kidId)

  let created = null
  let kidName = 'A kid'
  $app.dao().runInTransaction((txDao) => {
    const reward = txDao.findRecordById('reward_items', body.rewardId)
    if (!reward.getBool('active')) {
      throw new BadRequestError('That reward is not available right now.')
    }
    const kid = findOrNull(() => txDao.findRecordById('kids', body.kidId))
    if (kid) kidName = kid.getString('displayName') || kidName

    const col = txDao.findCollectionByNameOrId('reward_requests')
    const rec = new Record(col, {
      kidId: body.kidId,
      rewardId: reward.id,
      rewardTitle: reward.getString('title'),
      rewardEmoji: reward.getString('emoji') || '',
      coinCost: reward.getInt('coinCost'),
      status: 'pending',
    })
    txDao.saveRecord(rec)
    created = { id: rec.id, title: reward.getString('title'), coinCost: reward.getInt('coinCost') }
  })

  if (created) {
    sendWebPushToAllParents(
      `🎁 ${kidName} wants a reward`,
      `"${created.title}" — ${created.coinCost} 🪙 if approved`,
      { tag: 'chore-coin-reward-pending', clickUrl: '/approvals' },
    )
  }
  return c.json(200, { ok: true, id: created ? created.id : '' })
})

// POST /api/custom/approve-reward  { requestId }
routerAdd('POST', '/api/custom/approve-reward', (c) => {
  const {
    requireParent,
    requireBody,
    findOrNull,
    ensureBalance,
    writeLedger,
    sendWebPushToKid,
  } = require(`${__hooks}/lib.js`)

  const user = requireParent(c)
  const body = requireBody(c, { requestId: '' })
  if (!body.requestId) throw new BadRequestError('requestId required.')

  let notify = null
  $app.dao().runInTransaction((txDao) => {
    const req = txDao.findRecordById('reward_requests', body.requestId)
    if (req.getString('status') !== 'pending') {
      throw new BadRequestError('Request is not pending.')
    }
    const kidId = req.getString('kidId')

    // Re-derive cost from the reward if it still exists (prevents drift if a
    // parent edited the cost after the kid requested it). Fall back to the
    // snapshotted cost if the reward has since been deleted.
    const reward = findOrNull(() =>
      txDao.findRecordById('reward_items', req.getString('rewardId')),
    )
    const cost = reward ? reward.getInt('coinCost') : req.getInt('coinCost')
    if (cost <= 0) throw new BadRequestError('Reward cost is invalid.')

    const bal = ensureBalance(txDao, kidId)
    const cur = bal.getInt('coinBalance')
    if (cur < cost) {
      throw new BadRequestError(
        `Not enough coins — needs ${cost}, has ${cur}. Deny or wait for more coins.`,
      )
    }
    bal.set('coinBalance', cur - cost)
    txDao.saveRecord(bal)

    writeLedger(txDao, {
      kidId,
      type: 'spend_coin_reward',
      amount: -cost,
      note: `Reward: ${req.getString('rewardTitle')}`,
      refId: req.id,
      by: user.id,
    })

    req.set('status', 'approved')
    req.set('coinCost', cost)
    req.set('approvedBy', user.id)
    req.set('approvedAt', new Date().toISOString())
    txDao.saveRecord(req)

    notify = {
      kidId,
      title: '🎁 Reward approved!',
      message: `"${req.getString('rewardTitle')}" — enjoy it!`,
    }
  })

  if (notify) {
    sendWebPushToKid(notify.kidId, notify.title, notify.message, { tag: 'chore-coin-kid' })
  }
  return c.json(200, { ok: true })
})

// POST /api/custom/deny-reward  { requestId, note? }
routerAdd('POST', '/api/custom/deny-reward', (c) => {
  const { requireParent, requireBody, sendWebPushToKid } = require(`${__hooks}/lib.js`)
  const user = requireParent(c)
  const body = requireBody(c, { requestId: '', note: '' })
  if (!body.requestId) throw new BadRequestError('requestId required.')

  let notify = null
  $app.dao().runInTransaction((txDao) => {
    const req = txDao.findRecordById('reward_requests', body.requestId)
    if (req.getString('status') !== 'pending') {
      throw new BadRequestError('Request is not pending.')
    }
    req.set('status', 'denied')
    req.set('approvedBy', user.id)
    req.set('approvedAt', new Date().toISOString())
    if (body.note) req.set('denialNote', body.note)
    txDao.saveRecord(req)
    notify = {
      kidId: req.getString('kidId'),
      title: '😔 Reward not approved',
      message: body.note
        ? `"${req.getString('rewardTitle')}": ${body.note}`
        : `"${req.getString('rewardTitle')}" wasn't approved this time.`,
    }
  })
  if (notify) {
    sendWebPushToKid(notify.kidId, notify.title, notify.message, { tag: 'chore-coin-kid' })
  }
  return c.json(200, { ok: true })
})

// POST /api/custom/cancel-reward  { requestId }
// Kid cancels their own pending request (or a parent cancels on their behalf).
routerAdd('POST', '/api/custom/cancel-reward', (c) => {
  const { requireAuthedForKid, requireBody } = require(`${__hooks}/lib.js`)
  const body = requireBody(c, { requestId: '' })
  if (!body.requestId) throw new BadRequestError('requestId required.')

  $app.dao().runInTransaction((txDao) => {
    const req = txDao.findRecordById('reward_requests', body.requestId)
    if (req.getString('status') !== 'pending') {
      throw new BadRequestError('Request is not pending.')
    }
    // Verify the caller is the kid the request belongs to, or a parent.
    requireAuthedForKid(c, req.getString('kidId'))
    req.set('status', 'cancelled')
    txDao.saveRecord(req)
  })
  return c.json(200, { ok: true })
})

// POST /api/custom/redeem  { kidId, coins, kind }   kind = 'screen' | 'cash'
routerAdd('POST', '/api/custom/redeem', (c) => {
  const {
    requireAuthedForKid,
    requireBody,
    ensureBalance,
    writeLedger,
    COIN_TO_SCREEN_MINUTES,
    COIN_TO_CENTS,
  } = require(`${__hooks}/lib.js`)

  const body = requireBody(c, { kidId: '', coins: 0, kind: '' })
  if (!body.kidId) throw new BadRequestError('kidId required.')
  if (body.coins <= 0) throw new BadRequestError('coins must be positive.')
  if (body.kind !== 'screen' && body.kind !== 'cash') {
    throw new BadRequestError('kind must be screen or cash.')
  }
  const user = requireAuthedForKid(c, body.kidId)

  $app.dao().runInTransaction((txDao) => {
    const bal = ensureBalance(txDao, body.kidId)
    const cur = bal.getInt('coinBalance')
    if (cur < body.coins) throw new BadRequestError('Not enough coins.')
    bal.set('coinBalance', cur - body.coins)
    txDao.saveRecord(bal)

    const type = body.kind === 'screen' ? 'spend_coin_screen' : 'spend_coin_cash'
    const noteBody =
      body.kind === 'screen'
        ? `${body.coins * COIN_TO_SCREEN_MINUTES} min screen time`
        : `$${((body.coins * COIN_TO_CENTS) / 100).toFixed(2)} cash`
    writeLedger(txDao, {
      kidId: body.kidId,
      type,
      amount: -body.coins,
      note: `Redeemed ${body.coins} coins for ${noteBody}`,
      by: user.id,
    })
  })
  return c.json(200, { ok: true })
})

// POST /api/custom/adjust-coins  { kidId, amount, note }
routerAdd('POST', '/api/custom/adjust-coins', (c) => {
  const { requireParent, requireBody, ensureBalance, writeLedger, sendWebPushToKid } =
    require(`${__hooks}/lib.js`)
  const user = requireParent(c)
  const body = requireBody(c, { kidId: '', amount: 0, note: '' })
  if (!body.kidId) throw new BadRequestError('kidId required.')
  if (body.amount === 0) throw new BadRequestError('amount must not be zero.')
  if (!body.note) throw new BadRequestError('note required.')

  $app.dao().runInTransaction((txDao) => {
    const bal = ensureBalance(txDao, body.kidId)
    const next = bal.getInt('coinBalance') + body.amount
    if (next < 0) throw new BadRequestError('Balance cannot go negative.')
    bal.set('coinBalance', next)
    txDao.saveRecord(bal)
    writeLedger(txDao, {
      kidId: body.kidId,
      type: 'adjust_coin',
      amount: body.amount,
      note: body.note,
      by: user.id,
    })
  })
  const positive = body.amount > 0
  sendWebPushToKid(
    body.kidId,
    positive ? '🪙 Bonus coin!' : '⚠️ Coin taken away',
    positive
      ? `+${body.amount} 🪙 — ${body.note}`
      : `${body.amount} 🪙 — ${body.note}`,
    { tag: 'chore-coin-kid' },
  )
  return c.json(200, { ok: true })
})

// POST /api/custom/spend-base  { kidId, minutes, date? }
// Parents or the kid themselves can deduct base screen minutes as they're used.
routerAdd('POST', '/api/custom/spend-base', (c) => {
  const { requireAuthedForKid, requireBody, localDate, ensureDailyStatus, writeLedger } =
    require(`${__hooks}/lib.js`)
  const body = requireBody(c, { kidId: '', minutes: 0, date: '' })
  if (!body.kidId) throw new BadRequestError('kidId required.')
  if (body.minutes <= 0) throw new BadRequestError('minutes must be positive.')
  const user = requireAuthedForKid(c, body.kidId)
  const date = localDate(body.date)

  $app.dao().runInTransaction((txDao) => {
    const status = ensureDailyStatus(txDao, body.kidId, date)
    const avail =
      status.getInt('baseScreenTimeGrantedMinutes') +
      status.getInt('carryOverMinutes') -
      status.getInt('baseScreenTimeUsedMinutes')
    if (avail < body.minutes) throw new BadRequestError('Not enough base screen time.')
    status.set(
      'baseScreenTimeUsedMinutes',
      status.getInt('baseScreenTimeUsedMinutes') + body.minutes,
    )
    txDao.saveRecord(status)
    writeLedger(txDao, {
      kidId: body.kidId,
      type: 'spend_base_screen',
      amount: -body.minutes,
      note: `Used ${body.minutes} min base screen time`,
      by: user.id,
    })
  })
  return c.json(200, { ok: true })
})

// POST /api/custom/adjust-base  { kidId, minutes, note, date? }
routerAdd('POST', '/api/custom/adjust-base', (c) => {
  const { requireParent, requireBody, localDate, ensureDailyStatus, writeLedger } =
    require(`${__hooks}/lib.js`)
  const user = requireParent(c)
  const body = requireBody(c, { kidId: '', minutes: 0, note: '', date: '' })
  if (!body.kidId) throw new BadRequestError('kidId required.')
  if (body.minutes === 0) throw new BadRequestError('minutes must not be zero.')
  const date = localDate(body.date)

  $app.dao().runInTransaction((txDao) => {
    const status = ensureDailyStatus(txDao, body.kidId, date)
    const nextGranted = status.getInt('baseScreenTimeGrantedMinutes') + body.minutes
    const avail =
      nextGranted +
      status.getInt('carryOverMinutes') -
      status.getInt('baseScreenTimeUsedMinutes')
    if (avail < 0) throw new BadRequestError('Adjustment would drop below 0 available minutes.')
    status.set('baseScreenTimeGrantedMinutes', nextGranted)
    txDao.saveRecord(status)
    writeLedger(txDao, {
      kidId: body.kidId,
      type: 'adjust_base_screen',
      amount: body.minutes,
      note: body.note || 'Parent adjustment',
      by: user.id,
    })
  })
  return c.json(200, { ok: true })
})

// POST /api/custom/carry-over  { kidId, minutes, toDate? }
routerAdd('POST', '/api/custom/carry-over', (c) => {
  const { requireParent, requireBody, localDate, ensureDailyStatus, writeLedger } =
    require(`${__hooks}/lib.js`)
  const user = requireParent(c)
  const body = requireBody(c, { kidId: '', minutes: 0, toDate: '' })
  if (!body.kidId) throw new BadRequestError('kidId required.')
  if (body.minutes <= 0) throw new BadRequestError('minutes must be positive.')
  const date = localDate(body.toDate)

  $app.dao().runInTransaction((txDao) => {
    const status = ensureDailyStatus(txDao, body.kidId, date)
    status.set('carryOverMinutes', status.getInt('carryOverMinutes') + body.minutes)
    txDao.saveRecord(status)
    writeLedger(txDao, {
      kidId: body.kidId,
      type: 'carryover_base_screen',
      amount: body.minutes,
      note: `Carried over ${body.minutes} min`,
      by: user.id,
    })
  })
  return c.json(200, { ok: true })
})

// POST /api/custom/set-kid-login
//   { kidId, username?, pin?, email?, password? }
// Sets or resets the auth login attached to a kid. Creates the user record if
// none exists yet; otherwise updates the existing one. Parents can bypass PB's
// "requires oldPassword" rule this way because the endpoint runs as admin.
routerAdd('POST', '/api/custom/set-kid-login', (c) => {
  const { requireParent, requireBody } = require(`${__hooks}/lib.js`)
  requireParent(c)
  const body = requireBody(c, {
    kidId: '',
    username: '',
    pin: '',
    email: '',
    password: '',
  })
  if (!body.kidId) throw new BadRequestError('kidId required.')
  const secret = body.pin || body.password
  if (!secret) throw new BadRequestError('pin or password required.')
  if (secret.length < 4) throw new BadRequestError('PIN/password must be at least 4 characters.')
  const wantsUsername = !!body.username
  const wantsEmail = !!body.email

  $app.dao().runInTransaction((txDao) => {
    const kid = txDao.findRecordById('kids', body.kidId)
    const usersCol = txDao.findCollectionByNameOrId('users')
    const existingUserId = kid.getString('userId')

    let authUser
    if (existingUserId) {
      authUser = txDao.findRecordById('users', existingUserId)
    } else {
      authUser = new Record(usersCol, {
        role: 'kid',
        displayName: kid.getString('displayName'),
        avatarEmoji: kid.getString('avatarEmoji'),
        emailVisibility: false,
      })
    }

    if (wantsUsername) {
      const cleaned = String(body.username).toLowerCase().replace(/[^a-z0-9_]/g, '_')
      authUser.set('username', cleaned)
    } else if (!existingUserId && !wantsEmail) {
      throw new BadRequestError('username or email required for a new login.')
    }
    if (wantsEmail) authUser.set('email', body.email)

    authUser.setPassword(secret)
    txDao.saveRecord(authUser)

    if (!existingUserId) {
      kid.set('userId', authUser.id)
      txDao.saveRecord(kid)
      authUser.set('kidId', kid.id)
      txDao.saveRecord(authUser)
    }
  })
  return c.json(200, { ok: true })
})

// POST /api/custom/delete-kid  { kidId }
// Wipes the kid plus every record that references them (completions, ledger,
// balance, base chores, daily statuses, and the linked auth user if any).
routerAdd('POST', '/api/custom/delete-kid', (c) => {
  const { requireParent, requireBody, findOrNull } = require(`${__hooks}/lib.js`)
  requireParent(c)
  const body = requireBody(c, { kidId: '' })
  if (!body.kidId) throw new BadRequestError('kidId required.')

  $app.dao().runInTransaction((txDao) => {
    const kid = txDao.findRecordById('kids', body.kidId)
    const authUserId = kid.getString('userId')

    // completions + ledger reference kids with cascadeDelete=false, so drop them manually.
    for (const r of txDao.findRecordsByFilter('completions', 'kidId = {:k}', '', 1000, 0, { k: body.kidId })) {
      txDao.deleteRecord(r)
    }
    for (const r of txDao.findRecordsByFilter('ledger', 'kidId = {:k}', '', 1000, 0, { k: body.kidId })) {
      txDao.deleteRecord(r)
    }
    // Balance is 1:1 with kid; delete explicitly to be safe.
    const bal = findOrNull(() =>
      txDao.findFirstRecordByFilter('balances', 'kidId = {:k}', { k: body.kidId }),
    )
    if (bal) txDao.deleteRecord(bal)

    // Kid removal cascades base_chores + daily_status (both cascadeDelete=true).
    txDao.deleteRecord(kid)

    if (authUserId) {
      const authUser = findOrNull(() => txDao.findRecordById('users', authUserId))
      if (authUser) txDao.deleteRecord(authUser)
    }
  })
  return c.json(200, { ok: true })
})

// POST /api/custom/create-kid
//   { displayName, avatarEmoji?, kidUsername?, kidPin?, kidUserEmail?, kidUserPassword? }
//
// Two ways to attach a login to the kid record:
//   - Young-kid style: kidUsername (any string, must be unique) + kidPin (>=4 chars).
//     No email required. Kid signs in with the username as identity.
//   - Older-kid/email style: kidUserEmail + kidUserPassword. Same as before.
// If neither pair is provided, the kid is created without a login and one can
// be added later.
routerAdd('POST', '/api/custom/create-kid', (c) => {
  const { requireParent, requireBody, ensureBalance } = require(`${__hooks}/lib.js`)
  requireParent(c)
  const body = requireBody(c, {
    displayName: '',
    avatarEmoji: '',
    kidUsername: '',
    kidPin: '',
    kidUserEmail: '',
    kidUserPassword: '',
  })
  if (!body.displayName) throw new BadRequestError('displayName required.')

  const wantsUsernameLogin = !!body.kidUsername && !!body.kidPin
  const wantsEmailLogin = !!body.kidUserEmail && !!body.kidUserPassword

  let kidId = ''
  $app.dao().runInTransaction((txDao) => {
    const kidsCol = txDao.findCollectionByNameOrId('kids')
    const kid = new Record(kidsCol, {
      displayName: body.displayName,
      avatarEmoji: body.avatarEmoji || '👦',
      active: true,
    })

    if (wantsUsernameLogin || wantsEmailLogin) {
      const usersCol = txDao.findCollectionByNameOrId('users')

      const username = wantsUsernameLogin
        ? String(body.kidUsername).toLowerCase().replace(/[^a-z0-9_]/g, '_')
        : String(body.kidUserEmail).split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_')
                + '_' + $security.randomString(6).toLowerCase()

      const authFields = {
        username,
        emailVisibility: false,
        role: 'kid',
        displayName: body.displayName,
        avatarEmoji: body.avatarEmoji || '👦',
      }
      if (wantsEmailLogin) authFields.email = body.kidUserEmail

      const authUser = new Record(usersCol, authFields)
      authUser.setPassword(wantsUsernameLogin ? body.kidPin : body.kidUserPassword)
      txDao.saveRecord(authUser)
      kid.set('userId', authUser.id)
      txDao.saveRecord(kid)
      authUser.set('kidId', kid.id)
      txDao.saveRecord(authUser)
    } else {
      txDao.saveRecord(kid)
    }
    ensureBalance(txDao, kid.id)
    kidId = kid.id
  })
  return c.json(200, { ok: true, kidId })
})

/// <reference path="../pb_data/types.d.ts" />

/**
 * Shared helpers for pb_hooks/main.pb.js.
 * Each route callback runs in its own goja Runtime — main.pb.js file-scope
 * doesn't leak across runtimes, so callbacks require() this file to get
 * access to these helpers.
 */

const BASE_REWARD_MINUTES = 60
const COIN_TO_SCREEN_MINUTES = 5
const COIN_TO_CENTS = 25

const SETTINGS_KEY = 'instance'

function requireParent(c) {
  const info = $apis.requestInfo(c)
  const user = info.authRecord
  if (!user) throw new ForbiddenError('Sign in first.')
  if (user.getString('role') !== 'parent') throw new ForbiddenError('Parents only.')
  return user
}

function requireAuthedForKid(c, kidId) {
  const info = $apis.requestInfo(c)
  const user = info.authRecord
  if (!user) throw new ForbiddenError('Sign in first.')
  const role = user.getString('role')
  if (role === 'parent') return user
  // Dashboard tablet acts on behalf of any kid at the shared kiosk.
  if (role === 'dashboard') return user
  if (role === 'kid' && user.getString('kidId') === kidId) return user
  throw new ForbiddenError('You can only act on your own account.')
}

/** Fire-and-forget POST to an ntfy topic. Uses NTFY_URL + NTFY_TOPIC env vars.
 *  Silently no-ops when NTFY_TOPIC is unset so the app works fine without it. */
function sendNtfy(title, message, opts) {
  const topic = ($os.getenv('NTFY_TOPIC') || '').trim()
  if (!topic) return
  const baseUrl = ($os.getenv('NTFY_URL') || 'https://ntfy.sh').replace(/\/+$/, '')
  const authToken = ($os.getenv('NTFY_TOKEN') || '').trim()
  const headers = { Title: String(title || 'Chore Coin') }
  if (opts && opts.priority) headers.Priority = String(opts.priority)
  if (opts && opts.tags) headers.Tags = String(opts.tags)
  if (opts && opts.clickUrl) headers.Click = String(opts.clickUrl)
  if (authToken) headers.Authorization = `Bearer ${authToken}`
  try {
    $http.send({
      url: `${baseUrl}/${topic}`,
      method: 'POST',
      body: String(message || ''),
      headers,
      timeout: 5,
    })
  } catch (e) {
    // Don't let a notification failure break the request. Log for visibility.
    $app.logger().warn('ntfy send failed', 'error', String(e))
  }
}

function requireBody(c, schema) {
  const model = new DynamicModel(schema)
  c.bind(model)
  return model
}

function localDate(dateOverride) {
  if (dateOverride) return dateOverride
  // Server time is UTC. Clients pass an explicit `date` when it matters.
  return new Date().toISOString().slice(0, 10)
}

function findOrNull(fn) {
  try {
    return fn()
  } catch (_e) {
    return null
  }
}

function ensureDailyStatus(txDao, kidId, date) {
  const existing = findOrNull(() =>
    txDao.findFirstRecordByFilter('daily_status', 'kidId = {:k} && date = {:d}', {
      k: kidId,
      d: date,
    }),
  )
  if (existing) return existing
  const col = txDao.findCollectionByNameOrId('daily_status')
  const rec = new Record(col, {
    kidId,
    date,
    approvedBaseChores: {},
    baseAwarded: false,
    baseScreenTimeGrantedMinutes: 0,
    baseScreenTimeUsedMinutes: 0,
    carryOverMinutes: 0,
  })
  txDao.saveRecord(rec)
  return rec
}

function ensureBalance(txDao, kidId) {
  const existing = findOrNull(() =>
    txDao.findFirstRecordByFilter('balances', 'kidId = {:k}', { k: kidId }),
  )
  if (existing) return existing
  const col = txDao.findCollectionByNameOrId('balances')
  const rec = new Record(col, { kidId, coinBalance: 0 })
  txDao.saveRecord(rec)
  return rec
}

// Lazy-creates + returns the singleton row in the `settings` collection.
// The row is identified by key='instance' and holds licenseKey +
// licenseActivatedAt + installId. First call ever on a new install writes
// a random installId; subsequent calls read whatever's there.
function ensureSettingsRow(txDao) {
  const existing = findOrNull(() =>
    txDao.findFirstRecordByFilter('settings', 'key = {:k}', { k: SETTINGS_KEY }),
  )
  if (existing) return existing
  const col = txDao.findCollectionByNameOrId('settings')
  const rec = new Record(col, {
    key: SETTINGS_KEY,
    licenseKey: '',
    installId: $security.randomString(24).toLowerCase(),
  })
  txDao.saveRecord(rec)
  return rec
}

function writeLedger(txDao, entry) {
  const col = txDao.findCollectionByNameOrId('ledger')
  const rec = new Record(col, {
    kidId: entry.kidId,
    type: entry.type,
    amount: entry.amount,
    note: entry.note || '',
    refId: entry.refId || '',
    by: entry.by || '',
  })
  txDao.saveRecord(rec)
}

/**
 * Fire a Web Push notification to a list of subscription records. Silently
 * no-ops when WEBPUSH_URL is unset or the list is empty. Prunes subscriptions
 * the browser has expired (404/410 responses).
 */
function _sendWebPushToSubs(subs, title, message, opts) {
  const url = ($os.getenv('WEBPUSH_URL') || '').trim()
  if (!url || !subs || subs.length === 0) return
  const secret = ($os.getenv('WEBPUSH_SHARED_SECRET') || '').trim()

  const subscriptions = subs.map((s) => ({
    endpoint: s.getString('endpoint'),
    keys: { p256dh: s.getString('p256dh'), auth: s.getString('auth') },
  }))

  const headers = { 'Content-Type': 'application/json' }
  if (secret) headers['x-webpush-secret'] = secret

  const sendUrl = `${url.replace(/\/+$/, '')}/send`
  $app.logger().info('[webpush] sending', 'url', sendUrl, 'subs', subs.length)
  let resp
  try {
    resp = $http.send({
      url: sendUrl,
      method: 'POST',
      body: JSON.stringify({
        subscriptions,
        title: String(title || 'Chore Coin'),
        message: String(message || ''),
        url: (opts && opts.clickUrl) || '',
        tag: (opts && opts.tag) || '',
      }),
      headers,
      timeout: 5,
    })
    $app.logger().info('[webpush] response', 'status', resp.statusCode, 'body', resp.raw)
  } catch (e) {
    $app.logger().error('[webpush] send failed', 'error', String(e))
    return
  }

  // Prune subscriptions the browser has expired.
  try {
    const parsed = JSON.parse(resp.raw || '{}')
    const results = Array.isArray(parsed.results) ? parsed.results : []
    for (let i = 0; i < results.length; i++) {
      if (results[i] && results[i].gone) {
        try {
          $app.dao().deleteRecord(subs[i])
        } catch (_e) {}
      }
    }
  } catch (_e) {}
}

/** Notify every parent about something. */
function sendWebPushToAllParents(title, message, opts) {
  const subs = $app.dao().findRecordsByFilter(
    'push_subscriptions',
    'userId.role = "parent"',
    '',
    100,
    0,
  )
  _sendWebPushToSubs(subs, title, message, opts)
}

/** Notify a specific kid (by kid id → their linked auth user's subscriptions). */
function sendWebPushToKid(kidId, title, message, opts) {
  if (!kidId) return
  const kid = findOrNull(() => $app.dao().findRecordById('kids', kidId))
  if (!kid) return
  const userId = kid.getString('userId')
  if (!userId) return
  const subs = $app.dao().findRecordsByFilter(
    'push_subscriptions',
    'userId = {:u}',
    '',
    50,
    0,
    { u: userId },
  )
  _sendWebPushToSubs(subs, title, message, opts)
}

module.exports = {
  BASE_REWARD_MINUTES,
  COIN_TO_SCREEN_MINUTES,
  COIN_TO_CENTS,
  SETTINGS_KEY,
  requireParent,
  requireAuthedForKid,
  requireBody,
  localDate,
  findOrNull,
  ensureDailyStatus,
  ensureBalance,
  ensureSettingsRow,
  writeLedger,
  sendNtfy,
  sendWebPushToAllParents,
  sendWebPushToKid,
}

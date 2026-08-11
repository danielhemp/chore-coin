/// <reference path="../pb_data/types.d.ts" />

/**
 * Add a "dashboard" role for the wall tablet.
 *
 * A dashboard user can:
 *   - read all kids' data (chores, balances, screen time, ledger)
 *   - create pending completions for any kid (as if a kid tapped "I did it!")
 *   - spend base screen time for any kid (via /api/custom/spend-base)
 *
 * A dashboard user canNOT:
 *   - approve or reject completions
 *   - adjust coins or screen time
 *   - redeem coins for cash/screen
 *   - create, edit, or delete kids
 *   - create, edit, or delete chore templates
 *
 * The role is enforced by rule expressions on each collection plus authorization
 * checks in the custom /api/custom/* endpoints (parents-only checks stay, but
 * `requireAuthedForKid` now also accepts the dashboard role).
 */
migrate((db) => {
  const dao = new Dao(db)

  // 1) Widen the users.role select field to include "dashboard".
  const users = dao.findCollectionByNameOrId('users')
  const roleField = users.schema.getFieldByName('role')
  if (roleField) {
    // Mutate .values in place; wholesale-replacing options makes PB fail to
    // serialize because it includes bound Go func values behind the scenes.
    const values = roleField.options.values || []
    if (values.indexOf('dashboard') === -1) values.push('dashboard')
    roleField.options.values = values
    dao.saveCollection(users)
  }

  // 2) Broaden read-side rules so a dashboard user can see everything a parent
  //    would need to render the family kiosk.
  const isParentOrDashboard = '(@request.auth.role = "parent" || @request.auth.role = "dashboard")'
  const isSelfKid = 'kidId.userId = @request.auth.id'

  const setBroaderReads = (name, ownedByKidId = true) => {
    const col = dao.findCollectionByNameOrId(name)
    if (ownedByKidId) {
      col.listRule = `${isParentOrDashboard} || ${isSelfKid}`
      col.viewRule = `${isParentOrDashboard} || ${isSelfKid}`
    } else {
      col.listRule = '@request.auth.id != ""'
      col.viewRule = '@request.auth.id != ""'
    }
    dao.saveCollection(col)
  }
  // Family-visible templates: everyone signed in can already see; leave them.
  // Per-kid data: parent + dashboard can see all; kid sees own.
  setBroaderReads('completions', true)
  setBroaderReads('daily_status', true)
  setBroaderReads('balances', true)
  setBroaderReads('ledger', true)

  // 3) Let dashboard users create pending completions for any kid.
  const completions = dao.findCollectionByNameOrId('completions')
  completions.createRule =
    '@request.auth.role = "parent"' +
    ' || @request.auth.role = "dashboard"' +
    ' || (@request.auth.role = "kid" && kidId.userId = @request.auth.id && status = "pending")'
  dao.saveCollection(completions)
}, (db) => {
  const dao = new Dao(db)
  const users = dao.findCollectionByNameOrId('users')
  const roleField = users.schema.getFieldByName('role')
  if (roleField) {
    roleField.options.values = (roleField.options.values || []).filter(
      (v) => v !== 'dashboard',
    )
    dao.saveCollection(users)
  }
})

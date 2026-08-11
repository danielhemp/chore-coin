/// <reference path="../pb_data/types.d.ts" />

/**
 * Chore Coin — initial schema.
 *
 * Collections created:
 *   - users (built-in auth) is extended with role, displayName, kidId, avatarEmoji
 *   - kids, base_chores, bonus_chores, completions, daily_status, balances, ledger
 *
 * Rules summary:
 *   Parents can read/write everything.
 *   Kids can read family-visible collections (chore templates, active state) and their
 *   own personal records; can create a *pending* completion for themselves; cannot
 *   modify balances/ledger/daily_status/etc. directly — those go through pb_hooks.
 */
migrate((db) => {
  const dao = new Dao(db)

  // ----- Extend users -----
  const users = dao.findCollectionByNameOrId('users')

  users.schema.addField(new SchemaField({
    name: 'role',
    type: 'select',
    required: true,
    // 'dashboard' role is for the family wall tablet: read-all + create-pending
    // completions + spend-own-base-time. Cannot approve, adjust, or manage.
    options: { maxSelect: 1, values: ['parent', 'kid', 'dashboard'] },
  }))
  users.schema.addField(new SchemaField({
    name: 'displayName',
    type: 'text',
    required: true,
    options: { min: 1, max: 40 },
  }))
  users.schema.addField(new SchemaField({
    name: 'kidId',
    type: 'text',
    required: false,
  }))
  users.schema.addField(new SchemaField({
    name: 'avatarEmoji',
    type: 'text',
    required: false,
    options: { max: 8 },
  }))

  // Parents can list/view all users; kids only themselves.
  users.listRule = '@request.auth.id != "" && (@request.auth.role = "parent" || id = @request.auth.id)'
  users.viewRule = '@request.auth.id != "" && (@request.auth.role = "parent" || id = @request.auth.id)'
  // Only parents create/update/delete auth records (they add kid logins).
  users.createRule = '@request.auth.id != "" && @request.auth.role = "parent"'
  users.updateRule = '@request.auth.id != "" && @request.auth.role = "parent"'
  users.deleteRule = '@request.auth.id != "" && @request.auth.role = "parent"'
  // Kids often can't have their own email; allow username-only accounts and
  // short PINs. See 1700000001_relax_users.js for the same settings applied
  // as a follow-up migration for installs that predated this change.
  users.options.allowEmailAuth = true
  users.options.allowUsernameAuth = true
  users.options.requireEmail = false
  users.options.minPasswordLength = 4
  dao.saveCollection(users)

  // ----- kids -----
  const kids = new Collection({
    name: 'kids',
    type: 'base',
    schema: [
      { name: 'displayName', type: 'text', required: true, options: { min: 1, max: 40 } },
      { name: 'avatarEmoji', type: 'text', required: false, options: { max: 8 } },
      { name: 'userId', type: 'relation', required: false, options: { collectionId: '_pb_users_auth_', maxSelect: 1, cascadeDelete: false } },
      { name: 'active', type: 'bool', required: false },
    ],
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '@request.auth.role = "parent"',
    updateRule: '@request.auth.role = "parent"',
    deleteRule: '@request.auth.role = "parent"',
  })
  dao.saveCollection(kids)

  // ----- base_chores -----
  const baseChores = new Collection({
    name: 'base_chores',
    type: 'base',
    schema: [
      { name: 'kidId', type: 'relation', required: true, options: { collectionId: kids.id, maxSelect: 1, cascadeDelete: true } },
      { name: 'title', type: 'text', required: true, options: { min: 1, max: 120 } },
      { name: 'order', type: 'number', required: false, options: { noDecimal: true } },
      { name: 'active', type: 'bool', required: false },
    ],
    indexes: ['CREATE INDEX idx_base_chores_kid ON base_chores (kidId, `order`)'],
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '@request.auth.role = "parent"',
    updateRule: '@request.auth.role = "parent"',
    deleteRule: '@request.auth.role = "parent"',
  })
  dao.saveCollection(baseChores)

  // ----- bonus_chores -----
  const bonusChores = new Collection({
    name: 'bonus_chores',
    type: 'base',
    schema: [
      { name: 'title', type: 'text', required: true, options: { min: 1, max: 120 } },
      { name: 'coinValue', type: 'number', required: true, options: { min: 1, noDecimal: true } },
      // JSON: either an array of kid ids, or the string "all"
      { name: 'assignedTo', type: 'json', required: false, options: { maxSize: 4000 } },
      { name: 'recurring', type: 'select', required: true, options: { maxSelect: 1, values: ['once', 'daily', 'anytime'] } },
      // Optional hard cap on approvals per kid per local day. 0 = no cap.
      { name: 'maxPerDay', type: 'number', required: false, options: { min: 0, noDecimal: true } },
      { name: 'active', type: 'bool', required: false },
    ],
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '@request.auth.role = "parent"',
    updateRule: '@request.auth.role = "parent"',
    deleteRule: '@request.auth.role = "parent"',
  })
  dao.saveCollection(bonusChores)

  // ----- completions -----
  const completions = new Collection({
    name: 'completions',
    type: 'base',
    schema: [
      { name: 'kidId', type: 'relation', required: true, options: { collectionId: kids.id, maxSelect: 1, cascadeDelete: false } },
      { name: 'choreType', type: 'select', required: true, options: { maxSelect: 1, values: ['base', 'bonus'] } },
      { name: 'choreId', type: 'text', required: true, options: { min: 1, max: 40 } },
      { name: 'choreTitle', type: 'text', required: true, options: { min: 1, max: 200 } },
      { name: 'coinValue', type: 'number', required: false, options: { min: 0, noDecimal: true } },
      { name: 'forDate', type: 'text', required: false, options: { max: 12 } },
      { name: 'status', type: 'select', required: true, options: { maxSelect: 1, values: ['pending', 'approved', 'rejected'] } },
      { name: 'approvedBy', type: 'relation', required: false, options: { collectionId: '_pb_users_auth_', maxSelect: 1, cascadeDelete: false } },
      { name: 'approvedAt', type: 'date' },
      { name: 'rejectionNote', type: 'text', required: false, options: { max: 500 } },
    ],
    indexes: [
      'CREATE INDEX idx_completions_status ON completions (status, created)',
      'CREATE INDEX idx_completions_kid_status ON completions (kidId, status)',
    ],
    // Parents see everything; kids see their own.
    listRule:
      '(@request.auth.role = "parent" || @request.auth.role = "dashboard") || kidId.userId = @request.auth.id',
    viewRule:
      '(@request.auth.role = "parent" || @request.auth.role = "dashboard") || kidId.userId = @request.auth.id',
    // Parents create anything; kids create pending for themselves only.
    // Dashboard users (wall tablet) create pending for any kid.
    createRule:
      '@request.auth.role = "parent"' +
      ' || @request.auth.role = "dashboard"' +
      ' || (@request.auth.role = "kid" && kidId.userId = @request.auth.id && status = "pending")',
    // Only parents can mutate/delete (server hooks bypass rules).
    updateRule: '@request.auth.role = "parent"',
    deleteRule: '@request.auth.role = "parent"',
  })
  dao.saveCollection(completions)

  // ----- daily_status -----
  const dailyStatus = new Collection({
    name: 'daily_status',
    type: 'base',
    schema: [
      { name: 'kidId', type: 'relation', required: true, options: { collectionId: kids.id, maxSelect: 1, cascadeDelete: true } },
      { name: 'date', type: 'text', required: true, options: { min: 10, max: 10 } },
      { name: 'approvedBaseChores', type: 'json', required: false, options: { maxSize: 20000 } },
      { name: 'baseAwarded', type: 'bool', required: false },
      { name: 'baseScreenTimeGrantedMinutes', type: 'number', required: false, options: { noDecimal: true } },
      { name: 'baseScreenTimeUsedMinutes', type: 'number', required: false, options: { noDecimal: true } },
      { name: 'carryOverMinutes', type: 'number', required: false, options: { noDecimal: true } },
    ],
    indexes: [
      'CREATE UNIQUE INDEX idx_daily_status_kid_date ON daily_status (kidId, date)',
    ],
    listRule:
      '(@request.auth.role = "parent" || @request.auth.role = "dashboard") || kidId.userId = @request.auth.id',
    viewRule:
      '(@request.auth.role = "parent" || @request.auth.role = "dashboard") || kidId.userId = @request.auth.id',
    // Kids never write these directly — only server hooks do.
    createRule: null,
    updateRule: null,
    deleteRule: null,
  })
  dao.saveCollection(dailyStatus)

  // ----- balances -----
  const balances = new Collection({
    name: 'balances',
    type: 'base',
    schema: [
      { name: 'kidId', type: 'relation', required: true, options: { collectionId: kids.id, maxSelect: 1, cascadeDelete: true } },
      { name: 'coinBalance', type: 'number', required: false, options: { min: 0, noDecimal: true } },
    ],
    indexes: [
      'CREATE UNIQUE INDEX idx_balances_kid ON balances (kidId)',
    ],
    listRule:
      '(@request.auth.role = "parent" || @request.auth.role = "dashboard") || kidId.userId = @request.auth.id',
    viewRule:
      '(@request.auth.role = "parent" || @request.auth.role = "dashboard") || kidId.userId = @request.auth.id',
    createRule: null,
    updateRule: null,
    deleteRule: null,
  })
  dao.saveCollection(balances)

  // ----- ledger -----
  const ledger = new Collection({
    name: 'ledger',
    type: 'base',
    schema: [
      { name: 'kidId', type: 'relation', required: true, options: { collectionId: kids.id, maxSelect: 1, cascadeDelete: false } },
      { name: 'type', type: 'select', required: true, options: {
        maxSelect: 1,
        values: [
          'earn_coin',
          'spend_coin_screen',
          'spend_coin_cash',
          'grant_base_screen',
          'spend_base_screen',
          'adjust_coin',
          'adjust_base_screen',
          'carryover_base_screen',
        ],
      }},
      { name: 'amount', type: 'number', required: true },
      { name: 'note', type: 'text', required: false, options: { max: 500 } },
      { name: 'refId', type: 'text', required: false, options: { max: 40 } },
      { name: 'by', type: 'relation', required: false, options: { collectionId: '_pb_users_auth_', maxSelect: 1, cascadeDelete: false } },
    ],
    indexes: [
      'CREATE INDEX idx_ledger_kid_created ON ledger (kidId, created)',
    ],
    listRule:
      '(@request.auth.role = "parent" || @request.auth.role = "dashboard") || kidId.userId = @request.auth.id',
    viewRule:
      '(@request.auth.role = "parent" || @request.auth.role = "dashboard") || kidId.userId = @request.auth.id',
    // Immutable from the client; hooks write server-side.
    createRule: null,
    updateRule: null,
    deleteRule: null,
  })
  dao.saveCollection(ledger)
}, (db) => {
  // Rollback: drop new collections and revert users.
  const dao = new Dao(db)
  for (const name of ['ledger', 'balances', 'daily_status', 'completions', 'bonus_chores', 'base_chores', 'kids']) {
    try {
      dao.deleteCollection(dao.findCollectionByNameOrId(name))
    } catch (_e) {}
  }
  try {
    const users = dao.findCollectionByNameOrId('users')
    for (const f of ['role', 'displayName', 'kidId', 'avatarEmoji']) {
      const field = users.schema.getFieldByName(f)
      if (field) users.schema.removeField(field.id)
    }
    users.listRule = users.viewRule = 'id = @request.auth.id'
    users.createRule = ''
    users.updateRule = users.deleteRule = 'id = @request.auth.id'
    dao.saveCollection(users)
  } catch (_e) {}
})

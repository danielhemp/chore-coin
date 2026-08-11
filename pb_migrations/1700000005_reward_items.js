/// <reference path="../pb_data/types.d.ts" />

/**
 * Parent-defined "reward items" (e.g. Movie night, 10 coins) that kids can
 * request to redeem. Requests need parent approval — coins are only deducted
 * when the parent approves, so kids can't drain their balance by mistake and
 * denial doesn't require a refund entry.
 *
 * Adds two collections + one ledger type:
 *   - reward_items      — the catalog parents manage
 *   - reward_requests   — one row per kid request (pending → approved/denied)
 *   - ledger.type       — extended with "spend_coin_reward"
 */
migrate(
  (db) => {
    const dao = new Dao(db)
    const kids = dao.findCollectionByNameOrId('kids')

    // ----- reward_items -----
    const rewardItems = new Collection({
      name: 'reward_items',
      type: 'base',
      schema: [
        { name: 'title', type: 'text', required: true, options: { min: 1, max: 120 } },
        { name: 'description', type: 'text', required: false, options: { max: 500 } },
        { name: 'emoji', type: 'text', required: false, options: { max: 8 } },
        { name: 'coinCost', type: 'number', required: true, options: { min: 1, noDecimal: true } },
        { name: 'active', type: 'bool', required: false },
      ],
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: '@request.auth.role = "parent"',
      updateRule: '@request.auth.role = "parent"',
      deleteRule: '@request.auth.role = "parent"',
    })
    dao.saveCollection(rewardItems)

    // ----- reward_requests -----
    const rewardRequests = new Collection({
      name: 'reward_requests',
      type: 'base',
      schema: [
        {
          name: 'kidId',
          type: 'relation',
          required: true,
          options: { collectionId: kids.id, maxSelect: 1, cascadeDelete: false },
        },
        // Snapshot of the reward at request time so history stays intact even
        // if the reward is later edited or deleted. Server re-derives coinCost
        // from reward_items at approval time to prevent tampering.
        { name: 'rewardId', type: 'text', required: true, options: { min: 1, max: 40 } },
        { name: 'rewardTitle', type: 'text', required: true, options: { min: 1, max: 200 } },
        { name: 'rewardEmoji', type: 'text', required: false, options: { max: 8 } },
        { name: 'coinCost', type: 'number', required: true, options: { min: 1, noDecimal: true } },
        {
          name: 'status',
          type: 'select',
          required: true,
          options: { maxSelect: 1, values: ['pending', 'approved', 'denied', 'cancelled'] },
        },
        {
          name: 'approvedBy',
          type: 'relation',
          required: false,
          options: { collectionId: '_pb_users_auth_', maxSelect: 1, cascadeDelete: false },
        },
        { name: 'approvedAt', type: 'date' },
        { name: 'denialNote', type: 'text', required: false, options: { max: 500 } },
      ],
      indexes: [
        'CREATE INDEX idx_reward_requests_status ON reward_requests (status, created)',
        'CREATE INDEX idx_reward_requests_kid_status ON reward_requests (kidId, status)',
      ],
      listRule:
        '(@request.auth.role = "parent" || @request.auth.role = "dashboard") || kidId.userId = @request.auth.id',
      viewRule:
        '(@request.auth.role = "parent" || @request.auth.role = "dashboard") || kidId.userId = @request.auth.id',
      // Kids create pending for themselves; parents can create anything.
      // Server hook is the recommended path (validates balance + snapshots).
      createRule:
        '@request.auth.role = "parent"' +
        ' || (@request.auth.role = "kid" && kidId.userId = @request.auth.id && status = "pending")',
      // Only parents mutate/delete from the client; hooks bypass rules.
      updateRule: '@request.auth.role = "parent"',
      deleteRule: '@request.auth.role = "parent"',
    })
    dao.saveCollection(rewardRequests)

    // ----- Extend ledger.type enum with spend_coin_reward -----
    const ledger = dao.findCollectionByNameOrId('ledger')
    const typeField = ledger.schema.getFieldByName('type')
    if (typeField) {
      const values = typeField.options.values || []
      if (values.indexOf('spend_coin_reward') === -1) values.push('spend_coin_reward')
      typeField.options.values = values
      dao.saveCollection(ledger)
    }
  },
  (db) => {
    const dao = new Dao(db)
    for (const name of ['reward_requests', 'reward_items']) {
      try {
        dao.deleteCollection(dao.findCollectionByNameOrId(name))
      } catch (_e) {}
    }
    try {
      const ledger = dao.findCollectionByNameOrId('ledger')
      const typeField = ledger.schema.getFieldByName('type')
      if (typeField) {
        typeField.options.values = (typeField.options.values || []).filter(
          (v) => v !== 'spend_coin_reward',
        )
        dao.saveCollection(ledger)
      }
    } catch (_e) {}
  },
)

/// <reference path="../pb_data/types.d.ts" />

/**
 * Savings goals — kids (or the whole family) put coins toward a target,
 * parent approves the "cash-out" when the target is reached.
 *
 * Two goal shapes:
 *   - Individual goal — one kid owner. Only that kid can contribute; only
 *     that kid benefits when the goal completes (e.g. Alex's swimming
 *     pool membership).
 *   - Family goal — no owner. Any kid can contribute from their own coin
 *     balance; the whole family benefits (e.g. Disney trip 2026).
 *
 * Match rate: parent picks a multiplier per goal (0 = no match, 0.5 =
 * parent adds 50% of every kid contribution, 2 = parent doubles-plus
 * every kid contribution). Match is virtual — no parent balance is
 * debited; it's an encouragement mechanic so kids see progress faster.
 * Progress toward target = (sum of contributions) + (sum of contributions
 * × matchRate) = sum × (1 + matchRate).
 *
 * Contribution flow:
 *   1. Kid taps "Contribute 5 coins" → 5 coins leave their balance and
 *      land in the goal's contribution ledger. If the goal has
 *      approvalRequired=true, the contribution starts pending and coins
 *      only leave the balance when the parent approves it.
 *   2. When (total kid contribs) × (1 + matchRate) >= coinTarget, the
 *      goal auto-flips to status='reached' and shows up in the parent
 *      approvals inbox as "🎯 <goal> — approve to complete".
 *   3. Parent taps Approve → goal → status='completed', frozen. Parent
 *      goes real-world buy the thing.
 *   4. If parent cancels a goal (any status), all approved contributions
 *      auto-refund to the kids who contributed them, proportionally.
 *
 * New ledger types:
 *   contribute_coin_goal  — negative amount, kid → goal
 *   refund_coin_goal      — positive amount, goal → kid (cancelled goal)
 *   complete_coin_goal    — informational, zero amount, goal marks final
 */
migrate(
  (db) => {
    const dao = new Dao(db)
    const kids = dao.findCollectionByNameOrId('kids')

    // ----- goals -----
    const goals = new Collection({
      name: 'goals',
      type: 'base',
      schema: [
        { name: 'title', type: 'text', required: true, options: { min: 1, max: 120 } },
        { name: 'description', type: 'text', required: false, options: { max: 1000 } },
        { name: 'emoji', type: 'text', required: false, options: { max: 8 } },
        // 'travel' | 'membership' | 'experience' | 'toy' | 'charity' |
        // 'individual' | 'family' | 'other' — free text (validated in the
        // frontend picklist, not the schema, so parents can add new
        // categories later without a migration).
        { name: 'category', type: 'text', required: false, options: { max: 40 } },
        // Null = family goal. Any kid can contribute.
        // Set = individual goal. Only that kid contributes; only that kid benefits.
        {
          name: 'ownerKidId',
          type: 'relation',
          required: false,
          options: { collectionId: kids.id, maxSelect: 1, cascadeDelete: false },
        },
        { name: 'coinTarget', type: 'number', required: true, options: { min: 1, noDecimal: true } },
        // Store as text so we can accept fractional values like 0.5.
        // The number type in PB is fine for floats but text keeps the JS
        // side unambiguous when parsing edited values.
        { name: 'matchRate', type: 'number', required: false, options: { min: 0 } },
        // 'owner_only' | 'family' | 'private'
        // owner_only: owner kid + parents (individual goals default)
        // family:     everyone in the family (family goals default)
        // private:    parents only (rare)
        {
          name: 'visibility',
          type: 'select',
          required: true,
          options: { maxSelect: 1, values: ['owner_only', 'family', 'private'] },
        },
        // When true, each contribution starts as 'pending' and coins
        // don't leave the balance until a parent approves it. Useful for
        // young kids where you want to review "sam wants to spend 50
        // coins on Disney trip".
        { name: 'approvalRequired', type: 'bool', required: false },
        {
          name: 'status',
          type: 'select',
          required: true,
          // active:    accepting contributions
          // reached:   target hit, awaiting parent completion approval
          // completed: parent approved; frozen; the thing was bought
          // cancelled: parent cancelled; all approved contribs refunded
          options: { maxSelect: 1, values: ['active', 'reached', 'completed', 'cancelled'] },
        },
        {
          name: 'createdBy',
          type: 'relation',
          required: false,
          options: { collectionId: '_pb_users_auth_', maxSelect: 1, cascadeDelete: false },
        },
        { name: 'completedAt', type: 'date' },
        {
          name: 'completedBy',
          type: 'relation',
          required: false,
          options: { collectionId: '_pb_users_auth_', maxSelect: 1, cascadeDelete: false },
        },
        { name: 'cancelledAt', type: 'date' },
      ],
      indexes: [
        'CREATE INDEX idx_goals_status ON goals (status, created)',
        'CREATE INDEX idx_goals_owner ON goals (ownerKidId, status)',
      ],
      // Client-side visibility filtering is applied to the results the
      // frontend hooks fetch. At the schema level any authed user can
      // read + list; the frontend restricts by visibility + role.
      listRule:
        '(@request.auth.role = "parent" || @request.auth.role = "dashboard") || visibility = "family" || (visibility = "owner_only" && ownerKidId.userId = @request.auth.id)',
      viewRule:
        '(@request.auth.role = "parent" || @request.auth.role = "dashboard") || visibility = "family" || (visibility = "owner_only" && ownerKidId.userId = @request.auth.id)',
      // Only parents create/mutate goals; server hooks are the recommended path.
      createRule: '@request.auth.role = "parent"',
      updateRule: '@request.auth.role = "parent"',
      deleteRule: '@request.auth.role = "parent"',
    })
    dao.saveCollection(goals)

    // ----- goal_contributions -----
    const goalContribs = new Collection({
      name: 'goal_contributions',
      type: 'base',
      schema: [
        {
          name: 'goalId',
          type: 'relation',
          required: true,
          options: { collectionId: goals.id, maxSelect: 1, cascadeDelete: true },
        },
        {
          name: 'kidId',
          type: 'relation',
          required: true,
          options: { collectionId: kids.id, maxSelect: 1, cascadeDelete: false },
        },
        // Coins the kid actually contributed (positive).
        { name: 'coinAmount', type: 'number', required: true, options: { min: 1, noDecimal: true } },
        // Match applied at contribution time — snapshot so historical
        // contributions stay stable even if the goal's matchRate is later
        // edited by the parent.
        { name: 'matchAmount', type: 'number', required: false, options: { min: 0 } },
        {
          name: 'status',
          type: 'select',
          required: true,
          // approved: coins left the balance and count toward the goal
          // pending:  parent hasn't approved yet; coins still on the kid's balance
          // denied:   parent denied; coins untouched
          // refunded: goal was cancelled after this contribution was approved; coins returned
          options: { maxSelect: 1, values: ['approved', 'pending', 'denied', 'refunded'] },
        },
        {
          name: 'approvedBy',
          type: 'relation',
          required: false,
          options: { collectionId: '_pb_users_auth_', maxSelect: 1, cascadeDelete: false },
        },
        { name: 'approvedAt', type: 'date' },
      ],
      indexes: [
        'CREATE INDEX idx_goal_contribs_goal ON goal_contributions (goalId, status)',
        'CREATE INDEX idx_goal_contribs_kid ON goal_contributions (kidId, status)',
      ],
      // Parents / dashboard see everything; kids see their own contributions
      // and contributions to family-visibility goals (progress bar aggregation).
      listRule:
        '(@request.auth.role = "parent" || @request.auth.role = "dashboard") || kidId.userId = @request.auth.id || goalId.visibility = "family"',
      viewRule:
        '(@request.auth.role = "parent" || @request.auth.role = "dashboard") || kidId.userId = @request.auth.id || goalId.visibility = "family"',
      // Server hooks are the only path to create/mutate/delete these —
      // they handle the balance debit + ledger write atomically.
      createRule: null,
      updateRule: null,
      deleteRule: null,
    })
    dao.saveCollection(goalContribs)

    // ----- Extend ledger.type enum with the new goal-related types -----
    const ledger = dao.findCollectionByNameOrId('ledger')
    const typeField = ledger.schema.getFieldByName('type')
    if (typeField) {
      const values = typeField.options.values || []
      for (const t of ['contribute_coin_goal', 'refund_coin_goal', 'complete_coin_goal']) {
        if (values.indexOf(t) === -1) values.push(t)
      }
      typeField.options.values = values
      dao.saveCollection(ledger)
    }
  },
  (db) => {
    const dao = new Dao(db)
    for (const name of ['goal_contributions', 'goals']) {
      try {
        dao.deleteCollection(dao.findCollectionByNameOrId(name))
      } catch (_e) {}
    }
    try {
      const ledger = dao.findCollectionByNameOrId('ledger')
      const typeField = ledger.schema.getFieldByName('type')
      if (typeField) {
        typeField.options.values = (typeField.options.values || []).filter(
          (v) =>
            v !== 'contribute_coin_goal' &&
            v !== 'refund_coin_goal' &&
            v !== 'complete_coin_goal',
        )
        dao.saveCollection(ledger)
      }
    } catch (_e) {}
  },
)

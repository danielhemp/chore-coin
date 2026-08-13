/// <reference path="../pb_data/types.d.ts" />

/**
 * Extend reward_requests to support "screen time" as a kid-requestable
 * redemption alongside item rewards.
 *
 * Schema changes:
 *   - New `kind` select field: 'item' | 'screen_time' (nullable — legacy
 *     rows are treated as 'item' in code, no backfill needed).
 *   - New `screenTimeMinutes` number field (nullable — only populated on
 *     approval of a screen_time request; server derives from coinCost).
 *   - `rewardId` relaxed from required to optional. Screen-time requests
 *     don't reference a row in reward_items — the reward is inherent
 *     ("N minutes of screen time"), not a catalog entry.
 *
 * The parent approvals inbox and history views handle both kinds through
 * the same reward_requests row shape; the /api/custom/approve-reward hook
 * branches on kind at approval time.
 *
 * No new ledger types needed — screen-time approvals write:
 *   spend_coin_screen  (the coin debit)
 *   adjust_base_screen (the minute credit)
 * both of which already exist.
 */
migrate(
  (db) => {
    const dao = new Dao(db)
    const rewardRequests = dao.findCollectionByNameOrId('reward_requests')

    // Relax rewardId — screen-time requests have no reward_items row.
    const rewardIdField = rewardRequests.schema.getFieldByName('rewardId')
    if (rewardIdField) {
      rewardIdField.required = false
      if (rewardIdField.options) rewardIdField.options.min = 0
    }

    // Add kind field (nullable; empty = 'item' in application code).
    if (!rewardRequests.schema.getFieldByName('kind')) {
      rewardRequests.schema.addField(
        new SchemaField({
          name: 'kind',
          type: 'select',
          required: false,
          options: { maxSelect: 1, values: ['item', 'screen_time'] },
        }),
      )
    }

    // Add screenTimeMinutes field (nullable; only set on screen_time approvals).
    if (!rewardRequests.schema.getFieldByName('screenTimeMinutes')) {
      rewardRequests.schema.addField(
        new SchemaField({
          name: 'screenTimeMinutes',
          type: 'number',
          required: false,
          options: { min: 0, noDecimal: true },
        }),
      )
    }

    dao.saveCollection(rewardRequests)
  },
  (db) => {
    const dao = new Dao(db)
    try {
      const rewardRequests = dao.findCollectionByNameOrId('reward_requests')
      for (const name of ['screenTimeMinutes', 'kind']) {
        const f = rewardRequests.schema.getFieldByName(name)
        if (f) rewardRequests.schema.removeField(f.id)
      }
      // Re-tighten rewardId. Note: if any screen_time rows exist with empty
      // rewardId at this point, this will fail. Downgrade only works on
      // installs that never used screen_time requests.
      const rewardIdField = rewardRequests.schema.getFieldByName('rewardId')
      if (rewardIdField) {
        rewardIdField.required = true
        if (rewardIdField.options) rewardIdField.options.min = 1
      }
      dao.saveCollection(rewardRequests)
    } catch (_e) {}
  },
)

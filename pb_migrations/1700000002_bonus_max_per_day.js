/// <reference path="../pb_data/types.d.ts" />

/**
 * Add a per-kid, per-day cap to bonus chores.
 *
 *   maxPerDay = 0  (or unset)  → unlimited (fall back to `recurring`)
 *   maxPerDay >= 1             → hard cap on approvals for that chore per kid per local day
 *
 * The approve hook enforces the cap; the frontend hides / disables capped
 * chores in the kid + dashboard views.
 */
migrate((db) => {
  const dao = new Dao(db)
  const bonusChores = dao.findCollectionByNameOrId('bonus_chores')

  if (!bonusChores.schema.getFieldByName('maxPerDay')) {
    bonusChores.schema.addField(new SchemaField({
      name: 'maxPerDay',
      type: 'number',
      required: false,
      options: { min: 0, noDecimal: true },
    }))
    dao.saveCollection(bonusChores)
  }
}, (db) => {
  const dao = new Dao(db)
  const bonusChores = dao.findCollectionByNameOrId('bonus_chores')
  const field = bonusChores.schema.getFieldByName('maxPerDay')
  if (field) {
    bonusChores.schema.removeField(field.id)
    dao.saveCollection(bonusChores)
  }
})

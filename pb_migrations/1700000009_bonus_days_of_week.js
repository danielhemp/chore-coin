/// <reference path="../pb_data/types.d.ts" />

/**
 * Add day-of-week restrictions to bonus chores.
 *
 *   daysOfWeek = []  (or unset)  → available every day (existing behavior)
 *   daysOfWeek = [0..6]          → only available on those weekdays
 *                                  (0 = Sun, 1 = Mon, …, 6 = Sat)
 *
 * Composes with `maxPerDay` and `recurring`:
 *   - a "weekend only" chore uses daysOfWeek=[0,6]
 *   - a "mow the lawn on Saturday" one-per-week is daysOfWeek=[6] + maxPerDay=1
 *
 * The kid + dashboard views hide chores whose day list doesn't include
 * today; the approve-completion hook enforces the rule server-side so a
 * chore can't be back-dated onto a disallowed day either.
 */
migrate(
  (db) => {
    const dao = new Dao(db)
    const bonusChores = dao.findCollectionByNameOrId('bonus_chores')

    if (!bonusChores.schema.getFieldByName('daysOfWeek')) {
      bonusChores.schema.addField(
        new SchemaField({
          name: 'daysOfWeek',
          type: 'json',
          required: false,
          options: { maxSize: 200 },
        }),
      )
      dao.saveCollection(bonusChores)
    }
  },
  (db) => {
    const dao = new Dao(db)
    const bonusChores = dao.findCollectionByNameOrId('bonus_chores')
    const field = bonusChores.schema.getFieldByName('daysOfWeek')
    if (field) {
      bonusChores.schema.removeField(field.id)
      dao.saveCollection(bonusChores)
    }
  },
)

/// <reference path="../pb_data/types.d.ts" />

/**
 * Add a `settings` collection to hold instance-level state that doesn't
 * belong in any other collection:
 *   - licenseKey        the customer's Chore Coin license key (nullable
 *                       during v0 free period; required post-launch)
 *   - licenseActivatedAt when the current license key was first applied
 *   - installId         random UUID stamped on first boot; useful for
 *                       future anti-abuse analytics + support ID
 *
 * The collection holds a single row identified by a well-known key, so
 * queries always target "the singleton" — never grows beyond 1 row.
 *
 * Rules:
 *   - Parents can view (need to display + change the license)
 *   - Parents can update (release / apply keys)
 *   - Creation happens once via the setup wizard hook (or lazily on first
 *     query from a parent); direct client creation is closed to force
 *     that path.
 */
migrate(
  (db) => {
    const dao = new Dao(db)

    const settings = new Collection({
      name: 'settings',
      type: 'base',
      schema: [
        {
          name: 'key',
          type: 'text',
          required: true,
          options: { min: 1, max: 40 },
        },
        {
          name: 'licenseKey',
          type: 'text',
          required: false,
          options: { max: 40 },
        },
        {
          name: 'licenseActivatedAt',
          type: 'date',
          required: false,
        },
        {
          name: 'installId',
          type: 'text',
          required: false,
          options: { max: 64 },
        },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_settings_key ON settings (key)',
      ],
      // Parents view + update. Kids and dashboard don't need this data.
      listRule: '@request.auth.role = "parent"',
      viewRule: '@request.auth.role = "parent"',
      // Direct create closed — go through /api/custom/license/set which
      // handles the singleton semantics (upsert on key='instance').
      createRule: null,
      updateRule: '@request.auth.role = "parent"',
      // Delete closed — no reason for a client to nuke settings.
      deleteRule: null,
    })
    dao.saveCollection(settings)
  },
  (db) => {
    const dao = new Dao(db)
    try {
      dao.deleteCollection(dao.findCollectionByNameOrId('settings'))
    } catch (_e) {}
  },
)

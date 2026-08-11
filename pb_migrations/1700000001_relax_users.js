/// <reference path="../pb_data/types.d.ts" />

/**
 * Relax the users collection so young kids can have accounts without an email
 * address and with a short PIN instead of a full password.
 *
 * Applies to existing installs (Daniel's initial deploy went out with the
 * stricter defaults). Fresh installs get the same settings from the top
 * of 1700000000_init.js so this migration is a harmless no-op there.
 */
migrate((db) => {
  const dao = new Dao(db)
  const users = dao.findCollectionByNameOrId('users')

  users.options.allowEmailAuth = true
  users.options.allowUsernameAuth = true
  users.options.requireEmail = false
  users.options.minPasswordLength = 4

  dao.saveCollection(users)
}, (db) => {
  // Rollback: put the stricter settings back.
  const dao = new Dao(db)
  const users = dao.findCollectionByNameOrId('users')
  users.options.requireEmail = true
  users.options.minPasswordLength = 8
  dao.saveCollection(users)
})

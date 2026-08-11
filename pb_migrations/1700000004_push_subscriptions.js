/// <reference path="../pb_data/types.d.ts" />

/**
 * push_subscriptions — one row per (parent user × browser) Web Push subscription.
 * The frontend registers with the browser's push service using the shared VAPID
 * public key, then POSTs the resulting subscription JSON to a custom endpoint
 * that stores it here. The completion-notify hook reads these rows and asks the
 * webpush sidecar to encrypt + send a push to each parent's active endpoints.
 */
migrate((db) => {
  const dao = new Dao(db)

  const col = new Collection({
    name: 'push_subscriptions',
    type: 'base',
    schema: [
      { name: 'userId', type: 'relation', required: true, options: { collectionId: '_pb_users_auth_', maxSelect: 1, cascadeDelete: true } },
      { name: 'endpoint', type: 'text', required: true, options: { min: 10, max: 1000 } },
      { name: 'p256dh', type: 'text', required: true, options: { min: 10, max: 200 } },
      { name: 'auth', type: 'text', required: true, options: { min: 10, max: 200 } },
      // Optional label so parents can distinguish devices in the future.
      { name: 'userAgent', type: 'text', required: false, options: { max: 500 } },
    ],
    indexes: [
      'CREATE UNIQUE INDEX idx_push_endpoint ON push_subscriptions (endpoint)',
      'CREATE INDEX idx_push_user ON push_subscriptions (userId)',
    ],
    // Any signed-in user can list/manage only their own subscriptions.
    listRule: '@request.auth.id != "" && userId = @request.auth.id',
    viewRule: '@request.auth.id != "" && userId = @request.auth.id',
    // Direct writes are locked; go through /api/custom/push-subscribe hook.
    createRule: null,
    updateRule: null,
    deleteRule: '@request.auth.id != "" && userId = @request.auth.id',
  })
  dao.saveCollection(col)
}, (db) => {
  const dao = new Dao(db)
  try {
    dao.deleteCollection(dao.findCollectionByNameOrId('push_subscriptions'))
  } catch (_e) {}
})

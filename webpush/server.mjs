/**
 * Web Push sender sidecar.
 *
 * PocketBase's hook can build a JWT header but has no AES-128-GCM primitive
 * to encrypt the Web Push payload. This tiny Node service does that work with
 * the `web-push` npm package. PB's hook POSTs {subscription, title, body} here,
 * and this service delivers a real push to the browser's push relay.
 *
 * Only reachable inside the Docker network — bound to 0.0.0.0:3000 but not
 * published on the host.
 */
import { createServer } from 'node:http'
import webpush from 'web-push'

const {
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
  VAPID_SUBJECT = 'mailto:admin@chorecoin.local',
  PORT = '3000',
  WEBPUSH_SHARED_SECRET = '',
} = process.env

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error(
    '\n[FATAL] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not set.\n' +
      'Generate a keypair once:\n' +
      '  docker compose run --rm webpush npm run generate-vapid\n' +
      'Copy both lines into your .env and restart.\n',
  )
  process.exit(1)
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })

const server = createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json')

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200)
    res.end('{"ok":true}')
    return
  }

  if (req.method === 'GET' && req.url === '/vapid-public-key') {
    res.writeHead(200)
    res.end(JSON.stringify({ key: VAPID_PUBLIC_KEY }))
    return
  }

  if (req.method === 'POST' && req.url === '/send') {
    if (WEBPUSH_SHARED_SECRET) {
      const auth = req.headers['x-webpush-secret']
      if (auth !== WEBPUSH_SHARED_SECRET) {
        res.writeHead(401)
        res.end('{"error":"unauthorized"}')
        return
      }
    }
    let body
    try {
      body = JSON.parse(await readBody(req))
    } catch {
      res.writeHead(400)
      res.end('{"error":"bad json"}')
      return
    }
    const { subscriptions = [], title = 'Chore Coin', message = '', url, tag } = body
    if (!Array.isArray(subscriptions) || subscriptions.length === 0) {
      res.writeHead(400)
      res.end('{"error":"subscriptions[] required"}')
      return
    }

    const payload = JSON.stringify({ title, message, url, tag })
    const results = await Promise.all(
      subscriptions.map(async (s) => {
        try {
          await webpush.sendNotification(s, payload, { TTL: 60 })
          return { ok: true }
        } catch (e) {
          // 404/410 = subscription is gone, tell caller to prune it.
          const gone = e.statusCode === 404 || e.statusCode === 410
          return { ok: false, gone, error: String(e.body || e.message || e) }
        }
      }),
    )
    res.writeHead(200)
    res.end(JSON.stringify({ results }))
    return
  }

  res.writeHead(404)
  res.end('{"error":"not found"}')
})

server.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`[webpush] listening on 0.0.0.0:${PORT}`)
})

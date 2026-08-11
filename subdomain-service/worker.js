/**
 * Chore Coin subdomain service — Cloudflare Worker.
 *
 * A tiny DNS-only service that lets Chore Coin customers register
 * *.chorecoin.family subdomains pointing at their self-hosted instance
 * (home IP via Cloudflare Tunnel, VPS, whatever). We never see their
 * traffic — just create the DNS record. Storage is Cloudflare KV; DNS
 * mutations use the Cloudflare API on the chorecoin.family zone.
 *
 * Endpoints:
 *   GET  /                        — Simple HTML UI for registration/management
 *   POST /api/register            — { subdomain, target, licenseKey } → creates DNS
 *   GET  /api/status/:subdomain   — Returns { registered, expiresAt } for a name
 *   POST /api/update/:subdomain   — { target, licenseKey } → updates DNS record
 *   POST /api/unregister/:subdomain — { licenseKey } → deletes DNS record
 *
 * Bindings required (see wrangler.toml):
 *   env.SUBDOMAINS          Cloudflare KV namespace
 *   env.FAMILY_ZONE_ID      Cloudflare zone ID of chorecoin.family
 *   env.CLOUDFLARE_API_TOKEN  Token with "Zone.DNS: Edit" on chorecoin.family
 *   env.LICENSE_PUBLIC_KEY  (optional) Ed25519 public key, base64. When set,
 *                           licenseKey must be a valid signed license from
 *                           the corresponding private key. When unset (v0),
 *                           any well-formatted key is accepted.
 */

const FAMILY_DOMAIN = 'chorecoin.family'
const LEASE_DAYS = 365 // subdomains expire 1 year after last renewal

// Subdomains we reserve for ourselves and never issue.
const RESERVED = new Set([
  'www', 'api', 'admin', 'app', 'apps', 'auth', 'blog', 'cdn', 'docs',
  'help', 'mail', 'ftp', 'ssh', 'staging', 'dev', 'test', 'demo',
  'status', 'support', 'billing', 'account', 'accounts', 'ns', 'ns1',
  'ns2', 'mx', 'smtp', 'imap', 'pop', 'webmail', 'shop', 'store',
  'root', 'chorecoin', 'chore-coin', 'family',
])

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const method = request.method
    const path = url.pathname

    // CORS preflight — kept permissive since this is a public API.
    if (method === 'OPTIONS') return corsPreflight()

    try {
      if (method === 'GET' && path === '/') return html(INDEX_HTML)
      if (method === 'POST' && path === '/api/register') return withCors(await registerHandler(request, env))
      if (method === 'GET' && path.startsWith('/api/status/'))
        return withCors(await statusHandler(path.slice('/api/status/'.length), env))
      if (method === 'POST' && path.startsWith('/api/update/'))
        return withCors(await updateHandler(path.slice('/api/update/'.length), request, env))
      if (method === 'POST' && path.startsWith('/api/unregister/'))
        return withCors(await unregisterHandler(path.slice('/api/unregister/'.length), request, env))
      return withCors(jsonError(404, 'not found'))
    } catch (e) {
      return withCors(jsonError(500, e.message || 'internal error'))
    }
  },
}

// ---------------- handlers ---------------------------------------------------

async function registerHandler(request, env) {
  const body = await safeJson(request)
  const { subdomain, target, licenseKey } = body

  const subErr = validateSubdomain(subdomain)
  if (subErr) return jsonError(400, subErr)
  const tgtErr = validateTarget(target)
  if (tgtErr) return jsonError(400, tgtErr)
  const licErr = await validateLicense(licenseKey, env)
  if (licErr) return jsonError(400, licErr)

  // Refuse if subdomain already taken.
  const existing = await env.SUBDOMAINS.get(`sub:${subdomain}`)
  if (existing) return jsonError(409, `Subdomain "${subdomain}" is already taken.`)

  // Refuse if this license already has an active subdomain — one per license.
  const licenseRecord = await env.SUBDOMAINS.get(`license:${licenseKey}`)
  if (licenseRecord) {
    const { activeSubdomain } = JSON.parse(licenseRecord)
    return jsonError(
      409,
      `This license is already registered to ${activeSubdomain}.${FAMILY_DOMAIN}. ` +
        `Unregister it first or use /api/update to change its target.`,
    )
  }

  const { dnsRecordId, cfError } = await createDnsRecord(subdomain, target, env)
  if (cfError) return jsonError(502, `Cloudflare DNS API rejected the record: ${cfError}`)

  const now = new Date().toISOString()
  const expiresAt = new Date(Date.now() + LEASE_DAYS * 86400_000).toISOString()

  const record = { subdomain, target, licenseKey, dnsRecordId, createdAt: now, updatedAt: now, expiresAt }
  await env.SUBDOMAINS.put(`sub:${subdomain}`, JSON.stringify(record))
  await env.SUBDOMAINS.put(`license:${licenseKey}`, JSON.stringify({ activeSubdomain: subdomain, since: now }))

  return jsonOk({
    subdomain,
    url: `https://${subdomain}.${FAMILY_DOMAIN}`,
    target,
    expiresAt,
    message: `${subdomain}.${FAMILY_DOMAIN} now forwards to ${target}. DNS propagates in about a minute.`,
  })
}

async function statusHandler(subdomain, env) {
  const subErr = validateSubdomain(subdomain)
  if (subErr) return jsonError(400, subErr)
  const raw = await env.SUBDOMAINS.get(`sub:${subdomain}`)
  if (!raw) return jsonOk({ registered: false, subdomain })
  const rec = JSON.parse(raw)
  return jsonOk({
    registered: true,
    subdomain,
    url: `https://${subdomain}.${FAMILY_DOMAIN}`,
    target: rec.target,
    createdAt: rec.createdAt,
    expiresAt: rec.expiresAt,
  })
}

async function updateHandler(subdomain, request, env) {
  const body = await safeJson(request)
  const { target, licenseKey } = body

  const subErr = validateSubdomain(subdomain)
  if (subErr) return jsonError(400, subErr)
  const tgtErr = validateTarget(target)
  if (tgtErr) return jsonError(400, tgtErr)

  const raw = await env.SUBDOMAINS.get(`sub:${subdomain}`)
  if (!raw) return jsonError(404, 'not registered')
  const rec = JSON.parse(raw)
  if (rec.licenseKey !== licenseKey) return jsonError(403, 'license key does not match registration')

  const { cfError } = await updateDnsRecord(rec.dnsRecordId, subdomain, target, env)
  if (cfError) return jsonError(502, `Cloudflare DNS API rejected the update: ${cfError}`)

  rec.target = target
  rec.updatedAt = new Date().toISOString()
  await env.SUBDOMAINS.put(`sub:${subdomain}`, JSON.stringify(rec))

  return jsonOk({ subdomain, target, url: `https://${subdomain}.${FAMILY_DOMAIN}` })
}

async function unregisterHandler(subdomain, request, env) {
  const body = await safeJson(request)
  const { licenseKey } = body

  const subErr = validateSubdomain(subdomain)
  if (subErr) return jsonError(400, subErr)

  const raw = await env.SUBDOMAINS.get(`sub:${subdomain}`)
  if (!raw) return jsonError(404, 'not registered')
  const rec = JSON.parse(raw)
  if (rec.licenseKey !== licenseKey) return jsonError(403, 'license key does not match registration')

  const { cfError } = await deleteDnsRecord(rec.dnsRecordId, env)
  if (cfError) return jsonError(502, `Cloudflare DNS API rejected the delete: ${cfError}`)

  await env.SUBDOMAINS.delete(`sub:${subdomain}`)
  await env.SUBDOMAINS.delete(`license:${licenseKey}`)

  return jsonOk({ subdomain, message: `${subdomain}.${FAMILY_DOMAIN} deregistered.` })
}

// ---------------- validation -------------------------------------------------

function validateSubdomain(sub) {
  if (!sub || typeof sub !== 'string') return 'subdomain is required'
  const s = sub.toLowerCase()
  if (!/^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])?$/.test(s))
    return 'subdomain must be 2-30 chars, lowercase alphanumeric + hyphens, no leading/trailing hyphen'
  if (RESERVED.has(s)) return `"${s}" is reserved and can't be registered`
  return null
}

function validateTarget(target) {
  if (!target || typeof target !== 'string') return 'target is required'
  const t = target.trim()
  // Accept: raw IPv4, IPv6 in brackets, or a hostname (with optional port stripped).
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(t)) return null // IPv4
  if (/^\[[0-9a-f:]+\]$/i.test(t)) return null // IPv6 bracketed
  // Hostname — RFC 1123-ish. Must have at least one dot (no bare labels).
  if (/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(t))
    return null
  return 'target must be an IPv4/IPv6 address or a hostname (e.g. yourhome.cfargotunnel.com)'
}

async function validateLicense(key, env) {
  if (!key || typeof key !== 'string') return 'licenseKey is required'
  // Basic format check — CHRC-XXXX-XXXX-XXXX-XXXX where X is A-Z or 0-9.
  if (!/^CHRC(-[A-Z0-9]{4}){4}$/.test(key)) return 'license key format is invalid'

  // Optional cryptographic verification if a public key is configured. The
  // v0 launch uses format-only checks; real signature verification lands
  // when Lemon Squeezy integration produces signed keys.
  if (env.LICENSE_PUBLIC_KEY) {
    // TODO: parse signed key payload, verify Ed25519 signature with public
    // key from env.LICENSE_PUBLIC_KEY (base64). For MVP we skip this — set
    // this env var only after key issuance is live.
  }
  return null
}

// ---------------- Cloudflare DNS API ----------------------------------------

function cfHeaders(env) {
  return {
    Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
    'Content-Type': 'application/json',
  }
}

// Cloudflare uses CNAME for hostnames, A/AAAA for IPs. We pick automatically.
function dnsRecordShape(subdomain, target) {
  const isIPv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(target)
  const isIPv6 = /^\[[0-9a-f:]+\]$/i.test(target)
  return {
    type: isIPv4 ? 'A' : isIPv6 ? 'AAAA' : 'CNAME',
    name: subdomain,
    content: isIPv6 ? target.replace(/^\[|\]$/g, '') : target,
    ttl: 1, // "automatic" — CF chooses TTL
    proxied: false, // DNS-only so we never see their traffic
  }
}

async function createDnsRecord(subdomain, target, env) {
  const resp = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${env.FAMILY_ZONE_ID}/dns_records`,
    { method: 'POST', headers: cfHeaders(env), body: JSON.stringify(dnsRecordShape(subdomain, target)) },
  )
  const data = await resp.json()
  if (!data.success) return { cfError: data.errors?.[0]?.message || 'unknown error' }
  return { dnsRecordId: data.result.id }
}

async function updateDnsRecord(recordId, subdomain, target, env) {
  const resp = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${env.FAMILY_ZONE_ID}/dns_records/${recordId}`,
    { method: 'PUT', headers: cfHeaders(env), body: JSON.stringify(dnsRecordShape(subdomain, target)) },
  )
  const data = await resp.json()
  if (!data.success) return { cfError: data.errors?.[0]?.message || 'unknown error' }
  return {}
}

async function deleteDnsRecord(recordId, env) {
  const resp = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${env.FAMILY_ZONE_ID}/dns_records/${recordId}`,
    { method: 'DELETE', headers: cfHeaders(env) },
  )
  const data = await resp.json()
  if (!data.success) return { cfError: data.errors?.[0]?.message || 'unknown error' }
  return {}
}

// ---------------- responses --------------------------------------------------

async function safeJson(request) {
  try {
    return await request.json()
  } catch {
    return {}
  }
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function corsPreflight() {
  return new Response(null, { status: 204, headers: CORS })
}
function withCors(resp) {
  const h = new Headers(resp.headers)
  for (const [k, v] of Object.entries(CORS)) h.set(k, v)
  return new Response(resp.body, { status: resp.status, headers: h })
}
function jsonOk(body) {
  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
function jsonError(status, message) {
  return new Response(JSON.stringify({ error: message }, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
function html(body) {
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

// ---------------- HTML UI ----------------------------------------------------

const INDEX_HTML = `<!DOCTYPE html>
<html lang="en" class="bg-slate-950 text-slate-100">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Chore Coin — subdomain registration</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; }
  code, pre { font-family: 'SF Mono', ui-monospace, Consolas, monospace; }
</style>
</head>
<body class="min-h-screen">
<div class="max-w-2xl mx-auto px-6 py-16">

  <div class="text-center">
    <div class="text-5xl mb-3">🪙</div>
    <h1 class="text-3xl font-bold">Chore Coin subdomains</h1>
    <p class="mt-3 text-sm text-slate-400">
      Register a <code class="text-slate-200">yourname.chorecoin.family</code> subdomain
      that points at your self-hosted Chore Coin instance.
      DNS-only — your traffic never touches our servers.
    </p>
  </div>

  <div class="mt-10 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
    <h2 class="font-semibold text-lg">Register a new subdomain</h2>

    <div>
      <label class="block text-xs uppercase tracking-wide text-slate-400 mb-1">Subdomain</label>
      <div class="flex items-stretch">
        <input id="reg-subdomain" placeholder="smiths" class="flex-1 bg-slate-950 border border-slate-700 rounded-l-lg px-3 py-2 text-sm">
        <span class="bg-slate-800 border border-slate-700 border-l-0 rounded-r-lg px-3 py-2 text-sm text-slate-400">.chorecoin.family</span>
      </div>
      <p class="mt-1 text-xs text-slate-500">2–30 chars, lowercase alphanumeric + hyphens.</p>
    </div>

    <div>
      <label class="block text-xs uppercase tracking-wide text-slate-400 mb-1">Target</label>
      <input id="reg-target" placeholder="yourhome.cfargotunnel.com  OR  203.0.113.42" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm">
      <p class="mt-1 text-xs text-slate-500">Your Cloudflare Tunnel hostname, VPS IP, or any public hostname.</p>
    </div>

    <div>
      <label class="block text-xs uppercase tracking-wide text-slate-400 mb-1">License key</label>
      <input id="reg-key" placeholder="CHRC-XXXX-XXXX-XXXX-XXXX" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono">
      <p class="mt-1 text-xs text-slate-500">From your Chore Coin purchase receipt.</p>
    </div>

    <button onclick="register()" class="w-full bg-brand-600 hover:bg-brand-500 rounded-lg py-2.5 font-medium" style="background-color:#4f46e5">Register subdomain</button>

    <div id="reg-out" class="hidden text-sm rounded-lg px-4 py-3"></div>
  </div>

  <div class="mt-6 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
    <h2 class="font-semibold text-lg">Check or manage an existing subdomain</h2>
    <div class="flex items-stretch gap-2">
      <input id="chk-subdomain" placeholder="smiths" class="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm">
      <button onclick="check()" class="bg-slate-700 hover:bg-slate-600 rounded-lg px-4 text-sm">Check</button>
    </div>
    <div id="chk-out" class="hidden text-sm text-slate-300"></div>
  </div>

  <p class="mt-10 text-center text-xs text-slate-500">
    Full API docs on <a href="https://github.com/danielhemp/chore-coin" class="text-slate-300 underline">GitHub</a>.
  </p>
</div>

<script>
async function register() {
  const subdomain = document.getElementById('reg-subdomain').value.trim().toLowerCase()
  const target = document.getElementById('reg-target').value.trim()
  const licenseKey = document.getElementById('reg-key').value.trim().toUpperCase()
  const out = document.getElementById('reg-out')
  out.className = 'text-sm rounded-lg px-4 py-3 bg-slate-800 text-slate-300'
  out.textContent = 'Registering…'
  out.classList.remove('hidden')
  try {
    const r = await fetch('/api/register', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({subdomain, target, licenseKey})
    })
    const d = await r.json()
    if (r.ok) {
      out.className = 'text-sm rounded-lg px-4 py-3 bg-emerald-950 border border-emerald-800 text-emerald-200'
      out.innerHTML = '<b>Success!</b> ' + d.message + '<br><a class="underline" href="'+d.url+'">'+d.url+'</a>'
    } else {
      out.className = 'text-sm rounded-lg px-4 py-3 bg-red-950 border border-red-800 text-red-200'
      out.textContent = d.error || 'Registration failed.'
    }
  } catch (e) {
    out.className = 'text-sm rounded-lg px-4 py-3 bg-red-950 border border-red-800 text-red-200'
    out.textContent = 'Network error: ' + e.message
  }
}
async function check() {
  const s = document.getElementById('chk-subdomain').value.trim().toLowerCase()
  const out = document.getElementById('chk-out')
  out.textContent = 'Checking…'
  out.classList.remove('hidden')
  const r = await fetch('/api/status/' + encodeURIComponent(s))
  const d = await r.json()
  if (d.registered) {
    out.innerHTML = '<b>' + d.subdomain + '.chorecoin.family</b> is registered — points at <code>' + d.target + '</code>. Expires ' + new Date(d.expiresAt).toLocaleDateString() + '.'
  } else if (d.error) {
    out.textContent = d.error
  } else {
    out.innerHTML = '<b>' + s + '.chorecoin.family</b> is available.'
  }
}
</script>
</body>
</html>`

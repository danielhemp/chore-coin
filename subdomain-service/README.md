# Chore Coin subdomain service

Cloudflare Worker that provisions `*.chorecoin.family` subdomains for
Chore Coin customers. DNS-only — the Worker creates a CNAME (or A/AAAA)
record on the `chorecoin.family` zone pointing at the customer's
self-hosted instance. Customer traffic **never touches our
infrastructure**.

## What it does

- **POST /api/register** — customer submits `{ subdomain, target, licenseKey }`; Worker validates, calls the Cloudflare DNS API to create the record, stores the mapping in KV.
- **GET /api/status/:subdomain** — public availability check.
- **POST /api/update/:subdomain** — customer changes their target URL (with license-key auth).
- **POST /api/unregister/:subdomain** — customer removes their subdomain.
- **GET /** — Tailwind-styled HTML form for browser use.

## Prerequisites

1. Own **chorecoin.family**, hosted on Cloudflare (DNS at Cloudflare, doesn't need to be full Cloudflare proxy).
2. Cloudflare account with **Workers** enabled (free plan is enough — 100k requests/day covers thousands of customers).
3. A **Cloudflare API token** with `Zone.DNS: Edit` on the `chorecoin.family` zone. Create at https://dash.cloudflare.com/profile/api-tokens using the "Edit zone DNS" template.
4. **Wrangler CLI** installed:
   ```
   npm install -g wrangler
   wrangler login
   ```

## First-time deployment

From this `subdomain-service/` directory:

```bash
# 1. Create the KV namespace that stores subdomain registrations.
wrangler kv:namespace create SUBDOMAINS
wrangler kv:namespace create SUBDOMAINS --preview

# Copy the printed IDs into wrangler.toml (id and preview_id fields).

# 2. Load the runtime secrets.
wrangler secret put CLOUDFLARE_API_TOKEN   # paste the token from step 3 above
wrangler secret put FAMILY_ZONE_ID          # paste the chorecoin.family Zone ID

# 3. Deploy.
wrangler deploy
```

Wrangler prints the worker URL: something like
`https://chorecoin-subdomains.<yourteam>.workers.dev`. Open it and try
registering `test.chorecoin.family` pointing at `example.com` — you should
see a real CNAME record appear in the Cloudflare DNS dashboard within
seconds.

## Attach a nicer URL

Once you want the panel at `subdomains.chorecoin.family` instead of the
`workers.dev` URL, uncomment the `[[routes]]` block in `wrangler.toml`,
fill in the `zone_id`, and `wrangler deploy` again. Cloudflare will
auto-provision the DNS + HTTPS.

## Local development

```
wrangler dev --local
```

Serves on http://127.0.0.1:8787 with a local KV emulator. DNS API calls
still hit real Cloudflare — use a scratch zone or the same production
zone with a naming convention (`dev-<subdomain>`) to avoid conflicts.

## What's NOT here yet (v0 → v1 gaps)

- **Real license verification.** Right now `validateLicense()` just checks
  the format `CHRC-XXXX-XXXX-XXXX-XXXX`. Once license issuance is wired
  up through Lemon Squeezy, set the `LICENSE_PUBLIC_KEY` secret and
  implement the Ed25519 verify inside `validateLicense()`.
- **Renewal / billing.** Registrations set `expiresAt` a year out but
  nothing enforces the expiry today. Add a Cloudflare cron trigger that
  scans KV weekly and deletes expired subdomains (with a 30-day grace
  window and reminder emails).
- **Stripe webhook integration.** When Lemon Squeezy fires a
  `subscription.renewed` webhook, extend the `expiresAt` for that
  license's active subdomain.
- **Rate limiting.** Currently anyone with a valid license format can
  spray registrations at us. Add Cloudflare's built-in Rate Limiting
  rule or use `env.SUBDOMAINS` to track per-IP attempts.
- **Bulk email for expiration warnings.** Handled by a separate mail
  provider hook, not in this Worker.

## Cost math

Cloudflare free tier:
- Workers: 100,000 requests/day (~3M/mo)
- KV: 100,000 reads/day + 1,000 writes/day + 1 GB storage
- Zone DNS records: 3,500 free

At 50 subscribers @ $12/yr = $600/yr revenue with roughly zero infra cost.
At 1000 subscribers we'd still be well within free tier — DNS-only, no
proxied traffic.

## Data model (KV)

Two key prefixes:

- `sub:<subdomain>` → registration record:
  ```json
  {
    "subdomain": "smiths",
    "target": "smiths-home.cfargotunnel.com",
    "licenseKey": "CHRC-XXXX-XXXX-XXXX-XXXX",
    "dnsRecordId": "abc123",
    "createdAt": "2026-08-11T12:00:00Z",
    "updatedAt": "2026-08-11T12:00:00Z",
    "expiresAt": "2027-08-11T12:00:00Z"
  }
  ```

- `license:<licenseKey>` → active subdomain lookup (enforces 1 subdomain per license):
  ```json
  { "activeSubdomain": "smiths", "since": "2026-08-11T12:00:00Z" }
  ```

Both keys are removed on `/api/unregister`. Migrating away from
Cloudflare KV to D1 (SQL) later is straightforward if we outgrow it.

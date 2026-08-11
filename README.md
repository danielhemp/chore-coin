# Chore Coin

A tiny family PWA for tracking chores and paying kids in coins. Runs entirely on your Docker host — no third-party accounts, no cloud dependencies. Install it to the home screen on any phone, iPad, or laptop.

**What it does**

- Two-tier reward economy:
  - **Base chores** (per kid, editable) → finish them all today to earn **1 hour of screen time**. Use-it-or-lose-it by default; parents can extend, carry over, or grant bonuses.
  - **Bonus chores** → earn **chore coins**. Each coin redeems for 5 min extra screen time OR $0.25 cash.
- Kids check off chores → parent approves in a queue → balance updates in real time on every device.
- Immutable append-only ledger records every earn/spend so history is always auditable.

**Stack — 100% self-hosted**

- **Frontend:** Vite + React + TypeScript + Tailwind, packaged as a PWA (`vite-plugin-pwa`), served by nginx.
- **Backend:** PocketBase — a single Go binary that provides auth, realtime subscriptions (SSE), and per-collection access rules. Data lives in a single SQLite file (`pb_data/data.db`).
- **Deployment:** Two containers via `docker compose` (`pocketbase` + `chore-coin`), one named volume for the DB. Put it behind Cloudflare on your family domain.

---

## 1. First-time setup

Clone/extract this project onto your Docker host and, from the project root:

```bash
cp .env.example .env   # optional; only needed to change the default timezone
docker compose build
docker compose up -d
```

The app is now on `http://<host>:8080`. Health-check the backend with
`curl http://<host>:8080/api/health` — you should see `{"code":200,...}`.

The very first boot runs `pb_migrations/1700000000_init.js` which creates every collection with rules. Subsequent starts are no-ops.

### Create the PocketBase superuser (admin)

PocketBase needs a superuser account so you can open the admin UI. Run once:

```bash
docker compose exec pocketbase /pb/pocketbase admin create you@example.com 'SomeStrongPassword'
```

If you see `Error: Migration are not initialized yet` from `admin create`, your build predates the WORKDIR fix — append `--dir=/pb_data` to the command, or rebuild the pocketbase image with the latest Dockerfile (which sets `/pb_data` as the container's working directory).

Now you can log in at `http://<host>:8080/_/` — this is PocketBase's built-in admin UI. Use it for:

- Manually seeding data if needed
- Editing PB settings (SMTP for password-reset emails, etc.)
- Backups: `Settings → Backups`

### Create the first parent user

The app itself has no self-signup — parents create every login through the admin UI (or the "Add kid" screen once a parent is signed in).

Two ways:

1. **In the admin UI** — go to Collections → `users` → New record. Fill in `email`, `password`, `role=parent`, `displayName`, then Save.
2. **Via API** with your admin token — see `docs/api-cheatsheet.md` if you want to script it (not included; use the UI first time).

Sign into the app at `http://<host>:8080/login` with that parent email + password. From there you can add kids, base chores, and bonus chores through the app UI.

### Adding kid logins

On the parent "Manage kids" screen, add a kid and optionally fill in an email + password to create their login at the same time. Kids can then sign into the app on their own devices.

If you leave the login blank at creation time (e.g. the kid is too young), you can add it later via the PocketBase admin UI: create a `users` record with `role=kid` and set its `kidId` to the kid's ID (visible in the kid detail URL: `/kids/<id>`).

---

## 2. Everyday use

- **Kid view** — Chores tab shows today's base chores (tap "I did it!" to submit for approval) and available bonus chores. Redeem tab spends coins for screen minutes or cash.
- **Parent view** — Home shows every kid at a glance. Approve tab burns down the queue. Chores tab manages the bonus catalog. Redeem tab shows outstanding cash owed. History tab is the full ledger.
- Every action is realtime — approve on your phone, the kid's iPad updates instantly.

---

## 3. Deploying behind Cloudflare

You have two natural options:

**Same-origin (recommended, no config needed)** — expose `http://<host>:8080` through a Cloudflare Tunnel or DNS record on `chores.family.tld`. The frontend talks to `/api/*` on the same origin, and nginx (inside the `chore-coin` container) reverse-proxies to the PocketBase container. Nothing else to set up.

**Split origins (optional)** — if you'd rather serve the API from a separate subdomain (e.g. `chores.family.tld` and `chores-api.family.tld`), set `VITE_PB_URL=https://chores-api.family.tld` in `.env`, rebuild, and expose the PocketBase container's 8090 directly to a separate tunnel/DNS record.

---

## 4. Backups

The SQLite DB is a single file inside the `pb_data` volume. To back up:

```bash
# Trigger a PB backup (goes into pb_data/backups/)
docker compose exec pocketbase /pb/pocketbase --dir=/pb_data admin

# Or copy the DB straight out:
docker cp chore-coin-pocketbase:/pb_data/data.db ./backups/data-$(date +%F).db
```

You can also schedule PB backups from the admin UI's Settings → Backups tab, and configure S3 for offsite storage if you like.

---

## 5. Local development

Requires Node 22+ and PocketBase (grab it from https://pocketbase.io/docs/).

```bash
# Terminal 1 — run PocketBase locally
./pocketbase serve --dir=./pb_data --migrationsDir=./pb_migrations --hooksDir=./pb_hooks

# Terminal 2 — run the dev server
cp .env.example .env.local
echo 'VITE_PB_URL=http://localhost:8090' >> .env.local
npm install
npm run dev
```

Vite serves at http://localhost:5173.

---

## 6. Customization

- **Change coin value**: edit `COIN_TO_CENTS` and `COIN_TO_SCREEN_MINUTES` in both `src/lib/types.ts` and `pb_hooks/lib.js`, then rebuild + restart.
- **Change base-chore reward from 60 min**: edit `BASE_REWARD_MINUTES` in the same two files.
- **Change local timezone**: `VITE_LOCAL_TIMEZONE` in `.env`.

---

## Project layout

```
src/
  auth/AuthContext.tsx      — pb.authStore integration
  lib/types.ts              — TypeScript mirrors of the PB collections
  lib/actions.ts            — every mutation (direct CRUD OR custom /api/custom/*)
  lib/dates.ts              — local-timezone-aware date helpers
  hooks/data.ts             — live-subscription React hooks over PB realtime
  components/Layout.tsx     — shell with bottom tab bar
  pages/Login.tsx           — email/password sign-in
  pages/kid/                — kid views (home + redeem)
  pages/parent/             — parent views (dashboard, approvals, kid detail, chore editors, redemptions, history)
pb_migrations/1700000000_init.js — creates every collection + rules on first boot
pb_hooks/main.pb.js         — atomic multi-record mutations (approve/redeem/adjust/…)
pb_hooks/lib.js             — helper functions shared across the route handlers
Dockerfile                  — frontend (multi-stage: node → nginx)
Dockerfile.pocketbase       — backend (pinned PocketBase binary in alpine)
docker-compose.yml          — two services, one volume
nginx.conf                  — SPA fallback + reverse proxy for /api and /_/
```

## Data model at a glance

```
users            (auth)  role, displayName, kidId, avatarEmoji
kids                     displayName, avatarEmoji, userId, active
base_chores              kidId, title, order, active
bonus_chores             title, coinValue, assignedTo, recurring, active
completions              kidId, choreType, choreId, choreTitle, coinValue?, forDate?, status, approvedBy?, approvedAt?
daily_status             kidId, date, approvedBaseChores (map), baseAwarded, baseScreenTimeGrantedMinutes, baseScreenTimeUsedMinutes, carryOverMinutes
balances                 kidId (unique), coinBalance
ledger                   kidId, type, amount, note, refId, by
```

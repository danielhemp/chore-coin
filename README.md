# Chore Coin

A tiny self-hosted PWA that turns kids' chores into a working economy: base
chores earn daily screen time, bonus chores earn coins, and coins redeem for
extra screen time, cash, or parent-approved rewards like "movie night." Every
device in the family stays in sync in real time. Runs on a Mac mini, a Linux
VPS, or a $15 Raspberry Pi Zero 2W.

**Status: v0 — active development.** The current family-tested build ships as
Docker Compose. A single-binary distribution for macOS, Linux (including
Raspberry Pi), and eventually Windows is under active development in
`cmd/chorecoin/`. The intent is a paid v1 with signed license keys, at-cost
domain redirects, and marketing at [chorecoin.app](https://chorecoin.app)
(coming soon).

## What it does

- **Two-tier economy.** Base chores (a fixed daily set) unlock 60 minutes of
  screen time if all are completed. Bonus chores earn coins. 1 coin = 5 min
  extra screen time OR $0.25 in cash OR the coin cost of a parent-defined
  reward.
- **Reward catalog.** Parents pre-define rewards like "Movie night — 10 coins"
  or "Pick dinner — 15 coins." Kids request; parents approve from an inbox
  that unifies chores and reward requests.
- **Immutable ledger.** Every earn, spend, and adjustment is a signed row in
  an append-only ledger. Full history, always auditable.
- **Real-time everywhere.** Approve a chore on your phone; the kid's iPad
  updates within a second, and the family wall dashboard reflects the new
  balance instantly. Web Push notifies parents of pending approvals and kids
  of approvals/denials.
- **Fully self-hosted.** All data in a single SQLite file. Behind a Cloudflare
  Tunnel if you want the family to reach it from anywhere without opening a
  port on your router.

## Installation

### Option 1 — Docker Compose (current stable path)

Requires Docker Desktop or Docker Engine. This is what the reference family
instance runs.

```bash
git clone https://github.com/danielhemp/chore-coin.git
cd chore-coin
cp .env.example .env         # edit if you want a different timezone
docker compose up -d
```

Open `http://localhost:8080` and follow the setup instructions. Create the
initial superuser with:

```bash
docker compose exec pocketbase /pb/pocketbase admin create you@example.com 'ChangeMe'
```

Then sign into the admin UI at `/_/`, create your first parent record in the
`users` collection (`role=parent`), and log into the app.

### Option 2 — Native binary from source (developer path)

Requires Go 1.22+ and Node 20+. Produces a single self-contained
`chorecoin` binary per platform.

```bash
git clone https://github.com/danielhemp/chore-coin.git
cd chore-coin

# Build the frontend once
(cd frontend && npm ci && npm run build)

# Build the binary for your host
make build

# Run against a scratch data dir
./bin/chorecoin serve --http=127.0.0.1:8090 --dir=/tmp/chorecoin-dev
```

Cross-compile all release targets (macOS arm64/amd64, Linux
arm64/amd64/armv7):

```bash
make release
ls -lh bin/
```

Binaries are statically linked (`CGO_ENABLED=0`, pure-Go SQLite driver) — no
libc dependency, ~40MB each.

### Option 3 — Prebuilt binary (coming with v1)

A one-line installer for macOS + Linux (including Raspberry Pi) is planned:

```bash
curl -fsSL https://chorecoin.app/install.sh | sh
```

Detects your OS/arch, drops the right binary in `/usr/local/bin/chorecoin`,
registers a systemd/launchd service, and opens the setup wizard in your
browser. Not shipped yet — track progress at
[chorecoin.app](https://chorecoin.app) or in
[build-state](https://github.com/danielhemp/chore-coin/issues).

## Configuration

The Docker path reads a `.env` file at the repo root. The native binary
reads environment variables directly.

| Variable | Default | Notes |
|---|---|---|
| `VITE_LOCAL_TIMEZONE` | `America/Chicago` | Used to compute daily boundaries for base-chore reset |
| `WEBPUSH_VAPID_PUBLIC_KEY` | — | Generated with `docker compose run --rm webpush npm run generate-vapid` |
| `WEBPUSH_VAPID_PRIVATE_KEY` | — | Same command; keep private |
| `WEBPUSH_VAPID_SUBJECT` | `mailto:admin@chorecoin.local` | Contact for browser push registries |
| `WEBPUSH_SHARED_SECRET` | — | Random 64-hex string; ties PocketBase to the webpush sidecar |
| `CHORECOIN_HOOKS_DIR` | `./pb_hooks` | Native binary only — override for testing |
| `CHORECOIN_MIGRATIONS_DIR` | `./pb_migrations` | Native binary only — override for testing |

## Project layout

```
chore-coin/
├── frontend/           Vite + React + Tailwind PWA
├── cmd/chorecoin/      Go main package — custom PocketBase build
├── pb_hooks/           PocketBase JS hooks (approve, redeem, invite kid, ...)
├── pb_migrations/      PB schema migrations
├── webpush/            Node sidecar that signs + delivers Web Push
├── docker-compose.yml  Three-container reference deployment
├── Dockerfile.pocketbase
├── Makefile            make build | make release | make run
└── go.mod / go.sum
```

## License

[Business Source License 1.1](./LICENSE) — copyright © 2026 Daniel Hemphill.

- **Free to use** for the internal operations of a single family, household,
  or non-commercial group.
- **Commercial use** — including offering Chore Coin as a hosted or managed
  service, or bundling it into a paid product — requires a separate
  commercial license from the author.
- **Change license**: this code automatically converts to
  [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0) four
  years after each version's public release.

For commercial licensing inquiries, contact
[daniel@turnersystems.com](mailto:daniel@turnersystems.com).

## Support

File issues at
[github.com/danielhemp/chore-coin/issues](https://github.com/danielhemp/chore-coin/issues).
This is a side project maintained in evenings; responses may take a few days.

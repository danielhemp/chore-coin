# Chore Coin

A tiny self-hosted PWA that turns kids' chores into a working economy: base
chores earn daily screen time, bonus chores earn coins, and coins redeem for
extra screen time, cash, or parent-approved rewards like "movie night." Every
device in the family stays in sync in real time. Runs on a Mac mini, a Linux
VPS, or a $15 Raspberry Pi Zero 2W.

**Status: v0 — paid commercial product.** Chore Coin ships as a single
self-contained binary distributed through GitHub Releases. Installation
requires a valid license key (`CHRC-XXXX-XXXX-XXXX-XXXX`) from the
[chore-coin.app](https://chore-coin.app) purchase page. There is no free
install path; the installer refuses to run and the setup wizard refuses
to complete without one.

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
- **Fully self-hosted.** All data in a single SQLite file on hardware you
  own. Behind a Cloudflare Tunnel if you want the family to reach it from
  anywhere without opening a port on your router. Optional
  `yourname.chore-coin.family` subdomain add-on for a memorable URL.

## Installation

You need a Chore Coin license key from [chore-coin.app](https://chore-coin.app)
before you can install. Once you have it, the one-line installer handles
everything else:

```bash
curl -fsSL https://raw.githubusercontent.com/danielhemp/chore-coin/main/install.sh | \
  CHORECOIN_LICENSE=CHRC-XXXX-XXXX-XXXX-XXXX sh
```

The installer:

1. Detects your OS (macOS / Linux) and CPU (arm64 / amd64 / armv7).
2. Downloads the matching prebuilt binary from the latest GitHub release and
   verifies its SHA-256 checksum against the published `SHA256SUMS.txt`.
3. Installs `/usr/local/bin/chorecoin` (asks for sudo).
4. Creates the data directory owned by you (`/var/lib/chorecoin` on Linux,
   `~/Library/Application Support/chorecoin` on macOS).
5. Stages the license key into the data directory so the setup wizard
   pre-fills it — you don't retype it in the browser.
6. Registers Chore Coin as a background service (systemd on Linux,
   launchd user agent on macOS) so it starts at boot.
7. Prints the URL to open in your browser to complete first-run setup.

The setup wizard runs entirely in the browser: license key confirmation → PB
admin account → your first parent user. Everything atomic, no terminal
gymnastics required past step one.

If you run the installer from an interactive terminal without setting
`CHORECOIN_LICENSE`, it prompts for the key.

### Uninstall

```bash
# Linux
sudo systemctl disable --now chorecoin
sudo rm /etc/systemd/system/chorecoin.service /usr/local/bin/chorecoin

# macOS
launchctl unload ~/Library/LaunchAgents/dev.chorecoin.plist
rm ~/Library/LaunchAgents/dev.chorecoin.plist /usr/local/bin/chorecoin
```

Your data at `/var/lib/chorecoin` (or `~/Library/Application Support/chorecoin`)
is left in place — remove it manually if you want a clean uninstall.

### Moving to new hardware

1. On the old machine: **Settings → Download family backup**. You get a
   single zip file.
2. On the old machine: **Settings → Release license**. Frees the key for
   reuse.
3. Install Chore Coin on the new machine using the installer above with the
   same license key.
4. On the new machine, during setup: choose "Restore from backup" and pick
   the zip. Kids, chores, coin balances, and full history come across
   intact.

## Configuration

The binary reads runtime configuration from environment variables. All are
optional except when you want a specific feature.

| Variable | Default | Notes |
|---|---|---|
| `CHORECOIN_PORT` | `8090` | Port the HTTP server binds to |
| `CHORECOIN_BIND` | `0.0.0.0` | Bind address (set to `127.0.0.1` for loopback-only) |
| `CHORECOIN_LICENSE` | — | Only read by `install.sh`; ignored by the binary once installed |
| `VITE_LOCAL_TIMEZONE` | `America/Chicago` | Baked into the frontend build; controls daily-boundary math for base chores |
| `WEBPUSH_VAPID_PUBLIC_KEY` | — | Generated with the webpush sidecar; served to browsers so they can subscribe |
| `WEBPUSH_VAPID_PRIVATE_KEY` | — | Same command; keep private |
| `WEBPUSH_VAPID_SUBJECT` | `mailto:admin@chore-coin.local` | Contact for browser push registries |
| `WEBPUSH_SHARED_SECRET` | — | Random 64-hex string; ties PocketBase to the webpush sidecar |
| `NTFY_URL` / `NTFY_TOPIC` / `NTFY_TOKEN` | — | Optional [ntfy.sh](https://ntfy.sh) fallback for push notifications |
| `CHORECOIN_HOOKS_DIR` | (embedded) | Override the on-disk `pb_hooks` for local development |
| `CHORECOIN_MIGRATIONS_DIR` | (embedded) | Override the on-disk `pb_migrations` for local development |

## For developers

If you're a licensed customer who wants to build from source (allowed under
the BUSL — see below) or contribute a patch:

```bash
git clone https://github.com/danielhemp/chore-coin.git
cd chore-coin

# Build the frontend once
(cd frontend && npm ci && npm run build)

# Build the binary for your host
make build

# Run against a scratch data dir with a test license
mkdir -p /tmp/chorecoin-dev
echo "CHRC-TEST-TEST-TEST-TEST" > /tmp/chorecoin-dev/.license-pending
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

Docker Compose is retained in the repo (`docker-compose.yml`) for continuity
with the reference family instance that ran on it during development. It is
not a supported install path for new customers and is not advertised on the
marketing site.

## Project layout

```
chore-coin/
├── frontend/           Vite + React + Tailwind PWA
├── cmd/chorecoin/      Go main package — custom PocketBase build
├── pb_hooks/           PocketBase JS hooks (approve, redeem, invite kid, ...)
├── pb_migrations/      PB schema migrations
├── webpush/            Node sidecar that signs + delivers Web Push
├── subdomain-service/  Cloudflare Worker for *.chore-coin.family
├── docs/               Marketing site served from GitHub Pages
├── install.sh          One-line installer (curl-pipe)
├── Makefile            make build | make release | make run
└── docker-compose.yml  Retained for development / existing installs
```

## License

[Business Source License 1.1](./LICENSE) — copyright © 2026 Daniel Hemphill.

- **Personal / family use** requires a paid license key. Purchase at
  [chore-coin.app](https://chore-coin.app).
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

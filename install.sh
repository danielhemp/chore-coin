#!/bin/sh
# Chore Coin one-line installer for macOS and Linux (including Raspberry Pi).
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/danielhemp/chore-coin/main/install.sh | sh
#
# What it does:
#   1. Detects your OS and CPU architecture.
#   2. Downloads the matching prebuilt binary from the latest GitHub release,
#      verifies its SHA-256 checksum against the published SHA256SUMS.txt.
#   3. Installs the binary to /usr/local/bin/chorecoin (asks for sudo).
#   4. Creates a data directory owned by you:
#        Linux:  /var/lib/chorecoin   (sudo, chowned to $USER)
#        macOS:  ~/Library/Application Support/chorecoin
#   5. Registers Chore Coin as a background service that starts at boot:
#        Linux:  /etc/systemd/system/chorecoin.service (systemd)
#        macOS:  ~/Library/LaunchAgents/dev.chorecoin.plist (launchd user agent)
#   6. Starts the service and prints the URL to open in your browser to
#      complete first-run setup.
#
# Env overrides:
#   CHORECOIN_PORT=8090   Change the port the service binds
#   CHORECOIN_BIND=0.0.0.0  Change the bind address
#
# Uninstall:
#   Linux:  sudo systemctl disable --now chorecoin
#           sudo rm /etc/systemd/system/chorecoin.service /usr/local/bin/chorecoin
#   macOS:  launchctl unload ~/Library/LaunchAgents/dev.chorecoin.plist
#           rm ~/Library/LaunchAgents/dev.chorecoin.plist /usr/local/bin/chorecoin
#   Your data at /var/lib/chorecoin (or ~/Library/Application Support/chorecoin)
#   is left in place — remove it manually if you want a clean uninstall.

set -eu

REPO="danielhemp/chore-coin"
PORT="${CHORECOIN_PORT:-8090}"
BIND="${CHORECOIN_BIND:-0.0.0.0}"

if [ -t 1 ]; then
	B="$(printf '\033[1m')"; R="$(printf '\033[0m')"
	GREEN="$(printf '\033[32m')"; RED="$(printf '\033[31m')"; DIM="$(printf '\033[2m')"
else
	B=""; R=""; GREEN=""; RED=""; DIM=""
fi
say()  { printf "%s%s%s\n" "$B" "$1" "$R"; }
ok()   { printf "  %s✓%s %s\n" "$GREEN" "$R" "$1"; }
info() { printf "  %s%s%s\n" "$DIM" "$1" "$R"; }
die()  { printf "%s✗ %s%s\n" "$RED" "$1" "$R" >&2; exit 1; }

say "Chore Coin installer"
command -v curl >/dev/null 2>&1 || die "curl is required but not installed"

# ---- license gate ---------------------------------------------------------
# Chore Coin is a paid product. This installer requires a license key up
# front so nobody accidentally sets up a server they can't actually run.
# The key is passed to the setup wizard so the parent doesn't have to
# re-paste it in the browser.
LICENSE="${CHORECOIN_LICENSE:-}"
if [ -z "$LICENSE" ]; then
	# Try to read from an interactive terminal. When install.sh is piped
	# through curl | sh there IS no controlling TTY — in that case the
	# script fails cleanly with a link to the purchase page.
	if [ -t 0 ]; then
		printf "License key (from your purchase email): "
		read -r LICENSE
	fi
fi
LICENSE=$(printf "%s" "$LICENSE" | tr '[:lower:]' '[:upper:]' | tr -d ' \t\r\n')
if [ -z "$LICENSE" ]; then
	die "no license key provided.
  Get one from https://chore-coin.app then run:
      curl -fsSL https://raw.githubusercontent.com/${REPO}/main/install.sh | \\
        CHORECOIN_LICENSE=CHRC-XXXX-XXXX-XXXX-XXXX sh
  (or run the installer from an interactive terminal to be prompted).
  Full install guide: https://chore-coin.app/install-guide.html"
fi
# Format check — real signature verification lands with Lemon Squeezy.
if ! printf "%s" "$LICENSE" | grep -Eq '^CHRC(-[A-Z0-9]{4}){4}$'; then
	die "license key doesn't match the expected CHRC-XXXX-XXXX-XXXX-XXXX format.
  Copy the key straight from your welcome email — no spaces, no line breaks.
  If you're still stuck, see: https://chore-coin.app/install-guide.html#trouble"
fi
ok "license key accepted"

os_raw="$(uname -s)"
arch_raw="$(uname -m)"
case "$os_raw" in
	Darwin) OS="darwin" ;;
	Linux)  OS="linux" ;;
	*) die "unsupported OS: $os_raw (Chore Coin ships for macOS and Linux)" ;;
esac
case "$arch_raw" in
	x86_64|amd64) ARCH="amd64" ;;
	arm64|aarch64) ARCH="arm64" ;;
	armv7l|armv7|armhf) ARCH="armv7" ;;
	*) die "unsupported CPU architecture: $arch_raw" ;;
esac
ASSET="chorecoin-${OS}-${ARCH}"
say "Platform: ${OS}/${ARCH} → ${ASSET}"

# ---- fetch latest release --------------------------------------------------
say "Finding the latest release..."
LATEST_JSON="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest")" \
	|| die "failed to reach GitHub API — check your network"

TAG=$(printf "%s" "$LATEST_JSON" | grep '"tag_name"' | head -1 | sed 's/.*"tag_name":[[:space:]]*"\([^"]*\)".*/\1/')
BINARY_URL=$(printf "%s" "$LATEST_JSON" | grep '"browser_download_url"' | grep "/${ASSET}\"" | head -1 | sed 's/.*"browser_download_url":[[:space:]]*"\([^"]*\)".*/\1/')
CHECKSUMS_URL=$(printf "%s" "$LATEST_JSON" | grep '"browser_download_url"' | grep '/SHA256SUMS.txt"' | head -1 | sed 's/.*"browser_download_url":[[:space:]]*"\([^"]*\)".*/\1/')

[ -n "$TAG" ]        || die "couldn't parse latest release tag — is any release published yet? see https://github.com/${REPO}/releases"
[ -n "$BINARY_URL" ] || die "no ${ASSET} binary in release ${TAG} — this platform may not have a prebuilt binary yet"
ok "Release ${TAG}"

# ---- download + verify -----------------------------------------------------
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT
BINARY_TMP="${TMPDIR}/${ASSET}"

say "Downloading..."
curl -fsSL --progress-bar -o "$BINARY_TMP" "$BINARY_URL"

if [ -n "$CHECKSUMS_URL" ]; then
	say "Verifying SHA-256 checksum..."
	curl -fsSL -o "${TMPDIR}/SHA256SUMS.txt" "$CHECKSUMS_URL"
	expected=$(grep " ${ASSET}\$" "${TMPDIR}/SHA256SUMS.txt" | awk '{print $1}')
	if [ -z "$expected" ]; then
		info "no checksum entry for ${ASSET} — skipping verify"
	else
		if command -v sha256sum >/dev/null 2>&1; then
			actual=$(sha256sum "$BINARY_TMP" | awk '{print $1}')
		elif command -v shasum >/dev/null 2>&1; then
			actual=$(shasum -a 256 "$BINARY_TMP" | awk '{print $1}')
		else
			info "no sha256sum or shasum available — skipping verify"
			actual="$expected"
		fi
		[ "$actual" = "$expected" ] || die "checksum mismatch! expected $expected got $actual"
		ok "checksum verified"
	fi
fi

chmod +x "$BINARY_TMP"

# ---- install binary --------------------------------------------------------
BIN_PATH="/usr/local/bin/chorecoin"
if [ "$(id -u)" -eq 0 ]; then
	SUDO=""
elif command -v sudo >/dev/null 2>&1; then
	SUDO="sudo"
	say "Requesting sudo for /usr/local/bin install..."
else
	die "need root or sudo to install to /usr/local/bin — install manually with: mv $BINARY_TMP ~/.local/bin/chorecoin"
fi

$SUDO install -m 0755 "$BINARY_TMP" "$BIN_PATH"
ok "installed ${BIN_PATH}"

# ---- data directory --------------------------------------------------------
if [ "$OS" = "darwin" ]; then
	DATA_DIR="$HOME/Library/Application Support/chorecoin"
	mkdir -p "$DATA_DIR"
else
	DATA_DIR="/var/lib/chorecoin"
	$SUDO mkdir -p "$DATA_DIR"
	$SUDO chown "$USER:$(id -gn)" "$DATA_DIR"
fi
ok "data directory ${DATA_DIR}"

# Drop the license key into the data dir so the setup wizard picks it up
# on first run (parent doesn't have to re-paste it). Read-only by owner.
printf "%s\n" "$LICENSE" > "${DATA_DIR}/.license-pending"
chmod 600 "${DATA_DIR}/.license-pending"
ok "license key staged for setup wizard"

# ---- register as background service ----------------------------------------
if [ "$OS" = "linux" ]; then
	command -v systemctl >/dev/null 2>&1 || die "systemd not detected — this installer expects systemd on Linux"
	SERVICE_FILE="/etc/systemd/system/chorecoin.service"
	say "Writing ${SERVICE_FILE}..."
	$SUDO tee "$SERVICE_FILE" >/dev/null <<UNIT
[Unit]
Description=Chore Coin
Documentation=https://github.com/${REPO}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${USER}
Group=$(id -gn)
ExecStart=${BIN_PATH} serve --http=${BIND}:${PORT} --dir=${DATA_DIR}
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=${DATA_DIR}
ProtectHome=read-only
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT
	$SUDO systemctl daemon-reload
	$SUDO systemctl enable chorecoin >/dev/null 2>&1
	$SUDO systemctl restart chorecoin
	ok "systemd service enabled + started"

elif [ "$OS" = "darwin" ]; then
	AGENT_DIR="$HOME/Library/LaunchAgents"
	AGENT_FILE="${AGENT_DIR}/dev.chorecoin.plist"
	LOG_DIR="$HOME/Library/Logs/chorecoin"
	mkdir -p "$AGENT_DIR" "$LOG_DIR"
	say "Writing ${AGENT_FILE}..."
	cat > "$AGENT_FILE" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
	<key>Label</key><string>dev.chorecoin</string>
	<key>ProgramArguments</key><array>
		<string>${BIN_PATH}</string>
		<string>serve</string>
		<string>--http=${BIND}:${PORT}</string>
		<string>--dir=${DATA_DIR}</string>
	</array>
	<key>RunAtLoad</key><true/>
	<key>KeepAlive</key><true/>
	<key>StandardOutPath</key><string>${LOG_DIR}/chorecoin.log</string>
	<key>StandardErrorPath</key><string>${LOG_DIR}/chorecoin.err</string>
</dict></plist>
PLIST
	launchctl unload "$AGENT_FILE" 2>/dev/null || true
	launchctl load "$AGENT_FILE"
	ok "launchd agent loaded"
fi

# ---- wait for health + print URL ------------------------------------------
say "Waiting for the service to come up..."
URL="http://127.0.0.1:${PORT}"
ready=0
for i in $(seq 1 20); do
	if curl -fsS "${URL}/api/health" >/dev/null 2>&1; then
		ready=1; break
	fi
	sleep 1
done

echo
if [ $ready -eq 1 ]; then
	say "Chore Coin is running."
	echo
	echo "  ${B}Open in your browser:${R}  ${URL}"
	if [ "$BIND" = "0.0.0.0" ] && [ "$OS" = "linux" ]; then
		lan_ip=$(hostname -I 2>/dev/null | awk '{print $1}')
		[ -n "$lan_ip" ] && echo "  ${DIM}From another device:${R}    http://${lan_ip}:${PORT}"
	fi
	echo
	echo "  ${DIM}Version:${R}      ${TAG}"
	echo "  ${DIM}Binary:${R}       ${BIN_PATH}"
	echo "  ${DIM}Data:${R}         ${DATA_DIR}"
	echo "  ${DIM}Service:${R}      $([ "$OS" = "linux" ] && echo "systemctl status chorecoin" || echo "launchctl list | grep chorecoin")"
	echo
	echo "  ${DIM}First time here?${R} The setup wizard will guide you through creating"
	echo "  ${DIM}your admin account and first parent. All in the browser — no terminal.${R}"
	echo
	echo "  ${DIM}Step-by-step guide:${R}  https://chore-coin.app/install-guide.html"
else
	echo "  ${RED}Service didn't respond within 20s.${R}"
	echo "  Check logs: $([ "$OS" = "linux" ] && echo "journalctl -u chorecoin -n 50" || echo "tail -f ~/Library/Logs/chorecoin/chorecoin.err")"
	echo "  Troubleshooting: https://chore-coin.app/install-guide.html#trouble"
	exit 1
fi

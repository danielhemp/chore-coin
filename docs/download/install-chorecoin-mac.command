#!/bin/sh
# Chore Coin — Mac double-click launcher.
#
# This file is a launcher: double-click it on a Mac to open Terminal
# automatically, walk through the license prompt, and run the real installer.
# The .command extension is what makes macOS treat this as double-clickable.
#
# What it does:
#   1. Shows a welcome message so you know what's happening.
#   2. Asks for your license key (or reads it from a companion file if you
#      downloaded the pre-personalized version).
#   3. Runs the same install.sh that the "copy this in Terminal" flow uses.
#   4. Keeps the Terminal window open so you can read the output.
#
# You may see a "cannot be opened because it is from an unidentified
# developer" warning the first time. That's macOS being cautious about
# any file downloaded from the internet. To bypass it once:
#   1. Right-click (or Control-click) this file → "Open"
#   2. Click "Open" in the confirmation dialog
# After you allow it once, you can double-click normally forever.
#
# For the full guide, see: https://chore-coin.app/install-guide.html

# Change to the folder this file lives in so the license lookup works even
# if the user runs from a different working directory.
cd "$(dirname "$0")" 2>/dev/null || true

# --- ANSI helpers ---
B="$(printf '\033[1m')"; R="$(printf '\033[0m')"
GREEN="$(printf '\033[32m')"; DIM="$(printf '\033[2m')"; CYAN="$(printf '\033[36m')"

clear
echo ""
echo "${B}🪙  Chore Coin — Mac Installer${R}"
echo ""
echo "  This will download and install Chore Coin on your Mac."
echo "  It takes about 30 seconds. You'll see progress as it works."
echo ""
echo "  ${DIM}When it's done, Chore Coin will be running as a background"
echo "  service and will start automatically every time you log in.${R}"
echo ""
echo "  ${CYAN}More detail: https://chore-coin.app/install-guide.html${R}"
echo ""
echo "  Press Return to begin, or close this window to cancel."
read -r _dummy

echo ""
echo "${B}Step 1 of 2 — License key${R}"
echo ""

# If a companion .license file sits next to this launcher, use it. Otherwise
# ask interactively. This lets us support both a generic download AND a
# pre-personalized flow (Lemon Squeezy can bake the key into a per-buyer zip).
LICENSE=""
if [ -f "./license.txt" ]; then
	LICENSE=$(head -n1 ./license.txt | tr -d ' \t\r\n')
	echo "  Found license key in companion license.txt file:"
	echo "  ${GREEN}${LICENSE}${R}"
	echo ""
fi
if [ -z "$LICENSE" ]; then
	echo "  Copy your license key from your Chore Coin purchase email."
	echo "  It looks like: CHRC-XXXX-XXXX-XXXX-XXXX"
	echo ""
	printf "  License key: "
	read -r LICENSE
	LICENSE=$(printf "%s" "$LICENSE" | tr -d ' \t\r\n' | tr '[:lower:]' '[:upper:]')
	echo ""
fi

if [ -z "$LICENSE" ]; then
	echo "  ${DIM}(no key provided — cancelling)${R}"
	echo ""
	echo "  Press Return to close this window."
	read -r _dummy
	exit 1
fi

echo "${B}Step 2 of 2 — Installing Chore Coin${R}"
echo ""

# Hand off to the real installer, with the license key set. install.sh
# handles OS detection, download, checksum verification, and launchd
# registration. It'll print its own progress lines as it runs.
export CHORECOIN_LICENSE="$LICENSE"
curl -fsSL https://raw.githubusercontent.com/danielhemp/chore-coin/main/install.sh | sh
STATUS=$?

echo ""
if [ $STATUS -eq 0 ]; then
	echo "${GREEN}${B}All done!${R} You can close this window."
	echo ""
	echo "  ${DIM}Follow the Step-by-step guide link above to finish setup${R}"
	echo "  ${DIM}in your browser (create your admin + first parent account).${R}"
else
	echo "  ${DIM}Something didn't finish cleanly. See the error above,${R}"
	echo "  ${DIM}or check the troubleshooting section of the install guide:${R}"
	echo "  https://chore-coin.app/install-guide.html#trouble"
fi
echo ""
echo "  Press Return to close this window."
read -r _dummy

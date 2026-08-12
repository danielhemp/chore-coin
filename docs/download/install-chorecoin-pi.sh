#!/bin/sh
# Chore Coin — Raspberry Pi / Linux launcher.
#
# Save this file to your Pi (or Linux computer), then run it from a terminal:
#   sh install-chorecoin-pi.sh
#
# Or make it executable and double-click from a file manager:
#   chmod +x install-chorecoin-pi.sh
#   ./install-chorecoin-pi.sh
#
# What it does:
#   1. Shows a welcome message so you know what's happening.
#   2. Asks for your license key (or reads it from a companion file).
#   3. Runs the same install.sh that the "copy this in Terminal" flow uses.
#
# On Raspberry Pi OS Desktop, if double-clicking opens the script in a
# text editor instead of running it, right-click → "Execute" or
# "Open in Terminal" instead.
#
# For the full guide: https://chore-coin.app/install-guide.html

cd "$(dirname "$0")" 2>/dev/null || true

# --- ANSI helpers ---
B="$(printf '\033[1m')"; R="$(printf '\033[0m')"
GREEN="$(printf '\033[32m')"; DIM="$(printf '\033[2m')"; CYAN="$(printf '\033[36m')"

clear
echo ""
echo "${B}🪙  Chore Coin — Raspberry Pi / Linux Installer${R}"
echo ""
echo "  This will download and install Chore Coin on this computer."
echo "  It takes about 30 seconds. You'll see progress as it works."
echo ""
echo "  ${DIM}When it's done, Chore Coin will be running as a background"
echo "  service and will start automatically every time the computer boots.${R}"
echo ""
echo "  ${CYAN}More detail: https://chore-coin.app/install-guide.html${R}"
echo ""
echo "  Press Return to begin, or press Ctrl+C to cancel."
read -r _dummy

echo ""
echo "${B}Step 1 of 2 — License key${R}"
echo ""

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
	exit 1
fi

echo "${B}Step 2 of 2 — Installing Chore Coin${R}"
echo ""

export CHORECOIN_LICENSE="$LICENSE"
curl -fsSL https://raw.githubusercontent.com/danielhemp/chore-coin/main/install.sh | sh
STATUS=$?

echo ""
if [ $STATUS -eq 0 ]; then
	echo "${GREEN}${B}All done!${R}"
	echo ""
	echo "  ${DIM}Follow the Step-by-step guide link above to finish setup${R}"
	echo "  ${DIM}in your browser (create your admin + first parent account).${R}"
else
	echo "  ${DIM}Something didn't finish cleanly. See the error above,${R}"
	echo "  ${DIM}or check the troubleshooting section of the install guide:${R}"
	echo "  https://chore-coin.app/install-guide.html#trouble"
fi
echo ""

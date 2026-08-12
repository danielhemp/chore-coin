#!/bin/sh
# Chore Coin demo-data seeder.
#
# Populates a fresh Chore Coin instance with a realistic-looking family
# ("the Rivera family") so you can take screenshots or record demo videos
# without exposing your real family's data.
#
# Prereqs:
#   1. A Chore Coin instance already running (make run or ./bin/chorecoin serve).
#   2. Setup wizard already completed with the parent credentials below (or
#      override them via env vars).
#   3. `jq` installed. macOS: `brew install jq`. Linux: `apt install jq`.
#
# Env overrides:
#   BASE_URL          Chore Coin URL (default http://127.0.0.1:18090)
#   PARENT_EMAIL      Parent to auth as (default jordan@demo.local)
#   PARENT_PASSWORD   Parent password (default demopassword)
#
# What you get after this runs:
#   - Two kids: Alex (👦, age 11) with a username/PIN login, and Sam (👧, age 8)
#   - 5 base chores each (make bed, brush teeth, read 20 min, etc.)
#   - 5 bonus chores (empty dishwasher, take out trash, vacuum, fold laundry, wash car)
#   - 5 reward items (movie night, pick dinner, stay up late, new book, extra screen hour)
#   - Coin balances: Alex 47, Sam 22
#   - A handful of pending completions in the approvals queue (chore + reward requests)
#   - Ledger entries so the history view doesn't look empty
#
# Idempotency: the script REFUSES to run if any kid already exists in the
# instance, so you can't accidentally corrupt a real family's data. To reseed,
# nuke the data dir and re-run the setup wizard first.

set -eu

BASE_URL="${BASE_URL:-http://127.0.0.1:18090}"
PARENT_EMAIL="${PARENT_EMAIL:-jordan@demo.local}"
PARENT_PASSWORD="${PARENT_PASSWORD:-demopassword}"

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

command -v curl >/dev/null 2>&1 || die "curl required"
command -v jq   >/dev/null 2>&1 || die "jq required (brew install jq / apt install jq)"

say "Chore Coin demo seeder"
info "target: $BASE_URL"
info "parent: $PARENT_EMAIL"

# ---- health check ---------------------------------------------------------
curl -fsS "${BASE_URL}/api/health" >/dev/null 2>&1 \
	|| die "$BASE_URL is not responding. Start the app first (make run) and complete the setup wizard."

# ---- auth -----------------------------------------------------------------
say "Signing in as parent..."
AUTH_RESP=$(curl -fsS -X POST "${BASE_URL}/api/collections/users/auth-with-password" \
	-H 'Content-Type: application/json' \
	-d "$(jq -n --arg id "$PARENT_EMAIL" --arg pw "$PARENT_PASSWORD" \
	      '{identity:$id, password:$pw}')") \
	|| die "auth failed — is the wizard done with parent=${PARENT_EMAIL}?"

TOKEN=$(printf "%s" "$AUTH_RESP" | jq -r '.token')
PARENT_ID=$(printf "%s" "$AUTH_RESP" | jq -r '.record.id')
[ -n "$TOKEN" ] && [ "$TOKEN" != "null" ] || die "auth response had no token"
ok "signed in as $PARENT_EMAIL (id: $PARENT_ID)"

AUTHZ="Authorization: Bearer ${TOKEN}"

# ---- idempotency: refuse if kids already exist ----------------------------
EXISTING_KIDS=$(curl -fsS "${BASE_URL}/api/collections/kids/records?perPage=1" \
	-H "$AUTHZ" | jq -r '.items | length')
if [ "${EXISTING_KIDS:-0}" -gt 0 ]; then
	die "kids already exist on this instance. This script only runs on a clean install so it can't accidentally corrupt real data. Nuke the data dir and re-run the wizard first."
fi

# ---- helper: POST JSON, return response body -------------------------------
post_json() {
	# args: url, json-body
	curl -fsS -X POST "$1" \
		-H "$AUTHZ" \
		-H 'Content-Type: application/json' \
		-d "$2"
}

# ---- create kids via /api/custom/create-kid --------------------------------
say "Creating kids..."
ALEX_RESP=$(post_json "${BASE_URL}/api/custom/create-kid" "$(jq -n \
	'{displayName:"Alex", avatarEmoji:"👦", kidUsername:"alex", kidPin:"1111"}')")
ALEX_ID=$(printf "%s" "$ALEX_RESP" | jq -r '.kidId')
[ -n "$ALEX_ID" ] && [ "$ALEX_ID" != "null" ] || die "failed to create Alex: $ALEX_RESP"
ok "Alex → $ALEX_ID (login: alex / 1111)"

SAM_RESP=$(post_json "${BASE_URL}/api/custom/create-kid" "$(jq -n \
	'{displayName:"Sam", avatarEmoji:"👧", kidUsername:"sam", kidPin:"1111"}')")
SAM_ID=$(printf "%s" "$SAM_RESP" | jq -r '.kidId')
[ -n "$SAM_ID" ] && [ "$SAM_ID" != "null" ] || die "failed to create Sam: $SAM_RESP"
ok "Sam → $SAM_ID (login: sam / 1111)"

# ---- base chores ----------------------------------------------------------
say "Creating base chores..."
create_base_chore() {
	# args: kidId, title, order
	post_json "${BASE_URL}/api/collections/base_chores/records" \
		"$(jq -n --arg kidId "$1" --arg title "$2" --argjson order "$3" \
			'{kidId:$kidId, title:$title, order:$order, active:true}')" >/dev/null
	ok "base: $2 (order $3)"
}

# Alex — 5 base chores
create_base_chore "$ALEX_ID" "Make your bed"    1
create_base_chore "$ALEX_ID" "Brush teeth"       2
create_base_chore "$ALEX_ID" "Feed the dog"      3
create_base_chore "$ALEX_ID" "Read 20 minutes"   4
create_base_chore "$ALEX_ID" "Pack school bag"   5

# Sam — 4 base chores (age-appropriate, no dog + no bag)
create_base_chore "$SAM_ID"  "Make your bed"     1
create_base_chore "$SAM_ID"  "Brush teeth"       2
create_base_chore "$SAM_ID"  "Read 20 minutes"   3
create_base_chore "$SAM_ID"  "Put toys away"     4

# ---- bonus chores (shared, assignedTo "all") ------------------------------
say "Creating bonus chores..."
create_bonus_chore() {
	# args: title, coinValue, maxPerDay
	post_json "${BASE_URL}/api/collections/bonus_chores/records" \
		"$(jq -n --arg title "$1" --argjson value "$2" --argjson cap "$3" \
			'{title:$title, coinValue:$value, assignedTo:"all", recurring:"daily", maxPerDay:$cap, active:true}')" >/dev/null
	ok "bonus: $1 (${2} 🪙, max ${3}/day)"
}

create_bonus_chore "Empty the dishwasher" 3 1
create_bonus_chore "Take out the trash"   5 1
create_bonus_chore "Vacuum living room"   8 0
create_bonus_chore "Fold laundry"         6 0
create_bonus_chore "Wash the car"        15 0

# ---- reward items ---------------------------------------------------------
say "Creating reward menu..."
create_reward() {
	# args: title, description, emoji, coinCost
	post_json "${BASE_URL}/api/collections/reward_items/records" \
		"$(jq -n --arg title "$1" --arg desc "$2" --arg emoji "$3" --argjson cost "$4" \
			'{title:$title, description:$desc, emoji:$emoji, coinCost:$cost, active:true}')" >/dev/null
	ok "reward: $1 (${4} 🪙)"
}

create_reward "Movie night"          "You pick the movie"          "🎬" 10
create_reward "Pick dinner"          "Anything under \$25"         "🍕" 15
create_reward "Stay up 30 min late"  "School nights only"          "🌙" 12
create_reward "New book"             "Up to \$15"                  "📚" 25
create_reward "Extra screen hour"    "Weekends only"               "🎮" 20

# ---- coin balances via adjust-coins ---------------------------------------
say "Setting coin balances..."
post_json "${BASE_URL}/api/custom/adjust-coins" \
	"$(jq -n --arg kidId "$ALEX_ID" '{kidId:$kidId, amount:47, note:"Starting balance for demo"}')" >/dev/null
ok "Alex → 47 🪙"

post_json "${BASE_URL}/api/custom/adjust-coins" \
	"$(jq -n --arg kidId "$SAM_ID" '{kidId:$kidId, amount:22, note:"Starting balance for demo"}')" >/dev/null
ok "Sam  → 22 🪙"

# ---- a couple pending items in the approvals inbox ------------------------
say "Adding pending items to the approvals inbox..."

# Get one of Alex's base chores to reference
ALEX_BASE_ID=$(curl -fsS "${BASE_URL}/api/collections/base_chores/records?filter=$(printf 'kidId="%s"' "$ALEX_ID" | jq -sRr @uri)&perPage=1" \
	-H "$AUTHZ" | jq -r '.items[0].id')
ALEX_BASE_TITLE="Make your bed"

# Get first bonus chore id/title
BONUS_ROW=$(curl -fsS "${BASE_URL}/api/collections/bonus_chores/records?perPage=1" -H "$AUTHZ" | jq '.items[0]')
BONUS_ID=$(printf "%s" "$BONUS_ROW" | jq -r '.id')
BONUS_TITLE=$(printf "%s" "$BONUS_ROW" | jq -r '.title')
BONUS_VALUE=$(printf "%s" "$BONUS_ROW" | jq -r '.coinValue')

TODAY=$(date -u +%Y-%m-%d)

# Pending base completion for Alex
post_json "${BASE_URL}/api/collections/completions/records" \
	"$(jq -n --arg kidId "$ALEX_ID" --arg choreId "$ALEX_BASE_ID" --arg title "$ALEX_BASE_TITLE" --arg forDate "$TODAY" \
		'{kidId:$kidId, choreType:"base", choreId:$choreId, choreTitle:$title, forDate:$forDate, status:"pending"}')" >/dev/null
ok "pending: Alex — \"$ALEX_BASE_TITLE\""

# Pending bonus completion for Sam
post_json "${BASE_URL}/api/collections/completions/records" \
	"$(jq -n --arg kidId "$SAM_ID" --arg choreId "$BONUS_ID" --arg title "$BONUS_TITLE" --argjson value "$BONUS_VALUE" --arg forDate "$TODAY" \
		'{kidId:$kidId, choreType:"bonus", choreId:$choreId, choreTitle:$title, coinValue:$value, forDate:$forDate, status:"pending"}')" >/dev/null
ok "pending: Sam — bonus \"$BONUS_TITLE\" (${BONUS_VALUE} 🪙)"

# Pending reward request for Alex
FIRST_REWARD=$(curl -fsS "${BASE_URL}/api/collections/reward_items/records?perPage=1" -H "$AUTHZ" | jq '.items[0]')
REWARD_ID=$(printf "%s" "$FIRST_REWARD" | jq -r '.id')
post_json "${BASE_URL}/api/custom/request-reward" \
	"$(jq -n --arg kidId "$ALEX_ID" --arg rewardId "$REWARD_ID" \
		'{kidId:$kidId, rewardId:$rewardId}')" >/dev/null
ok "pending: Alex — reward request"

echo
say "Demo seed complete!"
echo
echo "  ${DIM}Parent login:${R}  ${PARENT_EMAIL} / ${PARENT_PASSWORD}"
echo "  ${DIM}Alex login:${R}    username=alex  pin=1111"
echo "  ${DIM}Sam login:${R}     username=sam   pin=1111"
echo "  ${DIM}Open:${R}          ${BASE_URL}"
echo
echo "  Open the app in your browser, sign in as each user to grab screenshots"
echo "  of the parent inbox, the kid home, the reward menu, and the family"
echo "  dashboard."

#!/usr/bin/env bash
#
# learnharness-dev — Development launcher for LearnHarness.
#
# Runs LearnHarness directly from the local working tree with:
#   - Isolated development data directory (.dev-state/data)
#   - Isolated authentication store (.dev-state/auth.json)
#   - Isolated Electron userData (LearnHarness-dev)
#   - Debug logging enabled (DEBUG=learnharness:*, ELECTRON_ENABLE_LOGGING=1)
#   - Complete isolation from production state and ~/.config/LearnHarness
#
# Usage:
#   learnharness-dev              # Starts desktop app (Next.js dev + Electron shell)
#   learnharness-dev --web        # Starts web dev server only (no Electron)
#   learnharness-dev --port 3000  # Specify custom port (default: 3000)
#   learnharness-dev --clean      # Wipe .dev-state before starting
#

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="3000"
WEB_ONLY=false
CLEAN=false

usage() {
	sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'
}

while [ $# -gt 0 ]; do
	case "$1" in
	--port)
		[ $# -ge 2 ] || { echo "error: --port requires a port number" >&2; exit 1; }
		PORT="$2"
		shift 2
		;;
	--port=*)
		PORT="${1#--port=}"
		shift
		;;
	--web)
		WEB_ONLY=true
		shift
		;;
	--clean)
		CLEAN=true
		shift
		;;
	-h | --help)
		usage
		exit 0
		;;
	*)
		echo "error: unknown argument: $1" >&2
		usage >&2
		exit 1
		;;
	esac
done

if ! [[ "$PORT" =~ ^[0-9]+$ ]]; then
	echo "error: --port must be a numeric port, got: \"$PORT\"" >&2
	exit 1
fi

DEV_STATE="$ROOT/.dev-state"

if [ "$CLEAN" = "true" ]; then
	echo "[learnharness-dev] Cleaning development state at $DEV_STATE..."
	rm -rf "$DEV_STATE"
fi

mkdir -p "$DEV_STATE/data"

export LH_DATA_DIR="$DEV_STATE/data"
export LH_AUTH_FILE="$DEV_STATE/auth.json"
export PORT="$PORT"
export NODE_ENV="development"
export DEBUG="${DEBUG:-learnharness:*}"
export ELECTRON_ENABLE_LOGGING="1"

# Touch auth.json if not present
if [ ! -f "$LH_AUTH_FILE" ]; then
	echo "{}" > "$LH_AUTH_FILE"
	chmod 0600 "$LH_AUTH_FILE"
fi

echo "=========================================================="
echo "  LearnHarness Dev Launcher"
echo "  Mode       : $([ "$WEB_ONLY" = "true" ] && echo "Web Server Only" || echo "Desktop Shell (Electron + Next.js)")"
echo "  Worktree   : $ROOT"
echo "  Dev State  : $DEV_STATE"
echo "  Auth File  : $LH_AUTH_FILE"
echo "  Dev URL    : http://localhost:$PORT"
echo "  Debug Log  : enabled ($DEBUG)"
echo "=========================================================="

cd "$ROOT"

if [ "$WEB_ONLY" = "true" ]; then
	exec npm run dev
else
	export LH_DEV_URL="http://localhost:$PORT"
	exec npx concurrently -k \
		"next dev -p $PORT" \
		"node -e 'const http=require(\"http\"); const check=()=>http.get(\"http://localhost:$PORT\",r=>{if(r.statusCode===200)process.exit(0);else setTimeout(check,500);}).on(\"error\",()=>setTimeout(check,500)); check();' && npx electron ."
fi

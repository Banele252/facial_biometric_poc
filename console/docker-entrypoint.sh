#!/bin/sh
# Writes the runtime config.js at container start so a single
# image can be promoted across environments without a rebuild.
#
# Runs from /docker-entrypoint.d/, which the official nginx image sources
# before starting the server.

set -eu

# Written outside the web root so the image can run with a read-only
# root filesystem; nginx aliases /config.js onto this path.
CONFIG_DIR="${CONSOLE_CONFIG_DIR:-/tmp/console}"
CONFIG_FILE="${CONFIG_DIR}/config.js"

mkdir -p "$CONFIG_DIR"

# Escape backslashes, double quotes, and newlines for safe JS string literals.
js_escape() {
    printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr -d '\n\r'
}

emit() {
    printf '    "%s": "%s",\n' "$1" "$(js_escape "${2:-}")"
}

{
    echo '// Generated at container start. Do not edit.'
    echo 'window.__CONSOLE_CONFIG__ = {'
    # Empty API_BASE_URL means same-origin: nginx proxies /api and /auth.
    emit 'API_BASE_URL'      "${CONSOLE_API_BASE_URL:-}"
    emit 'MANAGEMENT_PATH'   "${CONSOLE_MANAGEMENT_PATH:-/api/v1/management}"
    emit 'API_KEY'           "${CONSOLE_API_KEY:-}"
    emit 'GEO_FENCE'         "${CONSOLE_GEO_FENCE:-ZA-jnb}"
    emit 'CONSOLE_USERNAME'  "${CONSOLE_USERNAME:-}"
    emit 'CONSOLE_PASSWORD'  "${CONSOLE_PASSWORD:-}"
    emit 'CONSOLE_SCOPE'     "${CONSOLE_SCOPE:-biometric:read rica:read admin:docs}"
    emit 'POLL_INTERVAL_MS'  "${CONSOLE_POLL_INTERVAL_MS:-15000}"
    echo '};'
} > "$CONFIG_FILE"

# config.js carries credentials into the browser — never let a CDN or
# intermediary cache it. nginx.conf sets no-store on this path too.
echo "[console] wrote ${CONFIG_FILE}"

if [ -z "${CONSOLE_UPSTREAM:-}" ]; then
    echo "[console] warning: CONSOLE_UPSTREAM is not set; /api and /auth will 502" >&2
fi

#!/usr/bin/env bash
# One-command FINN: API (8000) + Next (3000). Safe to re-run.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

API_PORT=8000
WEB_PORT=3000
LOG_DIR="${TMPDIR:-/tmp}/finn-logs"
mkdir -p "$LOG_DIR"

port_up() {
  local p="$1"
  lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1
}

ensure_api() {
  if port_up "$API_PORT"; then
    echo "✓ API already on :$API_PORT"
    return
  fi
  if [[ ! -x "$ROOT/.venv/bin/uvicorn" ]]; then
    echo "Creating .venv + installing API deps…"
    python3 -m venv "$ROOT/.venv"
    "$ROOT/.venv/bin/pip" install -q -r "$ROOT/backend/requirements.txt"
  fi
  echo "→ Starting API on :$API_PORT"
  (
    cd "$ROOT/backend"
    env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy -u ALL_PROXY -u all_proxy \
      "$ROOT/.venv/bin/uvicorn" app.main:app --app-dir . --host 127.0.0.1 --port "$API_PORT" --reload --reload-dir .
  ) >"$LOG_DIR/api.log" 2>&1 &
  for i in $(seq 1 30); do
    if curl -sf "http://127.0.0.1:$API_PORT/health" >/dev/null 2>&1; then
      echo "✓ API ready  http://127.0.0.1:$API_PORT/docs"
      return
    fi
    sleep 0.4
  done
  echo "✗ API failed to start — see $LOG_DIR/api.log"
  tail -40 "$LOG_DIR/api.log" || true
  exit 1
}

ensure_web() {
  if [[ ! -d "$ROOT/node_modules" ]]; then
    echo "→ npm install…"
    npm install
  fi
  if port_up "$WEB_PORT"; then
    # Reuse if healthy
    if curl -sf "http://127.0.0.1:$WEB_PORT/" >/dev/null 2>&1; then
      echo "✓ Web already on :$WEB_PORT"
      return
    fi
    echo "Port $WEB_PORT busy but unhealthy — freeing it"
    lsof -nP -iTCP:"$WEB_PORT" -sTCP:LISTEN -t 2>/dev/null | xargs kill 2>/dev/null || true
    sleep 1
  fi
  echo "→ Starting Next on :$WEB_PORT"
  npm run dev >"$LOG_DIR/web.log" 2>&1 &
  for i in $(seq 1 40); do
    if curl -sf "http://127.0.0.1:$WEB_PORT/" >/dev/null 2>&1; then
      echo "✓ Web ready  http://127.0.0.1:$WEB_PORT"
      return
    fi
    sleep 0.5
  done
  echo "✗ Web failed to start — see $LOG_DIR/web.log"
  tail -40 "$LOG_DIR/web.log" || true
  exit 1
}

ensure_api
ensure_web

if curl -sf "http://127.0.0.1:$WEB_PORT/finn-api/health" >/dev/null 2>&1; then
  echo "✓ Proxy   http://127.0.0.1:$WEB_PORT/finn-api → API"
else
  echo "⚠ Proxy health check failed — restart web if quotes look empty"
fi

echo
echo "FINN is running"
echo "  App:      http://127.0.0.1:$WEB_PORT/home"
echo "  Demo:     http://127.0.0.1:$WEB_PORT/demo"
echo "  Research: http://127.0.0.1:$WEB_PORT/research/INFY"
echo "  API docs: http://127.0.0.1:$API_PORT/docs"
echo "  Logs:     $LOG_DIR/"
echo
if command -v open >/dev/null 2>&1; then
  open "http://127.0.0.1:$WEB_PORT/demo" 2>/dev/null || true
fi
echo "Keep this terminal open. Ctrl+C stops this helper only;"
echo "servers keep running in background. To stop them:"
echo "  lsof -tiTCP:$WEB_PORT,TCP:$API_PORT -sTCP:LISTEN | xargs kill"

#!/usr/bin/env bash
# Tests de bout en bout : construit l'application en mode production, la lance
# face à un faux serveur Supabase Auth et à une base Postgres locale, puis
# pilote un vrai navigateur (Playwright).
#
#   E2E_DATABASE_URL  base de test, migrations appliquées (défaut : iqra_dev en local)
#   E2E_PORT          port de l'application (défaut : 3200)
#
# Prérequis : Playwright disponible pour Node (`require("playwright")`), psql.
set -euo pipefail
cd "$(dirname "$0")/../.."

PORT="${E2E_PORT:-3200}"
DB="${E2E_DATABASE_URL:-postgresql://iqra:iqra@localhost:5432/iqra_dev}"
OUT="${E2E_OUT:-tests/e2e/.captures}"
mkdir -p "$OUT"

cleanup() { kill "${MOCK_PID:-}" "${APP_PID:-}" 2>/dev/null || true; }
trap cleanup EXIT

node tests/e2e/mock-supabase-auth.mjs > "$OUT/mock-auth.log" 2>&1 &
MOCK_PID=$!

DIRECT_URL="$DB" DATABASE_URL="$DB" npx prisma migrate deploy > "$OUT/migrate.log" 2>&1
DIRECT_URL="$DB" DATABASE_URL="$DB" node scripts/check-db-security.mjs

NEXT_TELEMETRY_DISABLED=1 \
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399 \
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_test \
  npx next build > "$OUT/build.log" 2>&1

NEXT_TELEMETRY_DISABLED=1 \
AUTH_ALLOWED_USER_ID=11111111-1111-4111-8111-111111111111 \
DATABASE_URL="$DB" \
  npx next start -p "$PORT" > "$OUT/app.log" 2>&1 &
APP_PID=$!
for _ in $(seq 1 40); do curl -s -o /dev/null "http://localhost:$PORT/connexion" && break; sleep 0.5; done

status=0
node tests/e2e/socle.test.cjs "http://localhost:$PORT" "$OUT" || status=1
E2E_DATABASE_URL="$DB" node tests/e2e/categories.test.cjs "http://localhost:$PORT" "$OUT" || status=1
exit $status

#!/usr/bin/env bash
# Tests de bout en bout : construit l'application en mode production, la lance
# face à un faux serveur Supabase Auth et à une base Postgres locale, puis
# pilote un vrai navigateur (Playwright).
#
#   E2E_DATABASE_URL  base de test, migrations appliquées (défaut : iqra_dev en local)
#   E2E_PORT          port de l'application (défaut : 3200)
#   E2E_AUTH_PORT     port du faux serveur Supabase Auth (défaut : 54399)
#   E2E_ONLY          ne lancer que certaines suites, ex. E2E_ONLY="adherents cheques"
#   DATABASE_CA_CERT  certificat racine, si la base de test n'est pas sur localhost
#                     (la liaison est alors chiffrée et vérifiée, comme en production)
#
# Prérequis : Playwright disponible pour Node (`require("playwright")`), psql.
set -euo pipefail
cd "$(dirname "$0")/../.."

PORT="${E2E_PORT:-3200}"
AUTH_PORT="${E2E_AUTH_PORT:-54399}"
DB="${E2E_DATABASE_URL:-postgresql://iqra:iqra@localhost:5432/iqra_dev}"
OUT="${E2E_OUT:-tests/e2e/.captures}"
mkdir -p "$OUT"

cleanup() { kill "${MOCK_PID:-}" "${APP_PID:-}" 2>/dev/null || true; }
trap cleanup EXIT

if curl -s -o /dev/null "http://localhost:$PORT/"; then
  echo "✗ Le port $PORT est déjà utilisé : arrêtez le serveur en cours ou changez E2E_PORT." >&2
  exit 1
fi

MOCK_AUTH_PORT="$AUTH_PORT" node tests/e2e/mock-supabase-auth.mjs > "$OUT/mock-auth.log" 2>&1 &
MOCK_PID=$!

DIRECT_URL="$DB" DATABASE_URL="$DB" npx prisma migrate deploy > "$OUT/migrate.log" 2>&1
DIRECT_URL="$DB" DATABASE_URL="$DB" npx tsx scripts/check-db-security.ts

NEXT_TELEMETRY_DISABLED=1 \
NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:$AUTH_PORT" \
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_test \
  npx next build > "$OUT/build.log" 2>&1

NEXT_TELEMETRY_DISABLED=1 \
AUTH_ALLOWED_USER_ID=11111111-1111-4111-8111-111111111111 \
CRON_SECRET=e2e-cron-secret-0123456789 RESEND_API_KEY=re_e2e_test \
DATABASE_URL="$DB" DATABASE_CA_CERT="${DATABASE_CA_CERT:-}" \
  node node_modules/next/dist/bin/next start -p "$PORT" > "$OUT/app.log" 2>&1 &
APP_PID=$!
for _ in $(seq 1 40); do curl -s -o /dev/null "http://localhost:$PORT/connexion" && break; sleep 0.5; done

# Les tentatives de connexion ratées des tests ne doivent pas bloquer les suivants.
reset_attempts() { psql "$DB" -q -c "delete from login_attempts" > /dev/null; }

# Chaque suite part d'une base sans données métier (elle charge ce dont elle a besoin).
wipe() {
  psql "$DB" -q -v ON_ERROR_STOP=1 -c "delete from receipts; delete from installments; delete from payment_plans; delete from transactions; delete from members; delete from receipt_counters; delete from settings; delete from login_attempts;" > /dev/null
}

# Le socle d'abord, puis les autres suites par ordre alphabétique.
suites="socle $(ls tests/e2e/*.test.cjs | xargs -n1 basename | sed 's/\.test\.cjs$//' | grep -v '^socle$' | sort | tr '\n' ' ')"
[ -n "${E2E_ONLY:-}" ] && suites="$E2E_ONLY"

status=0
for suite in $suites; do
  echo "── $suite"
  wipe
  E2E_DATABASE_URL="$DB" E2E_MOCK_AUTH="http://127.0.0.1:$AUTH_PORT" \
    node "tests/e2e/$suite.test.cjs" "http://localhost:$PORT" "$OUT" || status=1
done
wipe
exit $status

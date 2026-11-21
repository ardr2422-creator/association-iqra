// Vérifie que la base est verrouillée avant chaque mise en ligne :
//  1. toutes les tables du schéma `public` ont la sécurité RLS activée ;
//  2. les rôles de l'API publique de Supabase (`anon`, `authenticated`) n'ont
//     aucun droit sur ces tables.
// Sort avec une erreur (et bloque le déploiement) si ce n'est pas le cas.
//
// Usage : npm run db:check
import { config as loadEnv } from "dotenv";
import pg from "pg";

loadEnv({ path: [".env.local", ".env.development.local", ".env"], quiet: true });

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("✗ DIRECT_URL / DATABASE_URL manquante : impossible de vérifier la base.");
  process.exit(1);
}

const client = new pg.Client({ connectionString });
const problems = [];

try {
  await client.connect();

  const withoutRls = await client.query(`
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
    ORDER BY 1`);
  for (const row of withoutRls.rows) {
    problems.push(`la table « ${row.table_name} » n'a pas la sécurité RLS activée`);
  }

  const exposed = await client.query(`
    SELECT r.rolname AS role_name, c.relname AS table_name
    FROM pg_roles r
    CROSS JOIN pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE r.rolname IN ('anon', 'authenticated')
      AND n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
      AND (
        (c.relkind = 'S' AND has_sequence_privilege(r.oid, c.oid, 'USAGE, SELECT, UPDATE'))
        OR (c.relkind <> 'S' AND has_table_privilege(r.oid, c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'))
      )
    ORDER BY 1, 2`);
  for (const row of exposed.rows) {
    problems.push(`le rôle public « ${row.role_name} » a encore des droits sur « ${row.table_name} »`);
  }
} catch (error) {
  console.error("✗ Vérification impossible :", error instanceof Error ? error.message : error);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}

if (problems.length > 0) {
  console.error("✗ La base n'est pas correctement verrouillée :");
  for (const problem of problems) console.error("  - " + problem);
  console.error("Corrigez par une migration (ENABLE ROW LEVEL SECURITY / REVOKE) avant de déployer.");
  process.exit(1);
}
console.log("✓ Base verrouillée : RLS activé partout, aucun droit pour l'API publique.");

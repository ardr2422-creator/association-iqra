// Vérifie que la base est verrouillée avant chaque mise en ligne :
//  1. la connexion est chiffrée (hors base locale) ;
//  2. toutes les tables du schéma `public` ont la sécurité RLS activée, sans
//     aucune règle (l'application n'en a pas besoin : elle passe par Prisma) ;
//  3. les rôles de l'API publique de Supabase (`anon`, `authenticated`) n'ont
//     aucun droit sur les tables, colonnes, séquences et fonctions.
// Sort avec une erreur (et bloque le déploiement) si ce n'est pas le cas.
//
// Usage : npm run db:check
import { config as loadEnv } from "dotenv";
import pg from "pg";
import {
  databaseCaCert,
  isLocalDatabase,
  migrationDatabaseUrl,
  MISSING_CA_MESSAGE,
  pgConnectionOptions,
} from "../src/lib/db-connection";

loadEnv({ path: [".env.local", ".env.development.local", ".env"], quiet: true });

async function main(): Promise<string[]> {
  const connectionString = migrationDatabaseUrl();
  if (!connectionString) {
    throw new Error("Adresse de la base manquante (DATABASE_URL) : impossible de vérifier la base.");
  }

  const problems: string[] = [];
  const client = new pg.Client(pgConnectionOptions(connectionString));
  await client.connect();

  try {
    if (!isLocalDatabase(connectionString)) {
      const tls = await client.query(
        "SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()",
      );
      if (tls.rows[0]?.ssl !== true) problems.push("la connexion à la base n'est pas chiffrée");
      else console.log("✓ Connexion à la base chiffrée, certificat du serveur vérifié.");
    }

    const withoutRls = await client.query(`
      SELECT c.relname AS name
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
      ORDER BY 1`);
    for (const row of withoutRls.rows) {
      problems.push(`la table « ${row.name} » n'a pas la sécurité RLS activée`);
    }

    const policies = await client.query(`
      SELECT tablename AS name, policyname AS policy FROM pg_policies
      WHERE schemaname = 'public' ORDER BY 1, 2`);
    for (const row of policies.rows) {
      problems.push(`la table « ${row.name} » a une règle RLS (« ${row.policy} ») : aucune n'est attendue`);
    }

    const relations = await client.query(`
      SELECT r.rolname AS role, c.relname AS name
      FROM pg_roles r
      CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE r.rolname IN ('anon', 'authenticated')
        AND n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
        AND (
          (c.relkind = 'S' AND has_sequence_privilege(r.oid, c.oid, 'USAGE, SELECT, UPDATE'))
          OR (c.relkind <> 'S' AND (
            has_table_privilege(r.oid, c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
            OR has_any_column_privilege(r.oid, c.oid, 'SELECT, INSERT, UPDATE, REFERENCES')
          ))
        )
      ORDER BY 1, 2`);
    for (const row of relations.rows) {
      problems.push(`le rôle public « ${row.role} » a encore des droits sur « ${row.name} »`);
    }

    const functions = await client.query(`
      SELECT r.rolname AS role, p.proname AS name
      FROM pg_roles r
      CROSS JOIN pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE r.rolname IN ('anon', 'authenticated')
        AND n.nspname = 'public' AND p.prokind IN ('f', 'p')
        AND has_function_privilege(r.oid, p.oid, 'EXECUTE')
      ORDER BY 1, 2`);
    for (const row of functions.rows) {
      problems.push(`le rôle public « ${row.role} » peut exécuter la fonction « ${row.name} »`);
    }
  } finally {
    await client.end().catch(() => {});
  }
  return problems;
}

main().then(
  (problems) => {
    if (problems.length === 0) {
      console.log("✓ Base verrouillée : RLS partout, aucune règle, aucun droit pour l'API publique.");
      return;
    }
    console.error("✗ La base n'est pas correctement verrouillée :");
    for (const problem of problems) console.error("  - " + problem);
    console.error("Corrigez par une migration (ENABLE ROW LEVEL SECURITY / REVOKE) avant de déployer.");
    process.exit(1);
  },
  (error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error("✗ Vérification impossible :", message);
    if (/certificate|self.signed|issuer/i.test(message) && !databaseCaCert()) {
      console.error("  " + MISSING_CA_MESSAGE);
    }
    process.exit(1);
  },
);

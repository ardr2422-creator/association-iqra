import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";
import {
  databaseCaCert,
  isLocalDatabase,
  migrationDatabaseUrl,
  MISSING_CA_MESSAGE,
  prismaCliUrl,
} from "./src/lib/db-connection";

// Mêmes fichiers que Next.js. Le premier fichier qui définit une variable gagne :
// `.env.local` (vos identifiants) passe donc avant `.env`.
loadEnv({ path: [".env.local", ".env.development.local", ".env"], quiet: true });

/**
 * Adresse utilisée uniquement par les commandes `prisma` (migrations, studio).
 * DIRECT_URL = connexion directe à Postgres ; l'application, elle, lit DATABASE_URL.
 * Hors machine locale, la connexion est chiffrée et le certificat du serveur vérifié.
 */
function cliDatabaseUrl(): string | undefined {
  const raw = migrationDatabaseUrl();
  if (!raw) return undefined; // `prisma generate` n'a pas besoin de la base
  if (isLocalDatabase(raw)) return raw;

  const ca = databaseCaCert();
  if (!ca) {
    // Sans certificat, la vérification stricte fera échouer la connexion : on ne
    // migre jamais sur une liaison dont l'autre bout n'est pas authentifié.
    console.warn(`⚠ ${MISSING_CA_MESSAGE}`);
    return prismaCliUrl(raw, null);
  }
  const caFile = join(mkdtempSync(join(tmpdir(), "iqra-ca-")), "ca.pem");
  writeFileSync(caFile, ca + "\n", { mode: 0o600 });
  return prismaCliUrl(raw, caFile);
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: cliDatabaseUrl(),
  },
});

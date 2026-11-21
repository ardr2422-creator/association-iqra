import { SUPABASE_CA_CERT } from "./db-ca";

/*
 * Connexion chiffrée à la base de données.
 *
 * Par défaut, le pilote Postgres de Node n'utilise PAS de chiffrement tant
 * qu'on ne le lui demande pas. Dès que la base n'est pas sur la machine
 * elle-même, on impose donc TLS avec vérification du certificat ET du nom du
 * serveur : avec le certificat racine fourni (DATABASE_CA_CERT), sinon avec les
 * autorités reconnues par le système. Dans les deux cas, un serveur dont
 * l'identité ne peut pas être prouvée est refusé : rien ne part en clair.
 *
 * Ce module ne dépend pas de Next.js : il sert aussi aux scripts et à Prisma.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Paramètres TLS qu'une adresse de connexion pourrait contenir, toutes syntaxes confondues. */
const TLS_PARAMS = [
  "sslmode",
  "sslaccept",
  "sslcert",
  "sslkey",
  "sslrootcert",
  "sslidentity",
  "sslpassword",
  "sslnegotiation",
  "uselibpqcompat",
];

/**
 * Adresse de la base pour l'application. `POSTGRES_PRISMA_URL` est le nom posé
 * automatiquement quand la base Supabase est reliée au projet depuis Vercel
 * (onglet Storage) : aucun mot de passe à copier à la main.
 */
export function runtimeDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || undefined;
}

/** Adresse pour les migrations (connexion directe, hors « transaction pooler »). */
export function migrationDatabaseUrl(): string | undefined {
  return (
    process.env.DIRECT_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    runtimeDatabaseUrl()
  );
}

export function isLocalDatabase(connectionString: string): boolean {
  return LOCAL_HOSTS.has(new URL(connectionString).hostname);
}

/** Certificat racine (PEM) : variable DATABASE_CA_CERT, sinon celui du dépôt. */
export function databaseCaCert(): string | null {
  const fromEnv = process.env.DATABASE_CA_CERT?.replace(/\\n/g, "\n").trim();
  const pem = fromEnv || SUPABASE_CA_CERT.trim();
  return pem.includes("BEGIN CERTIFICATE") ? pem : null;
}

/** À afficher quand la vérification du certificat échoue sans certificat racine fourni. */
export const MISSING_CA_MESSAGE =
  "Le certificat de la base n'est pas reconnu. Téléchargez celui de Supabase " +
  "(Database → Settings → SSL Configuration) et collez-le dans la variable DATABASE_CA_CERT.";

/** Seuls paramètres d'adresse conservés ; tout le reste (TLS compris) est retiré. */
const KEPT_PARAMS = new Set(["application_name", "options", "schema", "pgbouncer", "connection_limit", "connect_timeout"]);

function withoutTlsParams(connectionString: string): URL {
  const url = new URL(connectionString);
  for (const param of [...url.searchParams.keys()]) {
    if (TLS_PARAMS.includes(param) || !KEPT_PARAMS.has(param)) url.searchParams.delete(param);
  }
  return url;
}

export type PgConnectionOptions = {
  connectionString: string;
  ssl?: { ca?: string; rejectUnauthorized: true };
};

/** Options pour node-postgres (pg.Pool, pg.Client, adaptateur Prisma). */
export function pgConnectionOptions(connectionString: string): PgConnectionOptions {
  if (isLocalDatabase(connectionString)) return { connectionString };

  const ca = databaseCaCert();

  // Les paramètres TLS de l'adresse l'emporteraient sur `ssl` : on les retire
  // pour qu'aucun `sslmode=disable` ou `no-verify` ne puisse affaiblir la connexion.
  const url = withoutTlsParams(connectionString);
  for (const param of ["schema", "pgbouncer", "connection_limit", "connect_timeout"]) {
    url.searchParams.delete(param); // paramètres destinés à Prisma, inconnus de node-postgres
  }
  return {
    connectionString: url.toString(),
    ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: true },
  };
}

/**
 * Adresse pour les commandes `prisma` (migrations) : mêmes exigences, exprimées
 * avec les paramètres que comprend le moteur de migration. `caFile` est le
 * chemin d'un fichier contenant le certificat racine.
 */
export function prismaCliUrl(connectionString: string, caFile: string | null): string {
  if (isLocalDatabase(connectionString)) return connectionString;
  const url = withoutTlsParams(connectionString);
  url.searchParams.set("sslmode", "require");
  url.searchParams.set("sslaccept", "strict");
  if (caFile) url.searchParams.set("sslcert", caFile);
  return url.toString();
}

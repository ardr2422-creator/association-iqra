// Vérifie la configuration avant une mise en ligne, avec des messages clairs.
// Lancé par `npm run vercel-build` pour la production.
import { config as loadEnv } from "dotenv";
import { databaseCaCert, isLocalDatabase, MISSING_CA_MESSAGE } from "../src/lib/db-connection";

loadEnv({ path: [".env.local", ".env.development.local", ".env"], quiet: true });

const problems: string[] = [];
const required = (name: string, hint: string) => {
  if (!process.env[name]?.trim()) problems.push(`${name} est vide — ${hint}`);
};

required("NEXT_PUBLIC_SUPABASE_URL", "l'adresse du projet Supabase (Project Settings → API).");
required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "la clé « publishable » du projet Supabase.");
required("AUTH_ALLOWED_USER_ID", "l'identifiant (UID) du compte de la trésorière.");
required("DATABASE_URL", "l'adresse de connexion à la base (Connect → ORMs → Prisma).");

for (const name of ["DATABASE_URL", "DIRECT_URL"]) {
  const value = process.env[name]?.trim();
  if (!value) continue;
  try {
    if (!isLocalDatabase(value) && !databaseCaCert()) problems.push(MISSING_CA_MESSAGE);
  } catch {
    problems.push(`${name} n'est pas une adresse de connexion valide.`);
  }
}

const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
if (/service_role|sb_secret/.test(publishable)) {
  problems.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY contient une clé SECRÈTE : remplacez-la par la clé « publishable ».");
}

if (problems.length > 0) {
  console.error("✗ Configuration incomplète :");
  for (const problem of [...new Set(problems)]) console.error("  - " + problem);
  process.exit(1);
}
console.log("✓ Configuration complète.");

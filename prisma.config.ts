import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// Mêmes fichiers que Next.js. Le premier fichier qui définit une variable gagne :
// `.env.local` (vos identifiants) passe donc avant `.env`.
loadEnv({ path: [".env.local", ".env.development.local", ".env"], quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Utilisé uniquement par les commandes `prisma` (migrations, studio).
    // DIRECT_URL = connexion directe à Postgres ; l'application, elle, lit DATABASE_URL.
    url: process.env.DIRECT_URL || process.env.DATABASE_URL,
  },
});

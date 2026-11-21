import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { pgConnectionOptions, runtimeDatabaseUrl } from "@/lib/db-connection";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  const connectionString = runtimeDatabaseUrl();
  if (!connectionString) {
    throw new Error("DATABASE_URL n'est pas définie : la base de données est inaccessible.");
  }
  const adapter = new PrismaPg(
    {
      // Chiffrement TLS vérifié dès que la base n'est pas locale.
      ...pgConnectionOptions(connectionString),
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    },
    { onPoolError: (error) => console.error("[base de données]", error.message) },
  );
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    transactionOptions: { maxWait: 5_000, timeout: 10_000 },
  });
}

/**
 * Accès à la base de données (Prisma). Le client est créé au premier appel,
 * pas à l'import : le build fonctionne même sans DATABASE_URL. Une seule
 * instance est partagée (y compris entre les rechargements en développement).
 *
 * Rappel : chaque fonction qui lit ou écrit des données commence par
 * `await requireUser()`.
 */
export function getDb(): PrismaClient {
  globalForPrisma.prisma ??= createPrismaClient();
  return globalForPrisma.prisma;
}

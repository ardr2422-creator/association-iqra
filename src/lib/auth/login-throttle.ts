import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { getDb } from "@/lib/db";

/*
 * Limite des tentatives de connexion (anti-force brute).
 *
 * - 5 échecs en 15 minutes depuis la même adresse IP : cette adresse est bloquée.
 * - 20 échecs en 15 minutes sur le même email, toutes adresses confondues :
 *   l'email est bloqué (protège contre une attaque répartie sur de nombreuses
 *   adresses ; en contrepartie, quelqu'un qui connaît l'email peut gêner la
 *   connexion pendant qu'il s'acharne — jamais l'obtenir).
 *
 * Rien de lisible n'est stocké : seulement des empreintes (SHA-256).
 */

const WINDOW_MS = 15 * 60 * 1000;
const RETENTION_MS = 24 * 60 * 60 * 1000;
const IP_LIMIT = 5;
const EMAIL_LIMIT = 20;

export type LoginThrottle = { blocked: boolean; ipKey: string; emailKey: string };

function fingerprint(kind: "ip" | "email", value: string): string {
  const digest = createHash("sha256").update(`${kind}:${value}`).digest("hex").slice(0, 40);
  return `${kind}:${digest}`;
}

/** Adresse du visiteur. Sur Vercel, ces en-têtes sont posés par la plateforme et ne peuvent pas être falsifiés. */
async function clientAddress(): Promise<string> {
  const requestHeaders = await headers();
  const address =
    requestHeaders.get("x-real-ip") ?? requestHeaders.get("x-forwarded-for")?.split(",")[0];
  return address?.trim() || "inconnue";
}

export async function checkLoginThrottle(email: string): Promise<LoginThrottle> {
  const ipKey = fingerprint("ip", await clientAddress());
  const emailKey = fingerprint("email", email);
  const since = new Date(Date.now() - WINDOW_MS);
  const db = getDb();

  const [ipFailures, emailFailures] = await Promise.all([
    db.loginAttempt.count({ where: { key: ipKey, createdAt: { gte: since } } }),
    db.loginAttempt.count({ where: { key: emailKey, createdAt: { gte: since } } }),
  ]);

  return { blocked: ipFailures >= IP_LIMIT || emailFailures >= EMAIL_LIMIT, ipKey, emailKey };
}

export async function recordLoginFailure(throttle: LoginThrottle): Promise<void> {
  const db = getDb();
  await db.loginAttempt.createMany({ data: [{ key: throttle.ipKey }, { key: throttle.emailKey }] });
  // Ménage : on ne garde rien au-delà de 24 heures.
  await db.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - RETENTION_MS) } } });
}

export async function clearLoginFailures(throttle: LoginThrottle): Promise<void> {
  await getDb().loginAttempt.deleteMany({ where: { key: { in: [throttle.ipKey, throttle.emailKey] } } });
}

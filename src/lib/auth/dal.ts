import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { LOGIN_HREF } from "@/lib/navigation";
import { getAuthMode, isAllowedUser } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type SessionUser = { id: string; email: string | null };

/**
 * L'utilisatrice connectée, ou `null`. Le jeton est vérifié (signature) à
 * chaque requête : on ne fait jamais confiance au simple contenu du cookie.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  // Marque le rendu comme dépendant de la requête (Supabase lit l'heure courante).
  await connection();

  const mode = getAuthMode();
  if (mode === "demo") return { id: "demo", email: "demo@iqra.test" };
  if (mode !== "supabase") throw new Error("L'authentification n'est pas configurée.");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data || !isAllowedUser(data.claims.sub)) return null;
  return { id: data.claims.sub, email: data.claims.email ?? null };
});

/**
 * À appeler au début de CHAQUE lecture de données et de CHAQUE action serveur :
 * le proxy et les layouts ne suffisent pas à protéger les données.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(LOGIN_HREF);
  return user;
}

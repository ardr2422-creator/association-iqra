import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { LOGIN_HREF } from "@/lib/navigation";
import { getAuthMode, isAllowedUser } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type SessionUser = { id: string; email: string | null };

/**
 * L'utilisatrice connectée, ou `null`.
 *
 * La session est validée auprès du serveur d'authentification à chaque requête
 * (`getUser`) : un cookie volé cesse de fonctionner dès la déconnexion, le
 * changement de mot de passe ou la suppression du compte. On ne fait jamais
 * confiance au simple contenu du cookie. En cas d'erreur réseau : accès refusé.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  // Marque le rendu comme dépendant de la requête (Supabase lit l'heure courante).
  await connection();

  const mode = getAuthMode();
  if (mode === "demo") return { id: "demo", email: "demo@iqra.test" };
  if (mode !== "supabase") throw new Error("L'authentification n'est pas configurée.");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user || !isAllowedUser(data.user.id)) return null;
  return { id: data.user.id, email: data.user.email ?? null };
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

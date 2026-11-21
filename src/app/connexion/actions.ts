"use server";

import { redirect } from "next/navigation";
import { safeNext } from "@/lib/auth/safe-next";
import { getAuthMode, isAllowedUser } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/** `attempt` change à chaque refus : le message est ré-annoncé même s'il est identique. */
export type LoginState = { error: string; email: string; attempt: number } | undefined;

const GENERIC_ERROR = "Email ou mot de passe incorrect.";

export async function login(previous: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const refuse = (error: string): LoginState => ({
    error,
    email,
    attempt: (previous?.attempt ?? 0) + 1,
  });

  if (!email || !password || email.length > 254 || password.length > 256) {
    return refuse(GENERIC_ERROR);
  }
  if (getAuthMode() !== "supabase") {
    return refuse("L'authentification n'est pas configurée.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.status === 429) {
      return refuse("Trop de tentatives. Réessayez dans quelques minutes.");
    }
    if (error.status === 400) return refuse(GENERIC_ERROR);
    return refuse("Connexion impossible pour le moment. Réessayez dans un instant.");
  }
  if (!isAllowedUser(data.user.id)) {
    // Visible uniquement dans les journaux du serveur, pour diagnostiquer un
    // AUTH_ALLOWED_USER_ID mal renseigné. Le visiteur, lui, voit le message générique.
    console.warn("[auth] connexion refusée : ce compte n'est pas le compte autorisé", data.user.id);
    await supabase.auth.signOut({ scope: "local" });
    return refuse(GENERIC_ERROR);
  }

  // `redirect` lève une exception interne : ne jamais l'entourer d'un try/catch.
  redirect(safeNext(formData.get("next")));
}

/** Ferme la session. La redirection est faite côté navigateur (rechargement complet). */
export async function logout(): Promise<void> {
  if (getAuthMode() !== "supabase") return;
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  // Si la déconnexion globale échoue, on efface au moins la session de ce navigateur.
  if (error) await supabase.auth.signOut({ scope: "local" });
}

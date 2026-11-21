"use server";

import { redirect } from "next/navigation";
import { safeNext } from "@/lib/auth/safe-next";
import { getAuthMode, isAllowedUser } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error: string; email: string } | undefined;

const GENERIC_ERROR = "Email ou mot de passe incorrect.";

export async function login(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password || email.length > 254 || password.length > 256) {
    return { error: GENERIC_ERROR, email };
  }
  if (getAuthMode() !== "supabase") {
    return { error: "L'authentification n'est pas configurée.", email };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.status === 429) {
      return { error: "Trop de tentatives. Réessayez dans quelques minutes.", email };
    }
    if (error.status === 400) return { error: GENERIC_ERROR, email };
    return { error: "Connexion impossible pour le moment. Réessayez dans un instant.", email };
  }
  if (!isAllowedUser(data.user.id)) {
    await supabase.auth.signOut({ scope: "local" });
    return { error: GENERIC_ERROR, email };
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

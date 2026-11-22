"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import {
  checkLoginThrottle,
  clearLoginFailures,
  recordLoginFailure,
  type LoginThrottle,
} from "@/lib/auth/login-throttle";
import { safeNext } from "@/lib/auth/safe-next";
import {
  AUTH_COOKIE_OPTIONS,
  getAuthMode,
  isAllowedUser,
  sessionCookieOptions,
  SUPABASE_KEY,
  SUPABASE_URL,
} from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/** `attempt` change à chaque refus : le message est ré-annoncé même s'il est identique. */
export type LoginState = { error: string; email: string; attempt: number } | undefined;

const GENERIC_ERROR = "Email ou mot de passe incorrect.";
const TOO_MANY = "Trop de tentatives. Réessayez dans quelques minutes.";
const UNAVAILABLE = "Connexion impossible pour le moment. Réessayez dans un instant.";

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

  // Anti-force brute : au-delà de la limite, on ne consulte même plus Supabase.
  let throttle: LoginThrottle;
  try {
    throttle = await checkLoginThrottle(email);
  } catch (error) {
    console.error("[auth] limite de tentatives indisponible", error);
    return refuse(UNAVAILABLE);
  }
  if (throttle.blocked) return refuse(TOO_MANY);

  // Les cookies de session sont mis de côté, et posés seulement une fois le
  // compte vérifié : la réponse à un refus est identique dans tous les cas
  // (mauvais mot de passe, ou bon mot de passe d'un compte non autorisé).
  const pendingCookies = new Map<string, { value: string; options: CookieOptions }>();
  const supabase = createServerClient(SUPABASE_URL!, SUPABASE_KEY!, {
    cookieOptions: AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll: () => [],
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          pendingCookies.set(name, { value, options });
        }
      },
    },
  });

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Le motif exact (mot de passe faux, email non confirmé, connexion par email
    // désactivée…) n'est visible que dans les journaux du serveur, jamais à l'écran.
    console.warn("[auth] connexion refusée par Supabase :", error.code ?? error.status ?? "motif inconnu");
    if (error.status === 429) return refuse(TOO_MANY);
    if (error.status !== 400) return refuse(UNAVAILABLE);
    await recordLoginFailure(throttle).catch(logThrottleError);
    return refuse(GENERIC_ERROR);
  }

  if (!isAllowedUser(data.user.id)) {
    // Visible uniquement dans les journaux du serveur, pour diagnostiquer un
    // AUTH_ALLOWED_USER_ID mal renseigné. Le visiteur, lui, voit le message générique.
    console.warn("[auth] connexion refusée : ce compte n'est pas le compte autorisé", data.user.id);
    await recordLoginFailure(throttle).catch(logThrottleError);
    await supabase.auth.signOut({ scope: "global" });
    return refuse(GENERIC_ERROR);
  }

  await clearLoginFailures(throttle).catch(logThrottleError);
  const cookieStore = await cookies();
  for (const [name, { value, options }] of pendingCookies) {
    cookieStore.set(name, value, sessionCookieOptions(value, options));
  }

  // `redirect` lève une exception interne : ne jamais l'entourer d'un try/catch.
  redirect(safeNext(formData.get("next")));
}

function logThrottleError(error: unknown): void {
  console.error("[auth] enregistrement de la tentative impossible", error);
}

/** Ferme la session. La redirection est faite côté navigateur (rechargement complet). */
export async function logout(): Promise<void> {
  if (getAuthMode() !== "supabase") return;
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  // Si la déconnexion globale échoue, on efface au moins la session de ce navigateur.
  if (error) await supabase.auth.signOut({ scope: "local" });
}

import type { CookieOptionsWithName } from "@supabase/ssr";

/**
 * Configuration de l'authentification.
 *
 * Les variables NEXT_PUBLIC_* doivent être référencées telles quelles
 * (pas de `process.env[name]`) pour être injectées au moment du build.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export type AuthMode = "supabase" | "demo" | "misconfigured";

/**
 * - `supabase` : fonctionnement normal.
 * - `demo` : uniquement en développement, si Supabase n'est pas configuré
 *   ET que AUTH_DEMO_MODE=1 est posé explicitement. Jamais en production.
 * - `misconfigured` : tout est bloqué (aucune page servie). C'est aussi le cas
 *   en production tant que AUTH_ALLOWED_USER_ID n'est pas renseigné.
 */
export function getAuthMode(): AuthMode {
  if (SUPABASE_URL && SUPABASE_KEY) {
    if (process.env.NODE_ENV === "production" && !allowedUserId()) return "misconfigured";
    return "supabase";
  }
  if (process.env.NODE_ENV !== "production" && process.env.AUTH_DEMO_MODE === "1") {
    return "demo";
  }
  return "misconfigured";
}

function allowedUserId(): string {
  return (process.env.AUTH_ALLOWED_USER_ID ?? "").trim().toLowerCase();
}

/**
 * Un seul compte a accès à l'application : celui de la trésorière.
 * En production, AUTH_ALLOWED_USER_ID est obligatoire ; sans lui, personne n'entre.
 */
export function isAllowedUser(userId: string | undefined): boolean {
  if (!userId) return false;
  const allowed = allowedUserId();
  if (allowed) return userId.toLowerCase() === allowed;
  return process.env.NODE_ENV !== "production";
}

/**
 * Options identiques pour tous les clients Supabase (proxy et serveur).
 * `httpOnly` : le cookie de session est illisible depuis JavaScript, donc hors
 * de portée d'un script malveillant. Aucun client Supabase ne tourne dans le
 * navigateur : toute l'authentification passe par le serveur.
 */
export const AUTH_COOKIE_OPTIONS: CookieOptionsWithName = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  secure: process.env.NODE_ENV === "production",
};

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
 * - `misconfigured` : tout est bloqué (aucune page servie).
 */
export function getAuthMode(): AuthMode {
  if (SUPABASE_URL && SUPABASE_KEY) return "supabase";
  if (process.env.NODE_ENV !== "production" && process.env.AUTH_DEMO_MODE === "1") {
    return "demo";
  }
  return "misconfigured";
}

/**
 * Un seul compte a accès à l'application : celui de la trésorière.
 * En production, AUTH_ALLOWED_USER_ID est obligatoire ; sans lui, personne n'entre.
 */
export function isAllowedUser(userId: string | undefined): boolean {
  if (!userId) return false;
  const allowed = process.env.AUTH_ALLOWED_USER_ID;
  if (allowed) return userId === allowed;
  return process.env.NODE_ENV !== "production";
}

/** Options identiques pour tous les clients Supabase (proxy, serveur, navigateur). */
export const AUTH_COOKIE_OPTIONS: CookieOptionsWithName = {
  secure: process.env.NODE_ENV === "production",
};

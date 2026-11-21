import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { AUTH_COOKIE_OPTIONS, SUPABASE_KEY, SUPABASE_URL } from "./env";

/** Client Supabase côté serveur. À créer à chaque appel, jamais au niveau du module. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL!, SUPABASE_KEY!, {
    cookieOptions: AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Pendant le rendu d'un composant serveur, on ne peut pas écrire de cookie :
          // le proxy a déjà rafraîchi la session, on peut ignorer.
        }
      },
    },
  });
}

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { safeNext } from "@/lib/auth/safe-next";
import { LOGIN_HREF } from "@/lib/navigation";
import {
  AUTH_COOKIE_OPTIONS,
  getAuthMode,
  isAllowedUser,
  sessionCookieOptions,
  sessionExpired,
  SUPABASE_KEY,
  SUPABASE_URL,
} from "@/lib/supabase/env";

/** Seuls fichiers servis sans session (lecture uniquement) : l'icône du site. */
const PUBLIC_FILES = new Set(["/icon.svg"]);

/**
 * Rappel quotidien des chèques, appelé par Vercel Cron : pas de session
 * possible, la route vérifie elle-même le secret CRON_SECRET.
 */
const CRON_PATH = "/api/cron/rappels";

/**
 * Toutes les pages sont protégées : sans session valide, on est renvoyé vers
 * la page de connexion. Le proxy rafraîchit aussi la session Supabase.
 * En cas de doute (erreur réseau, configuration absente), l'accès est refusé.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search, searchParams } = request.nextUrl;
  const isLogin = pathname === LOGIN_HREF;
  const isRead = request.method === "GET" || request.method === "HEAD";

  if (isRead && PUBLIC_FILES.has(pathname)) return NextResponse.next();

  const mode = getAuthMode();
  if (mode === "misconfigured") {
    return new NextResponse(
      "Iqra Compta : l'authentification n'est pas configurée. Vérifiez les variables NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY et AUTH_ALLOWED_USER_ID.",
      { status: 503, headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" } },
    );
  }
  if (pathname === CRON_PATH && request.method === "GET") return NextResponse.next();

  if (mode === "demo") {
    return isLogin && isRead
      ? NextResponse.redirect(new URL("/", request.url))
      : NextResponse.next();
  }

  const pendingCookies: { name: string; value: string; options: CookieOptions }[] = [];
  const pendingHeaders: Record<string, string> = {};
  let authenticated = false;

  try {
    const supabase = createServerClient(SUPABASE_URL!, SUPABASE_KEY!, {
      cookieOptions: AUTH_COOKIE_OPTIONS,
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, headers) {
          // Visible par getAll() et par le rendu de cette même requête.
          for (const { name, value } of cookiesToSet) {
            if (value) request.cookies.set(name, value);
            else request.cookies.delete(name);
          }
          pendingCookies.push(...cookiesToSet);
          Object.assign(pendingHeaders, headers);
        },
      },
    });
    // Premier filtre, rapide : rafraîchit le jeton si besoin et vérifie sa signature.
    // La validation complète auprès de Supabase est faite avant chaque accès aux
    // données (voir `requireUser`).
    const { data, error } = await supabase.auth.getClaims();
    authenticated = !error && !!data && isAllowedUser(data.claims.sub);

    // Session de plus de 12 heures : on la ferme, il faut se reconnecter.
    if (authenticated && data && sessionExpired(data.claims, Date.now() / 1000)) {
      authenticated = false;
      await supabase.auth.signOut({ scope: "local" });
    }
  } catch {
    authenticated = false;
  }

  // Chaque réponse emporte les cookies rafraîchis (ou effacés).
  const finish = (response: NextResponse) => {
    for (const { name, value, options } of pendingCookies) {
      response.cookies.set(name, value, sessionCookieOptions(value, options));
    }
    for (const [key, value] of Object.entries(pendingHeaders)) {
      response.headers.set(key, value);
    }
    return response;
  };

  if (!authenticated && !isLogin) {
    if (!isRead) {
      // Action serveur avec une session expirée : message lisible côté client.
      return finish(
        new NextResponse("Votre session a expiré. Rechargez la page pour vous reconnecter.", {
          status: 401,
          headers: { "content-type": "text/plain" },
        }),
      );
    }
    const loginUrl = new URL(LOGIN_HREF, request.url);
    if (pathname !== "/") loginUrl.searchParams.set("next", pathname + search);
    return finish(NextResponse.redirect(loginUrl));
  }

  if (authenticated && isLogin && isRead) {
    return finish(
      NextResponse.redirect(new URL(safeNext(searchParams.get("next")), request.url)),
    );
  }

  // Construit APRÈS getClaims() : transmet l'en-tête Cookie rafraîchi au rendu.
  return finish(NextResponse.next({ request }));
}

// Tout passe par le proxy, sauf les fichiers internes de Next.js (scripts, styles,
// polices). Aucune exception par extension : une adresse comme « /x.png » ne
// contourne donc pas le contrôle.
export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};

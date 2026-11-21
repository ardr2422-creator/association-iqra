import { LOGIN_HREF } from "@/lib/navigation";

const BASE = "http://internal.invalid";

/**
 * Nettoie le paramètre `next` (page à rouvrir après connexion) : seuls les
 * chemins internes sont acceptés, pour éviter toute redirection vers un autre site.
 */
export function safeNext(raw: unknown): string {
  if (
    typeof raw !== "string" ||
    !raw.startsWith("/") ||
    raw.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(raw)
  ) {
    return "/";
  }
  try {
    const url = new URL(raw, BASE);
    // Vérification APRÈS normalisation : « /.//evil.com » devient « //evil.com ».
    const path = url.pathname + url.search;
    if (url.origin !== BASE || path.startsWith("//") || url.pathname.startsWith(LOGIN_HREF)) {
      return "/";
    }
    return path;
  } catch {
    return "/";
  }
}

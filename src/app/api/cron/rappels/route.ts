import { createHash, timingSafeEqual } from "node:crypto";
import { connection } from "next/server";
import { todayIsoDay } from "@/lib/days";
import { collectReminders, cronSecret, remindersConfigured, sendReminderEmail } from "@/lib/services/reminders";

/*
 * Rappel quotidien des chèques (Vercel Cron, chaque matin).
 *
 * Cette adresse est la seule que le proxy laisse passer sans session : elle
 * est protégée par le secret CRON_SECRET, que Vercel envoie dans l'en-tête
 * Authorization. Elle ne renvoie jamais de donnée : seulement un compte rendu.
 */

function plain(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

/** Comparaison à durée constante (sur des empreintes de même longueur). */
function sameSecret(received: string, expected: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(received), digest(expected));
}

export async function GET(request: Request): Promise<Response> {
  await connection();

  const secret = cronSecret();
  if (!secret || !remindersConfigured()) return plain("Les rappels par email ne sont pas configurés.", 503);

  const header = request.headers.get("authorization") ?? "";
  if (!sameSecret(header, `Bearer ${secret}`)) return plain("Accès refusé.", 401);

  try {
    const digest = await collectReminders(todayIsoDay());
    const count = digest.late.length + digest.soon.length;
    if (count === 0) return plain("Aucun chèque à rappeler.", 200);
    if (!digest.recipient) return plain("Aucune adresse de rappel n'est renseignée dans les paramètres.", 200);

    const sent = await sendReminderEmail(digest.recipient, digest);
    return sent ? plain(`Rappel envoyé (${count}).`, 200) : plain("L'envoi du rappel a échoué.", 502);
  } catch (error) {
    console.error("[rappels] échec", error);
    return plain("Le rappel a échoué.", 500);
  }
}

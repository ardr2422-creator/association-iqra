import "server-only";
import { addDays, fromDbDay } from "@/lib/days";
import { getDb } from "@/lib/db";
import { formatEuros, formatLongDate, formatShortDay, parseIsoDay, plural } from "@/lib/format";
import { installmentLabel, type PaymentMethod } from "@/lib/payments";
import { paymentTitle } from "@/lib/services/money";

/*
 * Rappel quotidien des chèques à encaisser (Vercel Cron → /api/cron/rappels).
 *
 * Ce service ne vérifie PAS de session : il n'est appelé que par la route du
 * rappel, elle-même protégée par le secret CRON_SECRET. Il ne fait que lire.
 */

/** Chèques à encaisser dans les 3 jours (aujourd'hui compris) ou en retard. */
export const REMINDER_DAYS = 3;

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_SENDER = "Iqra Compta <onboarding@resend.dev>";

/** Le secret doit être long : Vercel recommande au moins 16 caractères aléatoires. */
export function cronSecret(): string | null {
  const secret = process.env.CRON_SECRET?.trim();
  return secret && secret.length >= 16 ? secret : null;
}

/** Clé d'envoi Resend (nom `RESEND_API_KEY`, ou `RESEND_KEY` accepté aussi). */
function resendApiKey(): string | null {
  return process.env.RESEND_API_KEY?.trim() || process.env.RESEND_KEY?.trim() || null;
}

export function remindersConfigured(): boolean {
  return Boolean(cronSecret() && resendApiKey());
}

export type ReminderLine = {
  family: string;
  detail: string;
  dueDay: string;
  amountCents: number;
};

export type ReminderDigest = {
  today: string;
  recipient: string | null;
  late: ReminderLine[];
  soon: ReminderLine[];
};

export async function collectReminders(today: string): Promise<ReminderDigest> {
  const db = getDb();
  const limit = addDays(today, REMINDER_DAYS);
  const [settings, rows] = await Promise.all([
    db.settings.findUnique({ where: { id: 1 }, select: { reminderEmail: true, email: true } }),
    db.installment.findMany({
      where: { status: "PLANNED", dueDate: { lte: new Date(`${limit}T00:00:00Z`) } },
      orderBy: [{ dueDate: "asc" }, { number: "asc" }],
      select: {
        number: true,
        amountCents: true,
        dueDate: true,
        method: true,
        plan: {
          select: {
            installmentCount: true,
            label: true,
            member: { select: { name: true } },
            category: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  const lines = rows.map((row) => ({
    family: row.plan.member.name,
    detail: `${installmentLabel(row.method as PaymentMethod, row.number, row.plan.installmentCount)} · ${paymentTitle(row.plan.label, row.plan.category.name)}`,
    dueDay: fromDbDay(row.dueDate),
    amountCents: row.amountCents,
  }));

  return {
    today,
    recipient: settings?.reminderEmail ?? null,
    late: lines.filter((line) => line.dueDay < today),
    soon: lines.filter((line) => line.dueDay >= today),
  };
}

/** Rend un texte inoffensif dans du HTML (les noms viennent de la saisie). */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildReminderEmail(digest: ReminderDigest): { subject: string; text: string; html: string } {
  const total = digest.late.length + digest.soon.length;
  const subject =
    digest.late.length > 0
      ? `${plural(total, "chèque")} à encaisser, dont ${digest.late.length} en retard`
      : `${plural(total, "chèque")} à encaisser dans les ${REMINDER_DAYS} jours`;

  const lineText = (line: ReminderLine) =>
    `- ${formatShortDay(parseIsoDay(line.dueDay))} : ${line.family} — ${line.detail} — ${formatEuros(line.amountCents)}`;
  const lineHtml = (line: ReminderLine) =>
    `<tr><td style="padding:8px 12px 8px 0;white-space:nowrap;color:#6B5A5E">${escapeHtml(formatShortDay(parseIsoDay(line.dueDay)))}</td>` +
    `<td style="padding:8px 12px 8px 0"><strong>${escapeHtml(line.family)}</strong><br><span style="color:#6B5A5E">${escapeHtml(line.detail)}</span></td>` +
    `<td style="padding:8px 0;text-align:right;white-space:nowrap;font-weight:600">${escapeHtml(formatEuros(line.amountCents))}</td></tr>`;

  const sections: { title: string; lines: ReminderLine[] }[] = [
    { title: "En retard", lines: digest.late },
    { title: `À encaisser dans les ${REMINDER_DAYS} jours`, lines: digest.soon },
  ].filter((section) => section.lines.length > 0);

  const text = [
    `Bonjour,`,
    ``,
    `Voici les chèques à encaisser au ${formatLongDate(parseIsoDay(digest.today)).toLocaleLowerCase("fr")} :`,
    ...sections.flatMap((section) => ["", `${section.title} :`, ...section.lines.map(lineText)]),
    ``,
    `Pensez à les marquer comme encaissés dans Iqra Compta une fois déposés.`,
  ].join("\n");

  const html =
    `<div style="font-family:Inter,Arial,sans-serif;color:#2A1A1E;max-width:560px">` +
    `<p style="font-size:22px;font-weight:600;color:#7A1F35;margin:0 0 16px">Iqra <span style="font-weight:400;color:#8A7479;font-size:14px">compta</span></p>` +
    `<p>Bonjour,</p><p>Voici les chèques à encaisser.</p>` +
    sections
      .map(
        (section) =>
          `<p style="margin:24px 0 4px;font-weight:600">${escapeHtml(section.title)}</p>` +
          `<table style="width:100%;border-collapse:collapse;font-size:15px">${section.lines.map(lineHtml).join("")}</table>`,
      )
      .join("") +
    `<p style="margin-top:24px;color:#6B5A5E">Pensez à les marquer comme encaissés dans Iqra Compta une fois déposés.</p></div>`;

  return { subject, text, html };
}

/** Envoie le rappel par Resend. Renvoie `false` si l'envoi a échoué (le motif est journalisé). */
export async function sendReminderEmail(recipient: string, digest: ReminderDigest): Promise<boolean> {
  const apiKey = resendApiKey();
  if (!apiKey) return false;
  const { subject, text, html } = buildReminderEmail(digest);

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: process.env.REMINDER_FROM?.trim() || DEFAULT_SENDER,
        to: [recipient],
        subject,
        text,
        html,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      console.error("[rappels] envoi refusé par Resend :", response.status);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[rappels] envoi impossible :", error instanceof Error ? error.name : "erreur inconnue");
    return false;
  }
}

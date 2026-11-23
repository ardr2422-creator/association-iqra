import "server-only";
import { requireUser } from "@/lib/auth/dal";
import { installmentSelect, toInstallmentView } from "@/lib/data/mappers";
import { isIsoMonth, monthBounds, todayIsoDay, toDbDay } from "@/lib/days";
import { getDb } from "@/lib/db";
import type { InstallmentView } from "@/lib/views";

/** Nombre d'échéances déjà encaissées affichées dans l'onglet « Encaissés ». */
const CASHED_LIMIT = 200;

/**
 * Les échéances des paiements : celles en attente (prévues, à encaisser,
 * rejetées) triées par date, et les dernières encaissées. Les paiements réglés
 * en une seule fois ne sont pas des « chèques à suivre » : ils sont exclus.
 */
export async function listInstallments(): Promise<{ today: string; pending: InstallmentView[]; cashed: InstallmentView[] }> {
  await requireUser();
  const db = getDb();
  const today = todayIsoDay();

  const [pending, cashed] = await Promise.all([
    db.installment.findMany({
      where: { status: { not: "CASHED" } },
      orderBy: [{ dueDate: "asc" }, { number: "asc" }],
      select: installmentSelect,
    }),
    db.installment.findMany({
      where: { status: "CASHED", plan: { installmentCount: { gt: 1 } } },
      orderBy: [{ cashedOn: "desc" }, { number: "desc" }],
      take: CASHED_LIMIT,
      select: installmentSelect,
    }),
  ]);

  return {
    today,
    pending: pending.map((row) => toInstallmentView(row, today)),
    cashed: cashed.map((row) => toInstallmentView(row, today)),
  };
}

/**
 * Les échéances d'un mois (« 2026-11 ») pour le calendrier : celles en attente
 * à leur date prévue, celles encaissées à leur date d'encaissement.
 * Renvoie `null` si le mois demandé n'est pas valide.
 */
export async function listMonthInstallments(
  rawMonth: unknown,
): Promise<{ today: string; month: string; items: InstallmentView[] } | null> {
  await requireUser();
  const today = todayIsoDay();
  const month = rawMonth === undefined ? today.slice(0, 7) : rawMonth;
  if (typeof month !== "string" || !isIsoMonth(month) || month < "2000-01" || month > "2100-12") return null;

  const { first, last } = monthBounds(month);
  const range = { gte: toDbDay(first), lte: toDbDay(last) };
  const rows = await getDb().installment.findMany({
    where: {
      OR: [
        { status: { not: "CASHED" }, dueDate: range },
        { status: "CASHED", cashedOn: range },
      ],
    },
    orderBy: [{ dueDate: "asc" }, { number: "asc" }],
    select: installmentSelect,
  });

  return { today, month, items: rows.map((row) => toInstallmentView(row, today)) };
}

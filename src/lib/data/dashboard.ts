import "server-only";
import { requireUser } from "@/lib/auth/dal";
import { addDays, addMonths, fromDbDay, todayIsoDay, toDbDay } from "@/lib/days";
import { getDb } from "@/lib/db";
import { plural } from "@/lib/format";
import { installmentLabel } from "@/lib/payments";
import { paymentTitle } from "@/lib/services/money";
import type { DashboardData, MonthlyFlow, UnpaidCourse, UpcomingCheque } from "@/lib/views";

const MONTH_LABELS = ["Janv", "Févr", "Mars", "Avr", "Mai", "Juin", "Juil", "Août", "Sept", "Oct", "Nov", "Déc"];
const CHART_MONTHS = 6;
const UPCOMING_LIMIT = 6;
const UNPAID_LIMIT = 6;

/** Les chiffres du tableau de bord, calculés sur les mouvements réels. */
export async function getDashboard(): Promise<DashboardData> {
  await requireUser();
  const db = getDb();
  const today = todayIsoDay();
  const firstMonth = addMonths(`${today.slice(0, 7)}-01`, -(CHART_MONTHS - 1));

  const [settings, totals, recent, planned, plans, members] = await Promise.all([
    db.settings.findUnique({ where: { id: 1 }, select: { openingBalanceCents: true } }),
    // Le solde ne compte que l'argent réellement encaissé ou dépensé.
    db.transaction.groupBy({ by: ["type"], where: { status: "COMPLETED" }, _sum: { amountCents: true }, _count: true }),
    db.transaction.findMany({
      where: { status: "COMPLETED", date: { gte: toDbDay(firstMonth) } },
      select: { date: true, type: true, amountCents: true },
    }),
    db.installment.findMany({
      where: { status: "PLANNED" },
      orderBy: [{ dueDate: "asc" }, { number: "asc" }],
      select: {
        id: true,
        number: true,
        amountCents: true,
        dueDate: true,
        method: true,
        plan: {
          select: {
            installmentCount: true,
            label: true,
            memberId: true,
            member: { select: { name: true } },
            category: { select: { name: true } },
          },
        },
      },
    }),
    db.paymentPlan.findMany({
      where: { installments: { some: { status: { not: "CASHED" } } } },
      select: {
        id: true,
        label: true,
        participants: true,
        installmentCount: true,
        memberId: true,
        member: { select: { name: true } },
        category: { select: { name: true } },
        installments: { select: { status: true, amountCents: true } },
      },
    }),
    db.member.count(),
  ]);

  const sumOf = (type: "INCOME" | "EXPENSE") => totals.find((row) => row.type === type)?._sum.amountCents ?? 0;
  const balanceCents = (settings?.openingBalanceCents ?? 0) + sumOf("INCOME") - sumOf("EXPENSE");

  const monthly: MonthlyFlow[] = Array.from({ length: CHART_MONTHS }, (_, index) => {
    const month = addMonths(firstMonth, index);
    return { month, label: MONTH_LABELS[Number(month.slice(5, 7)) - 1], incomeCents: 0, expenseCents: 0 };
  });
  for (const row of recent) {
    const entry = monthly.find((item) => item.month.slice(0, 7) === fromDbDay(row.date).slice(0, 7));
    if (!entry) continue;
    if (row.type === "INCOME") entry.incomeCents += row.amountCents;
    else entry.expenseCents += row.amountCents;
  }

  const inSevenDays = addDays(today, 7);
  const dueDays = planned.map((row) => fromDbDay(row.dueDate));
  const upcoming: UpcomingCheque[] = planned.slice(0, UPCOMING_LIMIT).map((row, index) => ({
    id: row.id,
    memberId: row.plan.memberId,
    family: row.plan.member.name,
    detail: `${installmentLabel(row.method, row.number, row.plan.installmentCount)} · ${paymentTitle(row.plan.label, row.plan.category.name)}`,
    dueDay: dueDays[index],
    amountCents: row.amountCents,
  }));

  const unpaidAll: UnpaidCourse[] = plans
    .map((plan) => {
      const cashed = plan.installments.filter((line) => line.status === "CASHED").length;
      const dueCents = plan.installments
        .filter((line) => line.status !== "CASHED")
        .reduce((sum, line) => sum + line.amountCents, 0);
      const title = paymentTitle(plan.label, plan.category.name);
      return {
        id: plan.id,
        memberId: plan.memberId,
        family: plan.member.name,
        course: plan.participants ? `${title} · ${plural(plan.participants, "inscrit")}` : title,
        progress:
          cashed === 0
            ? "Aucun versement reçu"
            : `${plural(cashed, "versement")} sur ${plan.installmentCount} ${cashed > 1 ? "reçus" : "reçu"}`,
        dueCents,
      };
    })
    .sort((a, b) => b.dueCents - a.dueCents);

  return {
    today,
    balanceCents,
    chequesToCash: planned.length,
    chequesNext7Days: dueDays.filter((day) => day >= today && day < inSevenDays).length,
    chequesLate: dueDays.filter((day) => day < today).length,
    unpaidFamilies: new Set(unpaidAll.map((item) => item.memberId)).size,
    unpaidCents: unpaidAll.reduce((sum, item) => sum + item.dueCents, 0),
    monthly,
    upcoming,
    unpaid: unpaidAll.slice(0, UNPAID_LIMIT),
    empty: members === 0 && totals.every((row) => row._count === 0),
  };
}

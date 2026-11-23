import "server-only";
import { requireUser } from "@/lib/auth/dal";
import { planSelect, toPlanView, toTransactionView, transactionSelect } from "@/lib/data/mappers";
import { fromDbDay, todayIsoDay, toDbDay, yearOf } from "@/lib/days";
import { getDb } from "@/lib/db";
import { toParisIsoDay } from "@/lib/format";
import { idSchema } from "@/lib/validation";
import type { MemberDetail, MemberListItem, MemberOption } from "@/lib/views";

const collator = new Intl.Collator("fr", { sensitivity: "base", numeric: true });

function yearRange(year: number) {
  return { gte: toDbDay(`${year}-01-01`), lte: toDbDay(`${year}-12-31`) };
}

/** Tous les adhérents (archivés compris), triés par nom, avec leurs totaux. */
export async function listMembers(): Promise<MemberListItem[]> {
  await requireUser();
  const db = getDb();
  const today = todayIsoDay();

  const [members, paid, pending] = await Promise.all([
    db.member.findMany({
      select: { id: true, name: true, phone: true, email: true, joinedOn: true, archivedAt: true },
    }),
    db.transaction.groupBy({
      by: ["memberId"],
      where: { type: "INCOME", status: "COMPLETED", memberId: { not: null }, date: yearRange(yearOf(today)) },
      _sum: { amountCents: true },
    }),
    db.installment.findMany({
      where: { status: { not: "CASHED" } },
      orderBy: { dueDate: "asc" },
      select: { amountCents: true, dueDate: true, status: true, plan: { select: { memberId: true } } },
    }),
  ]);

  const paidByMember = new Map(paid.map((row) => [row.memberId, row._sum.amountCents ?? 0]));
  const dueByMember = new Map<string, { remaining: number; late: number; next: MemberListItem["nextDue"] }>();
  for (const line of pending) {
    const entry = dueByMember.get(line.plan.memberId) ?? { remaining: 0, late: 0, next: null };
    const day = fromDbDay(line.dueDate);
    entry.remaining += line.amountCents;
    if (line.status === "PLANNED") {
      if (day < today) entry.late += 1;
      entry.next ??= { day, amountCents: line.amountCents };
    }
    dueByMember.set(line.plan.memberId, entry);
  }

  return members
    .map((member) => {
      const due = dueByMember.get(member.id);
      return {
        id: member.id,
        name: member.name,
        phone: member.phone,
        email: member.email,
        joinedDay: fromDbDay(member.joinedOn),
        archived: member.archivedAt !== null,
        paidThisYearCents: paidByMember.get(member.id) ?? 0,
        remainingCents: due?.remaining ?? 0,
        lateCount: due?.late ?? 0,
        nextDue: due?.next ?? null,
      };
    })
    .sort((a, b) => collator.compare(a.name, b.name));
}

/** Adhérents actifs, pour les listes de choix. */
export async function listMemberOptions(): Promise<MemberOption[]> {
  await requireUser();
  const members = await getDb().member.findMany({
    where: { archivedAt: null },
    select: { id: true, name: true },
  });
  return members.sort((a, b) => collator.compare(a.name, b.name));
}

/** La fiche d'un adhérent, ou `null` s'il n'existe pas. */
export async function getMember(rawId: unknown): Promise<MemberDetail | null> {
  await requireUser();
  const id = idSchema.safeParse(rawId);
  if (!id.success) return null;

  const db = getDb();
  const today = todayIsoDay();
  const year = yearOf(today);

  const member = await db.member.findUnique({
    where: { id: id.data },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      address: true,
      notes: true,
      joinedOn: true,
      archivedAt: true,
      paymentPlans: { orderBy: { createdAt: "desc" }, select: planSelect },
      transactions: {
        where: { type: "INCOME" },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        select: transactionSelect,
      },
    },
  });
  if (!member) return null;

  const plans = member.paymentPlans.map((plan) => toPlanView(plan, today, toParisIsoDay(plan.createdAt)));
  const payments = member.transactions.map(toTransactionView);

  return {
    id: member.id,
    name: member.name,
    phone: member.phone,
    email: member.email,
    address: member.address,
    notes: member.notes,
    joinedDay: fromDbDay(member.joinedOn),
    archived: member.archivedAt !== null,
    deletable: plans.length === 0 && payments.length === 0,
    today,
    year,
    paidThisYearCents: payments
      .filter((payment) => !payment.cancelled && yearOf(payment.day) === year)
      .reduce((sum, payment) => sum + payment.amountCents, 0),
    remainingCents: plans.reduce((sum, plan) => sum + plan.remainingCents, 0),
    plans,
    payments,
  };
}

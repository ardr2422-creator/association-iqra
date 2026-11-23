import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { fromDbDay } from "@/lib/days";
import { installmentLabel, installmentState, METHOD_LABELS } from "@/lib/payments";
import { paymentTitle } from "@/lib/services/money";
import type { InstallmentView, PlanView, TransactionView } from "@/lib/views";

/* Sélections Prisma partagées et conversion des lignes vers les formes affichées. */

export const installmentSelect = {
  id: true,
  planId: true,
  number: true,
  amountCents: true,
  dueDate: true,
  method: true,
  chequeNumber: true,
  bank: true,
  status: true,
  cashedOn: true,
  transaction: { select: { receipt: { select: { id: true, number: true } } } },
  plan: {
    select: {
      installmentCount: true,
      label: true,
      memberId: true,
      member: { select: { name: true } },
      category: { select: { name: true, color: true } },
    },
  },
} satisfies Prisma.InstallmentSelect;

type InstallmentRow = Prisma.InstallmentGetPayload<{ select: typeof installmentSelect }>;

export function toInstallmentView(row: InstallmentRow, today: string): InstallmentView {
  const dueDay = fromDbDay(row.dueDate);
  return {
    id: row.id,
    planId: row.planId,
    number: row.number,
    count: row.plan.installmentCount,
    amountCents: row.amountCents,
    dueDay,
    method: row.method,
    chequeNumber: row.chequeNumber,
    bank: row.bank,
    status: row.status,
    ...installmentState(row.status, dueDay, today),
    cashedDay: row.cashedOn ? fromDbDay(row.cashedOn) : null,
    memberId: row.plan.memberId,
    memberName: row.plan.member.name,
    planLabel: paymentTitle(row.plan.label, row.plan.category.name),
    categoryName: row.plan.category.name,
    categoryColor: row.plan.category.color,
    receipt: row.transaction?.receipt ?? null,
  };
}

export const planSelect = {
  id: true,
  memberId: true,
  label: true,
  participants: true,
  totalCents: true,
  installmentCount: true,
  createdAt: true,
  member: { select: { name: true } },
  category: { select: { name: true, color: true } },
  installments: { orderBy: { number: "asc" }, select: installmentSelect },
} satisfies Prisma.PaymentPlanSelect;

type PlanRow = Prisma.PaymentPlanGetPayload<{ select: typeof planSelect }>;

export function toPlanView(row: PlanRow, today: string, createdDay: string): PlanView {
  const installments = row.installments.map((line) => toInstallmentView(line, today));
  const cashed = installments.filter((line) => line.status === "CASHED");
  const paidCents = cashed.reduce((sum, line) => sum + line.amountCents, 0);
  return {
    id: row.id,
    memberId: row.memberId,
    memberName: row.member.name,
    label: paymentTitle(row.label, row.category.name),
    categoryName: row.category.name,
    categoryColor: row.category.color,
    participants: row.participants,
    totalCents: row.totalCents,
    installmentCount: row.installmentCount,
    paidCents,
    remainingCents: row.totalCents - paidCents,
    cashedCount: cashed.length,
    createdDay,
    installments,
  };
}

export const transactionSelect = {
  id: true,
  date: true,
  type: true,
  label: true,
  payerName: true,
  amountCents: true,
  method: true,
  status: true,
  chequeNumber: true,
  bank: true,
  notes: true,
  memberId: true,
  member: { select: { name: true } },
  category: { select: { id: true, name: true, color: true } },
  installment: { select: { number: true, plan: { select: { installmentCount: true } } } },
  receipt: { select: { id: true, number: true } },
} satisfies Prisma.TransactionSelect;

type TransactionRow = Prisma.TransactionGetPayload<{ select: typeof transactionSelect }>;

export function toTransactionView(row: TransactionRow): TransactionView {
  return {
    id: row.id,
    day: fromDbDay(row.date),
    type: row.type,
    who: row.type === "INCOME" ? (row.member?.name ?? row.payerName ?? row.label) : row.label,
    memberId: row.memberId,
    label: row.label,
    categoryId: row.category.id,
    categoryName: row.category.name,
    categoryColor: row.category.color,
    method: row.method,
    methodLabel: row.installment
      ? installmentLabel(row.method, row.installment.number, row.installment.plan.installmentCount)
      : METHOD_LABELS[row.method],
    chequeNumber: row.chequeNumber,
    bank: row.bank,
    amountCents: row.amountCents,
    cancelled: row.status === "CANCELLED",
    notes: row.notes,
    receipt: row.receipt,
  };
}

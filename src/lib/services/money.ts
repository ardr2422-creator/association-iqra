import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { amountInWords } from "@/lib/amount-words";
import { toDbDay, yearOf } from "@/lib/days";
import { METHOD_LABELS, type IncomeMethod, type PaymentMethod } from "@/lib/payments";
import { DomainError } from "@/lib/services/errors";
import { nameKey } from "@/lib/validation";
import type { ReceiptRef, ReceiptScheduleLine, ReceiptSnapshot } from "@/lib/views";

/*
 * Écritures comptables. Ces fonctions ne vérifient PAS la session : elles sont
 * appelées par les actions serveur, après `requireUser()` et la validation
 * zod, à l'intérieur d'une transaction Prisma. Une `DomainError` annule tout.
 *
 * Aucune valeur n'est collée dans du SQL : requêtes Prisma, ou gabarits
 * étiquetés (`$queryRaw`) dont les valeurs sont transmises à part.
 */

export type Tx = Prisma.TransactionClient;

export const RECEIPT_NOTICE = "Ce reçu atteste du paiement et ne vaut pas reçu fiscal.";

/**
 * Une seule écriture comptable à la fois : deux envois simultanés (double
 * clic, deux onglets) ne peuvent ni encaisser deux fois le même chèque ni
 * créer un trou dans la numérotation des reçus.
 */
export async function lockMoney(tx: Tx): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('iqra:money'))`;
}

/** Libellé affiché d'un paiement : « Cours d'arabe 2026-2027 », ou « Dons · Kermesse ». */
export function paymentTitle(label: string | null, categoryName: string): string {
  if (!label) return categoryName;
  return nameKey(label).includes(nameKey(categoryName)) ? label : `${categoryName} · ${label}`;
}

/** « Chèque n° 1234567 · Banque Postale », « Espèces »… */
export function methodDetail(method: PaymentMethod, chequeNumber: string | null, bank: string | null): string {
  if (method !== "CHEQUE") return METHOD_LABELS[method];
  return ["Chèque" + (chequeNumber ? ` n° ${chequeNumber}` : ""), bank].filter(Boolean).join(" · ");
}

type SettingsRow = {
  associationName: string;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  email: string | null;
  phone: string | null;
  rna: string | null;
  treasurerName: string | null;
};

export type SnapshotInput = {
  settings: SettingsRow | null;
  payer: { name: string; address: string | null };
  title: string;
  /** Rang et nombre de versements, si le paiement est en plusieurs fois. */
  installment: { number: number; count: number } | null;
  paidDay: string;
  amountCents: number;
  method: PaymentMethod;
  chequeNumber: string | null;
  bank: string | null;
  schedule: ReceiptScheduleLine[] | null;
};

/** Construit le contenu figé d'un reçu (fonction pure). */
export function buildReceiptSnapshot(input: SnapshotInput): ReceiptSnapshot {
  const settings = input.settings;
  const cityLine = [settings?.postalCode, settings?.city].filter(Boolean).join(" ");
  const multiple = input.installment !== null && input.installment.count > 1;
  return {
    version: 1,
    association: {
      name: settings?.associationName || "Association Iqra",
      addressLines: [...(settings?.address?.split("\n") ?? []), cityLine].filter(Boolean),
      email: settings?.email ?? null,
      phone: settings?.phone ?? null,
      rna: settings?.rna ?? null,
      treasurerName: settings?.treasurerName ?? null,
    },
    payer: input.payer,
    designation: multiple
      ? `${input.title} · versement ${input.installment!.number} sur ${input.installment!.count}`
      : input.title,
    paidDay: input.paidDay,
    amountCents: input.amountCents,
    amountWords: amountInWords(input.amountCents),
    methodLabel: methodDetail(input.method, input.chequeNumber, input.bank),
    schedule: multiple ? input.schedule : null,
    notice: RECEIPT_NOTICE,
  };
}

/** Numéro suivant de l'année (« 2026-0001 »…), sans trou : l'incrément est annulé avec la transaction. */
async function nextReceiptNumber(tx: Tx, year: number): Promise<{ sequence: number; number: string }> {
  const rows = await tx.$queryRaw<{ last: number }[]>`
    INSERT INTO "receipt_counters" ("year", "last") VALUES (${year}, 1)
    ON CONFLICT ("year") DO UPDATE SET "last" = "receipt_counters"."last" + 1
    RETURNING "last"`;
  const sequence = Number(rows[0].last);
  return { sequence, number: `${year}-${String(sequence).padStart(4, "0")}` };
}

/**
 * Émet le reçu d'un encaissement. À appeler une fois l'échéance mise à jour :
 * l'échéancier imprimé reflète l'état au moment de l'émission.
 */
export async function issueReceipt(tx: Tx, transactionId: string, issuedDay: string): Promise<ReceiptRef> {
  const transaction = await tx.transaction.findUniqueOrThrow({
    where: { id: transactionId },
    select: {
      date: true,
      label: true,
      payerName: true,
      amountCents: true,
      method: true,
      chequeNumber: true,
      bank: true,
      member: { select: { name: true, address: true } },
      installment: {
        select: {
          number: true,
          plan: {
            select: {
              installmentCount: true,
              installments: {
                orderBy: { number: "asc" },
                select: { number: true, amountCents: true, dueDate: true, cashedOn: true, status: true, method: true },
              },
            },
          },
        },
      },
    },
  });
  const settings = await tx.settings.findUnique({ where: { id: 1 } });

  const plan = transaction.installment?.plan ?? null;
  const snapshot = buildReceiptSnapshot({
    settings,
    payer: transaction.member
      ? { name: transaction.member.name, address: transaction.member.address }
      : { name: transaction.payerName ?? transaction.label, address: null },
    title: transaction.label,
    installment: plan ? { number: transaction.installment!.number, count: plan.installmentCount } : null,
    paidDay: transaction.date.toISOString().slice(0, 10),
    amountCents: transaction.amountCents,
    method: transaction.method,
    chequeNumber: transaction.chequeNumber,
    bank: transaction.bank,
    schedule:
      plan?.installments.map((line) => ({
        number: line.number,
        amountCents: line.amountCents,
        day: (line.cashedOn ?? line.dueDate).toISOString().slice(0, 10),
        status: line.status,
        method: line.method,
      })) ?? null,
  });

  const year = yearOf(issuedDay);
  const { sequence, number } = await nextReceiptNumber(tx, year);
  const receipt = await tx.receipt.create({
    data: {
      number,
      year,
      sequence,
      transactionId,
      issuedOn: toDbDay(issuedDay),
      payerName: snapshot.payer.name,
      payerAddress: snapshot.payer.address,
      snapshot,
    },
    select: { id: true, number: true },
  });
  return receipt;
}

async function requireCategory(tx: Tx, id: string, type: "INCOME" | "EXPENSE") {
  const category = await tx.category.findUnique({
    where: { id },
    select: { name: true, type: true, archivedAt: true },
  });
  if (!category || category.type !== type || category.archivedAt) {
    throw new DomainError("CATEGORY_UNAVAILABLE");
  }
  return category;
}

export type IncomeInput = {
  memberId: string | null;
  /** Payeur quand ce n'est pas un adhérent. */
  payerName: string | null;
  categoryId: string;
  /** « Cours d'arabe 2026-2027 » (facultatif). */
  label: string | null;
  /** Nombre d'inscrits concernés (facultatif). */
  participants: number | null;
  method: IncomeMethod;
  /** Versements dans l'ordre ; un seul élément pour un paiement en une fois. */
  installments: { amountCents: number; day: string; chequeNumber: string | null; bank: string | null }[];
  /** Le premier versement est encaissé à sa date. Sinon, tout est seulement prévu. */
  firstCashed: boolean;
  notes: string | null;
};

export type IncomeResult = {
  transactionId: string | null;
  planId: string | null;
  receipt: ReceiptRef | null;
};

/**
 * Enregistre un encaissement. Avec un adhérent, crée le paiement et ses
 * échéances (1 à 4) ; seul le premier versement, s'il est encaissé, devient un
 * mouvement et reçoit un reçu. Les autres restent des chèques « prévus ».
 */
export async function recordIncome(
  tx: Tx,
  input: IncomeInput,
  today: string,
  /** Date d'émission du reçu (aujourd'hui, sauf pour les données de démonstration). */
  issuedDay: string = today,
): Promise<IncomeResult> {
  const category = await requireCategory(tx, input.categoryId, "INCOME");
  const [first] = input.installments;
  const single = input.installments.length === 1;

  if (input.firstCashed && first.day > today) throw new DomainError("FUTURE_DAY");
  for (let index = 1; index < input.installments.length; index += 1) {
    if (input.installments[index].day < input.installments[index - 1].day) throw new DomainError("DAYS_ORDER");
  }

  const title = paymentTitle(input.label, category.name);

  // Sans adhérent : un simple mouvement, encaissé tout de suite (don de passage…).
  if (!input.memberId) {
    if (!single || !input.firstCashed) throw new DomainError("MEMBER_REQUIRED");
    if (!input.payerName) throw new DomainError("PAYER_REQUIRED");
    const transaction = await tx.transaction.create({
      data: {
        date: toDbDay(first.day),
        type: "INCOME",
        categoryId: input.categoryId,
        label: title,
        payerName: input.payerName,
        amountCents: first.amountCents,
        method: input.method,
        chequeNumber: input.method === "CHEQUE" ? first.chequeNumber : null,
        bank: input.method === "CHEQUE" ? first.bank : null,
        notes: input.notes,
      },
      select: { id: true },
    });
    const receipt = await issueReceipt(tx, transaction.id, issuedDay);
    return { transactionId: transaction.id, planId: null, receipt };
  }

  const member = await tx.member.findUnique({
    where: { id: input.memberId },
    select: { archivedAt: true },
  });
  if (!member || member.archivedAt) throw new DomainError("MEMBER_UNAVAILABLE");

  const plan = await tx.paymentPlan.create({
    data: {
      memberId: input.memberId,
      categoryId: input.categoryId,
      label: input.label,
      participants: input.participants,
      totalCents: input.installments.reduce((sum, line) => sum + line.amountCents, 0),
      installmentCount: input.installments.length,
      notes: input.notes,
    },
    select: { id: true },
  });

  let transactionId: string | null = null;
  if (input.firstCashed) {
    const transaction = await tx.transaction.create({
      data: {
        date: toDbDay(first.day),
        type: "INCOME",
        categoryId: input.categoryId,
        memberId: input.memberId,
        label: title,
        amountCents: first.amountCents,
        method: input.method,
        chequeNumber: input.method === "CHEQUE" ? first.chequeNumber : null,
        bank: input.method === "CHEQUE" ? first.bank : null,
        notes: input.notes,
      },
      select: { id: true },
    });
    transactionId = transaction.id;
  }

  await tx.installment.createMany({
    data: input.installments.map((line, index) => {
      const cashed = index === 0 && input.firstCashed;
      return {
        planId: plan.id,
        number: index + 1,
        amountCents: line.amountCents,
        dueDate: toDbDay(line.day),
        method: input.method,
        chequeNumber: input.method === "CHEQUE" ? line.chequeNumber : null,
        bank: input.method === "CHEQUE" ? line.bank : null,
        status: cashed ? ("CASHED" as const) : ("PLANNED" as const),
        cashedOn: cashed ? toDbDay(line.day) : null,
        transactionId: cashed ? transactionId : null,
      };
    }),
  });

  const receipt = transactionId ? await issueReceipt(tx, transactionId, issuedDay) : null;
  return { transactionId, planId: plan.id, receipt };
}

export type ExpenseInput = {
  day: string;
  label: string;
  categoryId: string;
  amountCents: number;
  method: PaymentMethod;
  chequeNumber: string | null;
  bank: string | null;
  notes: string | null;
};

export async function recordExpense(tx: Tx, input: ExpenseInput, today: string): Promise<{ transactionId: string }> {
  await requireCategory(tx, input.categoryId, "EXPENSE");
  if (input.day > today) throw new DomainError("FUTURE_DAY");
  const transaction = await tx.transaction.create({
    data: {
      date: toDbDay(input.day),
      type: "EXPENSE",
      categoryId: input.categoryId,
      label: input.label,
      amountCents: input.amountCents,
      method: input.method,
      chequeNumber: input.method === "CHEQUE" ? input.chequeNumber : null,
      bank: input.method === "CHEQUE" ? input.bank : null,
      notes: input.notes,
    },
    select: { id: true },
  });
  return { transactionId: transaction.id };
}

/** Encaisse une échéance prévue : crée le mouvement et émet le reçu. */
export async function cashInstallment(
  tx: Tx,
  installmentId: string,
  cashedDay: string,
  today: string,
  issuedDay: string = today,
): Promise<{ transactionId: string; receipt: ReceiptRef }> {
  const installment = await tx.installment.findUnique({
    where: { id: installmentId },
    select: {
      status: true,
      amountCents: true,
      method: true,
      chequeNumber: true,
      bank: true,
      plan: {
        select: { memberId: true, categoryId: true, label: true, notes: true, category: { select: { name: true } } },
      },
    },
  });
  if (!installment) throw new DomainError("INSTALLMENT_GONE");
  if (installment.status === "CASHED") throw new DomainError("ALREADY_CASHED");
  if (installment.status !== "PLANNED") throw new DomainError("NOT_PENDING");
  if (cashedDay > today) throw new DomainError("FUTURE_DAY");

  const transaction = await tx.transaction.create({
    data: {
      date: toDbDay(cashedDay),
      type: "INCOME",
      categoryId: installment.plan.categoryId,
      memberId: installment.plan.memberId,
      label: paymentTitle(installment.plan.label, installment.plan.category.name),
      amountCents: installment.amountCents,
      method: installment.method,
      chequeNumber: installment.chequeNumber,
      bank: installment.bank,
    },
    select: { id: true },
  });
  await tx.installment.update({
    where: { id: installmentId },
    data: { status: "CASHED", cashedOn: toDbDay(cashedDay), transactionId: transaction.id },
  });
  const receipt = await issueReceipt(tx, transaction.id, issuedDay);
  return { transactionId: transaction.id, receipt };
}

/**
 * Chèque rejeté. S'il avait déjà été encaissé, son mouvement est annulé
 * (conservé dans l'historique, retiré du solde).
 */
export async function rejectInstallment(tx: Tx, installmentId: string): Promise<void> {
  const installment = await tx.installment.findUnique({
    where: { id: installmentId },
    select: { status: true, transactionId: true },
  });
  if (!installment) throw new DomainError("INSTALLMENT_GONE");
  if (installment.status === "REJECTED") return;

  if (installment.transactionId) {
    await tx.transaction.update({
      where: { id: installment.transactionId },
      data: { status: "CANCELLED" },
    });
  }
  await tx.installment.update({
    where: { id: installmentId },
    data: { status: "REJECTED", cashedOn: null, transactionId: null },
  });
}

export type ReplanInput = { dueDay: string; chequeNumber: string | null; bank: string | null };

/** Modifie une échéance en attente, ou remet un chèque rejeté « à encaisser » (chèque de remplacement). */
export async function replanInstallment(tx: Tx, installmentId: string, input: ReplanInput): Promise<void> {
  const installment = await tx.installment.findUnique({
    where: { id: installmentId },
    select: { status: true, method: true },
  });
  if (!installment) throw new DomainError("INSTALLMENT_GONE");
  if (installment.status === "CASHED") throw new DomainError("ALREADY_CASHED");

  await tx.installment.update({
    where: { id: installmentId },
    data: {
      status: "PLANNED",
      dueDate: toDbDay(input.dueDay),
      chequeNumber: installment.method === "CHEQUE" ? input.chequeNumber : null,
      bank: installment.method === "CHEQUE" ? input.bank : null,
    },
  });
}

/**
 * Annule un mouvement : il reste dans l'historique (barré) mais ne compte
 * plus dans le solde. Son éventuel reçu est conservé et marqué « annulé ».
 * L'échéance correspondante redevient « prévue » ; un paiement en une seule
 * fois est retiré de la fiche de l'adhérent.
 */
export async function cancelTransaction(tx: Tx, transactionId: string): Promise<void> {
  const transaction = await tx.transaction.findUnique({
    where: { id: transactionId },
    select: {
      status: true,
      installment: { select: { id: true, planId: true, plan: { select: { installmentCount: true } } } },
    },
  });
  if (!transaction) throw new DomainError("TRANSACTION_GONE");
  if (transaction.status === "CANCELLED") throw new DomainError("ALREADY_CANCELLED");

  await tx.transaction.update({ where: { id: transactionId }, data: { status: "CANCELLED" } });

  const installment = transaction.installment;
  if (!installment) return;
  if (installment.plan.installmentCount === 1) {
    // Les échéances sont supprimées avec le paiement (clé étrangère en cascade).
    await tx.paymentPlan.delete({ where: { id: installment.planId } });
  } else {
    await tx.installment.update({
      where: { id: installment.id },
      data: { status: "PLANNED", cashedOn: null, transactionId: null },
    });
  }
}

/** Supprime un paiement dont aucun versement n'est encaissé (saisi par erreur, inscription annulée). */
export async function deletePaymentPlan(tx: Tx, planId: string): Promise<void> {
  const plan = await tx.paymentPlan.findUnique({
    where: { id: planId },
    select: { installments: { select: { status: true } } },
  });
  if (!plan) throw new DomainError("PLAN_GONE");
  if (plan.installments.some((line) => line.status === "CASHED")) throw new DomainError("PLAN_HAS_CASHED");
  await tx.paymentPlan.delete({ where: { id: planId } });
}

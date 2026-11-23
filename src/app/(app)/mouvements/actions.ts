"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { INCOME_METHODS, MAX_INSTALLMENTS, PAYMENT_METHODS } from "@/lib/payments";
import { cancelTransaction as cancelTransactionInTx, recordExpense, recordIncome } from "@/lib/services/money";
import { runMoney } from "@/lib/services/run";
import {
  amountSchema,
  daySchema,
  fieldErrorsOf,
  idSchema,
  INVALID_FORM,
  optionalLine,
  optionalText,
  requiredLine,
  type ActionResult,
} from "@/lib/validation";
import type { ReceiptRef } from "@/lib/views";

/*
 * Sécurité : session, puis validation zod de tout ce qui vient du navigateur,
 * puis écriture dans une transaction verrouillée (`runMoney`). Les montants
 * sont recalculés ici : le total est la somme des versements reçus.
 */

/** Nombre d'inscrits : entier de 1 à 50, ou rien. */
const participantsSchema = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((value) => (typeof value === "string" ? (value.trim() === "" ? null : Number(value.trim())) : (value ?? null)))
  .pipe(z.number().int().min(1).max(50).nullable());

const incomeSchema = z.object({
  memberId: z.union([idSchema, z.null(), z.undefined()]).transform((value) => value ?? null),
  /** Payeur, quand ce n'est pas un adhérent. */
  payerName: optionalLine(80),
  categoryId: idSchema,
  /** « Cours d'arabe 2026-2027 » (facultatif). */
  label: optionalLine(80),
  participants: participantsSchema,
  method: z.enum(INCOME_METHODS),
  /** Un élément par versement (1 à 4), dans l'ordre. */
  installments: z
    .array(
      z.object({
        amount: amountSchema,
        day: daySchema,
        chequeNumber: optionalLine(30),
        bank: optionalLine(60),
      }),
    )
    .min(1)
    .max(MAX_INSTALLMENTS),
  /** Le premier versement est encaissé à sa date (sinon tout est seulement prévu). */
  firstCashed: z.boolean(),
  notes: optionalText(500),
});

export type IncomeActionResult = ActionResult<{ receipt: ReceiptRef | null; memberId: string | null }>;

/**
 * Enregistre un encaissement, en 1 à 4 fois. Le premier versement encaissé
 * crée un mouvement et son reçu ; les suivants deviennent des échéances.
 */
export async function createIncome(input: unknown): Promise<IncomeActionResult> {
  await requireUser();
  const parsed = incomeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: INVALID_FORM, fieldErrors: fieldErrorsOf(parsed.error) };
  const data = parsed.data;

  return runMoney("encaissements", async (tx, today) => {
    const result = await recordIncome(
      tx,
      {
        memberId: data.memberId,
        payerName: data.memberId ? null : data.payerName,
        categoryId: data.categoryId,
        label: data.label,
        participants: data.participants,
        method: data.method,
        installments: data.installments.map((line) => ({
          amountCents: line.amount,
          day: line.day,
          chequeNumber: line.chequeNumber,
          bank: line.bank,
        })),
        firstCashed: data.firstCashed,
        notes: data.notes,
      },
      today,
    );
    return { receipt: result.receipt, memberId: data.memberId };
  });
}

const expenseSchema = z.object({
  day: daySchema,
  label: requiredLine(80, { required: "Indiquez à quoi correspond cette dépense." }),
  categoryId: idSchema,
  amount: amountSchema,
  method: z.enum(PAYMENT_METHODS),
  chequeNumber: optionalLine(30),
  bank: optionalLine(60),
  notes: optionalText(500),
});

/** Enregistre une dépense. */
export async function createExpense(input: unknown): Promise<ActionResult> {
  await requireUser();
  const parsed = expenseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: INVALID_FORM, fieldErrors: fieldErrorsOf(parsed.error) };
  const { amount, ...data } = parsed.data;

  return runMoney("dépenses", async (tx, today) => {
    await recordExpense(tx, { ...data, amountCents: amount }, today);
    return {};
  });
}

/**
 * Annule un mouvement : il reste visible dans l'historique mais ne compte plus
 * dans le solde. Rien n'est jamais effacé.
 */
export async function cancelTransaction(rawId: unknown): Promise<ActionResult> {
  await requireUser();
  const parsed = idSchema.safeParse(rawId);
  if (!parsed.success) return { ok: false, message: "Ce mouvement n'existe plus. Rechargez la page." };

  return runMoney("mouvements", async (tx) => {
    await cancelTransactionInTx(tx, parsed.data);
    return {};
  });
}

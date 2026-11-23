"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import {
  cashInstallment as cashInstallmentInTx,
  deletePaymentPlan as deletePaymentPlanInTx,
  rejectInstallment as rejectInstallmentInTx,
  replanInstallment as replanInstallmentInTx,
} from "@/lib/services/money";
import { runMoney } from "@/lib/services/run";
import {
  daySchema,
  fieldErrorsOf,
  idSchema,
  INVALID_FORM,
  optionalLine,
  type ActionResult,
} from "@/lib/validation";
import type { ReceiptRef } from "@/lib/views";

/*
 * Échéances (chèques). Sécurité : session, validation zod, puis écriture dans
 * une transaction verrouillée — un double clic ne peut pas encaisser deux fois.
 */

const GONE = "Cette échéance n'existe plus. Rechargez la page.";

const cashSchema = z.object({ id: idSchema, day: daySchema });

/** Marque une échéance comme encaissée : crée le mouvement et émet le reçu. */
export async function cashInstallment(input: unknown): Promise<ActionResult<{ receipt: ReceiptRef }>> {
  await requireUser();
  const parsed = cashSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: INVALID_FORM, fieldErrors: fieldErrorsOf(parsed.error) };

  return runMoney("chèques", async (tx, today) => {
    const { receipt } = await cashInstallmentInTx(tx, parsed.data.id, parsed.data.day, today);
    return { receipt };
  });
}

/** Marque un chèque comme rejeté (s'il était encaissé, son mouvement est annulé). */
export async function rejectInstallment(rawId: unknown): Promise<ActionResult> {
  await requireUser();
  const parsed = idSchema.safeParse(rawId);
  if (!parsed.success) return { ok: false, message: GONE };

  return runMoney("chèques", async (tx) => {
    await rejectInstallmentInTx(tx, parsed.data);
    return {};
  });
}

const replanSchema = z.object({
  id: idSchema,
  dueDay: daySchema,
  chequeNumber: optionalLine(30),
  bank: optionalLine(60),
});

/** Modifie une échéance en attente (date, numéro, banque) ou remet un chèque rejeté « à encaisser ». */
export async function replanInstallment(input: unknown): Promise<ActionResult> {
  await requireUser();
  const parsed = replanSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: INVALID_FORM, fieldErrors: fieldErrorsOf(parsed.error) };
  const { id, ...data } = parsed.data;

  return runMoney("chèques", async (tx) => {
    await replanInstallmentInTx(tx, id, data);
    return {};
  });
}

/** Supprime un paiement dont aucun versement n'est encaissé (saisi par erreur). */
export async function deletePaymentPlan(rawId: unknown): Promise<ActionResult> {
  await requireUser();
  const parsed = idSchema.safeParse(rawId);
  if (!parsed.success) return { ok: false, message: "Ce paiement n'existe plus. Rechargez la page." };

  return runMoney("chèques", async (tx) => {
    await deletePaymentPlanInTx(tx, parsed.data);
    return {};
  });
}

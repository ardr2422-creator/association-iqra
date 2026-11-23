"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";
import { clearDemoData, loadDemoData as loadDemoDataInTx } from "@/lib/services/demo";
import { runMoney } from "@/lib/services/run";
import {
  fieldErrorsOf,
  INVALID_FORM,
  optionalEmail,
  optionalLine,
  optionalText,
  requiredLine,
  signedAmountSchema,
  UNEXPECTED,
  type ActionResult,
} from "@/lib/validation";

/*
 * Paramètres de l'association. Sécurité : session, validation zod, requêtes
 * Prisma paramétrées. L'option « reçu fiscal » n'est pas modifiable ici : elle
 * reste désactivée tant que l'association ne l'a pas confirmée.
 */

const settingsSchema = z.object({
  associationName: requiredLine(80, { required: "Indiquez le nom de l'association." }),
  address: optionalText(200),
  postalCode: optionalLine(10),
  city: optionalLine(60),
  email: optionalEmail,
  phone: optionalLine(30),
  rna: optionalLine(20),
  treasurerName: optionalLine(80),
  reminderEmail: optionalEmail,
  openingBalance: signedAmountSchema,
});

/** Enregistre les informations de l'association (reprises sur les prochains reçus). */
export async function saveSettings(input: unknown): Promise<ActionResult> {
  await requireUser();
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: INVALID_FORM, fieldErrors: fieldErrorsOf(parsed.error) };
  const { openingBalance, ...fields } = parsed.data;
  const data = { ...fields, openingBalanceCents: openingBalance };

  try {
    await getDb().settings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
  } catch (error) {
    console.error("[paramètres] enregistrement impossible", error);
    return { ok: false, message: UNEXPECTED };
  }
  refresh();
  return { ok: true };
}

/** Charge les données de démonstration (familles fictives). Refusé si la base n'est pas vide. */
export async function loadDemoData(): Promise<ActionResult> {
  await requireUser();
  return runMoney(
    "démonstration",
    async (tx, today) => {
      await loadDemoDataInTx(tx, today);
      return {};
    },
    { timeout: 60_000 },
  );
}

/** Mot à saisir pour confirmer l'effacement. */
const CONFIRMATION = "EFFACER";

/**
 * Termine la démonstration : efface tous les adhérents, mouvements, chèques
 * et reçus. Possible uniquement pendant la démonstration, et après avoir saisi
 * le mot de confirmation.
 */
export async function endDemo(confirmation: unknown): Promise<ActionResult> {
  await requireUser();
  if (typeof confirmation !== "string" || confirmation.trim().toLocaleUpperCase("fr") !== CONFIRMATION) {
    return { ok: false, message: `Saisissez ${CONFIRMATION} pour confirmer.` };
  }
  return runMoney(
    "démonstration",
    async (tx) => {
      await clearDemoData(tx);
      return {};
    },
    { timeout: 60_000 },
  );
}

"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth/dal";
import { todayIsoDay, toDbDay } from "@/lib/days";
import { getDb } from "@/lib/db";
import {
  daySchema,
  fieldErrorsOf,
  idSchema,
  INVALID_FORM,
  optionalEmail,
  optionalLine,
  optionalText,
  requiredLine,
  UNEXPECTED,
  type ActionResult,
} from "@/lib/validation";

/*
 * Sécurité : même ordre que pour les catégories — session, validation zod de
 * tout ce qui vient du navigateur, puis requêtes Prisma paramétrées.
 */

const memberSchema = z.object({
  id: idSchema.optional(),
  name: requiredLine(80, { required: "Indiquez le nom de l'adhérent ou de la famille." }),
  phone: optionalLine(30),
  email: optionalEmail,
  address: optionalText(200),
  notes: optionalText(1000),
  joinedDay: z.union([daySchema, z.literal(""), z.null(), z.undefined()]).transform((value) => value || null),
});

const GONE = "Cet adhérent n'existe plus. Rechargez la page.";

function isPrismaError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

/** Crée un adhérent, ou enregistre ses modifications si `id` est présent. */
export async function saveMember(input: unknown): Promise<ActionResult<{ id: string }>> {
  await requireUser();
  const parsed = memberSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: INVALID_FORM, fieldErrors: fieldErrorsOf(parsed.error) };

  const { id, joinedDay, ...fields } = parsed.data;
  if (joinedDay && joinedDay > todayIsoDay()) {
    return { ok: false, message: INVALID_FORM, fieldErrors: { joinedDay: "La date d'adhésion ne peut pas être dans le futur." } };
  }

  try {
    const data = { ...fields, ...(joinedDay ? { joinedOn: toDbDay(joinedDay) } : {}) };
    const member = id
      ? await getDb().member.update({ where: { id }, data, select: { id: true } })
      : await getDb().member.create({ data, select: { id: true } });
    refresh();
    return { ok: true, id: member.id };
  } catch (error) {
    if (isPrismaError(error, "P2025")) return { ok: false, message: GONE };
    console.error("[adhérents] enregistrement impossible", error);
    return { ok: false, message: UNEXPECTED };
  }
}

/**
 * Supprime un adhérent. S'il a déjà des paiements, il est archivé à la place :
 * l'historique comptable n'est jamais effacé.
 */
export async function deleteMember(rawId: unknown): Promise<ActionResult<{ archived: boolean }>> {
  await requireUser();
  const parsed = idSchema.safeParse(rawId);
  if (!parsed.success) return { ok: false, message: GONE };
  const id = parsed.data;

  let archived = false;
  try {
    const db = getDb();
    const member = await db.member.findUnique({
      where: { id },
      select: { _count: { select: { transactions: true, paymentPlans: true } } },
    });
    if (!member) return { ok: false, message: GONE };

    if (member._count.transactions + member._count.paymentPlans === 0) {
      try {
        await db.member.delete({ where: { id } });
      } catch (error) {
        // Un paiement vient d'être rattaché entre-temps : on archive.
        if (!isPrismaError(error, "P2003")) throw error;
        archived = true;
      }
    } else {
      archived = true;
    }
    if (archived) await db.member.update({ where: { id }, data: { archivedAt: new Date() } });
  } catch (error) {
    if (isPrismaError(error, "P2025")) return { ok: false, message: GONE };
    console.error("[adhérents] suppression impossible", error);
    return { ok: false, message: "La suppression a échoué. Réessayez dans un instant." };
  }

  refresh();
  return { ok: true, archived };
}

/** Remet en service un adhérent archivé. */
export async function restoreMember(rawId: unknown): Promise<ActionResult> {
  await requireUser();
  const parsed = idSchema.safeParse(rawId);
  if (!parsed.success) return { ok: false, message: GONE };

  try {
    await getDb().member.update({ where: { id: parsed.data }, data: { archivedAt: null } });
  } catch (error) {
    if (isPrismaError(error, "P2025")) return { ok: false, message: GONE };
    console.error("[adhérents] restauration impossible", error);
    return { ok: false, message: "La restauration a échoué. Réessayez dans un instant." };
  }

  refresh();
  return { ok: true };
}

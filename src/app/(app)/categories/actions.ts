"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth/dal";
import { CATEGORY_COLORS, CATEGORY_NAME_MAX, FLOW_TYPES } from "@/lib/categories";
import { getDb } from "@/lib/db";

/*
 * Sécurité : une action serveur est une adresse publique. Chaque action
 * 1) vérifie la session (`requireUser`), 2) valide tout ce qui vient du
 * navigateur (zod), 3) ne parle à la base que par des requêtes Prisma
 * paramétrées — aucune valeur n'est jamais collée dans du SQL.
 */

export type CategoryFormState =
  | { ok: true }
  | { ok: false; fieldErrors?: { name?: string }; message?: string }
  | undefined;

export type CategoryActionResult =
  | { ok: true; archived?: boolean }
  | { ok: false; message: string };

const idSchema = z.string().regex(/^[a-z0-9_]{1,64}$/i);

const nameSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, " ").trim())
  .pipe(
    z
      .string()
      .min(1, "Donnez un nom à la catégorie.")
      .max(CATEGORY_NAME_MAX, `Le nom ne peut pas dépasser ${CATEGORY_NAME_MAX} caractères.`)
      .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), "Ce nom contient un caractère non autorisé."),
  );

const createSchema = z.object({
  name: nameSchema,
  type: z.enum(FLOW_TYPES),
  color: z.enum(CATEGORY_COLORS),
});

const updateSchema = z.object({
  id: idSchema,
  name: nameSchema,
  color: z.enum(CATEGORY_COLORS),
});

const DUPLICATE = "Une catégorie porte déjà ce nom.";
const UNEXPECTED = "L'enregistrement a échoué. Réessayez dans un instant.";
const GONE = "Cette catégorie n'existe plus. Rechargez la page.";

function isPrismaError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

function invalid(error: z.ZodError): CategoryFormState {
  const nameIssue = error.issues.find((issue) => issue.path[0] === "name");
  if (nameIssue) return { ok: false, fieldErrors: { name: nameIssue.message } };
  // Type, couleur ou identifiant inattendus : le formulaire a été modifié à la main.
  return { ok: false, message: "Le formulaire est invalide. Rechargez la page et réessayez." };
}

/** Crée une catégorie, ou enregistre les modifications si `id` est présent. */
export async function saveCategory(
  _previous: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  await requireUser();

  const raw = {
    id: formData.get("id") ?? undefined,
    name: formData.get("name"),
    type: formData.get("type"),
    color: formData.get("color"),
  };

  try {
    const db = getDb();

    if (raw.id !== undefined) {
      const parsed = updateSchema.safeParse(raw);
      if (!parsed.success) return invalid(parsed.error);
      const { id, name, color } = parsed.data;

      const current = await db.category.findUnique({ where: { id }, select: { type: true } });
      if (!current) return { ok: false, message: GONE };

      const clash = await db.category.findFirst({
        where: { type: current.type, id: { not: id }, name: { equals: name, mode: "insensitive" } },
        select: { archivedAt: true },
      });
      if (clash) {
        return {
          ok: false,
          fieldErrors: {
            name: clash.archivedAt
              ? "Une catégorie archivée porte déjà ce nom. Restaurez-la ou choisissez un autre nom."
              : DUPLICATE,
          },
        };
      }

      await db.category.update({ where: { id }, data: { name, color } });
    } else {
      const parsed = createSchema.safeParse(raw);
      if (!parsed.success) return invalid(parsed.error);
      const { name, type, color } = parsed.data;

      const existing = await db.category.findFirst({
        where: { type, name: { equals: name, mode: "insensitive" } },
        select: { id: true, archivedAt: true },
      });
      if (existing && !existing.archivedAt) {
        return { ok: false, fieldErrors: { name: DUPLICATE } };
      }
      if (existing) {
        // Même nom qu'une catégorie archivée : on la remet en service, ses
        // anciens mouvements restent ainsi rangés au même endroit.
        await db.category.update({
          where: { id: existing.id },
          data: { name, color, archivedAt: null },
        });
      } else {
        await db.category.create({ data: { name, type, color } });
      }
    }
  } catch (error) {
    if (isPrismaError(error, "P2002")) return { ok: false, fieldErrors: { name: DUPLICATE } };
    if (isPrismaError(error, "P2025")) return { ok: false, message: GONE };
    console.error("[catégories] enregistrement impossible", error);
    return { ok: false, message: UNEXPECTED };
  }

  refresh();
  return { ok: true };
}

/**
 * Supprime une catégorie. Si elle est déjà utilisée par des mouvements, elle
 * est archivée à la place : l'historique comptable n'est jamais modifié.
 */
export async function deleteCategory(rawId: unknown): Promise<CategoryActionResult> {
  await requireUser();
  const parsed = idSchema.safeParse(rawId);
  if (!parsed.success) return { ok: false, message: GONE };
  const id = parsed.data;

  let archived = false;
  try {
    const db = getDb();
    const category = await db.category.findUnique({
      where: { id },
      select: { _count: { select: { transactions: true, paymentPlans: true } } },
    });
    if (!category) return { ok: false, message: GONE };

    const inUse = category._count.transactions + category._count.paymentPlans > 0;
    if (!inUse) {
      try {
        await db.category.delete({ where: { id } });
      } catch (error) {
        // Un mouvement vient d'être rattaché entre-temps : on archive.
        if (!isPrismaError(error, "P2003")) throw error;
        archived = true;
      }
    } else {
      archived = true;
    }
    if (archived) {
      await db.category.update({ where: { id }, data: { archivedAt: new Date() } });
    }
  } catch (error) {
    if (isPrismaError(error, "P2025")) return { ok: false, message: GONE };
    console.error("[catégories] suppression impossible", error);
    return { ok: false, message: "La suppression a échoué. Réessayez dans un instant." };
  }

  refresh();
  return { ok: true, archived };
}

/** Remet en service une catégorie archivée. */
export async function restoreCategory(rawId: unknown): Promise<CategoryActionResult> {
  await requireUser();
  const parsed = idSchema.safeParse(rawId);
  if (!parsed.success) return { ok: false, message: GONE };

  try {
    await getDb().category.update({ where: { id: parsed.data }, data: { archivedAt: null } });
  } catch (error) {
    if (isPrismaError(error, "P2025")) return { ok: false, message: GONE };
    console.error("[catégories] restauration impossible", error);
    return { ok: false, message: "La restauration a échoué. Réessayez dans un instant." };
  }

  refresh();
  return { ok: true };
}

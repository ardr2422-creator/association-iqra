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

/** Caractères invisibles ou trompeurs : contrôle, formatage (zéro-largeur, sens d'écriture), usage privé, « lettres » vides. */
const DECEPTIVE_CHARACTERS = /[\p{Cc}\p{Cf}\p{Co}\u115F\u1160\u2800\u3164\uFFA0]/u;

const nameSchema = z
  .string()
  // Forme Unicode canonique : « é » saisi en un ou deux caractères donne le même nom.
  .transform((value) => value.normalize("NFC").replace(/\s+/g, " ").trim())
  .pipe(
    z
      .string()
      .min(1, "Donnez un nom à la catégorie.")
      .max(CATEGORY_NAME_MAX, `Le nom ne peut pas dépasser ${CATEGORY_NAME_MAX} caractères.`)
      .refine((value) => !DECEPTIVE_CHARACTERS.test(value), "Ce nom contient un caractère non autorisé.")
      .refine((value) => /[\p{L}\p{N}]/u.test(value), "Le nom doit contenir au moins une lettre ou un chiffre."),
  );

/** Clé de comparaison : deux noms qui ne diffèrent que par la casse ou la forme Unicode sont « le même nom ». */
function nameKey(name: string): string {
  return name.normalize("NFKC").toLocaleLowerCase("fr");
}

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

  const parsedUpdate = raw.id !== undefined ? updateSchema.safeParse(raw) : null;
  const parsedCreate = raw.id === undefined ? createSchema.safeParse(raw) : null;
  if (parsedUpdate && !parsedUpdate.success) return invalid(parsedUpdate.error);
  if (parsedCreate && !parsedCreate.success) return invalid(parsedCreate.error);

  try {
    const outcome = await getDb().$transaction(async (tx): Promise<CategoryFormState> => {
      // Une seule écriture de catégorie à la fois : deux envois simultanés ne
      // peuvent pas créer deux fois « le même » nom.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('iqra:categories'))`;

      if (parsedUpdate?.success) {
        const { id, name, color } = parsedUpdate.data;
        const current = await tx.category.findUnique({ where: { id }, select: { type: true } });
        if (!current) return { ok: false, message: GONE };

        // Comparaison faite ici, en JavaScript : le nom saisi n'est jamais
        // interprété comme un motif de recherche par la base.
        const siblings = await tx.category.findMany({
          where: { type: current.type, id: { not: id } },
          select: { name: true, archivedAt: true },
        });
        const clash = siblings.find((other) => nameKey(other.name) === nameKey(name));
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
        await tx.category.update({ where: { id }, data: { name, color } });
        return { ok: true };
      }

      if (parsedCreate?.success) {
        const { name, type, color } = parsedCreate.data;
        const siblings = await tx.category.findMany({
          where: { type },
          select: { id: true, name: true, archivedAt: true },
        });
        const existing = siblings.find((other) => nameKey(other.name) === nameKey(name));
        if (existing && !existing.archivedAt) {
          return { ok: false, fieldErrors: { name: DUPLICATE } };
        }
        if (existing) {
          // Même nom qu'une catégorie archivée : on la remet en service, ses
          // anciens mouvements restent ainsi rangés au même endroit.
          await tx.category.update({
            where: { id: existing.id },
            data: { name, color, archivedAt: null },
          });
        } else {
          await tx.category.create({ data: { name, type, color } });
        }
        return { ok: true };
      }

      return { ok: false, message: UNEXPECTED };
    });
    if (!outcome?.ok) return outcome;
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

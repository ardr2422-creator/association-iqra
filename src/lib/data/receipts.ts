import "server-only";
import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { fromDbDay } from "@/lib/days";
import { getDb } from "@/lib/db";
import { PAYMENT_METHODS } from "@/lib/payments";
import { idSchema } from "@/lib/validation";
import type { ReceiptDocument, ReceiptListItem, ReceiptSnapshot } from "@/lib/views";

/** Forme du contenu figé d'un reçu, relue avant usage (la colonne est du JSON libre). */
const snapshotSchema: z.ZodType<ReceiptSnapshot> = z.object({
  version: z.literal(1),
  association: z.object({
    name: z.string(),
    addressLines: z.array(z.string()),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    rna: z.string().nullable(),
    treasurerName: z.string().nullable(),
  }),
  payer: z.object({ name: z.string(), address: z.string().nullable() }),
  designation: z.string(),
  paidDay: z.string(),
  amountCents: z.number().int(),
  amountWords: z.string(),
  methodLabel: z.string(),
  schedule: z
    .array(
      z.object({
        number: z.number().int(),
        amountCents: z.number().int(),
        day: z.string(),
        status: z.enum(["PLANNED", "CASHED", "REJECTED"]),
        method: z.enum(PAYMENT_METHODS),
      }),
    )
    .nullable(),
  notice: z.string(),
});

/** Tous les reçus émis, du plus récent au plus ancien. */
export async function listReceipts(): Promise<ReceiptListItem[]> {
  await requireUser();
  const rows = await getDb().receipt.findMany({
    orderBy: [{ year: "desc" }, { sequence: "desc" }],
    select: {
      id: true,
      number: true,
      issuedOn: true,
      payerName: true,
      snapshot: true,
      transaction: { select: { status: true, memberId: true, amountCents: true, label: true } },
    },
  });

  return rows.map((row) => {
    const snapshot = snapshotSchema.safeParse(row.snapshot);
    return {
      id: row.id,
      number: row.number,
      issuedDay: fromDbDay(row.issuedOn),
      payerName: row.payerName,
      memberId: row.transaction.memberId,
      designation: snapshot.success ? snapshot.data.designation : row.transaction.label,
      amountCents: row.transaction.amountCents,
      cancelled: row.transaction.status === "CANCELLED",
    };
  });
}

/** Un reçu complet, prêt à être imprimé en PDF ; `null` s'il n'existe pas. */
export async function getReceiptDocument(rawId: unknown): Promise<ReceiptDocument | null> {
  await requireUser();
  const id = idSchema.safeParse(rawId);
  if (!id.success) return null;

  const row = await getDb().receipt.findUnique({
    where: { id: id.data },
    select: {
      id: true,
      number: true,
      issuedOn: true,
      snapshot: true,
      transaction: { select: { status: true } },
    },
  });
  if (!row) return null;

  const snapshot = snapshotSchema.safeParse(row.snapshot);
  if (!snapshot.success) {
    console.error("[reçus] contenu illisible pour le reçu", row.number);
    return null;
  }
  return {
    id: row.id,
    number: row.number,
    issuedDay: fromDbDay(row.issuedOn),
    cancelled: row.transaction.status === "CANCELLED",
    snapshot: snapshot.data,
  };
}

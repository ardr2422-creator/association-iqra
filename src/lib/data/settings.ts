import "server-only";
import { requireUser } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";
import { remindersConfigured } from "@/lib/services/reminders";
import type { SettingsView } from "@/lib/views";

/** Les paramètres de l'association (valeurs par défaut tant que rien n'a été enregistré). */
export async function getSettings(): Promise<SettingsView> {
  await requireUser();
  const db = getDb();
  const [row, members, transactions] = await Promise.all([
    db.settings.findUnique({ where: { id: 1 } }),
    db.member.count(),
    db.transaction.count(),
  ]);

  return {
    associationName: row?.associationName ?? "Association Iqra",
    address: row?.address ?? null,
    postalCode: row?.postalCode ?? null,
    city: row?.city ?? null,
    email: row?.email ?? null,
    phone: row?.phone ?? null,
    rna: row?.rna ?? null,
    treasurerName: row?.treasurerName ?? null,
    reminderEmail: row?.reminderEmail ?? null,
    fiscalReceiptsEnabled: false,
    openingBalanceCents: row?.openingBalanceCents ?? 0,
    demoMode: row?.demoMode ?? false,
    empty: members === 0 && transactions === 0,
    remindersConfigured: remindersConfigured(),
  };
}

/** Vrai tant que la base contient les données de démonstration (bandeau d'avertissement). */
export async function isDemoMode(): Promise<boolean> {
  await requireUser();
  const row = await getDb().settings.findUnique({ where: { id: 1 }, select: { demoMode: true } });
  return row?.demoMode ?? false;
}

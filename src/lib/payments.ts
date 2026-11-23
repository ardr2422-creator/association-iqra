/**
 * Règles communes aux encaissements et aux échéances (utilisable côté
 * navigateur comme côté serveur : aucune donnée, que des règles).
 */
import type { BadgeTone } from "@/components/ui/badge";
import { addMonths, daysBetween } from "@/lib/days";

/** Moyens de paiement. Mêmes valeurs que l'énumération `PaymentMethod` de la base. */
export const PAYMENT_METHODS = ["CHEQUE", "CASH", "TRANSFER", "CARD"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Une entrée se règle par chèque, espèces ou virement (la carte ne sert qu'aux dépenses). */
export const INCOME_METHODS = ["CHEQUE", "CASH", "TRANSFER"] as const;
export type IncomeMethod = (typeof INCOME_METHODS)[number];

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  CHEQUE: "Chèque",
  CASH: "Espèces",
  TRANSFER: "Virement",
  CARD: "Carte",
};

/** Les cours se paient en 4 fois au maximum. */
export const MAX_INSTALLMENTS = 4;

/** Montant maximal d'un mouvement : 1 000 000 € (garde-fou contre les fautes de frappe). */
export const MAX_AMOUNT_CENTS = 100_000_000;

/** Statut stocké d'une échéance. */
export type InstallmentStatus = "PLANNED" | "CASHED" | "REJECTED";

/**
 * Statut affiché. « À encaisser » n'est pas stocké : c'est une échéance prévue
 * dont la date arrive dans les 7 jours (ou est déjà passée : `late`).
 */
export type InstallmentState = "PLANNED" | "DUE" | "CASHED" | "REJECTED";

export const DUE_SOON_DAYS = 7;

export const STATE_LABELS: Record<InstallmentState, string> = {
  PLANNED: "Prévu",
  DUE: "À encaisser",
  CASHED: "Encaissé",
  REJECTED: "Rejeté",
};

export const STATE_TONES: Record<InstallmentState, BadgeTone> = {
  PLANNED: "neutral",
  DUE: "amber",
  CASHED: "income",
  REJECTED: "late",
};

export function installmentState(
  status: InstallmentStatus,
  dueDay: string,
  today: string,
): { state: InstallmentState; late: boolean } {
  if (status === "CASHED") return { state: "CASHED", late: false };
  if (status === "REJECTED") return { state: "REJECTED", late: false };
  const days = daysBetween(today, dueDay);
  return { state: days <= DUE_SOON_DAYS ? "DUE" : "PLANNED", late: days < 0 };
}

/** « Chèque 2/4 », « Versement 1/3 » ; en une seule fois : « Chèque », « Espèces ». */
export function installmentLabel(method: PaymentMethod, number: number, count: number): string {
  if (count <= 1) return METHOD_LABELS[method];
  return `${method === "CHEQUE" ? "Chèque" : "Versement"} ${number}/${count}`;
}

/** « Chèque 2 », « Versement 2 » (titre d'une case de l'échéancier). */
export function installmentName(method: PaymentMethod, number: number): string {
  return `${method === "CHEQUE" ? "Chèque" : "Versement"} ${number}`;
}

/** Partage un total en `count` versements ; les centimes en trop vont sur le premier. */
export function splitAmount(totalCents: number, count: number): number[] {
  const base = Math.floor(totalCents / count);
  const rest = totalCents - base * count;
  return Array.from({ length: count }, (_, index) => (index === 0 ? base + rest : base));
}

/** Dates proposées : une échéance par mois à partir du premier versement. */
export function defaultDueDays(firstDay: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => addMonths(firstDay, index));
}

/**
 * Lit un montant saisi (« 12 », « 12,5 », « 1 234,56 », « 12.50 € ») et le
 * renvoie en centimes ; `null` si ce n'est pas un montant.
 */
export function parseAmount(raw: string): number | null {
  const text = raw.replace(/[\s  €]/g, "").replace(",", ".");
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(text)) return null;
  const [euros, cents = ""] = text.split(".");
  return Number(euros) * 100 + Number(cents.padEnd(2, "0"));
}

/** Centimes → texte d'un champ de saisie : 12350 → « 123,50 », 12000 → « 120 ». */
export function amountInputValue(cents: number): string {
  const euros = Math.floor(cents / 100);
  const rest = cents % 100;
  return rest === 0 ? String(euros) : `${euros},${String(rest).padStart(2, "0")}`;
}

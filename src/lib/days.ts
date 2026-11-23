/**
 * Jours civils. Dans toute l'application, une date comptable est une chaîne
 * « AAAA-MM-JJ » (jour à Paris) : pas d'heure, donc pas de décalage de fuseau.
 * La base stocke ces jours dans des colonnes `date`.
 */
import { toParisIsoDay } from "@/lib/format";

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Vrai si la chaîne est un jour réel du calendrier (le 31 février est refusé). */
export function isIsoDay(value: string): boolean {
  const match = ISO_DAY.exec(value);
  if (!match) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Jour d'aujourd'hui à Paris. À n'appeler qu'après un `await` lié à la requête. */
export function todayIsoDay(now: Date = new Date()): string {
  return toParisIsoDay(now);
}

/** Jour civil → valeur à écrire dans une colonne `date` (minuit UTC). */
export function toDbDay(isoDay: string): Date {
  return new Date(`${isoDay}T00:00:00Z`);
}

/** Valeur lue dans une colonne `date` → jour civil. */
export function fromDbDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(isoDay: string, days: number): string {
  const date = toDbDay(isoDay);
  date.setUTCDate(date.getUTCDate() + days);
  return fromDbDay(date);
}

/** Même jour, `months` mois plus tard ; le 31 devient le dernier jour d'un mois plus court. */
export function addMonths(isoDay: string, months: number): string {
  const [year, month, day] = isoDay.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(day, lastDay));
  return fromDbDay(first);
}

/** Nombre de jours de `from` à `to` (négatif si `to` est avant). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toDbDay(to).getTime() - toDbDay(from).getTime()) / 86_400_000);
}

export function yearOf(isoDay: string): number {
  return Number(isoDay.slice(0, 4));
}

/** « 2026-11 » → premier et dernier jour du mois. */
export function monthBounds(month: string): { first: string; last: string } {
  const [year, monthIndex] = month.split("-").map(Number);
  const first = `${month}-01`;
  const last = fromDbDay(new Date(Date.UTC(year, monthIndex, 0)));
  return { first, last };
}

/** « 2026-11 » décalé de `delta` mois. */
export function shiftMonth(month: string, delta: number): string {
  return addMonths(`${month}-01`, delta).slice(0, 7);
}

export function isIsoMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

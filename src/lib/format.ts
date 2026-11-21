/**
 * Formatage en français. Toutes les dates sont interprétées dans le fuseau
 * de l'association (Europe/Paris), quel que soit le fuseau du serveur.
 */
export const TIME_ZONE = "Europe/Paris";
const LOCALE = "fr-FR";

const eurosFormatter = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const eurosCompactFormatter = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** 123456 → « 1 234,56 € ». Les montants sont stockés en centimes. */
export function formatEuros(cents: number): string {
  return eurosFormatter.format(cents / 100);
}

/** Comme `formatEuros`, sans les centimes quand ils sont nuls : « 1 234 € ». */
export function formatEurosCompact(cents: number): string {
  return eurosCompactFormatter.format(cents / 100);
}

/** « + 1 234,56 € » ou « − 1 234,56 € » (vrai signe moins typographique). */
export function formatSignedEuros(cents: number): string {
  const sign = cents < 0 ? "−" : "+";
  return `${sign} ${formatEuros(Math.abs(cents))}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase(LOCALE) + text.slice(1);
}

const longDateFormatter = new Intl.DateTimeFormat(LOCALE, {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: TIME_ZONE,
});

const shortDayFormatter = new Intl.DateTimeFormat(LOCALE, {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: TIME_ZONE,
});

const dayMonthFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "short",
  timeZone: TIME_ZONE,
});

const isoDayFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: TIME_ZONE,
});

/** « Samedi 21 novembre 2026 » */
export function formatLongDate(date: Date): string {
  return capitalize(longDateFormatter.format(date));
}

/** « Lun. 23 nov. » */
export function formatShortDay(date: Date): string {
  return capitalize(shortDayFormatter.format(date));
}

/** « 23 nov. » */
export function formatDayMonth(date: Date): string {
  return dayMonthFormatter.format(date);
}

/** Jour civil à Paris au format ISO (« 2026-11-21 »), pratique pour comparer des dates. */
export function toParisIsoDay(date: Date): string {
  return isoDayFormatter.format(date);
}

/** Une date « jour seul » (AAAA-MM-JJ) vers un objet Date à midi UTC, stable dans tous les fuseaux. */
export function parseIsoDay(isoDay: string): Date {
  return new Date(`${isoDay}T12:00:00Z`);
}

/** Pluriel français simple : `plural(2, "chèque")` → « 2 chèques ». */
export function plural(count: number, singular: string, pluralForm?: string): string {
  const word = Math.abs(count) > 1 ? (pluralForm ?? `${singular}s`) : singular;
  return `${count} ${word}`;
}

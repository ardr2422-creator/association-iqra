/**
 * Données d'exemple (noms fictifs) pour le tableau de bord.
 *
 * Étape 1 : la mise en page et les animations sont branchées sur ces valeurs.
 * Elles seront remplacées par les vraies requêtes à l'étape « tableau de bord ».
 * Les dates sont calculées par rapport à aujourd'hui pour que les badges
 * « En retard » et « dans les 7 jours » restent cohérents.
 */
import { parseIsoDay, toParisIsoDay } from "@/lib/format";

export type MonthlyFlow = {
  /** Premier jour du mois, AAAA-MM-JJ. */
  month: string;
  /** Libellé court de l'axe : « Sept », « Oct »… */
  label: string;
  incomeCents: number;
  expenseCents: number;
};

export type UpcomingCheque = {
  id: string;
  family: string;
  /** « Chèque 2/4 · Cours d'arabe » */
  detail: string;
  /** Date prévue d'encaissement, AAAA-MM-JJ. */
  dueDay: string;
  amountCents: number;
};

export type UnpaidCourse = {
  id: string;
  family: string;
  course: string;
  progress: string;
  dueCents: number;
};

export type DashboardData = {
  today: string;
  balanceCents: number;
  chequesToCash: number;
  /** Échéances d'aujourd'hui à J+6 inclus. */
  chequesNext7Days: number;
  chequesLate: number;
  unpaidFamilies: number;
  unpaidCents: number;
  monthly: MonthlyFlow[];
  upcoming: UpcomingCheque[];
  unpaid: UnpaidCourse[];
};

const MONTH_LABELS = [
  "Janv", "Févr", "Mars", "Avr", "Mai", "Juin",
  "Juil", "Août", "Sept", "Oct", "Nov", "Déc",
];

function addDays(isoDay: string, days: number): string {
  const date = parseIsoDay(isoDay);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function lastMonths(today: string, count: number): { month: string; label: string }[] {
  const [year, month] = today.split("-").map(Number);
  return Array.from({ length: count }, (_, index) => {
    const offset = count - 1 - index;
    const date = new Date(Date.UTC(year, month - 1 - offset, 1, 12));
    return {
      month: date.toISOString().slice(0, 10),
      label: MONTH_LABELS[date.getUTCMonth()],
    };
  });
}

const INCOME = [84_000, 61_500, 228_000, 196_500, 247_000, 281_500];
const EXPENSE = [52_000, 38_500, 96_000, 121_000, 88_500, 134_000];

export function getDemoDashboard(now: Date): DashboardData {
  const today = toParisIsoDay(now);

  const monthly = lastMonths(today, 6).map((entry, index) => ({
    ...entry,
    incomeCents: INCOME[index],
    expenseCents: EXPENSE[index],
  }));

  const upcoming: UpcomingCheque[] = [
    { id: "ch-1", family: "Famille Benali", detail: "Chèque 1/4 · Cours d'anglais", dueDay: addDays(today, -3), amountCents: 9_000 },
    { id: "ch-2", family: "Famille Haddad", detail: "Chèque 2/4 · Cours d'arabe", dueDay: addDays(today, 2), amountCents: 12_000 },
    { id: "ch-3", family: "Famille Diallo", detail: "Chèque 3/4 · Soutien scolaire", dueDay: addDays(today, 4), amountCents: 7_500 },
    { id: "ch-4", family: "Famille Lefèvre", detail: "Chèque 2/3 · Cours d'arabe", dueDay: addDays(today, 9), amountCents: 10_000 },
  ];

  const unpaid: UnpaidCourse[] = [
    { id: "un-1", family: "Famille Haddad", course: "Cours d'arabe · 2 enfants", progress: "2 versements sur 4 reçus", dueCents: 24_000 },
    { id: "un-2", family: "Famille Moreau", course: "Soutien scolaire · 1 enfant", progress: "Aucun versement", dueCents: 18_000 },
    { id: "un-3", family: "Famille Benali", course: "Cours d'anglais · 1 enfant", progress: "1 versement sur 4 reçu", dueCents: 27_000 },
  ];

  const inSevenDays = addDays(today, 7);

  return {
    today,
    balanceCents: 1_284_650,
    chequesToCash: 7,
    chequesNext7Days: upcoming.filter((c) => c.dueDay >= today && c.dueDay < inSevenDays).length,
    chequesLate: upcoming.filter((c) => c.dueDay < today).length,
    unpaidFamilies: unpaid.length,
    unpaidCents: unpaid.reduce((sum, item) => sum + item.dueCents, 0),
    monthly,
    upcoming,
    unpaid,
  };
}

/**
 * Formes des données envoyées aux pages (types seulement). Les jours sont des
 * chaînes « AAAA-MM-JJ », les montants des centimes entiers.
 */
import type { FlowType } from "@/lib/categories";
import type { InstallmentState, InstallmentStatus, PaymentMethod } from "@/lib/payments";

export type ReceiptRef = { id: string; number: string };

/** Une échéance (le plus souvent un chèque) d'un paiement en plusieurs fois. */
export type InstallmentView = {
  id: string;
  planId: string;
  /** Rang du versement (1 à 4) et nombre total de versements. */
  number: number;
  count: number;
  amountCents: number;
  dueDay: string;
  method: PaymentMethod;
  chequeNumber: string | null;
  bank: string | null;
  status: InstallmentStatus;
  /** Statut affiché (« À encaisser » est calculé) et retard éventuel. */
  state: InstallmentState;
  late: boolean;
  cashedDay: string | null;
  memberId: string;
  memberName: string;
  /** « Cours d'arabe 2026-2027 » ou, à défaut, le nom de la catégorie. */
  planLabel: string;
  categoryName: string;
  categoryColor: string;
  receipt: ReceiptRef | null;
};

/** Un paiement d'adhérent, en une ou plusieurs fois. */
export type PlanView = {
  id: string;
  memberId: string;
  memberName: string;
  label: string;
  categoryName: string;
  categoryColor: string;
  participants: number | null;
  totalCents: number;
  installmentCount: number;
  paidCents: number;
  remainingCents: number;
  /** Nombre de versements déjà encaissés. */
  cashedCount: number;
  createdDay: string;
  installments: InstallmentView[];
};

/** Une ligne du tableau « Entrées & sorties ». */
export type TransactionView = {
  id: string;
  day: string;
  type: FlowType;
  /** Colonne « Qui » : l'adhérent, le payeur, ou le libellé d'une dépense. */
  who: string;
  memberId: string | null;
  label: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  method: PaymentMethod;
  /** « Chèque 2/4 », « Virement »… */
  methodLabel: string;
  chequeNumber: string | null;
  bank: string | null;
  amountCents: number;
  cancelled: boolean;
  notes: string | null;
  receipt: ReceiptRef | null;
};

export type MemberListItem = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  joinedDay: string;
  archived: boolean;
  /** Encaissé pendant l'année civile en cours. */
  paidThisYearCents: number;
  /** Échéances pas encore encaissées (prévues ou rejetées). */
  remainingCents: number;
  lateCount: number;
  nextDue: { day: string; amountCents: number } | null;
};

export type MemberOption = { id: string; name: string };

export type MemberDetail = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  joinedDay: string;
  archived: boolean;
  /** Vrai si l'adhérent n'a aucun paiement : il peut être supprimé définitivement. */
  deletable: boolean;
  today: string;
  year: number;
  paidThisYearCents: number;
  remainingCents: number;
  /** Paiements de l'adhérent, du plus récent au plus ancien. */
  plans: PlanView[];
  /** Historique des encaissements (annulés compris), du plus récent au plus ancien. */
  payments: TransactionView[];
};

export type ReceiptListItem = {
  id: string;
  number: string;
  issuedDay: string;
  payerName: string;
  memberId: string | null;
  designation: string;
  amountCents: number;
  /** L'encaissement correspondant a été annulé. */
  cancelled: boolean;
};

/** Une ligne de l'échéancier imprimé sur un reçu. */
export type ReceiptScheduleLine = {
  number: number;
  amountCents: number;
  day: string;
  status: InstallmentStatus;
  method: PaymentMethod;
};

/** Tout ce qui est imprimé sur un reçu, figé au moment de l'émission. */
export type ReceiptSnapshot = {
  version: 1;
  association: {
    name: string;
    /** Adresse, puis « code postal ville ». */
    addressLines: string[];
    email: string | null;
    phone: string | null;
    rna: string | null;
    treasurerName: string | null;
  };
  payer: { name: string; address: string | null };
  /** « Cours d'arabe 2026-2027 · versement 2 sur 4 » */
  designation: string;
  /** Jour du paiement. */
  paidDay: string;
  amountCents: number;
  /** « cent vingt euros » */
  amountWords: string;
  /** « Chèque n° 1234567 · Banque Postale » */
  methodLabel: string;
  schedule: ReceiptScheduleLine[] | null;
  /** « Ce reçu atteste du paiement et ne vaut pas reçu fiscal. » */
  notice: string;
};

export type ReceiptDocument = {
  id: string;
  number: string;
  issuedDay: string;
  cancelled: boolean;
  snapshot: ReceiptSnapshot;
};

export type SettingsView = {
  associationName: string;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  email: string | null;
  phone: string | null;
  rna: string | null;
  treasurerName: string | null;
  reminderEmail: string | null;
  fiscalReceiptsEnabled: boolean;
  openingBalanceCents: number;
  demoMode: boolean;
  /** Vrai si aucun adhérent ni mouvement n'existe : les données de démonstration peuvent être chargées. */
  empty: boolean;
  /** Les rappels par email sont-ils configurés sur le serveur (clé d'envoi présente) ? */
  remindersConfigured: boolean;
};

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
  memberId: string;
  family: string;
  /** « Chèque 2/4 · Cours d'arabe » */
  detail: string;
  dueDay: string;
  amountCents: number;
};

export type UnpaidCourse = {
  id: string;
  memberId: string;
  family: string;
  /** « Cours d'arabe · 2 enfants » */
  course: string;
  /** « 2 versements sur 4 reçus » */
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
  /** Aucun mouvement ni adhérent : on propose de commencer. */
  empty: boolean;
};

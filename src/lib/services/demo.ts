import "server-only";
import { addDays, toDbDay } from "@/lib/days";
import type { IncomeMethod, PaymentMethod } from "@/lib/payments";
import { DomainError } from "@/lib/services/errors";
import { cashInstallment, recordExpense, recordIncome, rejectInstallment, type Tx } from "@/lib/services/money";

/*
 * Données de démonstration : familles et montants fictifs, datés par rapport à
 * aujourd'hui pour que les chèques « en retard » et « à encaisser » restent
 * parlants. Tout passe par les mêmes fonctions que la saisie réelle
 * (`recordIncome`, `cashInstallment`…), dans l'ordre chronologique : les reçus
 * sont donc numérotés comme en vrai.
 *
 * Numéros de téléphone : plage 06 39 98 réservée aux œuvres de fiction.
 */

/** Solde de départ posé pendant la démonstration (remis à zéro à la fin). */
export const DEMO_OPENING_BALANCE_CENTS = 350_000;

const MEMBERS = [
  { key: "benali", name: "Famille Benali", phone: "06 39 98 01 12", email: "benali@exemple.fr", address: "12 rue des Lilas\n69100 Villeurbanne", joined: -150 },
  { key: "haddad", name: "Famille Haddad", phone: "06 39 98 02 27", email: "famille.haddad@exemple.fr", address: "4 allée des Tilleuls\n69100 Villeurbanne", joined: -140 },
  { key: "diallo", name: "Famille Diallo", phone: "06 39 98 03 41", email: null, address: "27 avenue de la Gare\n69120 Vaulx-en-Velin", joined: -120 },
  { key: "lefevre", name: "Famille Lefèvre", phone: "06 39 98 04 58", email: "lefevre@exemple.fr", address: null, joined: -60 },
  { key: "moreau", name: "Famille Moreau", phone: "06 39 98 05 63", email: "moreau@exemple.fr", address: "8 impasse du Moulin\n69500 Bron", joined: -20 },
  { key: "traore", name: "Famille Traoré", phone: "06 39 98 06 79", email: "traore@exemple.fr", address: "15 rue Pasteur\n69100 Villeurbanne", joined: -150 },
  { key: "nguyen", name: "Famille Nguyen", phone: "06 39 98 07 84", email: null, address: null, joined: -90 },
  { key: "rahmani", name: "Famille Rahmani", phone: "06 39 98 08 90", email: "rahmani@exemple.fr", address: "3 place du Marché\n69120 Vaulx-en-Velin", joined: -130 },
  { key: "petit", name: "Famille Petit", phone: "06 39 98 09 15", email: "petit@exemple.fr", address: null, joined: -110 },
  { key: "cherif", name: "Mme Yasmine Cherif", phone: "06 39 98 10 36", email: "y.cherif@exemple.fr", address: "21 rue de la République\n69100 Villeurbanne", joined: -85 },
  { key: "bensaid", name: "M. Karim Bensaïd", phone: "06 39 98 11 47", email: null, address: null, joined: -115 },
] as const;

type MemberKey = (typeof MEMBERS)[number]["key"];
type IncomeCategory = "dons" | "adhesions" | "cours_anglais" | "cours_arabe" | "soutien_scolaire" | "sorties";
type ExpenseCategory = "fournitures" | "loyer" | "sorties_depenses" | "intervenants" | "frais_divers";

type Payment = {
  member: MemberKey;
  category: IncomeCategory;
  label?: string;
  participants?: number;
  method: IncomeMethod;
  bank?: string;
  /** Montant (en euros) et jour (par rapport à aujourd'hui) de chaque versement. */
  amounts: number[];
  days: number[];
  /** Nombre de versements encaissés à leur date (0 : tout reste prévu). */
  cashed: number;
  /** Rang d'un versement encaissé puis rejeté par la banque. */
  bounced?: number;
};

const SEASON = "2026-2027";

const PAYMENTS: Payment[] = [
  { member: "benali", category: "adhesions", label: `Adhésion ${SEASON}`, method: "CASH", amounts: [30], days: [-40], cashed: 1 },
  { member: "benali", category: "cours_anglais", label: `Cours d'anglais ${SEASON}`, participants: 1, method: "CHEQUE", bank: "Crédit Mutuel", amounts: [90, 90, 90, 90], days: [-33, -3, 27, 58], cashed: 1 },
  { member: "haddad", category: "adhesions", label: `Adhésion ${SEASON}`, method: "CHEQUE", bank: "Banque Postale", amounts: [30], days: [-60], cashed: 1 },
  { member: "haddad", category: "cours_arabe", label: `Cours d'arabe ${SEASON}`, participants: 2, method: "CHEQUE", bank: "Banque Postale", amounts: [120, 120, 120, 120], days: [-58, -28, 2, 32], cashed: 2 },
  { member: "diallo", category: "adhesions", label: `Adhésion ${SEASON}`, method: "CASH", amounts: [30], days: [-57], cashed: 1 },
  { member: "diallo", category: "soutien_scolaire", label: `Soutien scolaire ${SEASON}`, participants: 1, method: "CHEQUE", bank: "Caisse d'Épargne", amounts: [75, 75, 75, 75], days: [-56, -26, 4, 35], cashed: 2 },
  { member: "lefevre", category: "cours_arabe", label: `Cours d'arabe ${SEASON}`, participants: 1, method: "CHEQUE", bank: "LCL", amounts: [100, 100, 100], days: [-21, 9, 40], cashed: 1 },
  { member: "moreau", category: "adhesions", label: `Adhésion ${SEASON}`, method: "TRANSFER", amounts: [30], days: [-12], cashed: 1 },
  { member: "moreau", category: "soutien_scolaire", label: `Soutien scolaire ${SEASON}`, participants: 1, method: "CHEQUE", bank: "BNP Paribas", amounts: [90, 90], days: [-9, 21], cashed: 0 },
  { member: "traore", category: "cours_anglais", label: `Cours d'anglais ${SEASON}`, participants: 2, method: "CHEQUE", bank: "Société Générale", amounts: [180, 180, 180], days: [-95, -64, -34], cashed: 3 },
  { member: "nguyen", category: "cours_arabe", label: `Cours d'arabe ${SEASON}`, participants: 1, method: "TRANSFER", amounts: [240], days: [-45], cashed: 1 },
  { member: "nguyen", category: "sorties", label: "Sortie au musée", method: "CASH", amounts: [25], days: [-15], cashed: 1 },
  { member: "rahmani", category: "cours_arabe", label: `Cours d'arabe ${SEASON}`, participants: 3, method: "CHEQUE", bank: "Crédit Agricole", amounts: [165, 165, 165, 165], days: [-70, -40, -10, 21], cashed: 3, bounced: 2 },
  { member: "petit", category: "adhesions", label: `Adhésion ${SEASON}`, method: "CASH", amounts: [30], days: [-100], cashed: 1 },
  { member: "petit", category: "sorties", label: "Sortie au musée", method: "CHEQUE", bank: "Crédit Mutuel", amounts: [40], days: [-20], cashed: 1 },
  { member: "cherif", category: "dons", method: "CASH", amounts: [50], days: [-80], cashed: 1 },
  { member: "cherif", category: "cours_anglais", label: `Cours d'anglais ${SEASON}`, participants: 1, method: "CHEQUE", bank: "Banque Populaire", amounts: [90, 90], days: [-14, 17], cashed: 1 },
  { member: "bensaid", category: "adhesions", label: `Adhésion ${SEASON}`, method: "CASH", amounts: [30], days: [-110], cashed: 1 },
  { member: "bensaid", category: "dons", method: "TRANSFER", amounts: [100], days: [-50], cashed: 1 },
];

const DONATIONS: { payer: string; method: IncomeMethod; bank?: string; amount: number; day: number; label?: string }[] = [
  { payer: "Recette de la kermesse", method: "CASH", amount: 85, day: -130, label: "Kermesse de fin d'année" },
  { payer: "Boulangerie du Parc", method: "TRANSFER", amount: 150, day: -75 },
  { payer: "M. et Mme Roussel", method: "CHEQUE", bank: "LCL", amount: 60, day: -22 },
];

const EXPENSES: { category: ExpenseCategory; label: string; method: PaymentMethod; amount: number; day: number }[] = [
  ...[-140, -110, -80, -50, -20].map((day) => ({ category: "loyer" as const, label: "Loyer de la salle", method: "TRANSFER" as const, amount: 450, day })),
  { category: "frais_divers", label: "Assurance annuelle", method: "CHEQUE", amount: 210, day: -120 },
  { category: "fournitures", label: "Cahiers et manuels d'arabe", method: "CARD", amount: 126.4, day: -90 },
  { category: "sorties_depenses", label: "Goûter de rentrée", method: "CARD", amount: 72.35, day: -88 },
  { category: "intervenants", label: "Intervenante cours d'anglais", method: "TRANSFER", amount: 300, day: -62 },
  { category: "fournitures", label: "Fournitures soutien scolaire", method: "CARD", amount: 64.9, day: -35 },
  { category: "intervenants", label: "Intervenante cours d'anglais", method: "TRANSFER", amount: 300, day: -31 },
  { category: "frais_divers", label: "Frais bancaires", method: "TRANSFER", amount: 12.5, day: -28 },
  { category: "sorties_depenses", label: "Location minibus", method: "CASH", amount: 180, day: -18 },
  { category: "fournitures", label: "Cartouches d'encre", method: "CARD", amount: 48, day: -8 },
  { category: "intervenants", label: "Intervenante cours d'anglais", method: "TRANSFER", amount: 300, day: -2 },
];

const cents = (euros: number) => Math.round(euros * 100);

/** Catégorie par défaut si elle existe encore, sinon la première catégorie active du même sens. */
async function resolveCategories(tx: Tx) {
  const categories = await tx.category.findMany({
    where: { archivedAt: null },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    select: { id: true, type: true },
  });
  const pick = (key: string, type: "INCOME" | "EXPENSE"): string => {
    const id = `cat_defaut_${key}`;
    const found = categories.find((category) => category.id === id && category.type === type);
    const fallback = categories.find((category) => category.type === type);
    if (!found && !fallback) throw new DomainError("CATEGORY_UNAVAILABLE");
    return (found ?? fallback!).id;
  };
  return { income: (key: IncomeCategory) => pick(key, "INCOME"), expense: (key: ExpenseCategory) => pick(key, "EXPENSE") };
}

/** Remplit une base vide avec les données de démonstration et active le mode démonstration. */
export async function loadDemoData(tx: Tx, today: string): Promise<void> {
  const [members, transactions, plans] = await Promise.all([
    tx.member.count(),
    tx.transaction.count(),
    tx.paymentPlan.count(),
  ]);
  if (members + transactions + plans > 0) throw new DomainError("DEMO_NOT_EMPTY");

  const categories = await resolveCategories(tx);
  const day = (offset: number) => addDays(today, offset);

  const memberIds = new Map<MemberKey, string>();
  for (const member of MEMBERS) {
    const created = await tx.member.create({
      data: {
        name: member.name,
        phone: member.phone,
        email: member.email,
        address: member.address,
        joinedOn: toDbDay(day(member.joined)),
      },
      select: { id: true },
    });
    memberIds.set(member.key, created.id);
  }

  // Chaque écriture est datée ; on les applique dans l'ordre du calendrier.
  const steps: { offset: number; run: () => Promise<void> }[] = [];
  let chequeNumber = 4_512_300;

  for (const payment of PAYMENTS) {
    const numbers = payment.amounts.map(() => (payment.method === "CHEQUE" ? String((chequeNumber += 7)) : null));
    let planId: string | null = null;
    const installmentId = async (number: number) => {
      const row = await tx.installment.findFirstOrThrow({ where: { planId: planId!, number }, select: { id: true } });
      return row.id;
    };

    steps.push({
      // Un paiement dont rien n'est encaissé a été saisi une semaine avant sa première échéance.
      offset: payment.cashed > 0 ? payment.days[0] : Math.min(payment.days[0] - 7, 0),
      run: async () => {
        const result = await recordIncome(
          tx,
          {
            memberId: memberIds.get(payment.member)!,
            payerName: null,
            categoryId: categories.income(payment.category),
            label: payment.label ?? null,
            participants: payment.participants ?? null,
            method: payment.method,
            installments: payment.amounts.map((amount, index) => ({
              amountCents: cents(amount),
              day: day(payment.days[index]),
              chequeNumber: numbers[index],
              bank: payment.bank ?? null,
            })),
            firstCashed: payment.cashed > 0,
            notes: null,
          },
          today,
          day(payment.days[0]),
        );
        planId = result.planId;
      },
    });

    for (let number = 2; number <= payment.cashed; number += 1) {
      const offset = payment.days[number - 1];
      steps.push({
        offset,
        run: async () => {
          await cashInstallment(tx, await installmentId(number), day(offset), today, day(offset));
        },
      });
    }
    if (payment.bounced) {
      const number = payment.bounced;
      // La banque rejette le chèque quelques jours après son dépôt.
      steps.push({ offset: payment.days[number - 1] + 4, run: async () => rejectInstallment(tx, await installmentId(number)) });
    }
  }

  for (const donation of DONATIONS) {
    steps.push({
      offset: donation.day,
      run: async () => {
        await recordIncome(
          tx,
          {
            memberId: null,
            payerName: donation.payer,
            categoryId: categories.income("dons"),
            label: donation.label ?? null,
            participants: null,
            method: donation.method,
            installments: [
              {
                amountCents: cents(donation.amount),
                day: day(donation.day),
                chequeNumber: donation.method === "CHEQUE" ? String((chequeNumber += 7)) : null,
                bank: donation.bank ?? null,
              },
            ],
            firstCashed: true,
            notes: null,
          },
          today,
          day(donation.day),
        );
      },
    });
  }

  for (const expense of EXPENSES) {
    steps.push({
      offset: expense.day,
      run: async () => {
        await recordExpense(
          tx,
          {
            day: day(expense.day),
            label: expense.label,
            categoryId: categories.expense(expense.category),
            amountCents: cents(expense.amount),
            method: expense.method,
            chequeNumber: null,
            bank: null,
            notes: null,
          },
          today,
        );
      },
    });
  }

  // Tri stable : à date égale, l'ordre de déclaration est conservé.
  const ordered = steps.map((step, index) => ({ ...step, index })).sort((a, b) => a.offset - b.offset || a.index - b.index);
  for (const step of ordered) await step.run();

  const settings = await tx.settings.findUnique({ where: { id: 1 }, select: { openingBalanceCents: true } });
  await tx.settings.upsert({
    where: { id: 1 },
    create: { id: 1, demoMode: true, openingBalanceCents: DEMO_OPENING_BALANCE_CENTS },
    update: {
      demoMode: true,
      ...(settings?.openingBalanceCents === 0 ? { openingBalanceCents: DEMO_OPENING_BALANCE_CENTS } : {}),
    },
  });
}

/**
 * Fin de la démonstration : efface TOUS les adhérents, mouvements, échéances
 * et reçus, et remet la numérotation des reçus à zéro. Les catégories et les
 * informations de l'association sont conservées. Refusé hors démonstration.
 */
export async function clearDemoData(tx: Tx): Promise<void> {
  const settings = await tx.settings.findUnique({
    where: { id: 1 },
    select: { demoMode: true, openingBalanceCents: true },
  });
  if (!settings?.demoMode) throw new DomainError("DEMO_NOT_ACTIVE");

  await tx.receipt.deleteMany();
  await tx.installment.deleteMany();
  await tx.paymentPlan.deleteMany();
  await tx.transaction.deleteMany();
  await tx.member.deleteMany();
  await tx.receiptCounter.deleteMany();
  await tx.settings.update({
    where: { id: 1 },
    data: {
      demoMode: false,
      ...(settings.openingBalanceCents === DEMO_OPENING_BALANCE_CENTS ? { openingBalanceCents: 0 } : {}),
    },
  });
}

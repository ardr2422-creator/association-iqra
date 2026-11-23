/*
 * Tests des règles comptables, directement sur une base Postgres locale
 * (sans navigateur) : `npm run test:domain`.
 *
 *   E2E_DATABASE_URL  base de test, migrations appliquées (défaut : iqra_dev en local)
 *
 * ATTENTION : ces tests vident les tables métier de la base indiquée.
 */
import assert from "node:assert/strict";
import { amountInWords } from "../../src/lib/amount-words";
import { addMonths, daysBetween, isIsoDay, monthBounds } from "../../src/lib/days";
import { defaultDueDays, installmentState, parseAmount, splitAmount } from "../../src/lib/payments";
import { amountSchema, daySchema, optionalLine, optionalText, requiredLine } from "../../src/lib/validation";

process.env.DATABASE_URL = process.env.E2E_DATABASE_URL || "postgresql://iqra:iqra@localhost:5432/iqra_dev";
if (!/localhost|127\.0\.0\.1|iqra-db\.test/.test(process.env.DATABASE_URL)) {
  throw new Error("Ces tests vident la base : ils ne tournent que sur une base locale.");
}

let passed = 0;
const failures: string[] = [];
async function check(name: string, run: () => void | Promise<void>) {
  try {
    await run();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`FAIL  ${name}\n      ${error instanceof Error ? error.message.split("\n")[0] : error}`);
  }
}

async function main() {
  const { getDb } = await import("../../src/lib/db");
  const money = await import("../../src/lib/services/money");
  const demo = await import("../../src/lib/services/demo");
  const { DomainError } = await import("../../src/lib/services/errors");
  const db = getDb();
  const TODAY = "2026-11-23";

  const wipe = async () => {
    await db.receipt.deleteMany();
    await db.installment.deleteMany();
    await db.paymentPlan.deleteMany();
    await db.transaction.deleteMany();
    await db.member.deleteMany();
    await db.receiptCounter.deleteMany();
    await db.settings.deleteMany();
  };
  const inTx = <T>(work: (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => Promise<T>) =>
    db.$transaction(async (tx) => {
      await money.lockMoney(tx);
      return work(tx);
    }, { timeout: 60_000 });
  const refuses = async (code: string, work: () => Promise<unknown>) => {
    await assert.rejects(work, (error: unknown) => error instanceof DomainError && error.code === code);
  };
  const balance = async () => {
    const rows = await db.transaction.groupBy({ by: ["type"], where: { status: "COMPLETED" }, _sum: { amountCents: true } });
    const sum = (type: string) => rows.find((row) => row.type === type)?._sum.amountCents ?? 0;
    return sum("INCOME") - sum("EXPENSE");
  };

  // ---------------------------------------------------------------- fonctions pures
  await check("montant en lettres : cas usuels et pièges du français", () => {
    const cases: [number, string][] = [
      [100, "un euro"],
      [200, "deux euros"],
      [2100, "vingt et un euros"],
      [7100, "soixante et onze euros"],
      [8000, "quatre-vingts euros"],
      [8100, "quatre-vingt-un euros"],
      [9100, "quatre-vingt-onze euros"],
      [9900, "quatre-vingt-dix-neuf euros"],
      [10000, "cent euros"],
      [12000, "cent vingt euros"],
      [20000, "deux cents euros"],
      [20100, "deux cent un euros"],
      [100000, "mille euros"],
      [123456, "mille deux cent trente-quatre euros et cinquante-six centimes"],
      [8000000, "quatre-vingt mille euros"],
      [20000000, "deux cent mille euros"],
      [100000000, "un million d'euros"],
      [12050, "cent vingt euros et cinquante centimes"],
      [101, "un euro et un centime"],
      [50, "cinquante centimes"],
      [0, "zéro euro"],
    ];
    for (const [cents, words] of cases) assert.equal(amountInWords(cents), words, `${cents}`);
  });

  await check("partage d'un total en versements : rien ne se perd", () => {
    assert.deepEqual(splitAmount(36000, 4), [9000, 9000, 9000, 9000]);
    assert.deepEqual(splitAmount(10000, 3), [3334, 3333, 3333]);
    assert.deepEqual(splitAmount(1, 4), [1, 0, 0, 0]);
    for (const total of [1, 99, 100, 12345, 999999]) {
      for (const count of [1, 2, 3, 4]) assert.equal(splitAmount(total, count).reduce((a, b) => a + b, 0), total);
    }
  });

  await check("dates : mois suivants, fin de mois, jours réels", () => {
    assert.deepEqual(defaultDueDays("2026-11-05", 4), ["2026-11-05", "2026-12-05", "2027-01-05", "2027-02-05"]);
    assert.equal(addMonths("2027-01-31", 1), "2027-02-28");
    assert.equal(addMonths("2028-01-31", 1), "2028-02-29");
    assert.equal(daysBetween("2026-11-23", "2026-11-20"), -3);
    assert.deepEqual(monthBounds("2028-02"), { first: "2028-02-01", last: "2028-02-29" });
    assert.equal(isIsoDay("2026-02-30"), false);
    assert.equal(isIsoDay("2026-2-3"), false);
    assert.equal(isIsoDay("2026-02-28"), true);
  });

  await check("statut affiché d'une échéance (prévu, à encaisser, en retard)", () => {
    assert.deepEqual(installmentState("PLANNED", "2026-12-25", TODAY), { state: "PLANNED", late: false });
    assert.deepEqual(installmentState("PLANNED", "2026-11-30", TODAY), { state: "DUE", late: false });
    assert.deepEqual(installmentState("PLANNED", "2026-11-23", TODAY), { state: "DUE", late: false });
    assert.deepEqual(installmentState("PLANNED", "2026-11-22", TODAY), { state: "DUE", late: true });
    assert.deepEqual(installmentState("CASHED", "2026-11-01", TODAY), { state: "CASHED", late: false });
    assert.deepEqual(installmentState("REJECTED", "2026-11-01", TODAY), { state: "REJECTED", late: false });
  });

  await check("lecture d'un montant saisi", () => {
    assert.equal(parseAmount("12"), 1200);
    assert.equal(parseAmount("12,5"), 1250);
    assert.equal(parseAmount("1 234,56 €"), 123456);
    assert.equal(parseAmount("12.50"), 1250);
    for (const bad of ["", "abc", "12,345", "-5", "1e3", "12,", "0x10", "1,2,3"]) assert.equal(parseAmount(bad), null, bad);
    assert.equal(amountSchema.safeParse("0").success, false);
    assert.equal(amountSchema.safeParse(-100).success, false);
    assert.equal(amountSchema.safeParse(12.5).success, false);
    assert.equal(amountSchema.safeParse("1000000,01").success, false);
    assert.equal(amountSchema.parse("120,50"), 12050);
  });

  await check("validation des textes : normalisation, caractères trompeurs, longueurs", () => {
    const name = requiredLine(20, { required: "requis" });
    assert.equal(name.parse("  Famille   Benali "), "Famille Benali");
    assert.equal(name.parse("Café"), "Café");
    assert.equal(name.safeParse("   ").success, false);
    assert.equal(name.safeParse("a​b").success, false);
    assert.equal(name.safeParse("x".repeat(21)).success, false);
    assert.equal(name.safeParse(42).success, false);
    assert.equal(optionalLine(10).parse("   "), null);
    assert.equal(optionalLine(10).parse(undefined), null);
    assert.equal(optionalText(50).parse(" 12 rue  des Lilas \r\n 69100 Villeurbanne "), "12 rue des Lilas\n69100 Villeurbanne");
    assert.equal(optionalText(50).safeParse("a\u0007b").success, false);
    assert.equal(daySchema.safeParse("1999-12-31").success, false);
    assert.equal(daySchema.safeParse("2026-13-01").success, false);
  });

  // ---------------------------------------------------------------- écritures
  await wipe();
  const member = await db.member.create({ data: { name: "Famille Test", address: "1 rue du Test\n69000 Lyon" }, select: { id: true } });
  const line = (amountCents: number, day: string, chequeNumber: string | null = null) => ({ amountCents, day, chequeNumber, bank: chequeNumber ? "Banque Test" : null });
  const income = (overrides: Record<string, unknown> = {}) => ({
    memberId: member.id,
    payerName: null,
    categoryId: "cat_defaut_cours_arabe",
    label: "Cours d'arabe 2026-2027",
    participants: 2,
    method: "CHEQUE" as const,
    installments: [line(12000, "2026-11-20", "111"), line(12000, "2026-12-20", "112"), line(12000, "2027-01-20", "113"), line(12000, "2027-02-20", "114")],
    firstCashed: true,
    notes: null,
    ...overrides,
  });

  let planId = "";
  await check("paiement en 4 fois : 1 mouvement, 1 reçu, 3 chèques prévus, solde = argent encaissé", async () => {
    const result = await inTx((tx) => money.recordIncome(tx, income(), TODAY));
    planId = result.planId!;
    assert.equal(result.receipt?.number, "2026-0001");
    assert.equal(await balance(), 12000);
    const lines = await db.installment.findMany({ where: { planId }, orderBy: { number: "asc" } });
    assert.deepEqual(lines.map((l) => l.status), ["CASHED", "PLANNED", "PLANNED", "PLANNED"]);
    const receipt = await db.receipt.findUniqueOrThrow({ where: { id: result.receipt!.id } });
    const snapshot = receipt.snapshot as Record<string, any>;
    assert.equal(snapshot.designation, "Cours d'arabe 2026-2027 · versement 1 sur 4");
    assert.equal(snapshot.amountWords, "cent vingt euros");
    assert.equal(snapshot.methodLabel, "Chèque n° 111 · Banque Test");
    assert.equal(snapshot.schedule.length, 4);
    assert.equal(snapshot.payer.name, "Famille Test");
    assert.equal(receipt.payerAddress, "1 rue du Test\n69000 Lyon");
  });

  await check("un chèque prévu n'entre dans le solde qu'à l'encaissement, avec un reçu qui se suit", async () => {
    const second = await db.installment.findFirstOrThrow({ where: { planId, number: 2 } });
    const result = await inTx((tx) => money.cashInstallment(tx, second.id, "2026-11-23", TODAY));
    assert.equal(result.receipt.number, "2026-0002");
    assert.equal(await balance(), 24000);
    const snapshot = (await db.receipt.findUniqueOrThrow({ where: { id: result.receipt.id } })).snapshot as Record<string, any>;
    assert.equal(snapshot.designation, "Cours d'arabe 2026-2027 · versement 2 sur 4");
    assert.deepEqual(snapshot.schedule.map((l: any) => l.status), ["CASHED", "CASHED", "PLANNED", "PLANNED"]);
    assert.equal(snapshot.schedule[1].day, "2026-11-23");
  });

  await check("un chèque ne peut pas être encaissé deux fois, ni dans le futur", async () => {
    const second = await db.installment.findFirstOrThrow({ where: { planId, number: 2 } });
    const third = await db.installment.findFirstOrThrow({ where: { planId, number: 3 } });
    await refuses("ALREADY_CASHED", () => inTx((tx) => money.cashInstallment(tx, second.id, "2026-11-23", TODAY)));
    await refuses("FUTURE_DAY", () => inTx((tx) => money.cashInstallment(tx, third.id, "2026-11-24", TODAY)));
    await refuses("INSTALLMENT_GONE", () => inTx((tx) => money.cashInstallment(tx, "inconnu", "2026-11-23", TODAY)));
    assert.equal(await balance(), 24000);
    assert.equal(await db.receipt.count(), 2);
  });

  await check("deux encaissements simultanés du même chèque : un seul passe", async () => {
    const third = await db.installment.findFirstOrThrow({ where: { planId, number: 3 } });
    const results = await Promise.allSettled([
      inTx((tx) => money.cashInstallment(tx, third.id, "2026-11-23", TODAY)),
      inTx((tx) => money.cashInstallment(tx, third.id, "2026-11-23", TODAY)),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(await balance(), 36000);
    assert.equal(await db.receipt.count(), 3);
  });

  await check("chèque encaissé puis rejeté : mouvement annulé, retiré du solde, reçu conservé", async () => {
    const third = await db.installment.findFirstOrThrow({ where: { planId, number: 3 } });
    await inTx((tx) => money.rejectInstallment(tx, third.id));
    assert.equal(await balance(), 24000);
    assert.equal(await db.receipt.count(), 3);
    assert.equal(await db.transaction.count({ where: { status: "CANCELLED" } }), 1);
    const after = await db.installment.findUniqueOrThrow({ where: { id: third.id } });
    assert.equal(after.status, "REJECTED");
    assert.equal(after.cashedOn, null);
  });

  await check("chèque de remplacement : l'échéance rejetée redevient prévue puis s'encaisse", async () => {
    const third = await db.installment.findFirstOrThrow({ where: { planId, number: 3 } });
    await inTx((tx) => money.replanInstallment(tx, third.id, { dueDay: "2026-11-22", chequeNumber: "999", bank: "Autre Banque" }));
    const result = await inTx((tx) => money.cashInstallment(tx, third.id, "2026-11-23", TODAY));
    assert.equal(result.receipt.number, "2026-0004");
    const snapshot = (await db.receipt.findUniqueOrThrow({ where: { id: result.receipt.id } })).snapshot as Record<string, any>;
    assert.equal(snapshot.methodLabel, "Chèque n° 999 · Autre Banque");
    assert.equal(await balance(), 36000);
    const second = await db.installment.findFirstOrThrow({ where: { planId, number: 2 } });
    await refuses("ALREADY_CASHED", () => inTx((tx) => money.replanInstallment(tx, second.id, { dueDay: "2027-01-01", chequeNumber: null, bank: null })));
  });

  await check("annulation d'un mouvement : l'échéance redevient prévue, rien n'est effacé", async () => {
    const second = await db.installment.findFirstOrThrow({ where: { planId, number: 2 } });
    const before = await db.transaction.count();
    await inTx((tx) => money.cancelTransaction(tx, second.transactionId!));
    assert.equal(await db.transaction.count(), before);
    assert.equal(await balance(), 24000);
    assert.equal((await db.installment.findUniqueOrThrow({ where: { id: second.id } })).status, "PLANNED");
    await refuses("ALREADY_CANCELLED", () => inTx((tx) => money.cancelTransaction(tx, second.transactionId!)));
    await refuses("PLAN_HAS_CASHED", () => inTx((tx) => money.deletePaymentPlan(tx, planId)));
  });

  await check("un refus en cours de route annule tout : pas de trou dans les numéros de reçus", async () => {
    const counter = async () => (await db.receiptCounter.findUnique({ where: { year: 2026 } }))?.last;
    const before = await counter();
    await assert.rejects(() =>
      inTx(async (tx) => {
        await money.recordIncome(tx, income({ installments: [line(5000, "2026-11-23")], method: "CASH" }), TODAY);
        throw new Error("panne simulée");
      }),
    );
    assert.equal(await counter(), before);
    const result = await inTx((tx) => money.recordIncome(tx, income({ installments: [line(5000, "2026-11-23")], method: "CASH", label: null }), TODAY));
    assert.equal(result.receipt?.number, "2026-0005");
    const numbers = (await db.receipt.findMany({ orderBy: { sequence: "asc" } })).map((r) => r.sequence);
    assert.deepEqual(numbers, [1, 2, 3, 4, 5]);
  });

  await check("paiement en une fois annulé : il disparaît de la fiche, le mouvement reste dans l'historique", async () => {
    const single = await db.paymentPlan.findFirstOrThrow({ where: { installmentCount: 1 }, include: { installments: true } });
    await inTx((tx) => money.cancelTransaction(tx, single.installments[0].transactionId!));
    assert.equal(await db.paymentPlan.count({ where: { id: single.id } }), 0);
    assert.equal(await db.transaction.count({ where: { status: "CANCELLED" } }), 3);
    assert.equal(await balance(), 24000);
  });

  await check("sans adhérent : don simple accepté, paiement en plusieurs fois refusé", async () => {
    const don = { memberId: null, payerName: "Boulangerie du Parc", categoryId: "cat_defaut_dons", label: null, participants: null };
    const result = await inTx((tx) => money.recordIncome(tx, income({ ...don, method: "TRANSFER", installments: [line(15000, "2026-11-23")] }), TODAY));
    const snapshot = (await db.receipt.findUniqueOrThrow({ where: { id: result.receipt!.id } })).snapshot as Record<string, any>;
    assert.equal(snapshot.payer.name, "Boulangerie du Parc");
    assert.equal(snapshot.designation, "Dons");
    assert.equal(snapshot.schedule, null);
    assert.equal(result.planId, null);
    await refuses("MEMBER_REQUIRED", () => inTx((tx) => money.recordIncome(tx, income({ ...don, installments: [line(100, "2026-11-23"), line(100, "2026-12-23")] }), TODAY)));
    await refuses("MEMBER_REQUIRED", () => inTx((tx) => money.recordIncome(tx, income({ ...don, installments: [line(100, "2026-12-23")], firstCashed: false }), TODAY)));
    await refuses("PAYER_REQUIRED", () => inTx((tx) => money.recordIncome(tx, income({ ...don, payerName: null, installments: [line(100, "2026-11-23")] }), TODAY)));
  });

  await check("catégorie du mauvais sens ou archivée, adhérent archivé, dates dans le désordre : refusés", async () => {
    await refuses("CATEGORY_UNAVAILABLE", () => inTx((tx) => money.recordIncome(tx, income({ categoryId: "cat_defaut_loyer" }), TODAY)));
    await refuses("CATEGORY_UNAVAILABLE", () => inTx((tx) => money.recordIncome(tx, income({ categoryId: "inconnue" }), TODAY)));
    await refuses("CATEGORY_UNAVAILABLE", () => inTx((tx) => money.recordExpense(tx, { day: TODAY, label: "x", categoryId: "cat_defaut_dons", amountCents: 100, method: "CARD", chequeNumber: null, bank: null, notes: null }, TODAY)));
    await refuses("FUTURE_DAY", () => inTx((tx) => money.recordExpense(tx, { day: "2026-11-24", label: "x", categoryId: "cat_defaut_loyer", amountCents: 100, method: "CARD", chequeNumber: null, bank: null, notes: null }, TODAY)));
    await refuses("FUTURE_DAY", () => inTx((tx) => money.recordIncome(tx, income({ installments: [line(100, "2026-11-24")] }), TODAY)));
    await refuses("DAYS_ORDER", () => inTx((tx) => money.recordIncome(tx, income({ installments: [line(100, "2026-11-20"), line(100, "2026-11-10")] }), TODAY)));
    await db.member.update({ where: { id: member.id }, data: { archivedAt: new Date() } });
    await refuses("MEMBER_UNAVAILABLE", () => inTx((tx) => money.recordIncome(tx, income(), TODAY)));
    await db.member.update({ where: { id: member.id }, data: { archivedAt: null } });
    await db.category.update({ where: { id: "cat_defaut_sorties" }, data: { archivedAt: new Date() } });
    await refuses("CATEGORY_UNAVAILABLE", () => inTx((tx) => money.recordIncome(tx, income({ categoryId: "cat_defaut_sorties" }), TODAY)));
    await db.category.update({ where: { id: "cat_defaut_sorties" }, data: { archivedAt: null } });
  });

  await check("dépense : sort du solde ; paiement non encaissé : hors solde, puis supprimable", async () => {
    const before = await balance();
    await inTx((tx) => money.recordExpense(tx, { day: "2026-11-22", label: "Location minibus", categoryId: "cat_defaut_sorties_depenses", amountCents: 18000, method: "CASH", chequeNumber: "ignoré", bank: null, notes: null }, TODAY));
    assert.equal(await balance(), before - 18000);
    const planned = await inTx((tx) => money.recordIncome(tx, income({ installments: [line(9000, "2026-12-01", "500"), line(9000, "2027-01-01", "501")], firstCashed: false }), TODAY));
    assert.equal(planned.receipt, null);
    assert.equal(planned.transactionId, null);
    assert.equal(await balance(), before - 18000);
    await inTx((tx) => money.deletePaymentPlan(tx, planned.planId!));
    assert.equal(await db.installment.count({ where: { planId: planned.planId! } }), 0);
  });

  await check("la base refuse elle-même un montant nul ou un 5e versement (contraintes)", async () => {
    await assert.rejects(() => db.transaction.create({ data: { date: new Date(), type: "EXPENSE", categoryId: "cat_defaut_loyer", label: "x", amountCents: 0, method: "CARD" } }));
    await assert.rejects(() => db.installment.create({ data: { planId, number: 5, amountCents: 100, dueDate: new Date() } }));
    await assert.rejects(() => db.installment.create({ data: { planId, number: 4, amountCents: 100, dueDate: new Date() } }), "rang en double");
    const any = await db.installment.findFirstOrThrow({ where: { planId, status: "PLANNED" } });
    await assert.rejects(() => db.installment.update({ where: { id: any.id }, data: { status: "CASHED" } }), "encaissé sans date");
  });

  // ---------------------------------------------------------------- démonstration
  await check("données de démonstration : refusées si la base n'est pas vide", async () => {
    await refuses("DEMO_NOT_EMPTY", () => inTx((tx) => demo.loadDemoData(tx, TODAY)));
    await refuses("DEMO_NOT_ACTIVE", () => inTx((tx) => demo.clearDemoData(tx)));
    assert.ok((await db.transaction.count()) > 0, "rien n'a été effacé");
  });

  await check("données de démonstration : chargement cohérent (reçus numérotés dans l'ordre, retards, rejet)", async () => {
    await wipe();
    await inTx((tx) => demo.loadDemoData(tx, TODAY));
    assert.equal(await db.member.count(), 11);
    const receipts = await db.receipt.findMany({ orderBy: [{ year: "asc" }, { sequence: "asc" }] });
    assert.ok(receipts.length >= 25, `reçus : ${receipts.length}`);
    for (let index = 1; index < receipts.length; index += 1) {
      assert.ok(receipts[index].issuedOn >= receipts[index - 1].issuedOn, "numéros dans l'ordre des dates");
    }
    const byYear = new Map<number, number[]>();
    for (const r of receipts) byYear.set(r.year, [...(byYear.get(r.year) ?? []), r.sequence]);
    for (const sequences of byYear.values()) assert.deepEqual(sequences, sequences.map((_, i) => i + 1));
    assert.equal(await db.installment.count({ where: { status: "PLANNED", dueDate: { lt: new Date(`${TODAY}T00:00:00Z`) } } }), 2);
    assert.equal(await db.installment.count({ where: { status: "REJECTED" } }), 1);
    assert.equal(await db.transaction.count({ where: { status: "CANCELLED" } }), 1);
    assert.equal(await db.transaction.count({ where: { date: { gt: new Date(`${TODAY}T00:00:00Z`) } } }), 0);
    const settings = await db.settings.findUniqueOrThrow({ where: { id: 1 } });
    assert.equal(settings.demoMode, true);
    assert.ok(settings.openingBalanceCents + (await balance()) > 0, "solde positif");
    const plans = await db.paymentPlan.findMany({ include: { installments: true } });
    for (const plan of plans) {
      assert.equal(plan.installments.reduce((sum, l) => sum + l.amountCents, 0), plan.totalCents);
      assert.equal(plan.installments.length, plan.installmentCount);
    }
  });

  await check("rappel par email : chèques en retard et des 3 prochains jours, noms neutralisés dans le HTML", async () => {
    const reminders = await import("../../src/lib/services/reminders");
    const digest = await reminders.collectReminders(TODAY);
    assert.equal(digest.late.length, 2);
    assert.equal(digest.soon.length, 1);
    assert.equal(digest.recipient, null);
    const email = reminders.buildReminderEmail(digest);
    assert.equal(email.subject, "3 chèques à encaisser, dont 2 en retard");
    assert.match(email.text, /Famille Benali/);
    const hostile = { family: `<script>alert("x")</script>`, detail: "Chèque 1/2 · <b>Cours</b>", dueDay: TODAY, amountCents: 1000 };
    const html = reminders.buildReminderEmail({ ...digest, late: [], soon: [hostile] }).html;
    assert.ok(!html.includes("<script>") && !html.includes("<b>Cours"), "balises neutralisées");
    assert.ok(html.includes("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"));
  });

  await check("fin de la démonstration : tout est effacé, catégories conservées, numérotation remise à zéro", async () => {
    await inTx((tx) => demo.clearDemoData(tx));
    assert.equal(await db.member.count(), 0);
    assert.equal(await db.transaction.count(), 0);
    assert.equal(await db.receipt.count(), 0);
    assert.equal(await db.receiptCounter.count(), 0);
    assert.equal(await db.category.count(), 11);
    const settings = await db.settings.findUniqueOrThrow({ where: { id: 1 } });
    assert.equal(settings.demoMode, false);
    assert.equal(settings.openingBalanceCents, 0);
    await refuses("DEMO_NOT_ACTIVE", () => inTx((tx) => demo.clearDemoData(tx)));
  });

  await wipe();
  await db.$disconnect();
  console.log(`\n${passed} réussis, ${failures.length} en échec`);
  if (failures.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

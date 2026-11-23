// Page Chèques : résumé, onglets, encaissement, rejet, remise à encaisser, recherche, téléphone.
const { chromium } = require('playwright');
const path = require('path');
const { sql, seedDemo, reporter, watch, login, day } = require('./helpers.cjs');
const [BASE, OUT] = process.argv.slice(2);
const { check, finish } = reporter();

const fr = (cents, digits) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(cents / 100).replace(/\s/g, ' ');
const euros = (cents) => fr(cents, 2);
const compact = (cents) => (cents % 100 === 0 ? fr(cents, 0) : fr(cents, 2));
const text = async (locator) => (await locator.textContent()).replace(/\s/g, ' ').trim();
const cheques = (count) => `${count} chèque${count > 1 ? 's' : ''}`;
const rows = (query) => { const out = sql(query); return out === '' ? [] : out.split('\n').map((line) => line.split('|')); };

/** Ce que la base dit des échéances (même définition que la page : « 7 jours » = d'aujourd'hui à J+7). */
function stats() {
  const of = (where) => sql(`select count(*) || '|' || coalesce(sum(amount_cents), 0) from installments where ${where}`).split('|').map(Number);
  return {
    planned: of("status = 'PLANNED'"),
    late: of(`status = 'PLANNED' and due_date < '${day()}'`),
    soon: of(`status = 'PLANNED' and due_date >= '${day()}' and due_date <= '${day(7)}'`),
    rejected: of("status = 'REJECTED'"),
    cashed: Number(sql("select count(*) from installments i join payment_plans p on p.id = i.plan_id where i.status = 'CASHED' and p.installment_count > 1")),
  };
}

/** Les trois cartes et les trois pastilles affichent-elles ces chiffres ? Renvoie '' si oui, sinon le détail. */
async function summaryMismatch(page, expected) {
  const cards = page.locator('section[aria-label="Résumé des chèques"] > div');
  const problems = [];
  const specs = [['À encaisser', expected.planned], ['En retard', expected.late], ['Dans les 7 jours', expected.soon]];
  for (const [index, [label, [count, cents]]] of specs.entries()) {
    const card = cards.nth(index);
    const shown = await text(card);
    const ok = count === 0
      ? shown.startsWith(label + 'Aucun')
      : shown.startsWith(label) && (await text(card.locator('.sr-only').first())) === String(count) && shown.includes(cheques(count)) && shown.includes(compact(cents));
    if (!ok) problems.push(`${label}: « ${shown} » vs ${count} / ${compact(cents)}`);
  }
  for (const [name, count] of [['En attente', expected.planned[0]], ['Rejetés', expected.rejected[0]], ['Encaissés', expected.cashed]]) {
    const shown = await text(page.getByRole('button', { name: new RegExp('^' + name) }));
    if (shown !== `${name}${count}`) problems.push(`pastille « ${shown} » vs ${name} ${count}`);
  }
  return problems.join(' ; ');
}

/** Attend que le résumé affiche ce que dit la base (la page se rafraîchit après chaque écriture). */
async function summaryMatchesDatabase(page) {
  let mismatch = '';
  for (let attempt = 0; attempt < 20; attempt += 1) {
    mismatch = await summaryMismatch(page, stats());
    if (mismatch === '') return '';
    await page.waitForTimeout(150);
  }
  return mismatch;
}

const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const tab = (page, name) => page.getByRole('button', { name: new RegExp('^' + name) });
const row = (page, chequeNumber) => page.locator('li').filter({ hasText: `n° ${chequeNumber}` });
const openDialog = (page) => page.locator('dialog[open]');
/** Les prévisualisations de pages construites par d'autres étapes peuvent répondre 404 : hors sujet ici. */
const relevant = (issues) => issues.filter((issue) => !/Failed to load resource.*404/.test(issue));

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const issues = watch(page);

  // ------------------------------------------------------------------ base vide
  await login(page, BASE, '/cheques');
  await page.getByRole('heading', { name: 'Chèques', level: 1 }).waitFor();
  await page.getByText('Aucun chèque en attente').waitFor();
  check('empty database: explains where instalments come from and links to a new income',
    await page.getByText("Les échéances apparaissent ici dès qu'un encaissement en plusieurs fois est enregistré.").isVisible()
      && (await page.locator('#contenu').getByRole('link', { name: '+ Encaissement' }).getAttribute('href')) === '/mouvements?nouveau=encaissement');
  check('empty database: three cards and three chips at zero', (await summaryMismatch(page, stats())) === '', await summaryMismatch(page, stats()));
  await tab(page, 'Rejetés').click();
  const emptyRejected = await page.getByText('Aucun chèque rejeté').isVisible();
  await tab(page, 'Encaissés').click();
  check('empty database: each tab has its own empty state', emptyRejected && await page.getByText("Aucun chèque encaissé pour l'instant").isVisible());

  // ------------------------------------------------------------------ données de démonstration
  seedDemo();
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('li').first().waitFor();
  const initial = stats();
  check('demo data has late, due, planned, rejected and cashed cheques', initial.late[0] >= 2 && initial.soon[0] >= 1 && initial.planned[0] > initial.late[0] + initial.soon[0] && initial.rejected[0] >= 1 && initial.cashed >= 3, JSON.stringify(initial));
  const mismatch = await summaryMatchesDatabase(page);
  check('cards: counts and amounts of « À encaisser », « En retard », « Dans les 7 jours » match the database; chips show their counts', mismatch === '', mismatch);

  const listed = await page.locator('li').evaluateAll((items) => items.map((item) => ({
    day: item.querySelector('time').getAttribute('datetime'),
    badges: [...item.querySelectorAll('span.rounded-full')].map((badge) => badge.textContent.trim()),
    amount: item.textContent,
  })));
  const expectedDays = rows("select due_date from installments where status = 'PLANNED' order by due_date, number").map((line) => line[0]);
  check('pending tab lists every planned instalment, sorted by due date', JSON.stringify(listed.map((item) => item.day)) === JSON.stringify(expectedDays), JSON.stringify(listed.map((item) => item.day)));
  check('late cheques come first with the « En retard » badge',
    listed.slice(0, initial.late[0]).every((item) => item.badges.includes('En retard')) && listed.slice(initial.late[0]).every((item) => !item.badges.includes('En retard')),
    JSON.stringify(listed.map((item) => item.badges)));
  check('then « À encaisser » for the next 7 days and « Prévu » afterwards',
    listed.slice(initial.late[0], initial.late[0] + initial.soon[0]).every((item) => item.badges.includes('À encaisser'))
      && listed.slice(initial.late[0] + initial.soon[0]).every((item) => item.badges.includes('Prévu')));
  const groupLate = await text(page.getByRole('region', { name: /^En retard/ }).getByRole('heading'));
  const groupWeek = await text(page.getByRole('region', { name: /^Cette semaine/ }).getByRole('heading'));
  const groupLater = await text(page.getByRole('region', { name: /^Plus tard/ }).getByRole('heading'));
  const laterCents = initial.planned[1] - initial.late[1] - initial.soon[1];
  check('groups « En retard », « Cette semaine », « Plus tard » carry their count and total',
    groupLate === `En retard${cheques(initial.late[0])} · ${compact(initial.late[1])}`
      && groupWeek === `Cette semaine${cheques(initial.soon[0])} · ${compact(initial.soon[1])}`
      && groupLater === `Plus tard${cheques(initial.planned[0] - initial.late[0] - initial.soon[0])} · ${compact(laterCents)}`,
    `${groupLate} | ${groupWeek} | ${groupLater}`);
  const sample = rows("select i.cheque_number, i.bank, i.amount_cents, i.number, p.installment_count, p.label, m.name, m.id from installments i join payment_plans p on p.id = i.plan_id join members m on m.id = p.member_id where i.status = 'PLANNED' order by i.due_date, i.number limit 1")[0];
  const sampleText = await text(row(page, sample[0]));
  check('a row shows the family (link to its page), « Chèque n/N · label », cheque number, bank and amount',
    sampleText.includes(sample[6]) && sampleText.includes(`Chèque ${sample[3]}/${sample[4]} · ${sample[5]}`) && sampleText.includes(`n° ${sample[0]} · ${sample[1]}`) && sampleText.includes(euros(Number(sample[2])))
      && (await row(page, sample[0]).getByRole('link', { name: sample[6] }).getAttribute('href')) === `/adherents/${sample[7]}`,
    sampleText);
  await page.screenshot({ path: path.join(OUT, 'cheques-en-attente.png'), fullPage: true });

  // ------------------------------------------------------------------ recherche (dans la page)
  const planned = rows("select m.name, i.cheque_number, i.bank from installments i join payment_plans p on p.id = i.plan_id join members m on m.id = p.member_id where i.status = 'PLANNED'");
  const search = page.getByRole('searchbox', { name: 'Rechercher un chèque' });
  const visibleRows = () => page.locator('main li:visible').count();
  const settle = async (expected) => { for (let i = 0; i < 20 && (await visibleRows()) !== expected; i += 1) await page.waitForTimeout(100); return visibleRows(); };

  await search.fill('rahmani');
  const byFamily = planned.filter((line) => line[0].includes('Rahmani')).length;
  const familyRows = await settle(byFamily);
  const cashedRahmani = Number(sql("select count(*) from installments i join payment_plans p on p.id = i.plan_id join members m on m.id = p.member_id where i.status = 'CASHED' and p.installment_count > 1 and m.name like '%Rahmani%'"));
  check('search by family name filters the list and the chip counts',
    familyRows === byFamily && byFamily >= 1 && (await text(tab(page, 'En attente'))) === `En attente${byFamily}` && (await text(tab(page, 'Encaissés'))) === `Encaissés${cashedRahmani}`,
    `${familyRows} vs ${byFamily}`);
  await search.fill('LEFEVRE');
  const byAccent = planned.filter((line) => line[0].includes('Lefèvre')).length;
  check('search ignores case and accents', (await settle(byAccent)) === byAccent && byAccent >= 1);
  await search.fill(sample[0]);
  check('search by cheque number finds exactly that cheque', (await settle(1)) === 1 && await row(page, sample[0]).isVisible());
  await search.fill('postale');
  const byBank = planned.filter((line) => line[2] === 'Banque Postale').length;
  check('search by bank', (await settle(byBank)) === byBank && byBank >= 1);
  await search.fill("%' or 1=1 --");
  await page.getByText("Aucun résultat pour « %' or 1=1 -- »").waitFor();
  check('a search with no match says so (the text is never sent to the database) and offers to clear it', (await settle(0)) === 0 && await page.getByRole('button', { name: 'Effacer la recherche' }).isVisible());
  await page.getByRole('button', { name: 'Effacer la recherche' }).click();
  check('clearing the search brings every row back', (await settle(initial.planned[0])) === initial.planned[0] && (await search.inputValue()) === '');
  await tab(page, 'Rejetés').click();
  await search.fill('traore');
  const cashedTraore = Number(sql("select count(*) from installments i join payment_plans p on p.id = i.plan_id join members m on m.id = p.member_id where i.status = 'CASHED' and p.installment_count > 1 and m.name like '%Traoré%'"));
  await page.getByRole('button', { name: `Voir « Encaissés » (${cashedTraore})` }).click();
  check('no match in this tab but elsewhere: a button leads to the tab that has results', (await settle(cashedTraore)) === cashedTraore && cashedTraore >= 1 && (await tab(page, 'Encaissés').getAttribute('aria-pressed')) === 'true');
  await search.fill('');
  await tab(page, 'En attente').click();
  await settle(initial.planned[0]);

  // Une deuxième fenêtre garde l'ancienne liste : elle servira à tenter un double encaissement.
  const stale = await ctx.newPage();
  const staleIssues = watch(stale);
  await stale.goto(BASE + '/cheques', { waitUntil: 'networkidle' });
  await stale.locator('li').first().waitFor();

  // ------------------------------------------------------------------ encaisser (date future refusée)
  const target = rows("select id, cheque_number, amount_cents from installments where status = 'PLANNED' order by due_date, number limit 1")[0];
  const transactionsBefore = Number(sql('select count(*) from transactions'));
  const receiptsBefore = Number(sql('select count(*) from receipts'));
  await row(page, target[1]).getByRole('button', { name: /^Encaisser/ }).click();
  const dialog = openDialog(page);
  await dialog.getByRole('heading', { name: 'Marquer comme encaissé' }).waitFor();
  const dateField = dialog.getByLabel("Date d'encaissement");
  check('cash dialog proposes today and recalls the cheque', (await dateField.inputValue()) === day() && (await text(dialog)).includes(`n° ${target[1]}`) && (await text(dialog)).includes(euros(Number(target[2]))));
  await dateField.fill(day(1));
  await dialog.getByRole('button', { name: 'Encaisser et créer le reçu' }).click();
  await page.waitForTimeout(400);
  check('future date: the browser blocks the form', await dateField.evaluate((input) => input.validity.rangeOverflow) && sql(`select status from installments where id = '${target[0]}'`) === 'PLANNED');
  // Même sans le garde-fou du navigateur, le serveur refuse.
  await dateField.evaluate((input) => input.removeAttribute('max'));
  await dialog.getByRole('button', { name: 'Encaisser et créer le reçu' }).click();
  await dialog.getByText("La date d'un encaissement ne peut pas être dans le futur.").waitFor();
  check('future date: the server refuses with a clear message and writes nothing',
    sql(`select status from installments where id = '${target[0]}'`) === 'PLANNED' && Number(sql('select count(*) from transactions')) === transactionsBefore && Number(sql('select count(*) from receipts')) === receiptsBefore);

  await dateField.fill(day());
  await dialog.getByRole('button', { name: 'Encaisser et créer le reçu' }).click();
  await dialog.getByText(/Encaissement enregistré\. Le reçu n° \d{4}-\d{4} a été créé\./).waitFor();
  const cashedRow = sql(`select i.status, i.cashed_on, t.status, t.type, t.amount_cents, t.date, r.id, r.number from installments i join transactions t on t.id = i.transaction_id join receipts r on r.transaction_id = t.id where i.id = '${target[0]}'`).split('|');
  check('cashing: instalment CASHED today, a COMPLETED income of the same amount and a receipt exist',
    cashedRow.slice(0, 6).join('|') === `CASHED|${day()}|COMPLETED|INCOME|${target[2]}|${day()}` && /^\d{4}-\d{4}$/.test(cashedRow[7] || '')
      && Number(sql('select count(*) from transactions')) === transactionsBefore + 1 && Number(sql('select count(*) from receipts')) === receiptsBefore + 1,
    cashedRow.join('|'));
  check('cashing: the dialog confirms with the receipt number and a link to the PDF',
    (await text(dialog)).includes(`Le reçu n° ${cashedRow[7]} a été créé.`) && (await dialog.getByRole('link', { name: 'Ouvrir le reçu (PDF)' }).getAttribute('href')) === `/recus/${cashedRow[6]}/pdf`);
  await dialog.getByRole('button', { name: 'Fermer' }).last().click();
  await row(page, target[1]).waitFor({ state: 'detached' });
  const afterCash = await summaryMatchesDatabase(page);
  check('cashing: the row leaves « En attente », cards and chips follow the database', (await visibleRows()) === initial.planned[0] - 1 && afterCash === '', afterCash);
  await tab(page, 'Encaissés').click();
  await row(page, target[1]).waitFor();
  const firstCashed = page.locator('li').first();
  const receiptLink = row(page, target[1]).getByRole('link', { name: /^Reçu/ });
  check('cashing: the cheque is first in « Encaissés » with its badge, a green amount and a receipt link (new tab)',
    (await text(firstCashed)).includes(`n° ${target[1]}`) && (await text(firstCashed)).includes('Encaissé') && (await text(firstCashed)).includes(`+ ${euros(Number(target[2]))}`)
      && (await receiptLink.getAttribute('href')) === `/recus/${cashedRow[6]}/pdf` && (await receiptLink.getAttribute('target')) === '_blank'
      && (await page.locator('main li:visible').count()) === stats().cashed,
    await text(firstCashed));

  // La fenêtre restée ouverte croit encore le chèque en attente : pas de double encaissement.
  await row(stale, target[1]).getByRole('button', { name: /^Encaisser/ }).click();
  await openDialog(stale).getByRole('button', { name: 'Encaisser et créer le reçu' }).click();
  await openDialog(stale).getByText('Cette échéance est déjà encaissée.').waitFor();
  check('a stale window cannot cash the same cheque twice',
    Number(sql('select count(*) from transactions')) === transactionsBefore + 1 && Number(sql('select count(*) from receipts')) === receiptsBefore + 1);
  check('no console error in the stale window', relevant(staleIssues).length === 0, staleIssues.join(' | '));
  await stale.close();

  // ------------------------------------------------------------------ rejeter un chèque en attente, puis le remettre
  await tab(page, 'En attente').click();
  const bounced = rows("select id, cheque_number, amount_cents from installments where status = 'PLANNED' order by due_date, number limit 1")[0];
  const transactionsMid = Number(sql('select count(*) from transactions'));
  await row(page, bounced[1]).getByRole('button', { name: /^Rejeté/ }).click();
  await dialog.getByRole('heading', { name: 'Marquer comme rejeté' }).waitFor();
  check('reject dialog recalls the cheque and explains what happens next', (await text(dialog)).includes(`n° ${bounced[1]}`) && (await text(dialog)).includes('chèque de remplacement'));
  await dialog.getByRole('button', { name: 'Marquer comme rejeté' }).click();
  await row(page, bounced[1]).waitFor({ state: 'detached' });
  check('rejecting a pending cheque: REJECTED in the database, no movement written',
    sql(`select status || '|' || coalesce(transaction_id, '') from installments where id = '${bounced[0]}'`) === 'REJECTED|' && Number(sql('select count(*) from transactions')) === transactionsMid);
  const afterReject = await summaryMatchesDatabase(page);
  check('rejecting: the row leaves « En attente », cards and chips follow the database', afterReject === '', afterReject);
  await tab(page, 'Rejetés').click();
  await row(page, bounced[1]).waitFor();
  check('the rejected cheque is listed in « Rejetés » with its badge', (await text(row(page, bounced[1]))).includes('Rejeté') && (await page.locator('main li:visible').count()) === stats().rejected[0]);
  await page.screenshot({ path: path.join(OUT, 'cheques-rejetes.png'), fullPage: true });

  await row(page, bounced[1]).getByRole('button', { name: /^Remettre à encaisser/ }).click();
  await dialog.getByRole('heading', { name: 'Remettre à encaisser' }).waitFor();
  await dialog.getByLabel('Date prévue').fill(day(12));
  await dialog.getByLabel('N° du chèque').fill('7654321');
  await dialog.getByLabel('Banque').fill('Banque Test');
  await dialog.getByRole('button', { name: 'Remettre à encaisser' }).click();
  await row(page, bounced[1]).waitFor({ state: 'detached' });
  check('putting it back: PLANNED again with the new date, cheque number and bank',
    sql(`select status, due_date, cheque_number, bank from installments where id = '${bounced[0]}'`) === `PLANNED|${day(12)}|7654321|Banque Test`,
    sql(`select status, due_date, cheque_number, bank from installments where id = '${bounced[0]}'`));
  await tab(page, 'En attente').click();
  const replanned = page.getByRole('region', { name: /^Plus tard/ }).locator('li').filter({ hasText: 'n° 7654321 · Banque Test' });
  await replanned.waitFor();
  const afterReplan = await summaryMatchesDatabase(page);
  check('putting it back: the cheque is under « Plus tard » with the « Prévu » badge, cards follow', (await text(replanned)).includes('Prévu') && (await text(replanned)).includes('dans 12 jours') && afterReplan === '', afterReplan);

  // ------------------------------------------------------------------ rejeter un chèque déjà encaissé
  await tab(page, 'Encaissés').click();
  const old = rows("select i.id, i.cheque_number, i.transaction_id, i.amount_cents from installments i join payment_plans p on p.id = i.plan_id where i.status = 'CASHED' and p.installment_count > 1 order by i.cashed_on, i.number limit 1")[0];
  const balance = () => Number(sql("select coalesce(sum(case when type = 'INCOME' then amount_cents else -amount_cents end), 0) from transactions where status = 'COMPLETED'"));
  const balanceBefore = balance();
  await row(page, old[1]).getByRole('button', { name: /^Rejeté/ }).click();
  await dialog.getByRole('heading', { name: 'Marquer comme rejeté' }).waitFor();
  check('rejecting a cashed cheque: the dialog warns that the movement is cancelled', (await text(dialog)).includes('annulé et retiré du solde'));
  await dialog.getByRole('button', { name: 'Marquer comme rejeté' }).click();
  await row(page, old[1]).waitFor({ state: 'detached' });
  check('rejecting a cashed cheque: instalment REJECTED, its movement CANCELLED (kept, out of the balance), receipt kept',
    sql(`select status || '|' || coalesce(transaction_id, '') || '|' || coalesce(cashed_on::text, '') from installments where id = '${old[0]}'`) === 'REJECTED||'
      && sql(`select status from transactions where id = '${old[2]}'`) === 'CANCELLED'
      && Number(sql(`select count(*) from receipts where transaction_id = '${old[2]}'`)) === 1
      && balance() === balanceBefore - Number(old[3]),
    sql(`select status from transactions where id = '${old[2]}'`));
  const afterBounce = await summaryMatchesDatabase(page);
  await tab(page, 'Rejetés').click();
  await row(page, old[1]).waitFor();
  check('rejecting a cashed cheque: it moves from « Encaissés » to « Rejetés »', afterBounce === '' && (await page.locator('main li:visible').count()) === stats().rejected[0], afterBounce);

  // ------------------------------------------------------------------ thème sombre, retour sur la page
  await tab(page, 'En attente').click();
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.screenshot({ path: path.join(OUT, 'cheques-sombre.png'), fullPage: true });
  await page.evaluate(() => document.documentElement.classList.remove('dark'));
  await page.getByRole('link', { name: 'Catégories' }).click();
  await page.getByRole('heading', { name: 'Catégories', level: 1 }).waitFor();
  await page.getByRole('link', { name: 'Chèques' }).click();
  await page.getByRole('heading', { name: 'Chèques', level: 1 }).waitFor();
  const back = await summaryMatchesDatabase(page);
  check('leaving and coming back: the page is intact', back === '' && (await page.locator('main li:visible').count()) === stats().planned[0] && (await openDialog(page).count()) === 0, back);
  check('no console error on the page', relevant(issues).length === 0, issues.join(' | '));

  // ------------------------------------------------------------------ téléphone
  const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const phone = await phoneCtx.newPage();
  const phoneIssues = watch(phone);
  await login(phone, BASE, '/cheques');
  await phone.locator('li').first().waitFor();
  const widths = [await overflow(phone)];
  await phone.screenshot({ path: path.join(OUT, 'cheques-telephone.png'), fullPage: true });
  const firstButton = row(phone, '7654321').getByRole('button', { name: /^Encaisser/ });
  const box = await firstButton.boundingBox();
  for (const name of ['Rejetés', 'Encaissés', 'En attente']) {
    await tab(phone, name).click();
    await phone.locator('li').first().waitFor();
    widths.push(await overflow(phone));
  }
  await phone.getByRole('searchbox', { name: 'Rechercher un chèque' }).fill('introuvable');
  await phone.getByText('Aucun résultat pour « introuvable »').waitFor();
  widths.push(await overflow(phone));
  await phone.getByRole('button', { name: 'Effacer la recherche' }).click();
  await row(phone, '7654321').getByRole('button', { name: /^Modifier/ }).click();
  await openDialog(phone).getByLabel('Date prévue').waitFor();
  const dialogBox = await openDialog(phone).boundingBox();
  widths.push(await overflow(phone));
  await phone.screenshot({ path: path.join(OUT, 'cheques-telephone-fenetre.png') });
  check('phone (390px): no horizontal overflow in any tab, in the empty search or with a dialog open', widths.every((width) => width <= 0), JSON.stringify(widths));
  check('phone: rows are stacked, the main gesture is a 40px target and the dialog fits the screen', box !== null && box.height >= 40 && box.x >= 0 && box.x + box.width <= 390 && dialogBox !== null && dialogBox.x >= 0 && dialogBox.x + dialogBox.width <= 390, JSON.stringify({ box, dialogBox }));
  check('no console error on the phone', relevant(phoneIssues).length === 0, phoneIssues.join(' | '));

  await browser.close();
  finish();
})().catch((error) => { console.error(error); process.exit(1); });

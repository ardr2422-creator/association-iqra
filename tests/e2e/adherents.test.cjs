// Adhérents : liste et recherche, création / modification, suppression ou archivage,
// fiche (chiffres, échéancier, historique) et encaissement d'un chèque depuis la fiche.
const { chromium } = require('playwright');
const path = require('path');
const { sql, wipe, seedDemo, reporter, watch, login, day } = require('./helpers.cjs');
const [BASE, OUT] = process.argv.slice(2);
const { check, finish } = reporter();

const euros = (cents) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100).replace(/\s/g, ' ');
const whole = (cents) => euros(cents).replace(',00', '');
/** Texte visible d'un élément, espaces (insécables compris) ramenés à une espace. */
const text = async (locator) => (await locator.innerText()).replace(/\s+/g, ' ').trim();
const until = async (probe, timeout = 6000) => {
  const end = Date.now() + timeout;
  for (;;) {
    try { if (await probe()) return true; } catch { /* la page est en train de changer */ }
    if (Date.now() > end) return false;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
};
/** Débordement horizontal de la page, et éléments du contenu qui sortent de l'écran. */
const overflow = (page) => page.evaluate(() => ({
  page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  outside: [...document.querySelectorAll('main *')]
    .filter((el) => { const box = el.getBoundingClientRect(); return box.width > 0 && (box.right > window.innerWidth + 1 || box.left < -1); })
    .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`)
    .slice(0, 5),
}));

const TODAY = "(now() at time zone 'Europe/Paris')::date";
/** Versé cette année et reste à payer d'un adhérent, lus dans la base (centimes). */
const totals = (id) => sql(`select
    coalesce((select sum(amount_cents) from transactions where member_id = '${id}' and type = 'INCOME' and status = 'COMPLETED' and extract(year from date) = extract(year from ${TODAY})), 0)
    || '|' || coalesce((select sum(i.amount_cents) from installments i join payment_plans p on p.id = i.plan_id where p.member_id = '${id}' and i.status <> 'CASHED'), 0)`).split('|').map(Number);
const memberId = (name) => sql(`select id from members where name = '${name}'`);
const YEAR = day(0).slice(0, 4);
const since = (isoDay) => new Intl.DateTimeFormat('fr-FR', { month: 'short', year: 'numeric', timeZone: 'Europe/Paris' }).format(new Date(`${isoDay}T12:00:00Z`));

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR', reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const issues = watch(page);
  let action = null;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.headers()['next-action']) action = { url: request.url(), headers: request.headers(), body: request.postDataBuffer() };
  });

  const dialog = page.getByRole('dialog');
  const list = page.getByRole('region', { name: 'Liste des adhérents' });
  const rows = list.locator('li');
  const keys = page.getByRole('region', { name: 'Chiffres clés' });
  const history = page.getByRole('region', { name: 'Historique des paiements' });
  const title = (name) => page.getByRole('heading', { level: 1, name, exact: true });
  const focused = () => page.evaluate(() => document.activeElement?.getAttribute('name') || document.activeElement?.textContent?.trim());

  // ------------------------------------------------------------------
  // Base vide : la liste dit quoi faire, le formulaire refuse ce qui est faux
  // ------------------------------------------------------------------
  wipe();
  await login(page, BASE, '/adherents');
  await page.getByText("Aucun adhérent pour l'instant").waitFor();
  check('empty database: the list explains how to start', await list.getByRole('button', { name: 'Ajouter un adhérent' }).isVisible());

  await page.getByRole('button', { name: '+ Adhérent' }).click();
  await dialog.waitFor();
  const nameField = dialog.getByLabel("Nom de la famille ou de l'adhérent");
  const dateField = dialog.getByLabel("Date d'adhésion");
  const create = dialog.getByRole('button', { name: "Ajouter l'adhérent" });
  check('new member dialog: focus lands in the name field, the date defaults to today (never later)',
    (await focused()) === 'name' && (await dateField.inputValue()) === day(0) && (await dateField.getAttribute('max')) === day(0));

  await nameField.fill('   ');
  await create.click();
  await dialog.getByText("Indiquez le nom de l'adhérent ou de la famille.").waitFor();
  check('blank name is refused, the error is tied to the field and focus goes back to it',
    sql('select count(*) from members') === '0' && (await nameField.getAttribute('aria-invalid')) === 'true' && (await focused()) === 'name');

  await nameField.fill('  Famille   Martin ');
  await dialog.getByLabel('Email').fill('pas-un-email');
  await create.click();
  await dialog.getByText("Cette adresse email n'est pas valide.").waitFor();
  check('invalid email is refused', sql('select count(*) from members') === '0' && !(await dialog.getByText("Indiquez le nom de l'adhérent").isVisible()));

  await dialog.getByLabel('Email').fill('martin@exemple.fr');
  await dateField.fill(day(1));
  await create.click();
  await dialog.getByText("La date d'adhésion ne peut pas être dans le futur.").waitFor();
  check('a membership date in the future is refused', sql('select count(*) from members') === '0' && await dialog.getByText('Certains champs sont à corriger.').isVisible());

  const xss = '<img src=x onerror="window.__xss=1">';
  await dateField.fill(day(-10));
  await dialog.getByLabel('Téléphone').fill('06 39 98 55 01');
  await dialog.getByLabel('Adresse').fill('1 rue des Tests\n69000 Lyon');
  await dialog.getByLabel('Notes').fill(xss);
  await create.click();
  await list.getByRole('link', { name: 'Famille Martin' }).waitFor();
  const stored = sql("select name || '|' || phone || '|' || email || '|' || replace(address, E'\\n', '/') || '|' || notes || '|' || joined_on from members");
  check('the member is created with a normalised name and every field stored', stored === `Famille Martin|06 39 98 55 01|martin@exemple.fr|1 rue des Tests/69000 Lyon|${xss}|${day(-10)}`, stored);
  check('the dialog closes and the list shows the new member', await until(async () => !(await dialog.isVisible())) && await page.getByText('1 adhérent', { exact: true }).isVisible() && await rows.count() === 1);

  // ------------------------------------------------------------------
  // Fiche d'un adhérent sans paiement : modification, suppression définitive
  // ------------------------------------------------------------------
  const martin = memberId('Famille Martin');
  await list.getByRole('link', { name: 'Famille Martin' }).click();
  await page.waitForURL((url) => url.pathname === `/adherents/${martin}`);
  await title('Famille Martin').waitFor();
  const header = page.locator('header').filter({ has: page.getByRole('heading', { level: 1 }) });
  const headerText = await text(header);
  check('sheet header: name, "Adhérent depuis", phone and email', headerText.includes(`Adhérent depuis ${since(day(-10))} · 06 39 98 55 01 · martin@exemple.fr`), headerText);
  const emptyKeys = await text(keys);
  check('sheet without payment: zero totals, no enrolment, empty history with a next step',
    emptyKeys.includes(`Total versé en ${YEAR} ${euros(0)} Reste à payer ${euros(0)} Inscrits —`)
      && await history.getByText('Aucun paiement enregistré').isVisible()
      && await history.getByRole('link', { name: 'Enregistrer un encaissement' }).isVisible(), emptyKeys);
  check('"+ Encaisser" opens the income form for this member', await page.getByRole('link', { name: '+ Encaisser' }).getAttribute('href') === `/mouvements?nouveau=encaissement&adherent=${martin}`);
  const contactCard = page.getByRole('region', { name: 'Coordonnées' });
  check('address and notes are shown as plain text (an HTML injection is never executed)',
    (await text(contactCard)).includes('1 rue des Tests 69000 Lyon') && await contactCard.getByText(xss, { exact: true }).isVisible()
      && await page.evaluate(() => window.__xss === undefined && document.querySelectorAll('main img').length === 0));

  await page.getByRole('button', { name: 'Modifier', exact: true }).click();
  await dialog.waitFor();
  const save = dialog.getByRole('button', { name: 'Enregistrer' });
  check('edit dialog is pre-filled', (await nameField.inputValue()) === 'Famille Martin' && (await dialog.getByLabel('Téléphone').inputValue()) === '06 39 98 55 01'
    && (await dialog.getByLabel('Adresse').inputValue()) === '1 rue des Tests\n69000 Lyon' && (await dateField.inputValue()) === day(-10));
  await nameField.fill('');
  await save.click();
  await dialog.getByText("Indiquez le nom de l'adhérent ou de la famille.").waitFor();
  check('editing with a blank name is refused, nothing changes', sql('select name from members') === 'Famille Martin');
  await nameField.fill('Famille Martin-Dupont');
  await dialog.getByLabel('Téléphone').fill('');
  await dialog.getByLabel('Notes').fill('');
  await save.click();
  await title('Famille Martin-Dupont').waitFor();
  const edited = sql("select name || '|' || coalesce(phone, 'null') || '|' || coalesce(notes, 'null') || '|' || joined_on || '|' || count(*) over () from members");
  check('edit is saved (emptied fields become null, same member)', edited === `Famille Martin-Dupont|null|null|${day(-10)}|1`, edited);
  await until(async () => !(await dialog.isVisible()));

  // --- la même action, rejouée directement contre le serveur
  const saved = action;
  const replay = async (saved, mutate, withSession = true) => {
    const headers = { ...saved.headers };
    for (const name of ['content-length', 'cookie', 'host']) delete headers[name];
    if (withSession) headers.cookie = (await ctx.cookies()).map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
    const body = mutate(saved.body.toString('utf8'));
    const response = await fetch(saved.url, { method: 'POST', headers, body, redirect: 'manual' });
    return { status: response.status, text: await response.text() };
  };
  const anonymous = await replay(saved, (body) => body.replace('Famille Martin-Dupont', 'Piratage'), false);
  check('the save action without a session is rejected (401) and writes nothing', anonymous.status === 401 && sql("select count(*) from members where name = 'Piratage'") === '0', `status=${anonymous.status}`);
  const tooLong = await replay(saved, (body) => body.replace('Famille Martin-Dupont', 'A'.repeat(300)));
  const badId = await replay(saved, (body) => body.replace(martin, "' OR 1=1 --").replace('Famille Martin-Dupont', 'Piratage'));
  check('tampered requests (over-long name, forged id) are rejected by validation',
    sql('select name from members') === 'Famille Martin-Dupont' && /corriger/.test(tooLong.text) && /corriger/.test(badId.text), `${tooLong.status}/${badId.status}`);

  await page.getByRole('button', { name: 'Supprimer', exact: true }).click();
  await dialog.getByText('supprimée définitivement').waitFor();
  check('delete confirmation explains the permanent deletion, Cancel is focused', (await focused()) === 'Annuler');
  await dialog.getByRole('button', { name: 'Supprimer', exact: true }).click();
  await page.waitForURL((url) => url.pathname === '/adherents');
  await page.getByText("Aucun adhérent pour l'instant").waitFor();
  check('a member without payment is deleted for good, back on the list', sql('select count(*) from members') === '0');

  // ------------------------------------------------------------------
  // Données de démonstration : liste, chiffres, recherche
  // ------------------------------------------------------------------
  seedDemo();
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByText('11 adhérents', { exact: true }).waitFor();
  const shown = await rows.evaluateAll((items) => items.map((item) => item.querySelector('a').textContent));
  const expectedNames = sql('select name from members where archived_at is null').split('\n').sort(new Intl.Collator('fr', { sensitivity: 'base', numeric: true }).compare);
  check('demo data: 11 members listed, sorted by name', shown.length === 11 && shown.join('|') === expectedNames.join('|'), shown.join('|'));

  const figures = sql(`select m.name || '|' || m.id || '|' || (select count(*) from installments i join payment_plans p on p.id = i.plan_id where p.member_id = m.id and i.status = 'PLANNED' and i.due_date < ${TODAY}) from members m`)
    .split('\n').map((line) => line.split('|'));
  const wrong = [];
  for (const [name, id, late] of figures) {
    const [paid, remaining] = totals(id);
    const row = await text(rows.filter({ hasText: name }));
    const amounts = `Versé en ${YEAR} ${euros(paid)} Reste à payer ${remaining > 0 ? euros(remaining) : '—'}`;
    const badge = Number(late) > 0 ? row.includes(`${late} chèque${Number(late) > 1 ? 's' : ''} en retard`) : !row.includes('en retard');
    if (!row.includes(amounts) || !badge) wrong.push(`${row} ≠ ${amounts} (late ${late})`);
  }
  check('each row shows the amount paid this year, the amount still due and the late cheques of the database', wrong.length === 0, wrong.join(' || '));
  check('at least one family is late and one has a next due date (the demo covers both badges)',
    figures.some(([, , late]) => Number(late) > 0) && await rows.filter({ hasText: 'Prochain chèque le' }).count() > 0);
  await page.screenshot({ path: path.join(OUT, 'adherents-liste.png'), fullPage: true });

  const search = page.getByLabel('Rechercher un adhérent');
  const found = async (query, count, name) => {
    await search.fill(query);
    const ok = await until(async () => await rows.count() === count && (count === 0 || await rows.first().getByRole('link', { name }).isVisible()));
    return ok && await page.getByText(count === 0 ? 'Aucun adhérent sur 11' : `${count} adhérent sur 11`, { exact: true }).isVisible();
  };
  check('search ignores case and accents', await found('LEFEVRE', 1, 'Famille Lefèvre'));
  check('search finds a phone number typed without spaces', await found('0639980341', 1, 'Famille Diallo'));
  check('search finds an email, and every word must match', await found('y.cherif', 1, 'Mme Yasmine Cherif') && await found('famille ben', 1, 'Famille Benali'));
  check('search with no match says so', await found('zzz', 0) && await list.getByText('Aucun résultat').isVisible());
  await list.getByRole('button', { name: 'Effacer la recherche' }).click();
  check('"Effacer la recherche" brings the whole list back', await until(async () => await rows.count() === 11) && (await search.inputValue()) === '');

  // ------------------------------------------------------------------
  // Fiche sur les données de démonstration : chiffres, échéancier, historique
  // ------------------------------------------------------------------
  const haddad = memberId('Famille Haddad');
  await rows.filter({ hasText: 'Famille Haddad' }).click({ position: { x: 720, y: 30 } });
  await page.waitForURL((url) => url.pathname === `/adherents/${haddad}`);
  check('the whole row is clickable and opens the sheet', await until(() => title('Famille Haddad').isVisible()));
  const [paidBefore, dueBefore] = totals(haddad);
  const keysText = await text(keys);
  check('sheet: total paid this year, amount still due and enrolments match the database',
    keysText.includes(`Total versé en ${YEAR} ${euros(paidBefore)} Reste à payer ${euros(dueBefore)} Inscrits 2 inscrits · Cours d'arabe 2026-2027`), keysText);

  const plan = page.getByRole('region', { name: "Échéancier · Cours d'arabe 2026-2027" });
  const steps = plan.locator('ol > li');
  const planId = sql(`select id from payment_plans where member_id = '${haddad}' and installment_count = 4`);
  const planSummary = () => sql(`select p.total_cents || '|' || coalesce((select sum(amount_cents) from installments where plan_id = p.id and status = 'CASHED'), 0) from payment_plans p where p.id = '${planId}'`).split('|').map(Number);
  let [planTotal, planPaid] = planSummary();
  check('schedule card: "Paiement en 4 fois" and the amount already paid', await plan.getByText(`Paiement en 4 fois · ${whole(planPaid)} versés sur ${whole(planTotal)}`).isVisible());
  const lines = sql(`select number || '|' || status || '|' || amount_cents || '|' || cheque_number || '|' || (due_date - ${TODAY}) from installments where plan_id = '${planId}' order by number`).split('\n').map((line) => line.split('|'));
  const stepTexts = await Promise.all((await steps.all()).map(text));
  const stepsOk = lines.every(([number, status, amount, cheque, days], index) => {
    const state = status === 'CASHED' ? 'Encaissé' : status === 'REJECTED' ? 'Rejeté' : Number(days) < 0 ? 'En retard' : Number(days) <= 7 ? 'À encaisser' : 'Prévu';
    return stepTexts[index].startsWith(`Chèque ${number} · ${state} ${euros(Number(amount))}`) && stepTexts[index].includes(`n° ${cheque}`);
  });
  check('schedule: one step per cheque with its status, amount and number', stepTexts.length === 4 && stepsOk, stepTexts.join(' || '));
  const tones = await steps.evaluateAll((items) => items.map((item) => `${getComputedStyle(item).backgroundColor}/${getComputedStyle(item).borderTopColor}`));
  check('the cheque to cash stands out (amber box with a visible border), cashed and planned ones differ', new Set(tones).size === 3 && tones[0] === tones[1], tones.join(' '));

  const receiptsOf = () => sql(`select r.id from receipts r join transactions t on t.id = r.transaction_id where t.member_id = '${haddad}'`).split('\n').sort();
  const historyLinks = async () => (await history.getByRole('link', { name: /Reçu PDF/ }).evaluateAll((links) => links.map((link) => `${link.getAttribute('href')}|${link.target}|${link.rel}`))).sort();
  const paymentCount = () => Number(sql(`select count(*) from transactions where member_id = '${haddad}' and type = 'INCOME'`));
  check('history: one row per payment, each with its receipt opening in a new tab',
    await history.locator('li').count() === paymentCount() && (await historyLinks()).join() === receiptsOf().map((id) => `/recus/${id}/pdf|_blank|noopener`).join());
  const firstRow = await text(history.locator('li').first());
  check('history rows: date, label · payment method, green signed amount', /^\d{1,2} \S+ Cours d'arabe 2026-2027 · Chèque 2\/4 \+ 120,00 € Reçu PDF/.test(firstRow), firstRow);
  await page.screenshot({ path: path.join(OUT, 'adherents-fiche.png'), fullPage: true });

  // ------------------------------------------------------------------
  // Encaisser un chèque depuis la fiche
  // ------------------------------------------------------------------
  const cheque3 = sql(`select id from installments where plan_id = '${planId}' and number = 3`);
  await plan.getByRole('button', { name: 'Marquer le chèque 3 comme encaissé' }).click();
  await dialog.waitFor();
  const cashDay = dialog.getByLabel("Date d'encaissement");
  await cashDay.fill(day(1));
  await dialog.getByRole('button', { name: 'Encaisser et créer le reçu' }).click();
  await page.waitForTimeout(400);
  check('the form does not let a future cashing date through',
    await cashDay.evaluate((input) => input.validity.rangeOverflow) && await dialog.getByText(/Le reçu n°/).count() === 0
      && sql(`select status from installments where id = '${cheque3}'`) === 'PLANNED' && totals(haddad)[0] === paidBefore);
  await cashDay.fill(day(0));
  await dialog.getByRole('button', { name: 'Encaisser et créer le reçu' }).click();
  await dialog.getByText(/Le reçu n° \d{4}-\d{4} a été créé/).waitFor();
  const cashed = sql(`select i.status || '|' || i.cashed_on || '|' || t.status || '|' || t.type || '|' || t.amount_cents || '|' || t.member_id || '|' || t.date || '|' || r.id || '|' || r.number
    from installments i join transactions t on t.id = i.transaction_id join receipts r on r.transaction_id = t.id where i.id = '${cheque3}'`).split('|');
  check('database: the cheque is cashed today, with its movement and its receipt',
    cashed.slice(0, 7).join('|') === `CASHED|${day(0)}|COMPLETED|INCOME|12000|${haddad}|${day(0)}`, cashed.join('|'));
  check('the confirmation offers the new receipt', await dialog.getByRole('link', { name: 'Ouvrir le reçu (PDF)' }).getAttribute('href') === `/recus/${cashed[7]}/pdf`
    && await dialog.getByText(`Le reçu n° ${cashed[8]} a été créé`).isVisible());
  await dialog.getByRole('button', { name: 'Fermer' }).last().click();
  await until(async () => !(await dialog.isVisible()));

  // --- la même action rejouée : date future, puis deuxième encaissement du même chèque
  const cheque4 = sql(`select id from installments where plan_id = '${planId}' and number = 4`);
  const cashAction = action;
  const movementsBefore = sql('select count(*) from transactions');
  const future = await replay(cashAction, (body) => body.replace(cheque3, cheque4).replace(day(0), day(1)));
  const twice = await replay(cashAction, (body) => body);
  check('the server refuses a future cashing date and a second cashing of the same cheque',
    /dans le futur/.test(future.text) && /déjà encaissée/.test(twice.text)
      && sql(`select status from installments where id = '${cheque4}'`) === 'PLANNED' && sql('select count(*) from transactions') === movementsBefore, `${future.status}/${twice.status}`);
  [planTotal, planPaid] = planSummary();
  await plan.getByText(`${whole(planPaid)} versés sur ${whole(planTotal)}`).waitFor();
  const step3 = await text(steps.nth(2));
  check('the plan balance is updated and the step turns to "Encaissé" with its receipt link',
    planPaid === 36000 && step3.startsWith('Chèque 3 · Encaissé 120,00 €')
      && await steps.nth(2).getByRole('link', { name: `Reçu n° ${cashed[8]}` }).getAttribute('href') === `/recus/${cashed[7]}/pdf`, step3);
  const keysAfter = await text(keys);
  check('the figures follow: +120 € paid, −120 € still due',
    keysAfter.includes(`${euros(paidBefore + 12000)} Reste à payer ${euros(dueBefore - 12000)}`) && totals(haddad).join() === `${paidBefore + 12000},${dueBefore - 12000}`, keysAfter);
  check('the payment is added on top of the history with its receipt',
    await history.locator('li').count() === paymentCount() && (await text(history.locator('li').first())).includes("Cours d'arabe 2026-2027 · Chèque 3/4 + 120,00 €")
      && (await historyLinks()).some((link) => link.startsWith(`/recus/${cashed[7]}/pdf`)));
  check('the button now proposes the next cheque', await plan.getByRole('button', { name: 'Marquer le chèque 4 comme encaissé' }).isVisible()
    && await plan.getByRole('button', { name: 'Supprimer ce paiement' }).count() === 0);

  // --- chèque rejeté, puis remis à encaisser
  await steps.nth(3).getByRole('button', { name: /Marquer comme rejeté le chèque 4/ }).click();
  await dialog.getByText('Vous pourrez ensuite le remettre à encaisser').waitFor();
  await dialog.getByRole('button', { name: 'Marquer comme rejeté' }).click();
  check('a pending cheque can be marked as rejected: it stays due, nothing left to cash',
    await until(async () => (await text(steps.nth(3))).startsWith('Chèque 4 · Rejeté')) && sql(`select status from installments where id = '${cheque4}'`) === 'REJECTED'
      && totals(haddad)[1] === dueBefore - 12000 && await plan.getByRole('button', { name: /comme encaissé/ }).count() === 0);
  await until(async () => !(await dialog.isVisible()));
  await steps.nth(3).getByRole('button', { name: /Remettre à encaisser le chèque 4/ }).click();
  await dialog.getByLabel('Date prévue').fill(day(5));
  await dialog.getByLabel('N° du chèque').fill('9990001');
  await dialog.getByRole('button', { name: 'Remettre à encaisser' }).click();
  check('a rejected cheque can be put back with a replacement cheque',
    await until(async () => (await text(steps.nth(3))).startsWith('Chèque 4 · À encaisser')) && (await text(steps.nth(3))).includes('n° 9990001')
      && sql(`select status || '|' || due_date || '|' || cheque_number from installments where id = '${cheque4}'`) === `PLANNED|${day(5)}|9990001`);
  await until(async () => !(await dialog.isVisible()));

  // --- chèque encaissé puis rejeté par la banque : le mouvement est annulé, pas effacé
  await steps.nth(2).getByRole('button', { name: /Marquer comme rejeté le chèque 3/ }).click();
  await dialog.getByText('annulé et retiré du solde').waitFor();
  await dialog.getByRole('button', { name: 'Marquer comme rejeté' }).click();
  await until(async () => (await text(steps.nth(2))).startsWith('Chèque 3 · Rejeté'));
  const cancelledRow = history.locator('li').filter({ hasText: 'Annulé' });
  await cancelledRow.waitFor();
  check('a cashed cheque rejected afterwards: movement cancelled but kept, struck through with an "Annulé" badge, total goes back',
    sql(`select status from transactions where id = (select transaction_id from receipts where id = '${cashed[7]}')`) === 'CANCELLED'
      && await cancelledRow.count() === 1
      && await cancelledRow.getByText('+ 120,00 €').evaluate((el) => getComputedStyle(el).textDecorationLine.includes('line-through'))
      && totals(haddad)[0] === paidBefore && (await text(keys)).includes(`Total versé en ${YEAR} ${euros(paidBefore)}`), await text(keys));
  await until(async () => !(await dialog.isVisible()));

  // ------------------------------------------------------------------
  // Supprimer un paiement saisi par erreur, archiver, restaurer
  // ------------------------------------------------------------------
  const moreau = memberId('Famille Moreau');
  await page.goto(`${BASE}/adherents/${moreau}`, { waitUntil: 'networkidle' });
  await title('Famille Moreau').waitFor();
  const moreauPlan = page.getByRole('region', { name: /Échéancier · Soutien scolaire/ });
  check('late cheque is labelled "En retard"; a member with payments can only be archived',
    (await text(moreauPlan.locator('ol > li').first())).startsWith('Chèque 1 · En retard')
      && await page.getByRole('button', { name: 'Archiver', exact: true }).isVisible() && await page.getByRole('button', { name: 'Supprimer', exact: true }).count() === 0);
  const moreauPlanId = sql(`select id from payment_plans where member_id = '${moreau}' and installment_count = 2`);
  await moreauPlan.getByRole('button', { name: 'Supprimer ce paiement' }).click();
  await dialog.getByText('supprimés définitivement').waitFor();
  await dialog.getByRole('button', { name: 'Supprimer', exact: true }).click();
  check('a payment with nothing cashed can be deleted: its schedule disappears, nothing is due any more',
    await until(async () => await moreauPlan.count() === 0)
      && sql(`select (select count(*) from payment_plans where id = '${moreauPlanId}') || '|' || (select count(*) from installments where plan_id = '${moreauPlanId}') || '|' || (select count(*) from installments i join payment_plans p on p.id = i.plan_id where p.member_id = '${moreau}' and i.status <> 'CASHED')`) === '0|0|0'
      && await until(async () => (await text(keys)).includes(`Reste à payer ${euros(0)} Inscrits —`)), await text(keys));
  await until(async () => !(await dialog.isVisible()));

  const movements = sql(`select count(*) from transactions where member_id = '${moreau}'`);
  await page.getByRole('button', { name: 'Archiver', exact: true }).click();
  await dialog.getByText('ses paiements et ses reçus sont conservés').waitFor();
  await dialog.getByRole('button', { name: 'Archiver', exact: true }).click();
  await page.getByText('Archivé', { exact: true }).waitFor();
  check('a member with payments is archived, not deleted: badge, no more "+ Encaisser", history kept',
    sql(`select (archived_at is not null)::text || '|' || (select count(*) from transactions where member_id = '${moreau}') from members where id = '${moreau}'`) === `true|${movements}`
      && await page.getByRole('link', { name: '+ Encaisser' }).count() === 0 && await history.locator('li').count() === Number(movements)
      && new URL(page.url()).pathname === `/adherents/${moreau}`);
  await page.getByRole('button', { name: 'Restaurer' }).click();
  check('"Restaurer" on the sheet puts the member back', await until(async () => await page.getByText('Archivé', { exact: true }).count() === 0 && await page.getByRole('link', { name: '+ Encaisser' }).isVisible())
    && sql(`select (archived_at is null)::text from members where id = '${moreau}'`) === 'true');

  await page.getByRole('button', { name: 'Archiver', exact: true }).click();
  await dialog.getByRole('button', { name: 'Archiver', exact: true }).click();
  await page.getByText('Archivé', { exact: true }).waitFor();
  await page.getByRole('link', { name: '← Tous les adhérents' }).click();
  await page.waitForURL((url) => url.pathname === '/adherents');
  await page.getByText('10 adhérents', { exact: true }).waitFor();
  const archivedToggle = page.getByRole('button', { name: /Adhérents archivés/ });
  const restoreButton = page.getByRole('button', { name: 'Restaurer « Famille Moreau »' });
  check('the archived member leaves the list and sits in a collapsed "archived" section',
    await rows.filter({ hasText: 'Famille Moreau' }).count() === 0 && (await archivedToggle.getAttribute('aria-expanded')) === 'false' && await restoreButton.count() === 0);
  await archivedToggle.click();
  await restoreButton.waitFor();
  check('the section opens on demand', (await archivedToggle.getAttribute('aria-expanded')) === 'true');
  await restoreButton.click();
  await page.getByText('11 adhérents', { exact: true }).waitFor();
  check('"Restaurer" in the list puts the member back and the archived section goes away',
    await until(async () => await rows.filter({ hasText: 'Famille Moreau' }).count() === 1 && await archivedToggle.count() === 0)
      && sql(`select (archived_at is null)::text from members where id = '${moreau}'`) === 'true');

  check('no console error, warning or native dialog on the list and the sheets', issues.length === 0, [...new Set(issues)].join(' | '));

  // ------------------------------------------------------------------
  // Adresses inconnues ou mal formées, visiteur sans session
  // ------------------------------------------------------------------
  const lost = await ctx.newPage();
  const unknown = await lost.goto(`${BASE}/adherents/inconnu0000`, { waitUntil: 'networkidle' });
  const unknownOk = await until(() => lost.getByRole('heading', { name: "Cette page n'existe pas" }).isVisible());
  const forged = await lost.goto(`${BASE}/adherents/${encodeURIComponent("' OR 1=1 --")}`, { waitUntil: 'networkidle' });
  const forgedOk = await until(() => lost.getByRole('heading', { name: "Cette page n'existe pas" }).isVisible());
  check(`unknown or malformed member id: French "page introuvable", no data shown (HTTP ${unknown.status()}/${forged.status()})`,
    unknownOk && forgedOk && !/Famille/.test(await lost.locator('body').innerText()) && sql('select count(*) from members') === '11');
  await lost.close();

  const visitor = await browser.newContext();
  const stranger = await visitor.newPage();
  await stranger.goto(`${BASE}/adherents/${haddad}`, { waitUntil: 'networkidle' });
  check('without a session, a member sheet redirects to the login page and shows nothing', new URL(stranger.url()).pathname === '/connexion' && !/Haddad/.test(await stranger.content()));
  await visitor.close();

  // ------------------------------------------------------------------
  // Thème sombre et téléphone (390px)
  // ------------------------------------------------------------------
  const darkCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR', reducedMotion: 'reduce', colorScheme: 'dark', storageState: await ctx.storageState() });
  const dark = await darkCtx.newPage();
  await dark.goto(`${BASE}/adherents/${haddad}`, { waitUntil: 'networkidle' });
  await dark.getByRole('heading', { level: 1, name: 'Famille Haddad' }).waitFor();
  const colours = await dark.evaluate(() => [getComputedStyle(document.body).backgroundColor, getComputedStyle(document.querySelector('h1')).color]);
  check('dark theme: warm dark page, light text', colours.join() === 'rgb(24, 17, 19),rgb(245, 236, 238)', colours.join());
  await dark.screenshot({ path: path.join(OUT, 'adherents-fiche-sombre.png'), fullPage: true });
  await darkCtx.close();

  const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR', reducedMotion: 'reduce', storageState: await ctx.storageState() });
  const phone = await phoneCtx.newPage();
  const phoneIssues = watch(phone);
  await phone.goto(`${BASE}/adherents`, { waitUntil: 'networkidle' });
  await phone.getByText('11 adhérents', { exact: true }).waitFor();
  const listFit = await overflow(phone);
  const phoneRow = phone.getByRole('region', { name: 'Liste des adhérents' }).locator('li').filter({ hasText: 'Famille Haddad' });
  check('phone (390px): the list fits, each member is a stacked card with labelled amounts',
    listFit.page <= 0 && listFit.outside.length === 0 && await phoneRow.getByText(`Versé en ${YEAR}`).isVisible() && await phoneRow.getByText('Reste à payer').isVisible(), JSON.stringify(listFit));
  await phone.screenshot({ path: path.join(OUT, 'adherents-liste-telephone.png'), fullPage: true });
  await phone.getByRole('button', { name: '+ Adhérent' }).click();
  await phone.getByRole('dialog').waitFor();
  const dialogBox = await phone.getByRole('dialog').boundingBox();
  check('phone: the member form fits in the screen width', dialogBox.x >= 0 && dialogBox.x + dialogBox.width <= 390 && (await overflow(phone)).page <= 0, JSON.stringify(dialogBox));
  await phone.keyboard.press('Escape');

  const rahmani = memberId('Famille Rahmani');
  await phone.goto(`${BASE}/adherents/${rahmani}`, { waitUntil: 'networkidle' });
  await phone.getByRole('heading', { level: 1, name: 'Famille Rahmani' }).waitFor();
  const sheetFit = await overflow(phone);
  const boxes = await phone.getByRole('region', { name: /Échéancier/ }).locator('ol > li').evaluateAll((items) => items.map((item) => { const box = item.getBoundingClientRect(); return [Math.round(box.left), Math.round(box.top)]; }));
  const targets = await phone.locator('main > div').locator('a, button').evaluateAll((items) => items
    .filter((item) => { const { height } = item.getBoundingClientRect(); return height > 0 && height < 40; }) // hauteur 0 : fenêtres fermées
    .map((item) => item.textContent.trim().slice(0, 30)));
  check('phone: the sheet fits, the schedule is on two columns', sheetFit.page <= 0 && sheetFit.outside.length === 0 && boxes.length === 4 && boxes[0][1] === boxes[1][1] && boxes[0][0] < boxes[1][0] && boxes[2][1] > boxes[0][1], JSON.stringify({ sheetFit, boxes }));
  check('phone: every link and button of the sheet is at least 40px high', targets.length === 0, targets.join(' | '));
  check('rejected cheque: shown as "Rejeté" with a way to put it back', await phone.getByRole('button', { name: /Remettre à encaisser le chèque 2/ }).isVisible());
  await phone.screenshot({ path: path.join(OUT, 'adherents-fiche-telephone.png'), fullPage: true });
  check('no console error on phone', phoneIssues.length === 0, [...new Set(phoneIssues)].join(' | '));
  await phoneCtx.close();

  await browser.close();
  finish();
})().catch((error) => { console.error(error); process.exit(1); });

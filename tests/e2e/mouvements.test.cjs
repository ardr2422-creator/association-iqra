// Entrées & sorties : tableau, filtres, recherche, encaissement en 1 à 4 fois,
// dépense, annulation, liens directs, téléphone. Chaque geste est vérifié dans la base.
const { chromium } = require('playwright');
const path = require('path');
const { sql, wipe, seedDemo, reporter, watch, login, day } = require('./helpers.cjs');
const [BASE, OUT] = process.argv.slice(2);
const { check, finish } = reporter();

const euros = (cents) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100).replace(/\s/g, ' ');
const text = async (locator) => (await locator.textContent()).replace(/\s/g, ' ').trim();
const count = (query) => Number(sql(query));
const pad = (n) => String(n).padStart(4, '0');

/** Même calcul que l'application : le 31 devient le dernier jour d'un mois plus court. */
function addMonths(isoDay, months) {
  const [year, month, dayOfMonth] = isoDay.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(dayOfMonth, last));
  return first.toISOString().slice(0, 10);
}

/** [nombre, entrées, sorties, annulés] des mouvements qui vérifient `where`. */
function totals(where = 'true') {
  return sql(`select count(*) || '|' || coalesce(sum(amount_cents) filter (where status = 'COMPLETED' and type = 'INCOME'), 0) || '|' || coalesce(sum(amount_cents) filter (where status = 'COMPLETED' and type = 'EXPENSE'), 0) || '|' || count(*) filter (where status = 'CANCELLED') from transactions t where ${where}`).split('|').map(Number);
}

/** La ligne de résumé attendue : « 42 mouvements (dont 1 annulé) · entrées … · sorties … ». */
function summaryOf([total, income, expense, cancelled], parts = 'both') {
  return [
    `${total} mouvement${total > 1 ? 's' : ''}` + (cancelled ? ` (dont ${cancelled} annulé${cancelled > 1 ? 's' : ''})` : ''),
    parts === 'expense' ? null : `entrées ${euros(income)}`,
    parts === 'income' ? null : `sorties ${euros(expense)}`,
  ].filter(Boolean).join(' · ');
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', locale: 'fr-FR' });
  const page = await ctx.newPage();
  const issues = watch(page);
  // Fiche adhérent et reçu PDF appartiennent à d'autres étapes : on note les 404 pour les distinguer des nôtres.
  const notFound = [];
  page.on('response', (response) => { if (response.status() === 404) notFound.push(new URL(response.url()).pathname); });
  let actionRequest = null;
  page.on('request', (request) => { if (request.method() === 'POST' && request.headers()['next-action']) actionRequest = { url: request.url(), headers: request.headers(), body: request.postData() }; });

  const today = day(0);
  const year = Number(today.slice(0, 4));
  const dialog = page.getByRole('dialog');
  const table = page.getByRole('table', { name: 'Entrées et sorties' });
  const rows = table.locator('[role="row"]:has([role="cell"])');
  const summary = page.locator('p[role="status"]').filter({ hasText: /mouvement/ });
  const row = (label) => rows.filter({ hasText: label });
  const closed = () => dialog.waitFor({ state: 'hidden' });
  const openIncome = async () => { await page.getByRole('button', { name: '+ Encaissement' }).click(); await dialog.getByRole('heading', { name: 'Nouvel encaissement' }).waitFor(); };
  const openExpense = async () => { await page.getByRole('button', { name: '+ Dépense' }).click(); await dialog.getByRole('heading', { name: 'Nouvelle dépense' }).waitFor(); };
  const combo = dialog.getByRole('combobox', { name: 'Adhérent' });
  const pickMember = async (name, typed) => { await combo.fill(typed); await dialog.getByRole('option', { name }).click(); };
  const category = (label) => dialog.getByLabel('Catégorie').selectOption({ label });
  const method = (label) => dialog.getByLabel('Moyen de paiement').selectOption({ label });
  const submit = dialog.getByRole('button', { name: /^Enregistrer/ });
  const nextReceipt = () => `${year}-${pad(count(`select coalesce((select last from receipt_counters where year = ${year}), 0)`) + 1)}`;
  const describedText = (locator) => locator.evaluate((el) => (el.getAttribute('aria-describedby') || '').split(' ').map((id) => document.getElementById(id)?.textContent || '').join(' ').trim());
  const invalidWith = async (locator, message) => (await locator.getAttribute('aria-invalid')) === 'true' && (await describedText(locator)).includes(message);

  sql("update categories set archived_at = null where id like 'cat_defaut_%'");

  /* ------------------------------------------------------------------ */
  /* Base vide : la page dit quoi faire                                  */
  /* ------------------------------------------------------------------ */
  wipe();
  await login(page, BASE, '/mouvements');
  await page.getByText("Aucun mouvement pour l'instant").waitFor();
  check('empty database: empty state proposes to record an income or an expense',
    await page.getByRole('button', { name: 'Enregistrer un encaissement' }).isVisible()
      && await page.getByRole('button', { name: 'Enregistrer une dépense' }).isVisible()
      && await page.getByRole('heading', { level: 1, name: 'Entrées & sorties' }).isVisible()
      && await table.count() === 0);
  await page.screenshot({ path: path.join(OUT, 'mouvements-vide.png') });

  await page.getByRole('button', { name: 'Enregistrer un encaissement' }).click();
  await dialog.getByText("Aucun adhérent n'est encore enregistré").waitFor();
  check('no member yet: the form explains it, links to /adherents and falls back to "Autre payeur"',
    await dialog.getByRole('link', { name: "ajouter d'abord un adhérent" }).getAttribute('href') === '/adherents'
      && await combo.inputValue() === 'Autre payeur (non adhérent)'
      && await dialog.getByLabel('Nom du payeur').isVisible()
      && await dialog.getByRole('button', { name: '2 fois' }).isDisabled());
  await page.keyboard.press('Escape');
  await closed();

  const archived = sql("update categories set archived_at = now() where type = 'EXPENSE' and archived_at is null returning id").split('\n').filter((id) => /^[a-z0-9_]+$/i.test(id));
  await page.reload({ waitUntil: 'networkidle' });
  await openExpense();
  await dialog.getByText("Aucune catégorie de sortie n'est disponible").waitFor();
  check('no active expense category: the form explains it and links to /categories instead of failing',
    await dialog.getByRole('link', { name: 'Gérer les catégories' }).getAttribute('href') === '/categories'
      && await dialog.getByRole('button', { name: 'Enregistrer la dépense' }).count() === 0);
  await dialog.getByRole('button', { name: 'Fermer', exact: true }).last().click();
  await closed();
  sql(`update categories set archived_at = null where id in (${archived.map((id) => `'${id}'`).join(',')})`);

  /* ------------------------------------------------------------------ */
  /* Données de démonstration : tableau, résumé, filtres, recherche      */
  /* ------------------------------------------------------------------ */
  seedDemo();
  await page.reload({ waitUntil: 'networkidle' });
  await rows.first().waitFor();
  const all = totals();
  check('table lists every movement (50 at most) and the summary matches the database (cancelled excluded from sums)',
    await rows.count() === Math.min(all[0], 50) && await text(summary) === summaryOf(all), `${await rows.count()} rows · ${await text(summary)} vs ${summaryOf(all)}`);
  const headers = await table.getByRole('columnheader').allTextContents();
  check('columns: Date, Qui, Catégorie, Paiement, Montant, Reçu', headers.slice(0, 6).join('|') === 'Date|Qui|Catégorie|Paiement|Montant|Reçu', headers.join('|'));

  const firstIncome = sql("select t.id || '|' || m.id || '|' || m.name || '|' || t.amount_cents || '|' || r.id from transactions t join members m on m.id = t.member_id join receipts r on r.transaction_id = t.id where t.status = 'COMPLETED' order by t.date desc, t.created_at desc limit 1").split('|');
  const incomeRow = row(firstIncome[2]).first();
  check('income row: member linked to their sheet, amount in green with "+", receipt link to the PDF in a new tab',
    await incomeRow.getByRole('link', { name: firstIncome[2] }).getAttribute('href') === `/adherents/${firstIncome[1]}`
      && (await text(incomeRow)).includes(`+ ${euros(Number(firstIncome[3]))}`)
      && await incomeRow.getByRole('link', { name: /Reçu n° .* \(PDF/ }).getAttribute('href') === `/recus/${firstIncome[4]}/pdf`
      && await incomeRow.getByRole('link', { name: /Reçu n°/ }).getAttribute('target') === '_blank'
      && await incomeRow.locator('.text-income').count() === 1,
    await text(incomeRow));
  const firstExpense = sql("select label || '|' || amount_cents from transactions where type = 'EXPENSE' and status = 'COMPLETED' order by date desc, created_at desc limit 1").split('|');
  const expenseRow = row(firstExpense[0]).first();
  check('expense row: label as "Qui", amount in bordeaux with a real minus sign, no receipt',
    (await text(expenseRow)).includes(`− ${euros(Number(firstExpense[1]))}`) && await expenseRow.getByRole('link').count() === 0 && await expenseRow.locator('.text-accent').count() >= 1, await text(expenseRow));
  const cancelledRows = table.locator('[role="row"][data-cancelled]');
  check('cancelled movement: struck-through amount, neutral "Annulé" badge, no cancel button',
    await cancelledRows.count() === all[3] && all[3] > 0
      && await cancelledRows.first().locator('s').count() === 1
      && await cancelledRows.first().getByText('Annulé', { exact: true }).isVisible()
      && await cancelledRows.first().getByRole('button').count() === 0);
  const cascade = await rows.evaluateAll((items) => items.slice(0, 4).map((item) => `${getComputedStyle(item).animationName}:${item.style.getPropertyValue('--i')}`));
  check('rows arrive in cascade (rise animation, one step per row)', cascade.join(' ') === 'rise:0 rise:1 rise:2 rise:3', cascade.join(' '));
  await page.screenshot({ path: path.join(OUT, 'mouvements-bureau.png'), fullPage: true });

  // --- filtres
  const chips = await page.getByRole('group', { name: 'Filtrer par catégorie' }).getByRole('button').allTextContents();
  const usedIncome = sql("select string_agg(name, '|' order by name) from (select distinct c.name from transactions t join categories c on c.id = t.category_id where t.type = 'INCOME') s").split('|');
  check('chips: "Tout", one per income category in use, then "Dépenses"',
    chips[0] === 'Tout' && chips[chips.length - 1] === 'Dépenses' && chips.length === usedIncome.length + 2 && usedIncome.every((name) => chips.includes(name)), chips.join('|'));
  const chip = (name) => page.getByRole('group', { name: 'Filtrer par catégorie' }).getByRole('button', { name, exact: true });
  await chip('Dons').click();
  const dons = totals("t.category_id = 'cat_defaut_dons'");
  check('filter "Dons": only donations, summary limited to incomes',
    await rows.count() === dons[0] && await text(summary) === summaryOf(dons, 'income') && await chip('Dons').getAttribute('aria-pressed') === 'true'
      && (await rows.evaluateAll((items) => items.every((item) => item.textContent.includes('Dons')))), await text(summary));
  await chip('Dépenses').click();
  const expenses = totals("t.type = 'EXPENSE'");
  check('filter "Dépenses": every expense, summary limited to expenses',
    await rows.count() === expenses[0] && await text(summary) === summaryOf(expenses, 'expense') && await rows.locator('.text-income').count() === 0, await text(summary));
  await chip('Tout').click();

  // --- recherche (dans la page : nom, libellé, catégorie, moyen de paiement, n° de chèque)
  const search = page.getByRole('searchbox', { name: 'Rechercher un mouvement' });
  const benali = totals("t.member_id in (select id from members where name = 'Famille Benali')");
  await search.fill('  BENALI ');
  check('search by name ignores case and spaces', await rows.count() === benali[0] && await text(summary) === summaryOf(benali), await text(summary));
  const traore = totals("t.member_id in (select id from members where name = 'Famille Traoré')");
  await search.fill('traore');
  check('search ignores accents', await rows.count() === traore[0] && traore[0] > 0, `${await rows.count()} vs ${traore[0]}`);
  const cheque = sql("select t.cheque_number || '|' || m.name from transactions t join members m on m.id = t.member_id where t.cheque_number is not null order by t.date desc limit 1").split('|');
  await search.fill(cheque[0]);
  check('search by cheque number finds the cheque', await rows.count() === 1 && (await text(rows.first())).includes(cheque[1]) && (await text(rows.first())).includes(`n° ${cheque[0]}`), await text(rows.first()));
  const transfers = totals("t.method = 'TRANSFER' and t.category_id = 'cat_defaut_loyer'");
  await search.fill('virement loyer');
  check('search combines several words (payment method + category)', await rows.count() === transfers[0] && transfers[0] > 0, `${await rows.count()} vs ${transfers[0]}`);
  await search.fill("zzz%_' OR 1=1 --");
  await page.getByText('Aucun résultat').waitFor();
  check('search without match: "Aucun résultat", the typed text is shown as plain text', await table.count() === 0 && await page.getByText("zzz%_' OR 1=1 --").isVisible() && await text(summary) === 'Aucun mouvement ne correspond');
  await page.getByRole('button', { name: 'Tout afficher' }).click();
  check('"Tout afficher" clears the search and the filter', await rows.count() === Math.min(all[0], 50) && await search.inputValue() === '');

  /* ------------------------------------------------------------------ */
  /* Liens directs ?nouveau=…                                            */
  /* ------------------------------------------------------------------ */
  const haddad = sql("select id from members where name = 'Famille Haddad'");
  await page.goto(`${BASE}/mouvements?nouveau=encaissement&adherent=${haddad}`, { waitUntil: 'networkidle' });
  await dialog.getByRole('heading', { name: 'Nouvel encaissement' }).waitFor();
  await page.waitForURL((url) => url.pathname === '/mouvements' && url.search === '');
  check('?nouveau=encaissement&adherent=<id>: the form opens with the member selected, the parameter leaves the address',
    await combo.inputValue() === 'Famille Haddad' && new URL(page.url()).search === '');
  await page.reload({ waitUntil: 'networkidle' });
  await rows.first().waitFor();
  check('reloading does not reopen the form', !(await dialog.isVisible()));
  await page.goto(`${BASE}/mouvements?nouveau=depense`, { waitUntil: 'networkidle' });
  await dialog.getByRole('heading', { name: 'Nouvelle dépense' }).waitFor();
  await page.waitForURL((url) => url.search === '');
  check('?nouveau=depense opens the expense form, focus in "Libellé"', await page.evaluate(() => document.activeElement?.getAttribute('name')) === 'label');
  await page.keyboard.press('Escape');
  await closed();
  // depuis le tableau de bord, deux fois de suite : la page reste montée en arrière-plan entre les deux
  for (let round = 0; round < 2; round += 1) {
    await page.getByRole('link', { name: 'Tableau de bord' }).click();
    await page.waitForURL((url) => url.pathname === '/');
    await page.getByRole('link', { name: '+ Encaissement' }).click();
    await dialog.getByRole('heading', { name: 'Nouvel encaissement' }).waitFor();
    await page.waitForURL((url) => url.pathname === '/mouvements' && url.search === '');
    await page.keyboard.press('Escape');
    await closed();
  }
  check('"+ Encaissement" on the dashboard opens the form at every visit', true);
  await page.getByRole('link', { name: 'Tableau de bord' }).click();
  await page.waitForURL((url) => url.pathname === '/');
  await page.getByRole('link', { name: 'Entrées & sorties' }).click();
  await rows.first().waitFor();
  await page.waitForTimeout(500);
  check('coming back through the menu does not reopen the form', !(await dialog.isVisible()) && new URL(page.url()).pathname === '/mouvements');
  await page.goto(`${BASE}/mouvements?nouveau=encaissement&nouveau=depense`, { waitUntil: 'networkidle' });
  await rows.first().waitFor();
  await page.waitForTimeout(400);
  check('an ambiguous (repeated) parameter opens nothing', !(await dialog.isVisible()));
  await page.goto(`${BASE}/mouvements?nouveau=encaissement&adherent=${encodeURIComponent("x' OR '1'='1")}`, { waitUntil: 'networkidle' });
  await dialog.getByRole('heading', { name: 'Nouvel encaissement' }).waitFor();
  check('a forged member id in the address is ignored (form opens without a member)', await combo.inputValue() === '');

  /* ------------------------------------------------------------------ */
  /* Erreurs de saisie, affichées à côté des champs                      */
  /* ------------------------------------------------------------------ */
  const before = count('select count(*) from transactions') + '|' + count('select count(*) from payment_plans') + '|' + count('select count(*) from receipts');
  const unchanged = () => count('select count(*) from transactions') + '|' + count('select count(*) from payment_plans') + '|' + count('select count(*) from receipts') === before;
  await submit.click();
  await dialog.getByText('Certains champs sont à corriger.').waitFor();
  check('empty form: member, category and amount are flagged next to their fields',
    await invalidWith(combo, 'Choisissez un adhérent')
      && await invalidWith(dialog.getByLabel('Catégorie'), 'Choisissez une catégorie.')
      && await invalidWith(dialog.getByLabel('Montant total'), 'Indiquez un montant.')
      && await dialog.locator('[role="alert"]').filter({ hasText: 'Indiquez un montant.' }).count() === 1);
  check('focus moves to the first field to fix', await combo.evaluate((el) => el === document.activeElement));

  // clavier : ↓ puis Entrée choisit dans la liste, Échap referme la liste sans fermer la fenêtre
  await combo.fill('ben');
  const options = await dialog.getByRole('listbox', { name: 'Payeurs proposés' }).getByRole('option').allTextContents();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  const stillOpen = await dialog.isVisible() && await combo.getAttribute('aria-expanded') === 'false';
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  check('member picker: filtered list, keyboard selection, Escape only closes the list',
    options.length === 3 && options[0] === 'Famille Benali' && options[2] === 'Autre payeur (non adhérent)' && stillOpen && await combo.inputValue() === 'Famille Benali', options.join('|'));

  await category("Cours d'arabe");
  await dialog.getByLabel('Montant total').fill('12,5,0');
  await dialog.getByLabel('Date', { exact: true }).fill(day(1));
  await dialog.getByLabel("Nombre d'inscrits").fill('99');
  await submit.click();
  check('unreadable amount, future date and absurd head count are refused next to their fields',
    await invalidWith(dialog.getByLabel('Montant total'), "Ce montant n'est pas valide")
      && await invalidWith(dialog.getByLabel('Date', { exact: true }), "La date d'un encaissement ne peut pas être dans le futur.")
      && await invalidWith(dialog.getByLabel("Nombre d'inscrits"), 'Indiquez un nombre entre 1 et 50.'));
  await dialog.getByLabel('Date', { exact: true }).fill(today);
  await dialog.getByLabel("Nombre d'inscrits").fill('');
  await dialog.getByLabel('Montant total').fill('0');
  await submit.click();
  await dialog.getByText('Le montant doit être supérieur à zéro.').waitFor();
  check('zero amount: the server refuses and its message lands next to the amount field',
    await invalidWith(dialog.getByLabel('Montant total'), 'Le montant doit être supérieur à zéro.') && unchanged());

  /* ------------------------------------------------------------------ */
  /* Encaissement en 1 fois pour un adhérent                             */
  /* ------------------------------------------------------------------ */
  const benaliId = sql("select id from members where name = 'Famille Benali'");
  let expectedReceipt = nextReceipt();
  await category('Adhésions');
  await dialog.getByLabel('Montant total').fill('120,50');
  await method('Espèces');
  await dialog.getByLabel("Nombre d'inscrits").fill('2');
  await dialog.getByLabel('Libellé').fill('  E2E   une fois ');
  await dialog.getByLabel('N° du chèque').waitFor({ state: 'detached' });
  check('paying once in cash: no cheque field, button announces the receipt',
    await dialog.getByLabel('Banque').count() === 0 && (await text(submit)) === 'Enregistrer et générer le reçu');
  await submit.click();
  await dialog.getByText(`Encaissement enregistré. Reçu n° ${expectedReceipt}.`).waitFor();
  const once = sql(`select t.id || '|' || t.amount_cents || '|' || t.method || '|' || t.status || '|' || t.date || '|' || t.label || '|' || t.member_id || '|' || r.number || '|' || r.id || '|' || p.installment_count || '|' || p.total_cents || '|' || p.participants || '|' || i.status || '|' || i.cashed_on || '|' || (i.transaction_id = t.id) from transactions t join receipts r on r.transaction_id = t.id join installments i on i.transaction_id = t.id join payment_plans p on p.id = i.plan_id where t.label like '%E2E une fois'`).split('|');
  check('income in 1 instalment: transaction, receipt and payment plan are written',
    once.slice(1).join('|') === `12050|CASH|COMPLETED|${today}|Adhésions · E2E une fois|${benaliId}|${expectedReceipt}|${once[8]}|1|12050|2|CASHED|${today}|true`, once.join('|'));
  check('confirmation offers the receipt PDF in a new tab, focus on it',
    await dialog.getByRole('link', { name: 'Ouvrir le reçu (PDF)' }).getAttribute('href') === `/recus/${once[8]}/pdf`
      && await dialog.getByRole('link', { name: 'Ouvrir le reçu (PDF)' }).getAttribute('target') === '_blank'
      && await dialog.getByRole('link', { name: 'Ouvrir le reçu (PDF)' }).evaluate((el) => el === document.activeElement));
  await page.screenshot({ path: path.join(OUT, 'mouvements-confirmation.png') });
  await dialog.getByRole('button', { name: 'Fermer', exact: true }).last().click();
  await closed();
  const onceRow = row('E2E une fois');
  check('the new movement is in the table behind (first row, "Espèces", receipt link) and the summary is updated',
    (await text(rows.first())).includes('E2E une fois') && (await text(onceRow)).includes('Famille Benali') && (await text(onceRow)).includes('Espèces') && (await text(onceRow)).includes(`+ ${euros(12050)}`)
      && await onceRow.getByRole('link', { name: `Reçu n° ${expectedReceipt} (PDF, nouvel onglet)` }).getAttribute('href') === `/recus/${once[8]}/pdf`
      && await text(summary) === summaryOf(totals()), await text(summary));

  /* ------------------------------------------------------------------ */
  /* Encaissement en 4 fois par chèque                                   */
  /* ------------------------------------------------------------------ */
  await openIncome();
  await pickMember('Famille Haddad', 'hadd');
  await category("Cours d'arabe");
  await dialog.getByLabel('Libellé').fill('E2E quatre fois');
  await dialog.getByLabel('Montant total').fill('100');
  await dialog.getByRole('button', { name: '3 fois' }).click();
  const line = (label, n) => dialog.getByLabel(`${label} ${n}`, { exact: true });
  const amounts = async (n) => Promise.all(Array.from({ length: n }, (_, i) => line('Montant du versement', i + 1).inputValue()));
  check('100 € in 3 instalments: the extra cent goes on the first one', (await amounts(3)).join('|') === '33,34|33,33|33,33', (await amounts(3)).join('|'));
  await dialog.getByLabel('Montant total').fill('485');
  await dialog.getByRole('button', { name: '4 fois' }).click();
  const due = [0, 1, 2, 3].map((n) => addMonths(today, n));
  const dates = async () => [await line('Date du versement', 1).inputValue(), await line('Date prévue du versement', 2).inputValue(), await line('Date prévue du versement', 3).inputValue(), await line('Date prévue du versement', 4).inputValue()];
  check('485 € in 4 instalments: 4 lines of 121,25 €, one per month from the payment date',
    (await amounts(4)).join('|') === '121,25|121,25|121,25|121,25' && (await dates()).join('|') === due.join('|')
      && await dialog.getByText('Les 4 dates d\'encaissement sont créées et apparaissent dans le calendrier.').isVisible()
      && await dialog.getByText(`Les 4 versements font bien ${euros(48500)}.`).isVisible(), `${(await amounts(4)).join('|')} ${(await dates()).join('|')}`);
  const earlier = addMonths(today, -1);
  await dialog.getByLabel('Date du premier versement').fill(earlier);
  const shifted = [0, 1, 2, 3].map((n) => addMonths(earlier, n));
  check('changing the first date recomputes the schedule', (await dates()).join('|') === shifted.join('|'), (await dates()).join('|'));
  for (let n = 1; n <= 4; n += 1) await line('N° du chèque', n).fill(`900000${n}`);
  await line('Banque', 1).fill('Banque E2E');
  check('the bank of the first cheque is proposed for the others', await line('Banque', 4).inputValue() === 'Banque E2E');
  await line('Banque', 4).fill('Autre Banque');
  await page.screenshot({ path: path.join(OUT, 'mouvements-encaissement-4-fois.png') });

  // --- un échéancier dont les lignes ne font pas le total est refusé
  await line('Montant du versement', 2).fill('100');
  await dialog.getByText('il manque 21,25 € pour atteindre 485,00 €').waitFor();
  await submit.click();
  await dialog.locator('[role="alert"]').filter({ hasText: 'Les versements font 463,75 €, pas 485,00 €.' }).waitFor();
  check('schedule that does not add up: refused with a clear message, nothing is written',
    count("select count(*) from payment_plans where label = 'E2E quatre fois'") === 0 && count("select count(*) from transactions where label like '%E2E quatre fois'") === 0);
  await line('Date prévue du versement', 3).fill(addMonths(earlier, -2));
  await line('Montant du versement', 2).fill('121,25');
  await submit.click();
  await dialog.getByText('Cette date doit suivre celle du versement précédent.').waitFor();
  check('instalment dates out of order are refused on the line', await line('Date prévue du versement', 3).getAttribute('aria-invalid') === 'true' && count("select count(*) from payment_plans where label = 'E2E quatre fois'") === 0);
  await dialog.getByRole('button', { name: 'Répartir à nouveau' }).click();
  check('"Répartir à nouveau" restores the automatic schedule', (await amounts(4)).join('|') === '121,25|121,25|121,25|121,25' && (await dates()).join('|') === shifted.join('|') && await dialog.getByRole('button', { name: 'Répartir à nouveau' }).count() === 0);

  expectedReceipt = nextReceipt();
  await submit.click();
  await dialog.getByText(`Encaissement enregistré. Reçu n° ${expectedReceipt}.`).waitFor();
  const four = sql("select string_agg(i.number || ':' || i.amount_cents || ':' || i.due_date || ':' || i.cheque_number || ':' || i.bank || ':' || i.status || ':' || coalesce(i.cashed_on::text, '-') || ':' || (i.transaction_id is not null), '|' order by i.number) from installments i join payment_plans p on p.id = i.plan_id where p.label = 'E2E quatre fois'");
  const fourExpected = shifted.map((d, i) => `${i + 1}:12125:${d}:900000${i + 1}:${i === 3 ? 'Autre Banque' : 'Banque E2E'}:${i === 0 ? 'CASHED' : 'PLANNED'}:${i === 0 ? d : '-'}:${i === 0}`).join('|');
  check('4 instalments by cheque: 4 lines with the right amounts, dates, numbers and banks; only the first is cashed', four === fourExpected, `${four} vs ${fourExpected}`);
  const fourTx = sql("select count(*) || '|' || min(t.amount_cents) || '|' || min(t.cheque_number) || '|' || min(t.bank) || '|' || min(t.date::text) || '|' || min(r.number) || '|' || min(p.total_cents) || '|' || min(p.installment_count) from transactions t join receipts r on r.transaction_id = t.id join installments i on i.transaction_id = t.id join payment_plans p on p.id = i.plan_id where t.label like '%E2E quatre fois'");
  check('4 instalments: a single transaction (the cashed cheque) and the receipt number follows the previous one',
    fourTx === `1|12125|9000001|Banque E2E|${earlier}|${expectedReceipt}|48500|4` && expectedReceipt !== once[7], fourTx);
  await dialog.getByRole('button', { name: 'Fermer', exact: true }).last().click();
  await closed();
  const fourRow = row('E2E quatre fois');
  check('the cashed cheque appears as "Chèque 1/4" with its number', (await text(fourRow)).includes('Chèque 1/4') && (await text(fourRow)).includes('n° 9000001') && (await text(fourRow)).includes('Famille Haddad'), await text(fourRow));

  /* ------------------------------------------------------------------ */
  /* Échéancier sans encaissement immédiat                               */
  /* ------------------------------------------------------------------ */
  await openIncome();
  await pickMember('Famille Diallo', 'dial');
  await category('Soutien scolaire');
  await dialog.getByLabel('Libellé').fill('E2E plus tard');
  await dialog.getByLabel('Montant total').fill('90');
  await method('Virement');
  await dialog.getByRole('button', { name: '2 fois' }).click();
  await dialog.getByLabel('Le premier versement est encaissé à cette date').uncheck();
  await dialog.getByLabel('Date du premier versement').fill(day(10));
  check('first instalment not cashed: the button reads "Enregistrer l\'échéancier", no cheque column for a transfer',
    (await text(submit)) === "Enregistrer l'échéancier" && await dialog.getByLabel('N° du chèque 1').count() === 0);
  const receiptsBefore = count('select count(*) from receipts');
  await submit.click();
  await dialog.getByText('Échéancier enregistré : 2 versements prévus.').waitFor();
  const later = sql("select string_agg(i.amount_cents || ':' || i.due_date || ':' || i.status || ':' || i.method, '|' order by i.number) from installments i join payment_plans p on p.id = i.plan_id where p.label = 'E2E plus tard'");
  check('nothing cashed now: 2 planned instalments, no transaction, no receipt',
    later === `4500:${day(10)}:PLANNED:TRANSFER|4500:${addMonths(day(10), 1)}:PLANNED:TRANSFER` && count("select count(*) from transactions where label like '%E2E plus tard'") === 0 && count('select count(*) from receipts') === receiptsBefore
      && await dialog.getByRole('link', { name: "Voir la fiche de l'adhérent" }).getAttribute('href') === `/adherents/${sql("select id from members where name = 'Famille Diallo'")}`, later);

  /* ------------------------------------------------------------------ */
  /* Don d'un non-adhérent                                               */
  /* ------------------------------------------------------------------ */
  await dialog.getByRole('button', { name: 'Saisir un autre' }).click();
  await dialog.getByLabel('Montant total').waitFor();
  check('"Saisir un autre" gives an empty form, focus on the member field', await combo.inputValue() === '' && await combo.evaluate((el) => el === document.activeElement));
  await combo.fill('Mme Zoé Passante');
  await dialog.getByText('Aucun adhérent ne correspond à « Mme Zoé Passante ».').waitFor();
  await dialog.getByRole('option', { name: 'Autre payeur (non adhérent)' }).click();
  check('"Autre payeur": the typed name becomes the payer name, paying in several times is disabled and explained',
    await dialog.getByLabel('Nom du payeur').inputValue() === 'Mme Zoé Passante'
      && await dialog.getByRole('button', { name: '2 fois' }).isDisabled() && await dialog.getByRole('button', { name: '4 fois' }).isDisabled()
      && await dialog.getByText('Le paiement en plusieurs fois est réservé aux adhérents').isVisible()
      && await dialog.getByLabel("Nombre d'inscrits").count() === 0);
  await dialog.getByLabel('Nom du payeur').fill('');
  await category('Dons');
  await dialog.getByLabel('Montant total').fill('50');
  await method('Virement');
  await submit.click();
  check('payer name is required for a non-member', await invalidWith(dialog.getByLabel('Nom du payeur'), 'Indiquez qui a payé.'));
  await dialog.getByLabel('Nom du payeur').fill('Mme Zoé Passante');
  expectedReceipt = nextReceipt();
  const plansBefore = count('select count(*) from payment_plans');
  await submit.click();
  await dialog.getByText(`Encaissement enregistré. Reçu n° ${expectedReceipt}.`).waitFor();
  const gift = sql("select t.amount_cents || '|' || t.method || '|' || (t.member_id is null) || '|' || t.label || '|' || t.date || '|' || r.number || '|' || r.payer_name from transactions t join receipts r on r.transaction_id = t.id where t.payer_name = 'Mme Zoé Passante'");
  check('donation from a non-member: transaction with the payer name, receipt, no payment plan',
    gift === `5000|TRANSFER|true|Dons|${today}|${expectedReceipt}|Mme Zoé Passante` && count('select count(*) from payment_plans') === plansBefore, gift);
  await dialog.getByRole('button', { name: 'Fermer', exact: true }).last().click();
  await closed();
  const giftRow = row('Mme Zoé Passante');
  check('the donor is shown as plain text (no member sheet)', (await text(giftRow)).includes('Virement') && await giftRow.getByRole('link', { name: 'Mme Zoé Passante' }).count() === 0);

  /* ------------------------------------------------------------------ */
  /* Dépense                                                             */
  /* ------------------------------------------------------------------ */
  await openExpense();
  await submit.click();
  check('expense: empty label, category and amount are flagged next to their fields',
    await invalidWith(dialog.getByLabel('Libellé'), 'Indiquez à quoi correspond cette dépense.')
      && await invalidWith(dialog.getByLabel('Catégorie'), 'Choisissez une catégorie.')
      && await invalidWith(dialog.getByLabel('Montant'), 'Indiquez un montant.'));
  await dialog.getByLabel('Libellé').fill('E2E location minibus');
  await dialog.getByLabel('Date').fill(day(2));
  await category('Sorties et événements');
  await dialog.getByLabel('Montant').fill('42,9');
  await submit.click();
  check('expense dated in the future is refused next to the date', await invalidWith(dialog.getByLabel('Date'), "La date d'une dépense ne peut pas être dans le futur.") && count("select count(*) from transactions where label = 'E2E location minibus'") === 0);
  await dialog.getByLabel('Date').fill(day(-1));
  check('expense methods: Espèces, Chèque, Virement, Carte', (await dialog.getByLabel('Moyen de paiement').locator('option').allTextContents()).join('|') === 'Espèces|Chèque|Virement|Carte');
  await method('Chèque');
  await dialog.getByLabel('N° du chèque').fill('7700123');
  await dialog.getByLabel('Banque').fill('Banque E2E');
  await dialog.getByLabel('Notes').fill('Facture 118\nRemboursée');
  await submit.click();
  await closed();
  const spent = sql("select type || '|' || amount_cents || '|' || method || '|' || date || '|' || category_id || '|' || cheque_number || '|' || bank || '|' || replace(notes, E'\\n', '/') || '|' || status || '|' || (member_id is null) from transactions where label = 'E2E location minibus'");
  check('expense is written (cheque number, bank, notes) and the dialog closes', spent === `EXPENSE|4290|CHEQUE|${day(-1)}|cat_defaut_sorties_depenses|7700123|Banque E2E|Facture 118/Remboursée|COMPLETED|true`, spent);
  const spentRow = row('E2E location minibus');
  await spentRow.waitFor();
  check('the expense appears in the table: minus sign, no receipt, summary updated',
    (await text(spentRow)).includes(`− ${euros(4290)}`) && await spentRow.getByRole('link').count() === 0 && await text(summary) === summaryOf(totals()), await text(summary));

  /* ------------------------------------------------------------------ */
  /* Refus du serveur : adhérent archivé, requêtes falsifiées            */
  /* ------------------------------------------------------------------ */
  const petit = sql("select id from members where name = 'Famille Petit'");
  await openIncome();
  await pickMember('Famille Petit', 'petit');
  await category('Dons');
  await dialog.getByLabel('Montant total').fill('10');
  sql(`update members set archived_at = now() where id = '${petit}'`);
  const txBefore = count('select count(*) from transactions');
  await submit.click();
  await dialog.locator('[role="alert"]').filter({ hasText: "Cet adhérent n'existe plus ou a été archivé." }).waitFor();
  check('income for a member archived meanwhile is refused with a clear message, nothing is written', count('select count(*) from transactions') === txBefore);
  sql(`update members set archived_at = null where id = '${petit}'`);
  await page.keyboard.press('Escape');
  await closed();

  const replay = async (mutate, cookies = true) => {
    const jar = (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
    const headers = { ...actionRequest.headers }; delete headers['content-length']; delete headers['cookie']; delete headers['host'];
    if (cookies) headers['cookie'] = jar;
    const args = JSON.parse(actionRequest.body);
    if (mutate) mutate(args[0]);
    const res = await fetch(actionRequest.url, { method: 'POST', headers, body: JSON.stringify(args), redirect: 'manual' });
    return { status: res.status, text: (await res.text()).slice(0, 800) };
  };
  const anonymous = await replay(null, false);
  check('income action without a session is rejected (401), nothing is written', anonymous.status === 401 && count('select count(*) from transactions') === txBefore, `status=${anonymous.status}`);
  const tampered = [
    await replay((a) => { a.installments = Array.from({ length: 5 }, () => ({ amount: '10', day: today, chequeNumber: null, bank: null })); }),
    await replay((a) => { a.installments[0].amount = -500; }),
    await replay((a) => { a.memberId = "x' OR '1'='1"; }),
    await replay((a) => { a.method = 'CARD'; }),
    await replay((a) => { a.categoryId = 'cat_defaut_fournitures'; }),
    await replay((a) => { a.installments[0].day = day(3); }),
    await replay((a) => { a.memberId = null; a.payerName = 'Fraude'; a.firstCashed = false; }),
  ];
  const refusals = [/à corriger/, /à corriger/, /à corriger/, /à corriger/, /n'est plus disponible/, /dans le futur/, /Choisissez un adhérent/];
  check('forged requests (5 instalments, negative amount, injected id, card income, expense category, future date, unpaid non-member) are all refused',
    tampered.every((res, i) => refusals[i].test(res.text)) && count('select count(*) from transactions') === txBefore && count("select count(*) from transactions where payer_name = 'Fraude'") === 0,
    tampered.map((res, i) => `${i}:${res.status}:${refusals[i].test(res.text)}`).join(' '));

  /* ------------------------------------------------------------------ */
  /* Annuler un mouvement                                                */
  /* ------------------------------------------------------------------ */
  await page.reload({ waitUntil: 'networkidle' });
  await fourRow.waitFor();
  const fourId = sql("select id from transactions where label like '%E2E quatre fois'");
  const fourReceipt = sql(`select number from receipts where transaction_id = '${fourId}'`);
  const beforeCancel = totals();
  await fourRow.getByRole('button', { name: /^Annuler ce mouvement : Famille Haddad/ }).click();
  await dialog.getByRole('heading', { name: 'Annuler ce mouvement' }).waitFor();
  const explanation = await text(dialog);
  check('cancel confirmation explains the consequences (history, balance, cheque back to "prévu", receipt kept)',
    /reste visible dans l'historique/.test(explanation) && /retiré du solde/.test(explanation) && /chèque 1\/4\) redevient « prévu »/.test(explanation) && explanation.includes(`Le reçu n° ${fourReceipt} est conservé et marqué « annulé »`), explanation);
  check('the safe choice has the focus', await dialog.getByRole('button', { name: 'Conserver' }).evaluate((el) => el === document.activeElement));
  await dialog.getByRole('button', { name: 'Conserver' }).click();
  await closed();
  check('"Conserver" changes nothing', sql(`select status from transactions where id = '${fourId}'`) === 'COMPLETED');
  await fourRow.getByRole('button', { name: /^Annuler ce mouvement/ }).click();
  await dialog.getByRole('button', { name: 'Annuler le mouvement' }).click();
  await closed();
  await table.locator('[role="row"][data-cancelled]').filter({ hasText: 'E2E quatre fois' }).waitFor();
  const cancelledFour = sql(`select t.status || '|' || (select count(*) from receipts where transaction_id = t.id) || '|' || (select string_agg(i.status || ':' || coalesce(i.cashed_on::text, '-') || ':' || (i.transaction_id is null), ',' order by i.number) from installments i join payment_plans p on p.id = i.plan_id where p.label = 'E2E quatre fois') from transactions t where t.id = '${fourId}'`);
  check('cancelled cheque of a 4-instalment payment: transaction cancelled, receipt kept, instalment back to PLANNED',
    cancelledFour === 'CANCELLED|1|PLANNED:-:true,PLANNED:-:true,PLANNED:-:true,PLANNED:-:true', cancelledFour);
  check('after cancelling, the focus is on the cancelled row (not lost at the top of the page)', await fourRow.evaluate((el) => el === document.activeElement));
  const afterCancel = totals();
  check('the row is struck through with "Annulé", no cancel button, and the sums drop by the cancelled amount',
    await fourRow.locator('s').count() === 1 && await fourRow.getByText('Annulé', { exact: true }).isVisible() && await fourRow.getByRole('button').count() === 0
      && afterCancel[0] === beforeCancel[0] && afterCancel[1] === beforeCancel[1] - 12125 && afterCancel[3] === beforeCancel[3] + 1 && await text(summary) === summaryOf(afterCancel),
    await text(summary));
  await page.screenshot({ path: path.join(OUT, 'mouvements-annule.png') });

  // paiement en une fois : il disparaît de la fiche de l'adhérent
  await onceRow.getByRole('button', { name: /^Annuler ce mouvement/ }).click();
  check('single payment: the dialog says the payment leaves the member sheet', /Le paiement est retiré de la fiche de l'adhérent/.test(await text(dialog)));
  await dialog.getByRole('button', { name: 'Annuler le mouvement' }).click();
  await closed();
  check('cancelled single payment: transaction kept as cancelled with its receipt, plan removed',
    sql(`select status from transactions where id = '${once[0]}'`) === 'CANCELLED' && count(`select count(*) from receipts where transaction_id = '${once[0]}'`) === 1 && count("select count(*) from payment_plans where label = 'E2E une fois'") === 0);

  // mouvement déjà annulé ailleurs (autre onglet) : refus lisible
  await spentRow.getByRole('button', { name: /^Annuler ce mouvement/ }).click();
  await dialog.getByRole('heading', { name: 'Annuler ce mouvement' }).waitFor();
  sql("update transactions set status = 'CANCELLED' where label = 'E2E location minibus'");
  await dialog.getByRole('button', { name: 'Annuler le mouvement' }).click();
  await dialog.locator('[role="alert"]').filter({ hasText: 'Ce mouvement est déjà annulé.' }).waitFor();
  check('cancelling a movement already cancelled elsewhere is refused with a clear message', true);
  await dialog.getByRole('button', { name: 'Conserver' }).click();
  await closed();

  /* ------------------------------------------------------------------ */
  /* Plus de 50 mouvements, années précédentes, limite du serveur        */
  /* ------------------------------------------------------------------ */
  sql("insert into transactions (id, date, type, category_id, label, amount_cents, method, updated_at) select 'e2e_lot_' || g, current_date - 400 - g, 'EXPENSE', 'cat_defaut_frais_divers', 'e2e lot ' || g, 100 + g, 'CARD', now() from generate_series(1, 30) g");
  await page.reload({ waitUntil: 'networkidle' });
  await rows.first().waitFor();
  const total = count('select count(*) from transactions');
  const more = page.getByRole('button', { name: /^Afficher plus/ });
  check('50 rows at first, then "Afficher plus" with what is left', await rows.count() === 50 && (await text(more)).includes(`(${total - 50} restants)`), `${await rows.count()} · ${await text(more)}`);
  await more.click();
  await row('e2e lot 30').waitFor();
  const oldDay = sql("select to_char(date, 'YYYY') from transactions where id = 'e2e_lot_30'");
  check('"Afficher plus" reveals the rest; a date from another year shows the year',
    await rows.count() === total && await more.count() === 0
      && (await text(row('e2e lot 30').locator('[role="cell"]').first())).endsWith(oldDay) && !/\d{4}/.test(await text(rows.first().locator('[role="cell"]').first())),
    `${await text(row('e2e lot 30'))} / ${await text(rows.first().locator('[role="cell"]').first())}`);
  sql("insert into transactions (id, date, type, category_id, label, amount_cents, method, updated_at) select 'e2e_masse_' || g, current_date - 800, 'EXPENSE', 'cat_defaut_frais_divers', 'e2e masse ' || g, 100, 'CARD', now() from generate_series(1, 1000) g");
  await page.reload({ waitUntil: 'networkidle' });
  await rows.first().waitFor();
  check('beyond the server limit a note says only the most recent movements are loaded',
    await page.getByText('Seuls les 1 000 mouvements les plus récents sont chargés').isVisible() && (await text(summary)).startsWith('1000 mouvements'), await text(summary));
  sql("delete from transactions where id like 'e2e_masse_%' or id like 'e2e_lot_%'");

  /* ------------------------------------------------------------------ */
  /* Téléphone (390 px) et thème sombre                                  */
  /* ------------------------------------------------------------------ */
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'networkidle' });
  await rows.first().waitFor();
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const stacked = await rows.first().evaluate((item) => {
    const cells = [...item.querySelectorAll('[role="cell"]')].map((cell) => cell.getBoundingClientRect());
    const [date, who, categoryCell, , amount] = cells;
    return who.top < date.top && date.top < categoryCell.top && Math.abs(amount.top - who.top) < 6 && cells.every((cell) => cell.right <= item.getBoundingClientRect().right + 1);
  });
  check('phone: no horizontal overflow, each movement becomes a stacked block (name and amount, then date, then category)', await overflow() <= 0 && stacked, `overflow=${await overflow()}`);
  await page.screenshot({ path: path.join(OUT, 'mouvements-telephone.png') });
  await openIncome();
  await pickMember('Famille Nguyen', 'ngu');
  await dialog.getByLabel('Montant total').fill('300');
  await dialog.getByRole('button', { name: '3 fois' }).click();
  await line('Banque', 3).scrollIntoViewIfNeeded();
  const fits = await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth && [...el.querySelectorAll('input, select, button')].filter((field) => field.getClientRects().length > 0).every((field) => field.getBoundingClientRect().right <= el.getBoundingClientRect().right && field.getBoundingClientRect().left >= el.getBoundingClientRect().left));
  check('phone: the form and its 3-line schedule fit in the dialog, labels visible on each line', fits && await overflow() <= 0 && await dialog.getByText('Chèque 2 · prévu').isVisible());
  await page.screenshot({ path: path.join(OUT, 'mouvements-telephone-formulaire.png') });
  await page.keyboard.press('Escape');
  await closed();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'mouvements-sombre.png') });
  await page.evaluate(() => document.documentElement.classList.remove('dark'));

  const strangers = notFound.filter((pathname) => !/^\/(adherents|recus)\//.test(pathname));
  const own = issues.filter((issue) => !/status of 404/.test(issue));
  check('no console error, no failed request on this page (prefetch of pages built in other steps aside)', own.length === 0 && strangers.length === 0, [...own, ...strangers].join(' | '));

  /* ------------------------------------------------------------------ */
  /* Animations (sans « mouvement réduit ») : la nouvelle ligne se déplie */
  /* ------------------------------------------------------------------ */
  const lively = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR' });
  const livelyPage = await lively.newPage();
  const livelyIssues = watch(livelyPage);
  await login(livelyPage, BASE, '/mouvements');
  const livelyDialog = livelyPage.getByRole('dialog');
  const livelyRows = livelyPage.getByRole('table', { name: 'Entrées et sorties' }).locator('[role="row"]:has([role="cell"])');
  await livelyRows.first().waitFor();
  await livelyPage.getByRole('button', { name: '+ Dépense' }).click();
  await livelyDialog.getByLabel('Libellé').fill('E2E ligne animée');
  await livelyDialog.getByLabel('Catégorie').selectOption({ label: 'Fournitures' });
  await livelyDialog.getByLabel('Montant').fill('12');
  await livelyDialog.getByRole('button', { name: 'Enregistrer la dépense' }).click();
  const heights = [];
  for (let i = 0; i < 40; i += 1) {
    heights.push(await livelyRows.filter({ hasText: 'E2E ligne animée' }).evaluate((el) => Math.round(el.getBoundingClientRect().height)).catch(() => -1));
    await livelyPage.waitForTimeout(25);
  }
  await livelyRows.filter({ hasText: 'E2E ligne animée' }).waitFor();
  const settled = await livelyRows.filter({ hasText: 'E2E ligne animée' }).evaluate((el) => Math.round(el.getBoundingClientRect().height));
  check('a new movement unfolds smoothly at the top of the table (animated height)', heights.some((h) => h > 2 && h < settled - 2) && settled > 40 && (await text(livelyRows.first())).includes('E2E ligne animée'), `heights=${heights.filter((h) => h >= 0).join(',')} → ${settled}`);
  check('no console error with animations on', livelyIssues.filter((issue) => !/status of 404/.test(issue)).length === 0, livelyIssues.join(' | '));
  await lively.close();

  const anonymousPage = await (await browser.newContext()).newPage();
  const response = await anonymousPage.goto(`${BASE}/mouvements?nouveau=encaissement`, { waitUntil: 'domcontentloaded' });
  check('without a session the page redirects to the login form and shows no data', new URL(anonymousPage.url()).pathname === '/connexion' && !/Famille/.test(await response.text()));

  await browser.close();
  finish();
})().catch((error) => { console.error(error); process.exit(1); });

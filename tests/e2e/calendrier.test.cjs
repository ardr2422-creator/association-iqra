// Calendrier : mois en cours, navigation, mois invalide, encaissement depuis le détail.
const { chromium } = require('playwright');
const path = require('path');
const { sql, seedDemo, reporter, watch, login, day } = require('./helpers.cjs');
const [BASE, OUT] = process.argv.slice(2);
const { check, finish } = reporter();
const month = day(0).slice(0, 7);
const shift = (delta) => { const [y, m] = month.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + delta, 1)); return d.toISOString().slice(0, 7); };

(async () => {
  seedDemo();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const issues = watch(page);
  await login(page, BASE, '/calendrier');
  const detail = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Détail du mois' }) });
  await detail.waitFor();

  const expected = Number(sql(`select count(*) from installments where (status <> 'CASHED' and to_char(due_date, 'YYYY-MM') = '${month}') or (status = 'CASHED' and to_char(cashed_on, 'YYYY-MM') = '${month}')`));
  check('current month: one detail row per instalment of the month', (await detail.locator('li').count()) === expected && expected > 0, `${await detail.locator('li').count()} vs ${expected}`);
  const late = Number(sql(`select count(*) from installments where status = 'PLANNED' and due_date < (now() at time zone 'Europe/Paris')::date and to_char(due_date, 'YYYY-MM') = '${month}'`));
  check('late instalments carry the « En retard » badge', (await detail.getByText('En retard', { exact: true }).count()) === late);
  check('the month grid shows today', await page.getByText("(aujourd'hui)").count() === 1);
  await page.screenshot({ path: path.join(OUT, 'calendrier.png'), fullPage: false });

  await page.getByRole('link', { name: /^Mois suivant/ }).click();
  await page.waitForURL((url) => url.searchParams.get('mois') === shift(1));
  check('« Suivant » goes to the next month (?mois=)', await page.getByRole('link', { name: "Aujourd'hui" }).isVisible());
  await page.getByRole('link', { name: /^Mois précédent/ }).click();
  await page.waitForURL((url) => url.searchParams.get('mois') === month);

  await page.goto(BASE + '/calendrier?mois=2026-13', { waitUntil: 'networkidle' });
  check('an invalid month falls back to the current month', (await detail.locator('li').count()) === expected);

  // Encaisser depuis le détail.
  const row = detail.locator('li').filter({ has: page.getByRole('button', { name: /^Encaisser/ }) }).first();
  const before = Number(sql("select count(*) from receipts"));
  await row.getByRole('button', { name: /^Encaisser/ }).click();
  const dialog = page.locator('dialog[open]');
  await dialog.getByRole('button', { name: 'Encaisser et créer le reçu' }).click();
  await dialog.getByText(/Le reçu n° .* a été créé/).waitFor();
  check('cashing from the calendar creates the transaction and the receipt', Number(sql("select count(*) from receipts")) === before + 1);
  await dialog.getByRole('button', { name: 'Fermer' }).last().click();

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const mobile = await phone.newPage();
  await login(mobile, BASE, '/calendrier');
  await mobile.getByRole('heading', { name: 'Détail du mois' }).waitFor();
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('phone: agenda visible, grid hidden, no horizontal overflow', overflow <= 0 && !(await mobile.locator('section[aria-label^="Vue du mois"]').isVisible()), `overflow=${overflow}`);
  check('no console error', issues.length === 0, issues.join(' | '));
  await browser.close();
  finish();
})().catch((error) => { console.error(error); process.exit(1); });

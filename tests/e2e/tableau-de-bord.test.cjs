// Tableau de bord sur les vraies données, mode démonstration, rappel quotidien.
const { chromium } = require('playwright');
const path = require('path');
const { sql, wipe, seedDemo, reporter, watch, login } = require('./helpers.cjs');
const [BASE, OUT] = process.argv.slice(2);
const { check, finish } = reporter();
const euros = (cents) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100).replace(/\s/g, ' ');
const text = async (locator) => (await locator.textContent()).replace(/\s/g, ' ').trim();

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const issues = watch(page);

  // --- base vide
  wipe();
  await login(page, BASE, '/');
  const keys = page.locator('section[aria-label="Chiffres clés"]');
  await keys.waitFor();
  check('empty database: welcome card proposes the first steps', await page.getByRole('heading', { name: 'Bienvenue dans Iqra Compta' }).isVisible());
  check('empty database: balance is zero, no cheque, friendly empty lists',
    (await text(keys.locator('.sr-only').first())) === euros(0)
      && await page.getByText("Aucun chèque en attente d'encaissement.").isVisible()
      && await page.getByText('Tous les paiements enregistrés sont réglés.').isVisible());
  check('empty database: no demonstration banner', !(await page.getByText('Mode démonstration.').isVisible()));

  // --- données de démonstration
  seedDemo();
  await page.reload({ waitUntil: 'networkidle' });
  await keys.waitFor();
  const expected = Number(sql("select (select opening_balance_cents from settings) + coalesce(sum(case when type = 'INCOME' then amount_cents else -amount_cents end), 0) from transactions where status = 'COMPLETED'"));
  check('balance = opening balance + cashed income − expenses (cancelled and planned excluded)', (await text(keys.locator('.sr-only').first())) === euros(expected), `${await text(keys.locator('.sr-only').first())} vs ${euros(expected)}`);
  const planned = Number(sql("select count(*) from installments where status = 'PLANNED'"));
  const late = Number(sql("select count(*) from installments where status = 'PLANNED' and due_date < (now() at time zone 'Europe/Paris')::date"));
  const soon = Number(sql("select count(*) from installments where status = 'PLANNED' and due_date >= (now() at time zone 'Europe/Paris')::date and due_date < (now() at time zone 'Europe/Paris')::date + 7"));
  const cards = await text(keys);
  check('cheques to cash: count, next 7 days and late match the database', cards.includes(`${planned} chèques`) && cards.includes(`dont ${soon} dans les 7 jours`) && cards.includes(`${late} en retard`), cards);
  const unpaid = sql("select count(distinct p.member_id) || '|' || sum(i.amount_cents) from installments i join payment_plans p on p.id = i.plan_id where i.status <> 'CASHED'").split('|');
  check('unpaid courses: families and amount still due match the database', cards.includes(`${unpaid[0]} familles`) && cards.includes(`${euros(Number(unpaid[1])).replace(',00', '')} restant dû`), cards);
  const upcoming = page.getByRole('heading', { name: 'À encaisser bientôt' }).locator('xpath=ancestor::div[contains(@class,"rounded-card")][1]');
  const badges = await upcoming.locator('li').evaluateAll((items) => items.map((item) => item.innerText.includes('En retard')));
  check('late cheques come first with the "En retard" badge', badges.filter(Boolean).length === late && badges.slice(0, late).every(Boolean), JSON.stringify(badges));
  check('demonstration banner is shown with a link to end it', await page.getByText('Mode démonstration.').isVisible() && await page.getByRole('link', { name: 'Terminer la démonstration' }).getAttribute('href') === '/parametres#demonstration');
  check('welcome card is gone once there is data', !(await page.getByRole('heading', { name: 'Bienvenue dans Iqra Compta' }).isVisible()));
  await page.screenshot({ path: path.join(OUT, 'tableau-de-bord-demo.png'), fullPage: true });
  check('no console error on the dashboard', issues.length === 0, issues.join(' | '));

  // --- rappel quotidien (Vercel Cron) : protégé par un secret, jamais de donnée dans la réponse
  const anonymous = await browser.newContext();
  const noSecret = await anonymous.request.get(BASE + '/api/cron/rappels', { maxRedirects: 0 });
  const wrong = await anonymous.request.get(BASE + '/api/cron/rappels', { maxRedirects: 0, headers: { authorization: 'Bearer nope' } });
  check('cron route refuses a call without the secret (401, no redirect, no data)', noSecret.status() === 401 && wrong.status() === 401 && !/Famille/.test(await noSecret.text() + await wrong.text()), `${noSecret.status()} ${wrong.status()}`);
  const good = await anonymous.request.get(BASE + '/api/cron/rappels', { maxRedirects: 0, headers: { authorization: 'Bearer e2e-cron-secret-0123456789' } });
  const goodBody = await good.text();
  check('cron route with the secret: runs without a session, sends nothing while no address is set, leaks no name', good.status() === 200 && /Aucune adresse de rappel/.test(goodBody) && !/Famille|Benali/.test(goodBody), `${good.status()} ${goodBody}`);
  const post = await anonymous.request.post(BASE + '/api/cron/rappels', { maxRedirects: 0, headers: { authorization: 'Bearer e2e-cron-secret-0123456789' } });
  const other = await anonymous.request.get(BASE + '/api/cron/autre', { maxRedirects: 0, headers: { authorization: 'Bearer e2e-cron-secret-0123456789' } });
  check('only GET on that exact address is let through by the proxy', post.status() === 401 && [302, 307].includes(other.status()), `${post.status()} ${other.status()}`);
  wipe();
  const none = await anonymous.request.get(BASE + '/api/cron/rappels', { headers: { authorization: 'Bearer e2e-cron-secret-0123456789' } });
  check('cron route: nothing to remind on an empty database', none.status() === 200 && /Aucun chèque à rappeler/.test(await none.text()));

  await browser.close();
  finish();
})().catch((error) => { console.error(error); process.exit(1); });

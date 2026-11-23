// Reçus : liste, PDF (contenu, en-têtes, annulé, inconnu), accès sans session.
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { sql, seedDemo, reporter, watch, login } = require('./helpers.cjs');
const [BASE, OUT] = process.argv.slice(2);
const { check, finish } = reporter();

(async () => {
  seedDemo();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const issues = watch(page);
  await login(page, BASE, '/recus');
  const list = page.getByRole('region', { name: 'Liste des reçus' });
  await list.waitFor();

  const total = Number(sql('select count(*) from receipts'));
  const shown = Math.min(total, 50);
  check('list shows the receipts, newest first', (await list.locator('li').count()) === shown && (await list.locator('li').first().innerText()).includes(sql('select number from receipts order by year desc, sequence desc limit 1')));
  await page.getByRole('searchbox', { name: 'Rechercher un reçu' }).fill('haddad');
  const haddad = Number(sql("select count(*) from receipts where payer_name like '%Haddad%'"));
  check('search filters by payer', (await list.locator('li').count()) === haddad && haddad > 0);

  const [id, number, payer, amount] = sql("select r.id, r.number, r.payer_name, t.amount_cents from receipts r join transactions t on t.id = r.transaction_id where t.status = 'COMPLETED' order by r.sequence desc limit 1").split('|');
  const response = await page.request.get(`${BASE}/recus/${id}/pdf`);
  const body = await response.body();
  check('PDF: 200, application/pdf, not cacheable, inline',
    response.status() === 200 && response.headers()['content-type'] === 'application/pdf' && /no-store/.test(response.headers()['cache-control']) && /^inline/.test(response.headers()['content-disposition']) && body.slice(0, 4).toString() === '%PDF');
  const file = path.join(OUT, 'recu.pdf');
  fs.writeFileSync(file, body);
  const pdfText = execFileSync('pdftotext', [file, '-']).toString().replace(/\s+/g, ' ');
  const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(amount) / 100).replace(/\s/g, ' ');
  check('PDF content: number, payer, amount in figures and words, legal notice',
    pdfText.includes(number) && pdfText.includes(payer) && pdfText.includes(euros) && /toutes lettres : .+euros?\./.test(pdfText) && pdfText.includes('ne vaut pas reçu fiscal'), pdfText.slice(0, 200));
  const download = await page.request.get(`${BASE}/recus/${id}/pdf?telecharger=1`);
  check('download link: attachment with the receipt number', download.headers()['content-disposition'] === `attachment; filename="recu-${number}.pdf"`);

  const cancelled = sql("select r.id from receipts r join transactions t on t.id = r.transaction_id where t.status = 'CANCELLED' limit 1");
  fs.writeFileSync(file, await (await page.request.get(`${BASE}/recus/${cancelled}/pdf`)).body());
  check('cancelled receipt says it was cancelled', execFileSync('pdftotext', [file, '-']).toString().includes('Ce reçu a été annulé'));
  check('unknown and malformed ids give 404', (await page.request.get(`${BASE}/recus/inconnu123/pdf`)).status() === 404 && (await page.request.get(`${BASE}/recus/${encodeURIComponent("x' or 1=1")}/pdf`)).status() === 404);

  const anonymous = await browser.newContext();
  const noSession = await anonymous.request.get(`${BASE}/recus/${id}/pdf`, { maxRedirects: 0 });
  check('without a session the PDF redirects to the login page', [302, 307].includes(noSession.status()) && /\/connexion/.test(noSession.headers().location || ''));

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const mobile = await phone.newPage();
  await login(mobile, BASE, '/recus');
  await mobile.getByRole('region', { name: 'Liste des reçus' }).waitFor();
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('phone: no horizontal overflow', overflow <= 0, `overflow=${overflow}`);
  check('no console error', issues.length === 0, issues.join(' | '));
  await browser.close();
  finish();
})().catch((error) => { console.error(error); process.exit(1); });

const { chromium } = require('playwright');
const { execSync } = require('child_process');
const path = require('path');
const [BASE, OUT] = process.argv.slice(2);
const DB = process.env.E2E_DATABASE_URL || 'postgresql://iqra:iqra@localhost:5432/iqra_dev';
const sql = (q) => execSync(`psql ${JSON.stringify(DB)} -Atc ${JSON.stringify(q)}`).toString().trim();
const problems = [];
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); if (!ok) problems.push(name); };

(async () => {
  // clean leftovers from previous runs
  sql("delete from transactions where label like 'e2e%'; delete from categories where id not like 'cat_defaut_%'; update categories set archived_at = null;");
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const issues = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) issues.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
  page.on('pageerror', (e) => issues.push('pageerror: ' + String(e).slice(0, 200)));
  page.on('dialog', (d) => { issues.push('native dialog opened: ' + d.message()); d.dismiss(); });
  let actionRequest = null;
  page.on('request', (r) => { if (r.method() === 'POST' && r.headers()['next-action']) actionRequest = { url: r.url(), headers: r.headers(), body: r.postDataBuffer() }; });

  await page.goto(BASE + '/connexion?next=/categories', { waitUntil: 'networkidle' });
  await page.getByLabel('Adresse email').fill('tresorier@iqra.test');
  await page.getByLabel('Mot de passe').fill('correct horse');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL((url) => url.pathname === '/categories');
  const income = page.getByRole('region', { name: 'Entrées' }).or(page.locator('section').filter({ has: page.getByRole('heading', { name: 'Entrées' }) })).first();
  const expense = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Sorties', exact: true }) }).first();
  await income.getByText('6 catégories').waitFor();
  check('default categories are listed (6 entrées, 5 sorties)', await income.locator('li').count() === 6 && await expense.locator('li').count() === 5);

  const openCreate = async (kind = "d'entrée") => { await page.getByRole('button', { name: new RegExp(`Ajouter une catégorie ${kind}`) }).click(); await page.getByRole('dialog').waitFor(); };
  const dialog = page.getByRole('dialog');

  // --- dialog behaviour
  const trigger = page.getByRole('button', { name: /Ajouter une catégorie d'entrée/ });
  await trigger.click();
  const opac = [];
  for (let i = 0; i < 8; i++) { opac.push(await page.evaluate(() => Number(getComputedStyle(document.querySelector('dialog.modal')).opacity).toFixed(2))); await page.waitForTimeout(30); }
  check('dialog fades/scales in (CSS transition)', opac.some((o) => o > 0.05 && o < 0.95) && Number(opac[opac.length - 1]) > 0.95, opac.join(' '));
  check('focus lands in the name field', await page.evaluate(() => document.activeElement?.getAttribute('name')) === 'name');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check('Escape closes the dialog and focus returns to the button', !(await dialog.isVisible()) && await page.evaluate(() => /Ajouter/.test(document.activeElement?.textContent || '')));

  // --- create
  await openCreate();
  await dialog.getByLabel('Nom').fill("  Stages   d'été ");
  await dialog.getByText('Ambre', { exact: true }).click();
  const rowsBefore = await income.locator('li').count();
  await dialog.getByRole('button', { name: 'Créer la catégorie' }).click();
  const heights = [];
  for (let i = 0; i < 14; i++) { const h = await income.locator('li').filter({ hasText: "Stages d'été" }).evaluate((el) => Math.round(el.getBoundingClientRect().height)).catch(() => -1); heights.push(h); await page.waitForTimeout(35); }
  await income.getByText('7 catégories').waitFor();
  check('new category appears, name normalised, row grows in smoothly', await income.locator('li').count() === rowsBefore + 1 && heights.some((h) => h > 2 && h < 50) && sql("select name||'|'||color||'|'||type from categories where name ilike 'stages%'") === "Stages d'été|ambre|INCOME", 'heights=' + heights.filter((h) => h >= 0).join(','));
  check('dialog closed after saving', !(await dialog.isVisible()));

  // --- duplicate (case-insensitive) and empty
  await openCreate();
  await dialog.getByLabel('Nom').fill("STAGES D'ÉTÉ");
  await dialog.getByRole('button', { name: 'Créer la catégorie' }).click();
  await dialog.getByText('Une catégorie porte déjà ce nom.').waitFor();
  check('duplicate name is refused (ignoring case)', sql("select count(*) from categories where name ilike 'stages d''été'") === '1');
  await dialog.getByLabel('Nom').fill('   ');
  await dialog.getByRole('button', { name: 'Créer la catégorie' }).click();
  await dialog.getByText('Donnez un nom à la catégorie.').waitFor();
  check('blank name is refused by the server', true);

  // --- injection attempts are stored as plain text
  const sqli = "x'); DROP TABLE categories;--";
  await dialog.getByLabel('Nom').fill(sqli);
  await dialog.getByRole('button', { name: 'Créer la catégorie' }).click();
  await income.getByText('8 catégories').waitFor();
  check('SQL injection attempt is stored as plain text, table intact', sql("select count(*) from categories") === '13' && sql("select count(*) from categories where name like 'x'');%DROP TABLE categories;--'") === '1');
  await openCreate('de sortie');
  const xss = '<img src=x onerror="window.__xss=1">';
  await dialog.getByLabel('Nom').fill(xss);
  await dialog.getByRole('button', { name: 'Créer la catégorie' }).click();
  await expense.getByText('6 catégories').waitFor();
  await page.waitForTimeout(300);
  check('HTML/script injection is displayed as text and never executed', await page.evaluate(() => window.__xss === undefined && document.querySelectorAll('main img').length === 0) && await expense.getByText(xss, { exact: true }).isVisible());

  // --- edit
  await page.getByRole('button', { name: "Modifier « Stages d'été »" }).click();
  await dialog.getByLabel('Nom').fill('Stages de vacances');
  await dialog.getByText('Violet', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await income.getByText('Stages de vacances').waitFor();
  check('rename + recolour is saved', sql("select color from categories where name = 'Stages de vacances'") === 'violet');

  // --- tampered requests replayed straight at the server action
  const replay = async (mutate, cookies = true) => {
    const jar = (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
    const headers = { ...actionRequest.headers }; delete headers['content-length']; delete headers['cookie']; delete headers['host'];
    if (cookies) headers['cookie'] = jar;
    let body = actionRequest.body.toString('latin1');
    if (mutate) body = mutate(body);
    const res = await fetch(actionRequest.url, { method: 'POST', headers, body: Buffer.from(body, 'latin1'), redirect: 'manual' });
    return { status: res.status, text: (await res.text()).slice(0, 600) };
  };
  const anon = await replay(null, false);
  check('server action without a session is rejected (401)', anon.status === 401, `status=${anon.status}`);
  const before = sql('select count(*) from categories');
  const badColor = await replay((b) => b.replace(/violet/g, 'pirate'));
  const badId = await replay((b) => b.replace(/(name="id"\r\n\r\n)[^\r]+/, "$1' OR 1=1 --"));
  await page.waitForTimeout(200);
  check('tampered colour / id are rejected by validation, nothing changes', sql('select count(*) from categories') === before && sql("select count(*) from categories where color = 'pirate'") === '0' && /invalide|n'existe plus/.test(badColor.text + badId.text), `status ${badColor.status}/${badId.status}`);
  const long = await replay((b) => b.replace('Stages de vacances', 'A'.repeat(300)));
  check('over-long name is rejected server-side', sql("select count(*) from categories where length(name) > 40") === '0' && /dépasser/.test(long.text));

  // --- delete (unused) with exit animation
  await page.getByRole('button', { name: 'Supprimer « Stages de vacances »' }).click();
  await dialog.getByText('supprimée définitivement').waitFor();
  check('Cancel is focused by default in the delete confirmation', await page.evaluate(() => document.activeElement?.textContent?.trim()) === 'Annuler');
  await dialog.getByRole('button', { name: 'Supprimer', exact: true }).click();
  const exit = [];
  for (let i = 0; i < 12; i++) { exit.push(await income.locator('li').filter({ hasText: 'Stages de vacances' }).evaluate((el) => Math.round(el.getBoundingClientRect().height)).catch(() => -1)); await page.waitForTimeout(35); }
  await income.getByText('7 catégories').waitFor();
  check('unused category is deleted, row collapses smoothly', sql("select count(*) from categories where name = 'Stages de vacances'") === '0' && exit.some((h) => h > 2 && h < 50), 'heights=' + exit.join(','));

  // --- in-use category is archived, then restored
  sql("insert into transactions (id, date, type, category_id, label, amount_cents, method, updated_at) values ('e2e_tx_1', current_date, 'INCOME', 'cat_defaut_dons', 'e2e don', 5000, 'CASH', now())");
  await page.reload({ waitUntil: 'networkidle' });
  await income.getByText('1 mouvement').waitFor();
  await page.getByRole('button', { name: 'Supprimer « Dons »' }).click();
  await dialog.getByText('archivée').first().waitFor();
  await dialog.getByRole('button', { name: 'Archiver' }).click();
  const archivedCard = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Catégories archivées' }) });
  await archivedCard.getByText('Dons').waitFor();
  await page.waitForTimeout(600); // let the row finish its exit animation
  const parts = [sql("select (archived_at is not null)::text from categories where id = 'cat_defaut_dons'"), sql("select count(*) from transactions where id = 'e2e_tx_1'"), await income.locator('li').filter({ hasText: 'Dons' }).count()];
  check('a category in use is archived, not deleted; its movement is kept', parts[0] === 'true' && parts[1] === '1' && parts[2] === 0, JSON.stringify(parts));
  await page.screenshot({ path: path.join(OUT, 'categories-archived.png') });
  // creating the same name again restores it
  await openCreate();
  await dialog.getByLabel('Nom').fill('dons');
  await dialog.getByRole('button', { name: 'Créer la catégorie' }).click();
  await income.locator('li').filter({ hasText: 'dons' }).waitFor();
  check('re-creating an archived name restores the same category', sql("select count(*) from categories where name ilike 'dons'") === '1' && sql("select (archived_at is null)::text from categories where id = 'cat_defaut_dons'") === 'true');
  await page.getByRole('button', { name: 'Supprimer « dons »' }).click();
  await dialog.getByRole('button', { name: 'Archiver' }).click();
  await archivedCard.getByRole('button', { name: 'Restaurer « dons »' }).click();
  await income.locator('li').filter({ hasText: 'dons' }).waitFor();
  await page.waitForTimeout(500);
  check('Restaurer puts it back and the archived card disappears', await archivedCard.count() === 0);

  // --- logged-out session cannot run actions
  const jarBefore = (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await page.waitForURL('**/connexion');
  const headers = { ...actionRequest.headers }; delete headers['content-length']; delete headers['host']; headers['cookie'] = jarBefore;
  const countBefore = sql('select count(*) from categories');
  const stale = await fetch(actionRequest.url, { method: 'POST', headers, body: Buffer.from(actionRequest.body.toString('latin1').replace('Stages de vacances', 'Piratage'), 'latin1'), redirect: 'manual' });
  await stale.text();
  check('a cookie copied before logout can no longer run an action', sql('select count(*) from categories') === countBefore && sql("select count(*) from categories where name = 'Piratage'") === '0', `status=${stale.status}`);

  // cleanup
  sql("delete from transactions where label like 'e2e%'; delete from categories where id not like 'cat_defaut_%'; update categories set archived_at = null, name = 'Dons' where id = 'cat_defaut_dons';");
  await browser.close();
  console.log('\nconsole issues:', issues.length ? '\n' + [...new Set(issues)].join('\n') : 'none');
  console.log(problems.length ? `\n${problems.length} FAILED: ${problems.join(' | ')}` : '\nALL CATEGORY CHECKS PASSED');
  if (problems.length) process.exitCode = 1;
})().catch((e) => { console.error('crashed:', e); process.exit(1); });

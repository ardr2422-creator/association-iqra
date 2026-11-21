// Contrôles de sécurité issus de l'audit : réponse identique pour tout refus de
// connexion, cookie de session, noms de catégories piégés, actions serveur
// appelées hors des pages protégées, durée maximale de session, force brute.
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const [BASE] = process.argv.slice(2);
const DB = process.env.E2E_DATABASE_URL || 'postgresql://iqra:iqra@localhost:5432/iqra_dev';
const MOCK = process.env.E2E_MOCK_AUTH || 'http://127.0.0.1:54399';
const sql = (q) => execSync(`psql ${JSON.stringify(DB)} -Atc ${JSON.stringify(q)}`).toString().trim();
const problems = [];
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); if (!ok) problems.push(name); };
const cleanup = () => sql("delete from login_attempts; delete from transactions where label like 'e2e%'; delete from categories where id not like 'cat_defaut_%'; update categories set archived_at = null, name = 'Dons' where id = 'cat_defaut_dons';");

(async () => {
  cleanup();
  await fetch(`${MOCK}/__test/login-age?seconds=0`);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const loginResponses = [];
  let actionRequest = null;
  page.on('response', async (r) => { if (r.request().method() === 'POST' && new URL(r.url()).pathname === '/connexion') loginResponses.push(await r.allHeaders().catch(() => ({}))); });
  page.on('request', (r) => { if (r.method() === 'POST' && r.headers()['next-action'] && new URL(r.url()).pathname === '/categories') actionRequest = { url: r.url(), headers: r.headers(), body: r.postDataBuffer() }; });
  const signIn = async (email, password) => {
    await page.getByLabel('Adresse email').fill(email);
    await page.getByLabel('Mot de passe').fill(password);
    await page.getByRole('button', { name: 'Se connecter' }).click();
  };

  // --- A. refus identique, que le mot de passe soit faux ou que le compte ne soit pas le bon
  await page.goto(BASE + '/connexion', { waitUntil: 'networkidle' });
  await signIn('intrus@iqra.test', 'intrus-pass');
  await page.getByRole('alert').getByText('Email ou mot de passe incorrect.').waitFor();
  const intruder = loginResponses.pop() || {};
  check('valid password of a non-authorised account: same refusal, no cookie header at all', !('set-cookie' in intruder) && (await ctx.cookies()).filter((c) => c.name.startsWith('sb-')).length === 0, `set-cookie present=${'set-cookie' in intruder}`);
  sql('delete from login_attempts');

  // --- B. cookie de session
  await page.goto(BASE + '/connexion?next=/categories', { waitUntil: 'networkidle' });
  await signIn('tresorier@iqra.test', 'correct horse');
  await page.waitForURL((url) => url.pathname === '/categories');
  const sessionCookies = (await ctx.cookies()).filter((c) => c.name.startsWith('sb-'));
  check('session cookie: HttpOnly, SameSite=Lax, disappears when the browser closes', sessionCookies.length > 0 && sessionCookies.every((c) => c.httpOnly && c.sameSite === 'Lax' && c.expires === -1), JSON.stringify(sessionCookies.map((c) => ({ httpOnly: c.httpOnly, sameSite: c.sameSite, expires: c.expires }))));

  // --- C. noms piégés
  const dialog = page.getByRole('dialog');
  const create = async (kind, name) => {
    await page.getByRole('button', { name: new RegExp(`Ajouter une catégorie ${kind}`) }).click();
    await dialog.getByLabel('Nom').fill(name);
    await dialog.getByRole('button', { name: 'Créer la catégorie' }).click();
  };
  const closeDialog = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(350); };
  await page.locator('section').filter({ has: page.getByRole('heading', { name: 'Entrées' }) }).getByText('6 catégories').waitFor();

  await create("d'entrée", 'D_ns');
  await page.getByText('7 catégories').waitFor();
  check('"_" is a plain character: "D_ns" is a new category, "Dons" is untouched', sql("select count(*) from categories where name in ('Dons','D_ns')") === '2');

  sql("insert into categories (id, name, type, color, archived_at, updated_at) values ('e2e_arch', 'Cantine 2025', 'EXPENSE', 'vert', now(), now())");
  await create('de sortie', 'Cantine 20__');
  await page.locator('li').filter({ hasText: 'Cantine 20__' }).first().waitFor();
  check('a name with wildcards never matches (and never renames) another category', sql("select name || '|' || color || '|' || (archived_at is not null) from categories where id = 'e2e_arch'") === 'Cantine 2025|vert|true' && sql("select count(*) from categories where name = 'Cantine 20__'") === '1');

  await create("d'entrée", 'Adhésions'); // « é » en deux caractères (forme décomposée)
  await dialog.getByText('Une catégorie porte déjà ce nom.').waitFor();
  check('same name typed with a decomposed accent is recognised as a duplicate', sql("select count(*) from categories where name like 'Adh%sions'") === '1');
  await dialog.getByLabel('Nom').fill('Dons​');
  await dialog.getByRole('button', { name: 'Créer la catégorie' }).click();
  await dialog.getByText('Ce nom contient un caractère non autorisé.').waitFor();
  await dialog.getByLabel('Nom').fill('‮abc');
  await dialog.getByRole('button', { name: 'Créer la catégorie' }).click();
  await dialog.getByText('Ce nom contient un caractère non autorisé.').waitFor();
  await dialog.getByLabel('Nom').fill('%%%');
  await dialog.getByRole('button', { name: 'Créer la catégorie' }).click();
  await dialog.getByText('Le nom doit contenir au moins une lettre ou un chiffre.').waitFor();
  check('invisible, direction-reversing and symbol-only names are refused', sql("select count(*) from categories where type = 'INCOME'") === '7');
  await closeDialog();

  // --- D. action serveur rejouée hors des pages protégées, sans session
  const before = sql('select count(*) from categories');
  const replay = async (path) => {
    const headers = { ...actionRequest.headers }; delete headers['content-length']; delete headers['cookie']; delete headers['host'];
    const body = actionRequest.body.toString('latin1').replace(/Cantine 20__|%%%|abc/g, 'Piratage');
    const res = await fetch(BASE + path, { method: 'POST', headers, body: Buffer.from(body, 'latin1'), redirect: 'manual' });
    return { status: res.status, text: await res.text() };
  };
  const onLogin = await replay('/connexion');
  const onAsset = await replay('/x.png');
  check('server action replayed without a session on /connexion and on /x.png changes nothing', sql('select count(*) from categories') === before && sql("select count(*) from categories where name = 'Piratage'") === '0' && onAsset.status === 401 && !/"ok":true/.test(onLogin.text), `status /connexion=${onLogin.status} /x.png=${onAsset.status}`);

  // --- E. durée maximale de session : 12 heures
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await page.waitForURL('**/connexion');
  await fetch(`${MOCK}/__test/login-age?seconds=${13 * 3600}`);
  await signIn('tresorier@iqra.test', 'correct horse');
  await page.waitForTimeout(1500);
  await page.goto(BASE + '/categories', { waitUntil: 'networkidle' });
  check('a session older than 12 hours is closed', new URL(page.url()).pathname === '/connexion' && (await ctx.cookies()).filter((c) => c.name.startsWith('sb-')).length === 0, page.url());
  await fetch(`${MOCK}/__test/login-age?seconds=${11 * 3600}`);
  await page.goto(BASE + '/connexion', { waitUntil: 'networkidle' });
  await signIn('tresorier@iqra.test', 'correct horse');
  await page.waitForURL(BASE + '/');
  check('a session of 11 hours still works', true);
  await fetch(`${MOCK}/__test/login-age?seconds=0`);
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await page.waitForURL('**/connexion');

  // --- F. force brute : 5 échecs, puis même le bon mot de passe est refusé
  sql('delete from login_attempts');
  for (let i = 1; i <= 5; i++) {
    await signIn('tresorier@iqra.test', 'faux-' + i);
    await page.getByRole('alert').getByText('Email ou mot de passe incorrect.').waitFor();
    await page.waitForTimeout(150);
  }
  await signIn('tresorier@iqra.test', 'correct horse');
  await page.getByRole('alert').getByText('Trop de tentatives').waitFor();
  check('after 5 failures the address is locked, even with the right password', new URL(page.url()).pathname === '/connexion' && Number(sql('select count(*) from login_attempts')) >= 10 && sql("select count(*) from login_attempts where key !~ '^(ip|email):[0-9a-f]{40}$'") === '0', `rows=${sql('select count(*) from login_attempts')}`);
  sql('delete from login_attempts');
  await signIn('tresorier@iqra.test', 'correct horse');
  await page.waitForURL(BASE + '/');
  check('once the window has passed, the right password works again', true);

  cleanup();
  await browser.close();
  console.log(problems.length ? `\n${problems.length} FAILED: ${problems.join(' | ')}` : '\nALL SECURITY CHECKS PASSED');
  if (problems.length) process.exitCode = 1;
})().catch((e) => { console.error('crashed:', e); try { cleanup(); } catch {} process.exit(1); });

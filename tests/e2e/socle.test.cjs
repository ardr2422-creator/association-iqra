const { chromium } = require('playwright');
const path = require('path');
const BASE = process.argv[2];
const OUT = process.argv[3];
const log = (...a) => console.log(...a);
const problems = [];
const check = (name, ok, extra = '') => { log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); if (!ok) problems.push(name); };

async function samplePill(page, ms = 700) {
  return page.evaluate(async (ms) => {
    const out = []; const t0 = performance.now();
    await new Promise((resolve) => {
      const tick = () => {
        const pill = [...document.querySelectorAll('nav[aria-label="Menu principal"] a[aria-current="page"] > span[aria-hidden="true"]')][0];
        const r = pill ? pill.getBoundingClientRect() : null;
        out.push(r ? { t: Math.round(performance.now() - t0), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : { t: Math.round(performance.now() - t0), none: true });
        if (performance.now() - t0 < ms) requestAnimationFrame(tick); else resolve();
      };
      requestAnimationFrame(tick);
    });
    return out;
  }, ms);
}
const linkRect = (page, name) => page.getByRole('navigation', { name: 'Menu principal' }).getByRole('link', { name, exact: true }).evaluate((el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; });

(async () => {
  const browser = await chromium.launch();
  const consoleIssues = [];
  const watch = (page, tag) => {
    page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) consoleIssues.push(`[${tag}] ${m.type()}: ${m.text().slice(0, 240)}`); });
    page.on('pageerror', (e) => consoleIssues.push(`[${tag}] pageerror: ${String(e).slice(0, 240)}`));
  };

  // ---------- Desktop session ----------
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'light' });
  const page = await ctx.newPage(); watch(page, 'desktop');
  await page.addInitScript(() => {
    window.__vt = 0;
    const orig = document.startViewTransition?.bind(document);
    if (orig) document.startViewTransition = (cb) => { window.__vt++; return orig(cb); };
  });

  await page.goto(BASE + '/adherents', { waitUntil: 'networkidle' });
  check('unauthenticated visit is redirected to /connexion with next', page.url().includes('/connexion?next=%2Fadherents'), page.url());
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, 'login-desktop-light.png') });

  // wrong password
  await page.getByLabel('Adresse email').fill('tresorier@iqra.test');
  await page.getByLabel('Mot de passe').fill('mauvais');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.getByRole('alert').getByText('Email ou mot de passe incorrect.').waitFor({ timeout: 8000 });
  const shake = await page.evaluate(() => document.querySelector('form').getAnimations().length);
  check('wrong password shows the generic error and shakes the form', shake >= 1, `formAnimations=${shake}`);
  check('email is kept after a failed attempt', (await page.getByLabel('Adresse email').inputValue()) === 'tresorier@iqra.test');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, 'login-error-desktop-light.png') });

  // good password -> lands on next
  await page.getByLabel('Mot de passe').fill('correct horse');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL('**/adherents', { timeout: 10000 });
  check('login succeeds and reopens the requested page', new URL(page.url()).pathname === '/adherents');
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, 'adherents-desktop-light.png') });

  // count-up on dashboard (fresh load so we see it from the start)
  await page.goto(BASE + '/', { waitUntil: 'commit' });
  const samples = [];
  for (let i = 0; i < 16; i++) {
    const txt = await page.locator('section[aria-label="Chiffres clés"] p >> nth=1').locator('span[aria-hidden="true"]').textContent({ timeout: 4000 }).catch(() => null);
    samples.push(txt);
    await page.waitForTimeout(90);
  }
  const distinct = [...new Set(samples.filter(Boolean))];
  check('balance counts up to its final value', distinct.length >= 4 && distinct[distinct.length - 1].replace(/\s/g, ' ') === '12 846,50 €', JSON.stringify(distinct.slice(0, 3)) + ' … ' + distinct[distinct.length - 1] + ` (${distinct.length} distinct frames)`);
  const sr = await page.locator('section[aria-label="Chiffres clés"] .sr-only').first().textContent();
  check('screen readers get the final value directly', sr.replace(/\s/g, ' ') === '12 846,50 €', sr);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: path.join(OUT, 'dashboard-desktop-light.png') });

  // entrance animations ran (CSS)
  await page.goto(BASE + '/', { waitUntil: 'commit' });
  await page.waitForSelector('section[aria-label="Chiffres clés"]');
  const anims = await page.evaluate(() => document.getAnimations().filter((a) => a.animationName === 'rise').length);
  check('cards and rows enter with the staggered rise animation', anims >= 8, `running rise animations=${anims}`);
  await page.waitForTimeout(1600);

  // pill slide (desktop, top of page)
  const from = await linkRect(page, 'Tableau de bord');
  const to = await linkRect(page, 'Chèques');
  const t0 = Date.now();
  await page.getByRole('navigation', { name: 'Menu principal' }).getByRole('link', { name: 'Chèques', exact: true }).click();
  const s1 = await samplePill(page, 800);
  const ys = s1.filter((s) => !s.none).map((s) => s.y);
  const firstMove = s1.find((s) => !s.none && s.y !== from.y);
  const monotonicIsh = ys.every((y) => y >= from.y - 2 && y <= to.y + 12);
  const mid = ys.filter((y) => y > from.y + 3 && y < to.y - 3).length;
  check('active pill slides from "Tableau de bord" to "Chèques"', monotonicIsh && mid >= 3 && Math.abs(ys[ys.length - 1] - to.y) <= 1, `from y=${from.y} to y=${to.y}; intermediate frames=${mid}; first movement after ~${firstMove ? firstMove.t : '?'}ms; final y=${ys[ys.length - 1]}; x range=${Math.min(...s1.filter(s=>!s.none).map(s=>s.x))}-${Math.max(...s1.filter(s=>!s.none).map(s=>s.x))}`);
  check('navigation happened', new URL(page.url()).pathname === '/cheques', `in ${Date.now() - t0}ms`);

  // pill slide when the page is scrolled (dashboard is tall)
  await page.getByRole('navigation', { name: 'Menu principal' }).getByRole('link', { name: 'Tableau de bord', exact: true }).click();
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.scrollTo(0, 400));
  await page.waitForTimeout(200);
  const scrolled = await page.evaluate(() => window.scrollY);
  const from2 = await linkRect(page, 'Tableau de bord');
  const to2 = await linkRect(page, 'Reçus');
  await page.getByRole('navigation', { name: 'Menu principal' }).getByRole('link', { name: 'Reçus', exact: true }).click();
  const s2 = await samplePill(page, 800);
  const ys2 = s2.filter((s) => !s.none).map((s) => s.y);
  check('pill stays inside the menu when the page was scrolled', scrolled > 0 && ys2.every((y) => y >= from2.y - 2 && y <= to2.y + 12) && Math.abs(ys2[ys2.length - 1] - to2.y) <= 1, `scrollY before=${scrolled}; y range=${Math.min(...ys2)}..${Math.max(...ys2)} expected ${from2.y}..${to2.y}`);

  // theme toggle
  await page.waitForTimeout(400);
  const before = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  await page.getByRole('button', { name: 'Mode sombre' }).click();
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(OUT, 'theme-mid-transition.png') });
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => ({ dark: document.documentElement.classList.contains('dark'), vt: window.__vt, stored: localStorage.getItem('theme') }));
  check('theme toggle switches to dark through a view transition', !before && after.dark && after.vt === 1 && after.stored === 'dark', JSON.stringify(after));
  check('toggle label follows the theme', await page.getByRole('button', { name: 'Mode clair' }).isVisible());
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);
  check('dark theme persists after reload without flash class change', await page.evaluate(() => document.documentElement.classList.contains('dark')));
  await page.screenshot({ path: path.join(OUT, 'dashboard-desktop-dark.png') });
  // hover tooltip on chart
  const chart = page.locator('.recharts-wrapper').first();
  const box = await chart.boundingBox();
  await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.4);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, 'chart-tooltip-dark.png'), clip: { x: box.x - 30, y: box.y - 70, width: box.width + 60, height: box.height + 120 } });
  check('chart tooltip shows month and both series', await page.getByText('Entrées', { exact: true }).nth(1).isVisible().catch(() => false));
  await page.getByRole('button', { name: 'Mode clair' }).click();
  await page.waitForTimeout(700);

  // other pages screenshots
  for (const [name, file] of [['Entrées & sorties', 'mouvements'], ['Paramètres', 'parametres']]) {
    await page.getByRole('navigation', { name: 'Menu principal' }).getByRole('link', { name, exact: true }).click();
    await page.waitForTimeout(1300);
    await page.screenshot({ path: path.join(OUT, `${file}-desktop-light.png`) });
  }
  // 404
  await page.goto(BASE + '/nimporte-quoi', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, 'not-found-desktop-light.png') });
  check('unknown URL shows the French not-found page', await page.getByRole('heading', { name: "Cette page n'existe pas" }).isVisible());

  // logout
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await page.waitForURL('**/connexion', { timeout: 10000 });
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  check('after logout the app is locked again', new URL(page.url()).pathname === '/connexion', page.url());
  const state = await ctx.storageState();
  await ctx.close();

  // ---------- Mobile session ----------
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: 'light', hasTouch: true, isMobile: true });
  const mp = await m.newPage(); watch(mp, 'mobile');
  await mp.goto(BASE + '/connexion', { waitUntil: 'networkidle' });
  await mp.waitForTimeout(600);
  await mp.screenshot({ path: path.join(OUT, 'login-mobile-light.png') });
  await mp.getByLabel('Adresse email').fill('tresorier@iqra.test');
  await mp.getByLabel('Mot de passe').fill('correct horse');
  await mp.getByRole('button', { name: 'Se connecter' }).click();
  await mp.waitForURL(BASE + '/', { timeout: 10000 });
  await mp.waitForTimeout(2200);
  await mp.screenshot({ path: path.join(OUT, 'dashboard-mobile-light.png'), fullPage: true });
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('no horizontal page scroll on phone', overflow <= 0, `overflow=${overflow}px`);
  const mFrom = await linkRect(mp, 'Tableau de bord');
  await mp.evaluate(() => [...document.querySelectorAll('nav[aria-label="Menu principal"] a')].find((a) => a.textContent === 'Entrées & sorties').click());
  const s3 = await samplePill(mp, 900);
  const xs = s3.filter((s) => !s.none).map((s) => s.x);
  const mTo = await linkRect(mp, 'Entrées & sorties');
  const jumps = xs.slice(1).map((x, i) => Math.abs(x - xs[i]));
  check('pill slides horizontally in the phone tab bar, without jumps', Math.max(...jumps) <= 40 && Math.abs(xs[xs.length - 1] - mTo.x) <= 1 && s3.filter((s) => !s.none).every((s) => Math.abs(s.y - mFrom.y) <= 2), `x ${xs[0]} -> ${xs[xs.length - 1]} (tab at ${mTo.x}); frames=${xs.length}; biggest step=${Math.max(...jumps)}px`);
  await mp.waitForTimeout(500);
  // far item: go to Catégories (off-screen at first)
  await mp.evaluate(() => [...document.querySelectorAll('nav[aria-label="Menu principal"] a')].find((a) => a.textContent === 'Catégories').click());
  const s4 = await samplePill(mp, 1100);
  await mp.waitForTimeout(500);
  const catRect = await linkRect(mp, 'Catégories');
  const pillNow = await mp.evaluate(() => { const r = document.querySelector('nav[aria-label="Menu principal"] a[aria-current="page"] > span[aria-hidden="true"]').getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y) }; });
  check('far tab: the row scrolls so the active tab is centred, pill on it', Math.abs(pillNow.x - catRect.x) <= 1 && catRect.x > 40 && catRect.x + catRect.w < 390 - 40, `tab x=${catRect.x} w=${catRect.w} pill x=${pillNow.x}`);
  await mp.screenshot({ path: path.join(OUT, 'categories-mobile-light.png') });
  await mp.goto(BASE + '/recus', { waitUntil: 'networkidle' });
  await mp.waitForTimeout(600);
  const recus = await linkRect(mp, 'Reçus');
  check('direct load on phone: active tab is visible', recus.x >= 0 && recus.x + recus.w <= 390, `tab x=${recus.x} w=${recus.w}`);
  await mp.getByRole('button', { name: /Changer de thème/ }).tap();
  await mp.waitForTimeout(800);
  await mp.goto(BASE + '/', { waitUntil: 'networkidle' });
  await mp.waitForTimeout(2200);
  await mp.screenshot({ path: path.join(OUT, 'dashboard-mobile-dark.png'), fullPage: true });
  await m.close();

  // ---------- Intermediate widths ----------
  for (const w of [1024, 900, 768]) {
    const c = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1, storageState: undefined });
    const p2 = await c.newPage(); watch(p2, 'w' + w);
    await p2.goto(BASE + '/connexion', { waitUntil: 'networkidle' });
    await p2.getByLabel('Adresse email').fill('tresorier@iqra.test');
    await p2.getByLabel('Mot de passe').fill('correct horse');
    await p2.getByRole('button', { name: 'Se connecter' }).click();
    await p2.waitForURL(BASE + '/', { timeout: 10000 });
    await p2.waitForTimeout(2300);
    await p2.screenshot({ path: path.join(OUT, `dashboard-w${w}.png`), fullPage: true });
    const ov = await p2.evaluate(() => { const bad = []; for (const el of document.querySelectorAll('main *')) { if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === 'visible' && el.clientWidth > 0 && !el.closest('svg')) bad.push(el.tagName + '.' + String(el.className).slice(0, 40)); } return { page: document.documentElement.scrollWidth - document.documentElement.clientWidth, bad: bad.slice(0, 5) }; });
    check(`no overflow at ${w}px`, ov.page <= 0 && ov.bad.length === 0, JSON.stringify(ov));
    await c.close();
  }

  // ---------- Reduced motion ----------
  const r = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', colorScheme: 'light' });
  const rp = await r.newPage(); watch(rp, 'reduced');
  await rp.addInitScript(() => { window.__vt = 0; const o = document.startViewTransition?.bind(document); if (o) document.startViewTransition = (cb) => { window.__vt++; return o(cb); }; });
  await rp.goto(BASE + '/connexion', { waitUntil: 'networkidle' });
  await rp.getByLabel('Adresse email').fill('tresorier@iqra.test');
  await rp.getByLabel('Mot de passe').fill('correct horse');
  await rp.getByRole('button', { name: 'Se connecter' }).click();
  await rp.waitForURL(BASE + '/', { timeout: 10000 });
  await rp.waitForSelector('section[aria-label="Chiffres clés"]');
  await rp.waitForTimeout(120);
  const quick = await rp.locator('section[aria-label="Chiffres clés"] span[aria-hidden="true"]').first().textContent();
  const longAnims = await rp.evaluate(() => document.getAnimations().filter((a) => { const t = a.effect?.getComputedTiming?.(); return t && t.activeDuration > 50 && a.playState === 'running'; }).length);
  check('reduced motion: numbers appear at once and nothing keeps animating', quick.replace(/\s/g, ' ') === '12 846,50 €' && longAnims === 0, `text=${quick} runningAnimations=${longAnims}`);
  const rFrom = await linkRect(rp, 'Tableau de bord');
  await rp.getByRole('navigation', { name: 'Menu principal' }).getByRole('link', { name: 'Chèques', exact: true }).click();
  const s5 = await samplePill(rp, 500);
  const rTo = await linkRect(rp, 'Chèques');
  const between = s5.filter((s) => !s.none && s.y > rFrom.y + 3 && s.y < rTo.y - 3).length;
  check('reduced motion: pill jumps instead of sliding', between === 0, `intermediate frames=${between}`);
  await rp.getByRole('button', { name: 'Mode sombre' }).click();
  await rp.waitForTimeout(200);
  const rvt = await rp.evaluate(() => ({ vt: window.__vt, dark: document.documentElement.classList.contains('dark') }));
  check('reduced motion: theme switches without the cross-fade', rvt.vt === 0 && rvt.dark, JSON.stringify(rvt));
  await r.close();

  await browser.close();
  log('\nconsole issues:', consoleIssues.length ? '\n' + [...new Set(consoleIssues)].join('\n') : 'none');
  log(problems.length ? `\n${problems.length} FAILED: ${problems.join(' | ')}` : '\nALL CHECKS PASSED');
  if (problems.length) process.exitCode = 1;
})().catch((e) => { console.error('E2E crashed:', e); process.exit(1); });

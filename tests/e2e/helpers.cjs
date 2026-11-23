// Outils communs aux tests de bout en bout.
const { execFileSync } = require('child_process');
const path = require('path');

const DB = process.env.E2E_DATABASE_URL || 'postgresql://iqra:iqra@localhost:5432/iqra_dev';
const ROOT = path.join(__dirname, '..', '..');

/** Exécute du SQL sur la base de test (sans passer par un shell : aucun caractère n'est interprété). */
const sql = (query) => execFileSync('psql', [DB, '-v', 'ON_ERROR_STOP=1', '-Atc', query]).toString().trim();

/** Vide les données métier (les catégories par défaut sont conservées). */
function wipe() {
  sql('delete from receipts; delete from installments; delete from payment_plans; delete from transactions; delete from members; delete from receipt_counters; delete from settings; delete from login_attempts;');
}

/** Charge les données de démonstration (familles fictives) dans une base vidée. */
function seedDemo() {
  wipe();
  execFileSync('node', ['--conditions=react-server', '--import', 'tsx', 'tests/e2e/seed-demo.ts'], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: DB },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
}

/** Compte rendu : `check(nom, ok, détail)` puis `finish()` qui fixe le code de sortie. */
function reporter() {
  const problems = [];
  const check = (name, ok, extra = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${ok ? '' : extra}`.trimEnd());
    if (!ok) problems.push(name);
  };
  const finish = () => {
    console.log(`\n${problems.length === 0 ? 'Tout est bon.' : problems.length + ' échec(s) : ' + problems.join(' | ')}`);
    process.exit(problems.length === 0 ? 0 : 1);
  };
  return { check, problems, finish };
}

/** Relève les erreurs de console, exceptions et fenêtres natives d'une page. */
function watch(page) {
  const issues = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) issues.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
  page.on('pageerror', (e) => issues.push('pageerror: ' + String(e).slice(0, 200)));
  page.on('dialog', (d) => { issues.push('native dialog opened: ' + d.message()); d.dismiss(); });
  return issues;
}

/** Se connecte avec le compte autorisé du faux Supabase et attend la page demandée. */
async function login(page, base, next = '/') {
  await page.goto(base + '/connexion?next=' + encodeURIComponent(next), { waitUntil: 'networkidle' });
  await page.getByLabel('Adresse email').fill('tresorier@iqra.test');
  await page.getByLabel('Mot de passe').fill('correct horse');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  const target = new URL(next, base).pathname;
  await page.waitForURL((url) => url.pathname === target);
}

/** Jour civil à Paris, décalé de `offset` jours (même calcul que l'application). */
function day(offset = 0) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

module.exports = { DB, sql, wipe, seedDemo, reporter, watch, login, day };

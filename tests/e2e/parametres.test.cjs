// Paramètres : enregistrement, erreurs, reçu fiscal verrouillé, démonstration.
const { chromium } = require('playwright');
const { sql, wipe, reporter, watch, login } = require('./helpers.cjs');
const [BASE, OUT] = process.argv.slice(2);
const { check, finish } = reporter();

(async () => {
  wipe();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const issues = watch(page);
  await login(page, BASE, '/parametres');
  await page.getByLabel("Nom de l'association").waitFor();

  await page.getByLabel("Nom de l'association").fill('  Association   Iqra  ');
  await page.getByLabel('Adresse', { exact: true }).fill('14 rue des Écoles');
  await page.getByLabel('Code postal').fill('69100');
  await page.getByLabel('Ville').fill('Villeurbanne');
  await page.getByLabel('N° RNA').fill('W691234567');
  await page.getByLabel('Montant (en euros)').fill('-150,50');
  await page.getByLabel('Adresse email des rappels').fill('pas-un-email');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByText("Cette adresse email n'est pas valide.").waitFor();
  check('a bad email is refused next to its field, nothing saved', sql('select count(*) from settings') === '0');

  await page.getByLabel('Adresse email des rappels').fill('tresorerie@exemple.fr');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByText('Paramètres enregistrés.').waitFor();
  check('settings saved, normalised, negative opening balance accepted',
    sql("select association_name || '|' || city || '|' || rna || '|' || opening_balance_cents || '|' || reminder_email from settings") === 'Association Iqra|Villeurbanne|W691234567|-15050|tresorerie@exemple.fr');
  check('receipt header preview follows the form', await page.getByLabel("Aperçu de l'en-tête des reçus").getByText('69100 Villeurbanne').isVisible());

  await page.getByLabel("Nom de l'association").fill('   ');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByText("Indiquez le nom de l'association.").waitFor();
  check('a blank association name is refused', sql('select association_name from settings') === 'Association Iqra');

  const fiscal = page.getByRole('switch', { name: 'Reçu fiscal pour les dons' });
  await fiscal.click({ force: true });
  check('the fiscal receipt switch stays off', (await fiscal.getAttribute('aria-checked')) === 'false' && sql('select fiscal_receipts_enabled from settings') === 'f');
  check('reminder status is shown', await page.getByText('Activés').isVisible());

  // Démonstration : chargement dans une base vide, puis fin avec le mot de confirmation.
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Charger les données de démonstration' }).click();
  await page.getByText('Les données de démonstration sont chargées.').waitFor({ timeout: 60000 });
  check('demo loaded: members created, demo mode on', Number(sql('select count(*) from members')) === 11 && sql('select demo_mode from settings') === 't');
  await page.reload({ waitUntil: 'networkidle' });
  check('demo banner visible', await page.getByText('Mode démonstration.').isVisible());

  await page.getByRole('button', { name: 'Terminer la démonstration…' }).click();
  const dialog = page.locator('dialog[open]');
  await dialog.getByLabel('Pour confirmer, saisissez EFFACER').fill('effacé');
  await dialog.getByRole('button', { name: 'Tout effacer' }).click({ force: true });
  await page.waitForTimeout(500);
  check('a wrong confirmation word erases nothing', Number(sql('select count(*) from members')) === 11);
  await dialog.getByLabel('Pour confirmer, saisissez EFFACER').fill('EFFACER');
  await dialog.getByRole('button', { name: 'Tout effacer' }).click();
  await page.getByText("La démonstration est terminée").waitFor({ timeout: 60000 });
  check('ending the demo wipes members, movements and receipts, keeps categories',
    sql("select (select count(*) from members) + (select count(*) from transactions) + (select count(*) from receipts)") === '0' && sql('select count(*) from categories') === '11' && sql('select demo_mode from settings') === 'f');

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const mobile = await phone.newPage();
  await login(mobile, BASE, '/parametres');
  await mobile.getByLabel("Nom de l'association").waitFor();
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('phone: no horizontal overflow', overflow <= 0, `overflow=${overflow}`);
  check('no console error', issues.length === 0, issues.join(' | '));
  await browser.close();
  finish();
})().catch((error) => { console.error(error); process.exit(1); });

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Projet Iqra Compta — repères pour les prochaines sessions

Brief et maquettes : `docs/design/` (à relire avant chaque étape ; reproduire les
maquettes fidèlement). Avancement : tableau en tête du `README.md`. Méthode demandée
par l'utilisateur : une étape à la fois, vérifier que ça compile, montrer le résultat
(captures) avant de passer à la suite.

Conventions :

- Interface en français uniquement, vouvoiement. Dates en `Europe/Paris`.
- Montants en centimes (entiers) ; formatage dans `src/lib/format.ts`.
- Couleurs uniquement via les jetons de `src/app/globals.css` (`bg-surface`,
  `text-muted`, `text-accent`…) : jamais de `dark:` pour les couleurs, jamais de
  code hexadécimal dans les composants. `primary` = aplats, `accent` = texte/liens.
- Le menu passe en haut sous 900px : variante `desk:`.
- Toute fonction qui lit ou écrit des données commence par `await requireUser()`
  (`src/lib/auth/dal.ts`). Base de données : `getDb()` (`src/lib/db.ts`).

Next.js 16.4 avec `cacheComponents` (vérifié à l'étape 1) :

- Layouts et pages restent synchrones ; ce qui lit la session, la base ou la date
  du jour vit dans un composant `async` sous `<Suspense>` avec un `Skeleton`.
- `new Date()` / `Date.now()` interdits avant un `await` lié à la requête
  (`requireUser()` ou `connection()`), y compris dans les composants client.
- Les pages visitées restent montées mais cachées (`<Activity>`) : identifiants via
  `useId()`, fermer les fenêtres modales dans un nettoyage d'effet.
- Fichier `src/proxy.ts` (plus de `middleware.ts`) ; pas d'`export const dynamic`.

Animations (« fluides et propres ») :

- Entrées en CSS : `animate-rise` + `stagger-N` sur les sections, et
  `style={{ "--i": index }}` + `stagger-i` sur les lignes de liste.
- Motion (`motion/react`, ou `motion/react-client` dans un composant serveur)
  seulement pour : pastille du menu (`layoutId`), `CountUp`, fenêtres modales
  (`AnimatePresence`). Transitions courtes (150–350 ms), courbe `ease-soft`,
  uniquement `opacity` / `transform`.
- Toujours respecter `prefers-reduced-motion` (géré globalement en CSS et par
  `MotionConfig reducedMotion="user"` ; à gérer à la main pour `animate()` et
  l'API Web Animations).

Sécurité (données confidentielles — exigence forte de l'utilisateur) :

- Action serveur = adresse publique. Ordre imposé : `await requireUser()`, puis
  validation zod de TOUT ce qui vient du navigateur, puis Prisma. Modèle à suivre :
  `src/app/(app)/categories/actions.ts`. Les lectures vont dans `src/lib/data/`.
- Jamais de SQL construit à la main : pas de `$queryRawUnsafe`, `$executeRawUnsafe`,
  `Prisma.raw` (bloqués par ESLint). `$queryRaw` uniquement en gabarit étiqueté.
- Jamais `mode: "insensitive"` (ni `contains` / `startsWith`) sur un texte saisi
  sans échapper `\ % _` : Postgres l'exécute comme un motif ILIKE. Pour chercher
  un doublon, comparer en JavaScript (`nameKey` dans `categories/actions.ts`).
- Textes saisis : `normalize("NFC")`, refuser les caractères invisibles (voir
  `nameSchema`).
- Écritures concurrentes sur une même liste : transaction + verrou
  `pg_advisory_xact_lock` (voir `saveCategory`).
- `npm run lint` lance aussi `scripts/check-server-actions.mjs` : toute fonction
  exportée d'un fichier `"use server"` doit commencer par `await requireUser();`.
- Connexion à la base : toujours via `pgConnectionOptions` (`src/lib/db-connection.ts`),
  qui impose TLS vérifié hors machine locale. Ne jamais créer un `pg.Client` nu.
- Jamais de `dangerouslySetInnerHTML`. Aucun client Supabase dans le navigateur.
- Chaque migration qui crée une table doit contenir
  `ALTER TABLE "…" ENABLE ROW LEVEL SECURITY;` — `npm run db:check` (lancé par
  `vercel-build`) échoue sinon.
- On n'efface pas l'historique comptable : archiver ou annuler plutôt que supprimer.
- Ne jamais afficher au visiteur un message d'erreur technique ; journaliser côté
  serveur (`console.error`) et renvoyer un message générique.

Argent (encaissements, dépenses, chèques, reçus) — étapes 3 à 9 :

- Lectures : `src/lib/data/*` ; formes envoyées aux pages : `src/lib/views.ts`
  (jours en `AAAA-MM-JJ`, montants en centimes).
- Écritures : uniquement par `src/lib/services/money.ts`, appelé depuis une action
  serveur via `runMoney` (`src/lib/services/run.ts`) : transaction + verrou
  `iqra:money`, `DomainError` → message lisible. Ne jamais écrire une transaction,
  une échéance ou un reçu à la main ailleurs.
- Un encaissement lié à un adhérent crée toujours un `PaymentPlan` (1 à 4
  échéances) ; un chèque prévu n'est PAS une transaction tant qu'il n'est pas
  encaissé. Le solde = solde de départ + transactions `COMPLETED`.
- Reçu : numéro sans trou (`receipt_counters`), contenu figé dans
  `receipts.snapshot` ; le PDF se construit à partir de ce contenu seul.
- On n'efface rien : annulation (`CANCELLED`) ou archivage. Seule exception : la
  fin du mode démonstration (`clearDemoData`), refusée hors démonstration.
- Dates : `todayIsoDay()` après un `await` lié à la requête ; `toDbDay` /
  `fromDbDay` pour les colonnes `date` (`src/lib/days.ts`).
- Gestes sur une échéance (encaisser, modifier, rejeter) : le hook partagé
  `useInstallmentActions` (`src/components/installments/`).
- `/api/cron/rappels` est la seule adresse sans session : protégée par
  `CRON_SECRET`, elle ne renvoie jamais de donnée.
- Tests : `npm run test:domain` (règles comptables, base locale) en plus des
  tests de bout en bout ; `tests/e2e/helpers.cjs` (`wipe`, `seedDemo`, `login`).

Interface des formulaires : fenêtre `Dialog` (`src/components/ui/dialog.tsx`,
élément natif animé en CSS), champs `FIELD_CLASSES`, erreurs dans un
`role="alert"`, bouton d'envoi en `aria-disabled` pendant l'envoi. Listes qui
changent : `AnimatePresence` + hauteur animée (voir `category-board.tsx`).

Vérifier avant de livrer : `npm run typecheck`, `npm run lint`, `npm run build`,
`npm run test:domain`, puis `npm run test:e2e` (faux Supabase Auth + Postgres local ; démarrer Postgres
avec `pg_ctlcluster 16 main start` et créer la base si besoin, voir
`tests/e2e/run.sh`). Ajouter un fichier de test par étape.

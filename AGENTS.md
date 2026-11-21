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

Vérifier avant de livrer : `npm run typecheck`, `npm run lint`, `npm run build`.

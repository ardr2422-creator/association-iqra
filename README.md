# Iqra Compta

Application web de comptabilité pour l'association Iqra (cours d'anglais, d'arabe,
soutien scolaire, sorties et événements). Un seul compte : la trésorière.

Le brief d'origine et les maquettes validées sont dans [`docs/design/`](docs/design/).

## Où en est le projet

| Étape | Contenu | État |
| --- | --- | --- |
| 1 | Socle : Next.js, thème clair/sombre, connexion, menu, animations | ✅ fait |
| 2 | Catégories | à venir |
| 3 | Adhérents et fiche adhérent | à venir |
| 4 | Encaissements, dépenses, échéancier de chèques | à venir |
| 5 | Tableau de bord branché sur les vraies données | à venir (la page existe, avec des données d'exemple) |
| 6 | Reçus PDF | à venir |
| 7 | Calendrier | à venir |
| 8 | Rappels par email | à venir |

## Lancer l'application sur votre ordinateur

Il faut [Node.js](https://nodejs.org) 20 ou plus récent.

```bash
npm install
```

**Sans Supabase (mode démo).** Pour voir l'interface tout de suite, créez un fichier
`.env.development.local` contenant :

```
AUTH_DEMO_MODE=1
```

puis lancez `npm run dev` et ouvrez <http://localhost:3000>. Le mode démo ouvre
l'application sans mot de passe ; il ne fonctionne qu'en développement et il est
ignoré en production.

**Avec Supabase.** Copiez `.env.example` en `.env.local`, remplissez-le (voir
ci-dessous), puis `npm run dev`.

## Brancher Supabase

1. Créez un projet sur [supabase.com](https://supabase.com).
2. **Compte de la trésorière** : *Authentication → Users → Add user* (email + mot de
   passe). Copiez son identifiant (colonne *UID*) dans `AUTH_ALLOWED_USER_ID`.
3. **Fermez les inscriptions** : *Authentication → Sign In / Providers →* décochez
   *Allow new users to sign up*. (Même si quelqu'un créait un compte, seul
   l'identifiant de l'étape 2 peut entrer.)
4. **Clés** : *Project Settings → API* → copiez l'URL du projet dans
   `NEXT_PUBLIC_SUPABASE_URL` et la clé *publishable* dans
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
5. **Base de données** : bouton *Connect → ORMs → Prisma* → copiez les deux adresses
   proposées dans `DATABASE_URL` et `DIRECT_URL`.
6. Créez les tables : `npm run db:deploy`.

> Ces réglages n'ont pas encore été testés sur un vrai projet Supabase : la connexion
> a été vérifiée avec un serveur d'authentification simulé, et la base avec un
> Postgres local. Dites-moi si un intitulé de menu a changé chez Supabase.

Sur Vercel, déclarez les mêmes variables (*Settings → Environment Variables*) avant
le premier déploiement.

## Commandes

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Lance l'application en développement |
| `npm run build` puis `npm start` | Version de production |
| `npm run typecheck` | Vérifie les types TypeScript |
| `npm run lint` | Vérifie le style du code |
| `npm run db:migrate` | Crée et applique une migration (développement) |
| `npm run db:deploy` | Applique les migrations (production) |
| `npm run db:studio` | Ouvre un explorateur de la base |

## Organisation du code

```
docs/design/            Brief et maquettes d'origine
prisma/                 Modèle de données et migrations
src/proxy.ts            Protège toutes les pages (redirige vers /connexion)
src/app/connexion/      Page de connexion
src/app/(app)/          Pages de l'application (menu + contenu)
src/components/shell/   Menu, bascule clair/sombre, déconnexion
src/components/ui/      Boutons, cartes, pastilles, blocs d'attente
src/components/motion/  Compteur animé
src/lib/auth/           Vérification de la session
src/lib/format.ts       Euros et dates en français
src/app/globals.css     Couleurs (clair et sombre) et animations
```

## Style et animations

- Couleurs, rayons et courbes d'animation sont des variables dans
  `src/app/globals.css` ; le thème sombre redéfinit les mêmes variables.
- Les entrées de page (cartes puis lignes, en cascade) sont en CSS pur :
  `animate-rise` + `stagger-1`, `stagger-2`…
- La bibliothèque Motion sert pour ce que le CSS ne sait pas faire : la pastille du
  menu qui glisse d'une entrée à l'autre et les compteurs qui montent.
- Le passage clair/sombre est un fondu enchaîné de toute la page.
- Si l'appareil demande « moins de mouvement », tout s'affiche sans animation.

## Sécurité

- Toutes les pages passent par `src/proxy.ts` ; sans session valide, retour à la
  connexion. Sans configuration Supabase, l'application refuse tout (erreur 503).
- Chaque lecture de données et chaque action revérifie la session (`requireUser`).
- Les tables ont la sécurité « RLS » activée sans règle : l'API publique de
  Supabase ne peut rien lire ; seule l'application (via Prisma) y accède.

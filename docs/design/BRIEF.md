# Iqra Compta — brief pour Claude Code

Tu vas coder une application web de comptabilité pour l'association Iqra (cours d'anglais, d'arabe, soutien scolaire, sorties et événements). Les maquettes validées sont dans `maquettes/` : ouvre-les dans un navigateur et reproduis-les fidèlement (couleurs, espacements, typographie, composants).

## Stack
- Next.js (App Router) + TypeScript + Tailwind CSS
- Base de données : Supabase (Postgres) avec Prisma ou le client Supabase
- Auth : un seul compte (la trésorière), connexion email + mot de passe via Supabase Auth. Toutes les pages sont protégées.
- Graphiques : Recharts (courbes)
- PDF : @react-pdf/renderer
- Emails : Resend + Vercel Cron pour les rappels
- Mode clair / sombre : next-themes, bouton en bas de la sidebar
- Déploiement : Vercel

## Style (à respecter)
- Ambiance chaleureuse, associative, aérée, grosses cartes arrondies (radius 20px)
- Police : Inter
- Couleur principale bordeaux `#7A1F35` (hover `#5A1426`, fond doux `#F3E9EB`)
- Fond de page `#FBF8F6`, cartes blanches, bordures `#EEE3E5`
- Texte `#2A1A1E`, texte secondaire `#6B5A5E`
- Entrées en vert `#2F6B4F`, sorties en bordeaux, chèques à venir en ambre (`#FBEFD9` / `#6B4600`)
- Interface en français uniquement, vouvoiement
- Utilisé sur ordinateur, mais doit rester correct sur téléphone (la sidebar passe en haut)
- Pas de motifs ni de logo : le nom "Iqra" en texte bordeaux
- Prévois une palette sombre cohérente (bordeaux plus clair sur fond sombre chaud)

## Pages
1. **Tableau de bord** (`01-tableau-de-bord.html`) : solde actuel, nombre de chèques à encaisser, cours impayés, courbe entrées/sorties par mois, liste "à encaisser bientôt" (badge "En retard" si la date est passée), liste des cours impayés.
2. **Entrées & sorties** (`02-entrees-sorties.html`) : tableau de tous les mouvements, filtres par catégorie, recherche, boutons "+ Encaissement" et "+ Dépense". Le formulaire d'encaissement propose le paiement en 1, 2, 3 ou 4 fois. En plusieurs fois, ça crée automatiquement les échéances de chèques (montant, date prévue, numéro de chèque, banque).
3. **Adhérents** + **fiche adhérent** (`03-fiche-adherent.html`) : liste des familles/adhérents, et la fiche avec le total versé, le reste à payer, les inscriptions, l'échéancier des chèques (statuts : prévu, à encaisser, encaissé, rejeté), un bouton "Marquer comme encaissé" et l'historique des paiements avec un lien vers chaque reçu.
4. **Chèques** : tous les chèques en attente, triés par date, avec les mêmes statuts.
5. **Calendrier** : vue mensuelle des encaissements prévus (à concevoir dans le même style).
6. **Reçus** : liste des reçus générés, re-téléchargeables.
7. **Catégories** : CRUD des catégories, modifiables par l'utilisatrice. Chaque catégorie est de type entrée ou sortie. À créer au départ : Dons, Adhésions, Cours d'anglais, Cours d'arabe, Soutien scolaire, Sorties (entrées) et quelques catégories de dépenses génériques.

## Règles métier
- Moyens de paiement : espèces, chèque, virement (et carte pour les dépenses).
- Les cours peuvent être payés en 4 fois maximum.
- Le solde ne compte que les montants réellement encaissés (un chèque prévu n'est pas dans le solde).
- Chaque encaissement génère un reçu PDF au format A4, style classique officiel (`04-recu-pdf.html`), avec un numéro qui se suit (`2026-0001`, `2026-0002`…), le montant en chiffres et en lettres, le moyen de paiement et l'échéancier si le paiement est en plusieurs fois.
- Les infos de l'asso (adresse, email, téléphone, numéro RNA, nom du trésorier) sont réglables dans une page Paramètres et reprises sur les reçus.
- Reçu fiscal pour les dons : pas encore confirmé par l'asso. Prévois juste une option désactivée dans les Paramètres, sans la coder pour l'instant. Le reçu standard affiche "Ce reçu atteste du paiement et ne vaut pas reçu fiscal."

## Rappels de chèques
- Alerte sur le tableau de bord (à encaisser cette semaine, et en retard)
- Email chaque matin à la trésorière s'il y a des chèques à encaisser dans les 3 jours ou en retard (Vercel Cron + Resend)
- Calendrier des encaissements

## Modèle de données (proposition)
- `Member` : famille/adhérent (nom, téléphone, email, adresse, notes)
- `Category` : nom, type (entrée/sortie), couleur
- `Transaction` : date, type, catégorie, membre (optionnel), libellé, montant, moyen de paiement, statut
- `PaymentPlan` : membre, catégorie, montant total, nombre de versements
- `Installment` (chèque) : plan, numéro de versement, montant, date prévue, numéro de chèque, banque, statut, date d'encaissement, transaction liée
- `Receipt` : numéro, transaction, date, URL du PDF
- `Settings` : infos de l'association

## Méthode
1. Commence par le setup (Next.js, Tailwind avec les couleurs ci-dessus, Supabase, auth) et le layout avec la sidebar.
2. Puis dans l'ordre : catégories, adhérents, encaissements/dépenses, échéancier de chèques, tableau de bord, reçus PDF, calendrier, rappels par email.
3. Données de démo (seed) avec des noms fictifs pour tester.
4. Après chaque étape, vérifie que ça compile et montre-moi le résultat avant de passer à la suite.

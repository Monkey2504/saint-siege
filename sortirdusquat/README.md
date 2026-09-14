# sortirdusquat.be

Page unique, trilingue, pour la recherche de 120 engagements citoyens de 1 000 €
à 0 %. Le site n'encaisse rien et ne traite aucun paiement : il enregistre des
engagements non contraignants et des pistes de bâtiment.

Porteur : Ballal ASBL, Molenbeek.

## Stack

- Next.js (App Router), TypeScript, React
- Tailwind CSS v4, sans configuration JavaScript (le thème est déclaré dans
  `src/app/globals.css`)
- Supabase (Postgres) en région européenne, atteint par l'API REST depuis les
  routes serveur uniquement
- Resend pour les accusés de réception
- Déploiement sur Vercel

Aucune dépendance analytique, aucun traceur, aucune police ni script chargés
depuis un serveur tiers : Inter est servie depuis `public/fonts`. Une
Content-Security-Policy stricte est posée dans `next.config.mjs` et interdit
toute ressource externe.

## Routes

| Route | Rôle |
| --- | --- |
| `/`, `/nl`, `/en` | la page, dans les trois langues |
| `/vie-privee`, `/nl/privacy`, `/en/privacy` | politique de confidentialité |
| `/unsubscribe/[token]` (et `/nl/…`, `/en/…`) | suppression des données par jeton |
| `/admin` | compteurs, correction manuelle, export CSV |
| `/api/pledge`, `/api/lead` | insertion, honeypot et limitation de débit |
| `/api/unsubscribe` | suppression effective |
| `/api/cron/purge` | purge des enregistrements de plus de 24 mois |

## Variables d'environnement

Copiez `.env.example` vers `.env.local` en développement, et déclarez les mêmes
clés dans Vercel (Project Settings → Environment Variables).

| Variable | Obligatoire | Rôle |
| --- | --- | --- |
| `SUPABASE_URL` | oui | URL du projet Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | oui | clé de service, serveur uniquement, jamais exposée au navigateur |
| `ADMIN_PASSWORD` | oui | mot de passe unique de `/admin` |
| `ADMIN_COOKIE_SECRET` | non | secret de signature du cookie d'administration ; à défaut, `ADMIN_PASSWORD` est utilisé |
| `CRON_SECRET` | oui | secret présenté par le cron Vercel sur `/api/cron/purge` |
| `RESEND_API_KEY` | non | sans elle, aucun email n'est envoyé et les formulaires fonctionnent quand même |
| `EMAIL_FROM` | non | expéditeur des accusés de réception, ex. `Sortir du squat <bonjour@sortirdusquat.be>` |
| `NEXT_PUBLIC_SITE_URL` | non | URL publique utilisée dans les liens de désinscription ; déduite de Vercel à défaut |
| `NEXT_PUBLIC_COMPANY_NUMBER` | non | numéro d'entreprise affiché au pied de page |
| `NEXT_PUBLIC_CONTACT_EMAIL` | non | adresse de contact ; `fhzegert@gmail.com` par défaut |

## Base de données

Le script `supabase/schema.sql` crée les trois tables et verrouille l'accès.

1. Créez un projet Supabase en région européenne (Frankfurt ou Paris).
2. Ouvrez l'éditeur SQL et exécutez `supabase/schema.sql`.
3. Relevez l'URL du projet et la clé `service_role` dans Project Settings → API.

La Row Level Security est activée sur les trois tables **sans aucune politique** :
les rôles `anon` et `authenticated` ne peuvent donc rien lire ni écrire. Seules
les routes serveur, qui portent la clé de service, accèdent aux données.

La correction manuelle du compteur vit dans `settings.offline_pledges` : les
engagements pris en réunion s'ajoutent au compte des engagements en ligne. Elle
se modifie depuis `/admin`, sans toucher au SQL.

## Le dossier PDF

Les fichiers téléchargeables se déposent dans `public/dossier`, nommés
`sortir-du-squat-fr.pdf`, `sortir-du-squat-nl.pdf`, `sortir-du-squat-en.pdf`.
La section n'affiche que les fichiers réellement présents : tant qu'une
traduction manque, son lien n'apparaît pas. La version française est déjà en
place.

## Développement

```bash
npm install
cp .env.example .env.local   # puis renseignez les clés
npm run dev
```

Le site tourne sans base de données : la grille affiche alors ses 120 briques
vides et la mention « La liste ouvre bientôt ».

```bash
npm run build      # génère aussi next-env.d.ts, requis par le typecheck
npm run typecheck
```

## Déploiement sur Vercel

1. Importez le dépôt dans Vercel et pointez le *Root Directory* sur
   `sortirdusquat`.
2. Le framework est détecté automatiquement ; aucune commande de build à régler.
3. Déclarez les variables d'environnement du tableau ci-dessus pour les
   environnements Production et Preview.
4. Réglez la région de fonction sur `fra1` ou `cdg1` (Project Settings →
   Functions) pour rester au plus près de la base.
5. `vercel.json` déclare la purge quotidienne à 4 h UTC. Vercel présente
   `CRON_SECRET` en en-tête `Authorization` sur cet appel ; la route refuse tout
   appel sans ce secret.
6. Branchez le domaine `sortirdusquat.be` dans Project Settings → Domains.

## RGPD

- Responsable de traitement : Ballal ASBL, Molenbeek. Finalité : tenir la liste
  des engagements et recueillir des pistes de bâtiment. Base légale : le
  consentement, horodaté dans `consent_at`.
- Conservation : 24 mois, purge automatique quotidienne.
- Chaque enregistrement porte un jeton opaque de 24 octets. L'accusé de
  réception contient le lien `/unsubscribe/<jeton>`, qui supprime la ligne sans
  aucune authentification. La page demande une confirmation par bouton : cela
  n'ajoute aucune identification, mais évite qu'un scanner de liens d'un client
  mail supprime les données à la place du destinataire.
- Aucun cookie non essentiel — le seul cookie posé est celui de la session
  d'administration — donc aucun bandeau cookies.
- Aucun champ n'invite à décrire une situation personnelle et aucune donnée
  relative aux futurs résidents n'est collectée. Cette règle est stricte : elle
  ne doit pas être relâchée pour « mieux qualifier » les inscriptions.

## Anti-spam

Champ honeypot invisible sur les deux formulaires, et limitation de débit par IP
(cinq envois par tranche de dix minutes) dans `src/lib/rate-limit.ts`. Le
compteur vit en mémoire de l'instance et repart à zéro au redéploiement — c'est
assumé : pas de service tiers, et pas de reCAPTCHA, qui est un traceur.

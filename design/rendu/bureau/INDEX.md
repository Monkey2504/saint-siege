# Rendu réel — bureau (1440×900)

Capturé le 2026-09-11 15:59 · commit 28accf9 · source http://localhost:4173

Ces images sont le rendu réel du jeu dans un navigateur, pas une maquette.
Une session sans navigateur (Claude Design) doit les lire avant de juger le graphisme.

## Écrans

- `01-portail.png` — capturé, 50 Ko
- `02-cle-api.png` — capturé, 101 Ko
- `03-accueil.jpg` — capturé, 247 Ko
- `04-habemus-papam.png` — capturé, 249 Ko
- `05-edition-du-tour.jpg` — capturé, 223 Ko
- `06-ordres.png` — capturé, 129 Ko
- `07-registre.png` — capturé, 134 Ko
- `08-college.png` — capturé, 365 Ko
- `09-caisses.png` — capturé, 131 Ko
- `10-correspondance.png` — capturé, 93 Ko
- `11-courrier-ouvert.png` — capturé, 177 Ko

Total du lot : 1900 Ko.

## Polices

- `--oh-font-display` → Bricolage Grotesque — réellement dessinée
- `--oh-font-body` → Archivo — réellement dessinée
- `--oh-font-label` → Archivo — réellement dessinée
- `--oh-font-data` → Archivo — réellement dessinée
- `--oh-font-serif` → Newsreader — réellement dessinée

Toutes les polices annoncées par les tokens sont réellement dessinées ici.


## Appels sortants, sans effet ici

Cette capture tourne sans accès internet : ces requêtes échouent toujours, et
ce n'est pas un défaut de la page.

- www.googletagmanager.com — la mesure d'audience du jeu (index.html)
- open-historia-registry.nichojkrol.workers.dev — le registre des nœuds de carte, sollicité à la première tuile
- api.github.com — le hub communautaire, qui liste des scénarios


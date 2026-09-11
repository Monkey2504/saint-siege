# Protocole d'échange entre la session de design et la session de code

Deux sessions travaillent sur ce jeu et ne peuvent pas se parler directement :

- une session **design** (Claude Design) dessine des maquettes, mais n'a pas de
  navigateur : elle ne peut ni exécuter l'application, ni voir son rendu ;
- une session **code** (Claude Code) modifie l'application, mais ne juge pas la
  direction graphique.

Le dépôt est leur seul point de contact. Ce fichier dit qui écrit quoi.

## La frontière : `design/tokens.json`

C'est la source de vérité de la direction graphique — couleurs, typographie,
échelle, rayons. `src/theme.css` en découle mécaniquement.

- La session **design** modifie `design/tokens.json`, et rien d'autre dans `src/`.
- La session **code** exécute `npm run tokens:sync` : les valeurs descendent dans
  le bloc `:root` de `src/theme.css`, commentaires et ordre préservés.
- `npm run tokens:check` échoue si les deux fichiers ont divergé. À brancher en CI.
- Si un composant a besoin d'une couleur absente des tokens, ce n'est pas au
  composant de l'inventer : le token est ajouté ici d'abord.

`design/TOKENS.md` est la version lisible de ce fichier, régénérée par
`npm run tokens:doc`. C'est ce que la session de design lit avant de dessiner.

`design/ECHELLE.md` est une proposition de la session de code : les deux marches
d'affichage et les trois graisses de filet qui manquaient, avec le comptage qui
les motive. Ces cinq valeurs vivent aujourd'hui dans le bloc `:root` de
`src/theme.css` en attendant que la session de design les reprenne, ou les
refuse, dans `tokens.json`.

## Le retour : `design/rendu/`

Des captures du rendu réel du jeu dans un navigateur, en bureau et en mobile,
committées dans le dépôt — donc lisibles par une session qui n'a pas de navigateur.

    npm i -D playwright && npx playwright install chromium   # une fois
    npm run build:web && npm run preview:web                 # sert sur :4173
    npm run rendu                              # gabarit bureau, 1440×900
    npm run rendu -- --largeur 390 --hauteur 844   # gabarit mobile
    npm run rendu -- --url https://…           # un déploiement plutôt que le local

Si l'image hôte fournit déjà un Chromium, `CHROMIUM_PATH` impose son binaire et
`npx playwright install` devient inutile.

Chaque lot écrit un `INDEX.md` : date, commit, écrans atteints ou non — avec la
raison quand une manœuvre a échoué —, poids de chaque image, polices réellement
dessinées, et domaines dont le chargement a échoué pendant la capture.

**Ces captures se régénèrent à la main.** Rien ne les met à jour automatiquement
aujourd'hui : après un changement visuel, c'est à la session de code de relancer
`npm run rendu` et de committer le résultat. Une capture datée d'avant le dernier
commit touchant le style ne montre pas l'état du jeu — l'`INDEX.md` porte la date
et le commit précisément pour qu'on puisse s'en apercevoir.

Le parcours capturé est celui du joueur qui ouvre le jeu pour la première fois :
le portail, l'écran de la clé, l'accueil, la feuille d'investiture, puis les six
cahiers d'une partie signée.

**Construire avec `npm run build:web`, jamais avec `vite build`.** Sans
`--mode web`, le backend IndexedDB n'est pas installé : `/api/library` répond
500, aucun scénario n'est chargé, le monde reste sans pays et toutes les pages
paraissent vides. Une session de code a perdu une passe entière à prendre cela
pour un défaut du jeu.

Un workflow qui ferait ce travail à chaque poussée sur `main` existe, mais hors
du dépôt : François le garde de côté. L'installer suppose d'abord de retirer la
ligne `.github/workflows/` du `.gitignore`, qui exclut aujourd'hui toute
automatisation — c'est sa décision, pas celle d'une session.

## Ce que chaque session doit faire

**Session de design, avant de dessiner :** lire `design/TOKENS.md` et le dernier
`design/rendu/*/INDEX.md`, puis regarder les images. Une maquette qui introduit
une couleur, une graisse ou un rayon hors tokens doit le dire explicitement et
proposer le token correspondant dans `design/tokens.json`.

**Session de code, avant de toucher au style :** ne jamais écrire une valeur
littérale dans un composant ; passer par un token. Après un changement visuel,
relancer `npm run rendu` pour que le retour soit à jour.

**Un brief qui renvoie à des maquettes doit les committer.** Le brief du
11 septembre pointe six fichiers dans `reference/` ; ce dossier n'est pas dans le
dépôt, et la session de code ne peut pas les ouvrir. Un chemin cité mais absent
coûte une passe entière.

## Ce que ce protocole ne résout pas

La session de design ne verra jamais l'application en train de tourner : elle
voit des images d'un instant donné. Les états transitoires — survol, focus,
chargement, erreur, texte trop long — n'apparaissent que si une étape du
parcours dans `scripts/rendu.mjs` les provoque. Ajouter une étape est le seul
moyen de les rendre visibles.

Les images portent aussi l'environnement qui les a prises. Une police servie par
un CDN injoignable depuis la machine de capture sortirait remplacée par son repli
sans que rien ne le signale à l'œil — d'où la section « Polices » de l'`INDEX.md`,
qui mesure ce qui a été dessiné plutôt que ce qui a été demandé. Un écran jugé
sur une capture est jugé dans les conditions de cette capture, pas dans celles du
joueur.

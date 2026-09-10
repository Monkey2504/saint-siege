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

## Le retour : `design/rendu/`

Des captures du rendu réel du jeu dans un navigateur, en bureau et en mobile,
committées dans le dépôt — donc lisibles par une session qui n'a pas de navigateur.

    npm run rendu                              # localhost:4173 (après npm run preview:web)
    npm run rendu -- --url https://…           # un déploiement
    npm run rendu -- --largeur 390 --hauteur 844   # gabarit mobile

Chaque lot écrit un `INDEX.md` : date, commit, écrans atteints ou non, et les
domaines dont le chargement a échoué pendant la capture (polices, tuiles, API).

Ce dossier est régénéré automatiquement par `.github/workflows/rendu.yml` à
chaque poussée sur `main`. Personne n'a de capture à faire à la main.

## Ce que chaque session doit faire

**Session de design, avant de dessiner :** lire `design/TOKENS.md` et le dernier
`design/rendu/*/INDEX.md`, puis regarder les images. Une maquette qui introduit
une couleur, une graisse ou un rayon hors tokens doit le dire explicitement et
proposer le token correspondant dans `design/tokens.json`.

**Session de code, avant de toucher au style :** ne jamais écrire une valeur
littérale dans un composant ; passer par un token. Après un changement visuel,
relancer `npm run rendu` pour que le retour soit à jour.

## Ce que ce protocole ne résout pas

La session de design ne verra jamais l'application en train de tourner : elle
voit des images d'un instant donné. Les états transitoires — survol, focus,
chargement, erreur, texte trop long — n'apparaissent que si une étape du
parcours dans `scripts/rendu.mjs` les provoque. Ajouter une étape est le seul
moyen de les rendre visibles.

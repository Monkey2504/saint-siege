# Brief — deuxième passe

Pour Claude Code. Fait suite aux rendus `design/rendu/` du 11 septembre, 12 h 30, et répond à `design/ECHELLE.md`.

**Le constat.** Le brief du matin est appliqué, point par point, et il a fonctionné : la une est un journal. Titre Newsreader sur deux lignes, pastille rouge de dateline, chapô italique, photo créditée, « Ce que cela change » sous filet bleu. Rapport d'échelle de la colonne de tête : 4, comme demandé. États vides montés en taille et sur une colonne. Collège traduit, axe Opinion par défaut, hémicycle en encre unique. Mobile impeccable.

**Correction, 13 h.** François a envoyé une capture du Courrier **avec une lettre ouverte**. Elle infirme une partie de ce qui précède : les rendus de `design/rendu/` ne montrent que des états vides, et un état vide cache tout. Le Courrier rempli est l'ancien composant de discussion, pas la maquette. Deux conséquences, toutes deux en tête de liste ci-dessous.

Il reste **trois bloquants**, **cinq finitions**, et une réponse aux jetons proposés.

---

## BLOQUANT 0 — Le pipeline de capture doit jouer avant de capturer

`scripts/rendu.mjs` capture au tour 1 : aucune caisse ouverte, aucune lettre reçue, aucun ordre jugé. Ce sont des états réels, mais ils ne montrent **aucun** des composants qui portent le contenu — tableaux, fil de lettres, verdicts, registre. Les deux audits de design ont validé des pages qui ne montraient rien.

Le parcours doit, avant de capturer les cahiers : signer le pontificat, verser au moins un ordre qui ouvre une caisse, mettre sous presse deux ou trois fois, ouvrir la première lettre reçue. Si c'est trop lent pour un run de CI, un état de partie sauvegardé à charger (`fixtures/partie-tour-4.json`) fait le même travail. Tant que ce n'est pas fait, ne pas considérer un cahier comme validé sur la foi de `design/rendu/`.

## BLOQUANT 1 — Le Courrier rempli est l'ancien chat repeint

Capture de François, 11 septembre 13 h, lettre du Chemin synodal allemand ouverte. Point par point :

| Vu | Attendu |
| --- | --- |
| Bandeau **« A new version of Open Historia is ready. Reload to get the latest fixes. Your games are saved. » · bouton bleu arrondi « Update now »** | Service worker de l'amont. Texte en français, sur le papier, filet et bouton plats — ou supprimé si l'édition n'a pas besoin de cette notification |
| Étiquettes **ITS GROUND**, **WHAT IT SAYS IT WANTS**, **1 exchanged**, placeholder **Write to Chemin synodal allemand… (Shift+Enter for a new line)** | Français partout : « Ce qu'il défend », « Ce qu'il veut », « 1 lettre échangée », « Répondre au Chemin synodal allemand… » |
| Ligne de **mots-clés bruts** : `progressive · synodal · reformist · synod · allemagne · germany · german · diacon` | Ce sont les clés internes du moteur. Ne jamais les afficher. Si un résumé de position est utile, c'est une phrase rédigée |
| **« un État · 7 électeurs »** pour le Chemin synodal allemand | Le Chemin synodal n'est pas un État. Le type doit venir du modèle (courant / État / organisme), pas d'un défaut |
| Texte qui court **jusqu'au bord droit sur 1 500 px**, « Opinion 0, réservé » **coupé**, bouton ENVOYER **flottant hors du champ** sur fond gris | Le panneau central tient dans la mesure de page (1 136 px) ; le fil de lettres à `max-width: 62ch` ; ENVOYER collé au champ, `--oh-accent` plein, texte blanc |
| Fiche du correspondant : nom, puis un sous-titre de deux noms propres et une parenthèse, puis un extrait en italique | La ligne de la propal : **« Préfet de l'Économie · doctrine : modéré · région : Italie · suit son propre courant (19) »**, et à droite **« Opinion +6, avec vous · 4 lettres échangées »**. Une ligne de faits, pas un paragraphe |
| Rien ne dit quel **événement a déclenché** la lettre | Chaque lettre sous un filet portant sa date et son déclencheur : « 3 MARS 2027 · APRÈS LA DISTRIBUTION DE L'IOR » |

Ce qui est juste et doit rester : la lettre elle-même, en Newsreader à taille de lecture. C'est la seule pièce de la maquette qui soit là.

À reprendre depuis `reference/5-le-courrier.html` et `CORRECTIFS-GRAPHIQUES.md` partie I, point 5, une fois `reference/` dans le dépôt.

## BLOQUANT 2 — Les Comptes remplis n'ont jamais été vus

Même cause. `ECHELLE.md` le reconnaît : « les tableaux des Caisses n'ont toujours pas été vus remplis ». Tant que le Bloquant 0 n'est pas réglé, ce cahier est **non évalué**, pas validé. La maquette de référence est celle que François a renvoyée : bandeau de cotes, analyse en serif qui prend position, tableau à cinq colonnes avec sparklines, campagnes et rassemblements en compte d'exploitation — `reference/4-les-comptes.html`.

---

## Réponse à ECHELLE.md — les cinq jetons sont validés

À coller dans `design/tokens.json` :

```json
"echelle": {
  "--oh-t-2xl": "clamp(1.9rem, 3.4vw, 2.83rem)",
  "--oh-t-3xl": "clamp(2.3rem, 5.4vw, 4rem)"
},
"filet": {
  "--oh-filet": "1px",
  "--oh-filet-fort": "3px",
  "--oh-filet-manchette": "6px"
}
```

- `3xl` une fois par page, `2xl` une fois : la règle est la bonne.
- Le verdict en `--oh-filet-fort` (3 px) suffit ; le brief demandait 4 par habitude. Pas de quatrième graisse.
- Sur le serif, la lecture d'ECHELLE.md est juste : Newsreader pour les titres, chapôs, lettres et états vides ; le labeur en Archivo. Resserrer le commentaire de `theme.css` sur `--oh-font-serif`, qui est plus large que l'intention.
- `reference/` : exact, le dossier n'est pas dans le dépôt. Il est dans le projet de design ; François doit le copier à la racine du dépôt. Tant qu'il n'y est pas, le Conseiller se fera sans maquette.

---

## BLOQUANT 3 — Le portail est Open Historia, intégralement

`01-portail.png`, `03-accueil.jpg` — `runtime/Welcome.jsx`, `runtime/FirstRunKey.jsx`.

Colonnes doriques en marge, dégradé doré, carte à coins arrondis et ombre, titre **Open Historia** en Times bicolore, « An AI-driven alternate-history strategy game. Lead any nation on a living world map », bouton **⚔ ENTER OPEN HISTORIA**, badge « community-hosted alternative to Pax Historia ». C'est la première page que voit le joueur, et elle est en tout point l'autre jeu.

L'écart avec la une qui suit est maintenant si grand qu'il fait paraître la une comme un accident.

Ce qu'il faut :

1. **Le portail technique (recherche de nœud, clé API) passe sur le papier du journal.** Fond `--oh-ground`, une carte `--oh-plate` sans rayon ni ombre, filet haut `--oh-filet-manchette`. Titre « Saint-Siège » en `--oh-font-serif` `3xl`. Sous-titre : la devise, en italique — « Vous êtes le pape. Les comptes ne mentent pas. » Les états (« Recherche du nœud le plus proche… ») en Archivo `sm`, `--oh-text-dim`. Bouton d'entrée : `--oh-text-strong` plein, texte blanc, Archivo 700 capitales — comme METTRE SOUS PRESSE. Aucune colonne, aucune dorure, aucun glyphe ⚔.
2. **Supprimer tout ce qui nomme l'amont** : « Open Historia », « Pax Historia », « community-hosted alternative », les liens GitHub / Discord / Host a node. Ils ont leur place dans un À propos, pas sur la porte.
3. **Habemus Papam devient la première page de jeu**, tout de suite après le portail technique. Il existe et il est réussi.

---

## Finition 1 — L'inauguration affiche le jeu avant que le jeu ait commencé

`04-habemus-papam.png`. La page garde ses trois colonnes : à droite « Prochaine édition » et « Les six fronts » avec des chiffres, au centre le champ d'ordres — pendant que le pape n'a pas encore de nom. Et l'état vide « Aucune situation d'ouverture n'a été écrite pour ce début » s'affiche comme un défaut, alors que c'est l'état normal de cette page.

Tant que le pontificat n'est pas signé : **une seule colonne**, la cérémonie, rien d'autre. Masquer la colonne Ordres, masquer les Six fronts, masquer l'état vide de situation. La colonne de droite peut ne porter que la phrase déjà écrite — « Les presses attendent : le pape prend un nom et déclare son programme avant que la première édition sorte. »

## Finition 2 — Collège et Courrier ne sont pas dans la grille des autres

Édition, Ordres, Registre, Comptes : colonne de 1 136 px centrée, barre des cahiers à 152 px du bord. Collège et Courrier : pleine largeur, barre à 24 px. La navigation saute de 130 px quand on change de cahier. **Une seule mesure de page**, celle des quatre premiers.

Le Collège est aussi le seul cahier dont le nom est en Bricolage. « Les Comptes », « Les Ordres », « Le Courrier » sont en Newsreader `3xl` : « Le Collège » aussi. Et sa ligne de compte écrit `2026-09-01` — seule date ISO du jeu. Passer par le formateur qui écrit « 1er septembre 2026 » partout ailleurs.

## Finition 3 — Le champ d'ordre est rétréci, ses boutons sont restés à l'autre bout

`06-ordres.png`. Le champ fait 570 px — bonne mesure. Mais le `+` et le bouton d'envoi sont à 1 250 px, à 530 px de vide du champ qu'ils commandent. « Demander des suggestions » fait toujours toute la largeur, seul bouton de la page à le faire. **Les trois partagent la colonne du champ** (`max-width: 62ch`), le bouton d'envoi collé au champ.

## Finition 4 — « indécis 160 (0) »

Légende du Collège. Le « (0) » sous chaque groupe ne se lit pas : zéro quoi ? Si c'est le nombre de ceux qui suivent le pape dans ce groupe, l'écrire : « dont 0 avec vous ». Si c'est redondant avec « 0 vous sont acquis » au-dessus, le supprimer.

## Finition 5 — Le Conseiller

Pas repris, pas d'onglet dans la barre, pas atteint par la capture. C'est le dernier des cinq écrans de la propal encore à l'état d'origine. La spec est dans `CORRECTIFS-GRAPHIQUES.md` partie I, point 3 ; la maquette dans `reference/3-conseiller.html` dès que le dossier est dans le dépôt. Ajouter l'écran au parcours de `scripts/rendu.mjs`.

---

## L'ordre

1. Le pipeline joue avant de capturer — sans ça, rien de ce qui suit n'est vérifiable.
2. Le Courrier rempli, d'après la maquette.
3. Le portail — première impression.
4. Les Comptes remplis, une fois visibles.
5. L'inauguration en une colonne, le Conseiller.
6. Les finitions de grille, boutons, légende.

Rien ici ne touche à la une, aux Comptes, au Collège hors les deux détails nommés, ni au mobile. Ils sont au niveau de la propal — par endroits au-dessus : les états vides rédigés et l'hémicycle en encre unique sont des décisions que la propal n'avait pas prises aussi nettement.

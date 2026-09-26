# Saint-Siège — plan de construction

> Révisé le 10 septembre 2026, après comparaison des cinq écrans en ligne avec les maquettes de la propal.
> **Le problème n'est pas cosmétique.** Le déployé, ce sont les écrans d'Open Historia avec la feuille de style du Saint-Siège appliquée par-dessus. Cinq structures de la propal n'ont pas été construites. Les corriger est du travail de construction, pas de finition — mais aucune décision de design n'est à reprendre : tout est déjà spécifié dans `Propal Saint-Siege.dc.html`.
>
> Les points 1 à 5 sont le chantier. Le point 6 est le nettoyage, à faire après.

---

# PARTIE I — LES CINQ STRUCTURES À BÂTIR

## 1. La barre de règne, sur toutes les pages

**Manque entièrement.** Aujourd'hui : six onglets gris en bas de fenêtre, sans emblème, sans date, sans badge, et « Prochaine édition » — le geste central du jeu — réduit au sixième onglet, du même poids que les autres.

La propal met en **haut** de chaque page une barre unique qui porte :

| Zone | Contenu |
| --- | --- |
| Gauche | emblème + `Saint-Siège` + séparateur + date en cours (`14 mars 2027`) |
| Centre | `ÉDITION DU JOUR` · `LETTRES` + badge rouge du non-lu · `COLLÈGE` · `CONSEILLER` · `FINANCES` |
| Droite | pavé bleu plein `TOUR SUIVANT`, puis `→ 14 avril 2027 · 30 j` sur fond bleu foncé |

L'onglet actif est en **inversion** (fond `--oh-line`, texte `--oh-plate`), pas en soulignement.

Points à ne pas rater :
- le pavé `TOUR SUIVANT` est **permanent et visuellement dominant** — c'est l'action principale, elle ne doit jamais se confondre avec la navigation ;
- il **annonce sa date d'arrivée et sa durée avant qu'on clique**, calculées d'après ce qui est au dossier (une lettre : une semaine ; un consistoire : un mois ; rien : le prochain événement du monde) ;
- pendant la presse, il **devient la barre de progression** ;
- le badge sur `LETTRES` porte le nombre de lettres non lues.

Supprimer la barre d'onglets du bas une fois celle-ci en place.

---

## 2. L'Édition du jour : manchette, trois colonnes, verdicts, registre

**Manque : la manchette, la colonne des verdicts, le registre, le rappel du Collège.** Aujourd'hui : le mot « Bulletin », deux colonnes, un article sans image, un champ de saisie.

### 2.1 La manchette

Grille `1fr auto 1fr`, alignée en bas, sous un filet épais :

- **gauche** — `N° 14 · AN I` en capitales grasses, puis `6 événements · 3 ordres jugés`
- **centre** — `Édition du jour` en Bricolage 800, très grande taille, interlettrage `-0.045em` ; en dessous, en italique Newsreader : `Rome, 14 mars 2027 — ce que le monde a fait de vos ordres`
- **droite** — `SOLDE DU TOUR` en capitales, puis le montant en rouge s'il est négatif, puis `4 lignes au registre`

Cette ligne d'italique est le sujet du jeu. Elle doit être imprimée, pas sous-entendue.

### 2.2 Les trois colonnes

**Colonne 1 — l'article de tête.** Pastille de dateline rouge (`12 MARS 2027 · ABUJA`), titre en **Newsreader serif 700** à très grande taille sur plusieurs lignes, chapô en italique, photographie, puis le corps sur deux colonnes. En pied, un encadré `Ce que cela change` en bleu qui dit l'effet mécanique. Sous filet, deux brèves à pastille de lieu.

**Colonne 2 — `VOS ORDRES, JUGÉS`**, en tête `3 au dossier`. Chaque ordre :

```
Titre de l'ordre                          (Newsreader 700)
────────────────────────────────  liseré 3px, couleur = verdict
Accordé en partie                         (verdict, en gras)
Budget    réservé · 2,1 M$ sur une caisse à 1,4 M$
Collège   réservé · 62 sur 81
Légitimité accordé
```

Verdicts et couleurs de liseré : `Exécuté en entier` → `--oh-grant` ; `Accordé en partie` → `--oh-caution` ; `Refusé` → `--oh-alert`. Chaque contrainte nommée porte sa raison **chiffrée** — c'est ce qui permet au joueur d'argumenter avec le monde au lieu de deviner.

En bas de colonne, l'encadré `NOUVEL ORDRE` : champ en italique (« Écrivez l'ordre comme vous le dicteriez. Le moteur le lit, le juge, et le registre dira ce qu'il a coûté. »), puis `VERSER AU DOSSIER` en bleu plein et `CONSEIL` en bouton bordé.

**Colonne 3 — `LE REGISTRE DU TOUR`**, avec un lien `→ Finances`. Quatre à six lignes, chacune :

```
8 mars · Manille                          (date · lieu, petit, gris)
Recettes du rassemblement        +7,9 M$  (intitulé / montant tabulaire)
```

Montants en vert si positif, rouge si négatif, `font-variant-numeric: tabular-nums`. Ligne de total `Solde du tour` en gras. Dessous, `LE COLLÈGE` avec l'hémicycle en petit et la ligne de compte.

**Règle de fond :** une ligne n'apparaît au registre que si le moteur a réellement déplacé quelque chose. Ce qui manque en dit autant que ce qui figure.

---

## 3. Le Conseiller : une note de cabinet, pas une fenêtre de discussion

**Manque entièrement.** Aujourd'hui : un tiroir latéral ouvert par un bouton rond à boussole — le composant de discussion d'origine, inchangé.

Page pleine, deux colonnes.

**Colonne gauche.** En-tête `NOTE DE CABINET · N° 14`, titre `Le Conseiller`, et à droite la signature : `Mgr Aurelio Vance, secrétaire particulier` / `lit le même registre que vous`. Le conseiller a un nom et une charge — il n'est pas « l'assistant ».

Puis `LA SITUATION, EN TROIS POINTS` : trois entrées numérotées en gros chiffre, chacune avec un titre en gras qui **affirme** (« Vous n'avez pas les voix, mais vous savez où elles sont. ») et deux ou trois lignes chiffrées dessous.

Puis `ORDRES PROPOSÉS — À VERSER AU DOSSIER D'UN GESTE`. Chaque ligne : titre en gras, conséquence en petit dessous, et à droite un bouton `VERSER` (bleu plein) ou `OUVRIR` (bordé, quand l'action se poursuit dans Lettres). Les effets négatifs sont écrits en rouge.

**Colonne droite.** `POSER UNE QUESTION` : champ en italique, bouton `DEMANDER` noir, mention `réponse immédiate, hors tour`. La réponse est datée, écrite en serif, et **cite ses sources** : `Sources : Collège (standing), Finances (caisse curiale), Lettres (Bertoni, 12 mars)`.

En pied de colonne, l'encadré `Ce que le Conseiller n'est pas.` — il ne voit rien que le joueur ne voie, ne déplace pas d'argent, ne parle à personne : il propose, le joueur verse, le moteur juge à la prochaine édition. **Garder ce paragraphe :** il fixe le contrat et empêche le composant de redevenir un chat.

---

## 4. Les Comptes : le cahier financier, à refaire de zéro

**Jamais converti.** Aujourd'hui : barre noire `Session des Temps Modernes` avec bouton `Quitter` à demi masqué par le sélecteur de date, deux onglets à emoji, sept emojis de ligne, barres de progression vert/jaune/cyan/rose/bleu, cartes arrondies et ombrées.

Tout supprimer, et bâtir :

**Bandeau de cotes** en tête, fond sombre, défilant : `● EN DIRECT 14:32 · actualisé pendant l'édition` puis les caisses avec valeur et variation (`IOR capital 2,84 Md$ ▲ 0,6 %`, `Denier de Saint-Pierre 47,1 M$ ▼ 3,2 %`, `Caisse curiale 1,4 M$ ▼ 41 %`). C'est le seul endroit du jeu où le fond est sombre — il tient lieu de ruban boursier.

**Titre** `SAINT-SIÈGE · CAHIER` / `Les Comptes`, cinq onglets soulignés (`CAISSES`, `REGISTRE`, `CAMPAGNES`, `RASSEMBLEMENTS`, `PRÉVISIONS`), et à droite `Tour 14 · 14 mars 2027` + **la mention d'unité** : `Unité : dollars ; années de subsistance (AS) entre parenthèses`.

**Colonne gauche, l'analyse.** Étiquette `ANALYSE`, titre en Newsreader serif qui prend position, chapô en italique, une courbe fine, puis le texte en colonnes avec un bloc `À surveiller`. En pied, la mention : *rédigé par le moteur à partir du registre ; aucun chiffre n'est narratif*.

**Colonne droite, les tableaux.** `CAISSES · 5 ORGANISMES` avec colonnes Capital / Rendement / En main / Reversé / 12 tours (sparkline), sous-lignes indentées pour les diocèses, ligne `Total en main` en gras. Puis `CAMPAGNES` (barre de progression **en une seule couleur d'encre**, pas cinq) et `RASSEMBLEMENTS` (compte d'exploitation : recettes, coût, reste au diocèse).

**Et le contenu — le plus important.** `Votre pays`, `Chef de file : François`, `Autonomie alimentaire 21 %`, `Sécurité intérieure`, `Autonomie énergétique`, `Souveraineté` : ces indicateurs appartiennent au jeu d'atlas. Le joueur **est** le pape et son État fait 44 hectares. Les remplacer par ceux du jeu : caisses, Denier, dépenses de la Curie, engagements non financés, années de subsistance.

---

## 5. Le Courrier : un fil, pas une boîte vide

**Manque : tout le panneau central.** Aujourd'hui : la liste de gauche (tronquée en plein milieu d'une fiche) et deux tiers d'écran vides avec une consigne d'attente.

**Liste de gauche.** Chaque correspondant : liseré gauche de 3 px à la couleur de son courant, nom, extrait de la dernière lettre, puis sa ligne politique — `Courant Bertoni · 19 électeurs · avec vous (+6)` ou `· contre vous (−12)`. Pastille de non-lu. La liste **défile sous** le bloc d'action ; ombre de défilement en bas. Aujourd'hui elle est coupée net sans que rien n'indique la suite.

**Panneau central — le fil.** En-tête du correspondant : nom en display, puis `Préfet de l'Économie · doctrine : modéré · région : Italie · suit son propre courant (19)`, et à droite `Opinion +6, avec vous` / `4 lettres échangées depuis l'élection`.

Chaque lettre est précédée d'un filet portant `3 MARS 2027 · APRÈS LA DISTRIBUTION DE L'IOR` — **l'événement qui l'a déclenchée**. Corps en Newsreader à taille de lecture, signature à droite en italique. Les réponses du joueur sont en encadré tramé, avec la ligne de jugement : `Jugée par le moteur : reçue, opinion +3 · Rien n'a bougé au registre`.

**Composeur** en pied : `RÉPONDRE À BERTONI`, champ en italique, `ENVOYER AVEC LA PROCHAINE ÉDITION` en bleu plein, `DEMANDER CONSEIL` bordé. Sous le champ, la note existante — « Une lettre vaut ce que vaut votre position… » — qui est déjà bien écrite.

---

# PARTIE II — NETTOYAGE

À faire une fois les structures en place. Rien ici ne change ce que le joueur peut faire.

## 6.1 Les fontes de titre

La propal réserve **Newsreader serif** à tout ce qui se lit — titres d'articles, chapôs, analyses — et Bricolage aux seuls noms de cahiers et à la manchette. Le déployé titre et compose dans la même grotesque, ce qui lui donne l'air d'un tableau de bord.

```js
fontFamily: "var(--oh-font-serif)",
fontWeight: 700,
letterSpacing: "-0.02em",
```

Le jeton existe déjà dans `theme.css`.

## 6.2 Une palette pour les graphiques

L'hémicycle du Collège colorie les cinq continents (brique, vert pomme, vert sapin, bleu, violet) ; les barres de Comptes reprennent la même palette générique. La propal donne à l'hémicycle **trois** couleurs et une seule lecture — vert avec vous, gris indécis, rouge contre — sous la phrase `62 avec vous · 71 indécis · 27 contre / il en faut 81 pour emporter une décision`.

```
var(--oh-grant)    #17643f   avec vous / accordé
var(--oh-alert)    #b8291d   contre / refusé
var(--oh-caution)  #7f4705   sous contrainte
var(--oh-text-dim) #4f535b   indécis / neutre
```

La couleur dit le vote, jamais la géographie. Séries neutres : une seule valeur d'encre.

## 6.3 Emojis et chrome hérité

- Onglets `🧭 Conseiller`, `📊 Statistiques` ; lignes `⚠ 🚩 🌾 ⚡ 🏛 🛡 🤝` ; bouton rond à boussole.
- Barre noire `Session des Temps Modernes` + `Quitter`, recouverte par le sélecteur de date.
- La fenêtre `WebGL Not Available` s'ouvre encore dans un jeu sans carte :

```js
useEffect(() => {
  if (HAS_MAP && !checkWebGL()) setShowWebGLWarning(true);
}, []);
```

## 6.4 Rayons, ombres, `!important`

`theme.css` répare à la sortie ce que les composants produisent : treize `!important` sur huit lignes (450-452, 457-460, 474) dans `.oh-desk` et `.oh-letters`. Remplacer les valeurs en dur à la source par `var(--oh-r-flat)` / `boxShadow: "none"`, puis supprimer ces huit lignes. **Test de réussite : la page ne bouge pas après suppression.**

`.oh-plate` est déclarée deux fois — la première avec bordure, rayon souple et ombre, pour un « globe sombre » qui n'existe plus. Supprimer la première.

`CountryPickerMap.jsx` figure dans la liste `SKIP` de `runtime/contrastAudit.test.js` et deux fois dans `runtime/designTokens.test.js`. L'écran étant inatteignable, supprimer le fichier et ses trois exemptions.

## 6.5 La copie

- `Décrets au nom de votre nation , prenant effet à compter de ce jour .` → espaces avant ponctuation à retirer ; « votre nation » → « le pontificat ».
- `réservés ( 0 )` → `réservés (0)`.
- `M'aider à trouver des idées` et `Demander des suggestions` promettent la même chose : n'en garder qu'un. Le gris du premier n'existe pas dans la palette.
- `0 personnes ont une bonne opinion de vous` → accorder au singulier, et donner le seuil : `il en faut 81`.

## 6.6 Les métadonnées de partage

`index.html` — vérifié en production, le lien partagé annonce encore Open Historia.

```html
<html lang="fr">
<meta name="theme-color" content="#f4f0e6" />
<meta name="description" content="Vous êtes pape. Les comptes ne mentent pas." />
<meta property="og:site_name" content="Saint-Siège" />
<meta property="og:title" content="Saint-Siège" />
<meta property="og:description" content="Vous êtes pape. Les comptes ne mentent pas." />
<meta property="og:image" content="https://saint-siege.vercel.app/og.jpg" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Saint-Siège" />
<meta name="twitter:description" content="Vous êtes pape. Les comptes ne mentent pas." />
<meta name="twitter:image" content="https://saint-siege.vercel.app/og.jpg" />
```

`public/og.jpg` reste à produire : une capture de l'Édition du jour en 1280×720. Tant qu'elle n'existe pas, retirer les lignes `image` plutôt que de pointer vers le dépôt amont.

---

## Ce qu'il ne faut pas toucher

`theme.css` est bon : un seul jeu de jetons, aucune couleur littérale dans les composants, trois fontes distribuées par rôle, les cinq sections sur le même papier. Le bandeau photographique du Collège est le seul usage d'image du jeu et il est justifié. Le texte du Courrier (« Une lettre vaut ce que vaut votre position… ») est bien écrit.

Les points ci-dessus rendent au jeu la **mise en page** de la propal. Ils ne changent aucun de ses choix de couleur.

# Sortir du squat — analyse graphique de `fr.html`

Site analysé : https://leave-the-squat.vercel.app/fr.html (version en ligne au 20 septembre 2026).
Méthode : captures à 1280 px et 400 px, lecture du CSS, calcul des contrastes WCAG, et passage sur les grilles de trois skills d'audit récupérés sur GitHub (Anthropic `frontend-design`, Vercel `web-design-guidelines`, jezweb `design-review`).

## Impression générale

Une page sobre, bien écrite, avec une vraie hiérarchie de lecture. Le problème n'est pas la propreté : c'est que la page ressemble à n'importe quel dossier « éditorial » généré aujourd'hui (crème `#ECEAE4`, titre gras à un mot rouge brique, filets noirs, étiquettes en capitales espacées). Elle ne ressemble pas au projet, et elle ne ressemble pas au dossier imprimé (vert profond, or) qui circule en parallèle. Un lecteur qui reçoit le PDF puis ouvre le site ne voit pas la même marque.

## Ce qui marche et qu'il faut garder

- Le titre « Il ne manque que 120 personnes. » : une seule idée, en très grand, portée par Bricolage Grotesque. C'est la meilleure chose de la page.
- Les chiffres-clés sous le héros et la barre 57 / 38 / 5 % : la page prouve au lieu d'affirmer.
- Les quatre points de sortie et le tableau « risque maximal 30 000 € » : c'est ce qui rassure un prêteur, et c'est visible.
- Le texte : phrases courtes, chiffres sourcés, ton franc. Rien à retoucher.
- Contrastes : tous les couples texte/fond passent le seuil AA (le plus faible, rouge brique sur crème pour les gros chiffres, est à 4,95:1).

## Constats, par ordre d'importance

### 1. Le mur de briques est vide — le seul visuel de la page ne raconte rien
120 rectangles gris clair sur fond crème, bord gris : on lit « grille » ou « tableur », pas « mur ». Or c'est LA métaphore du projet (1 brique = 1 prêteur = 1 000 €). Il devrait être l'élément le plus fort de la page, avant même le titre.
→ Briques pleines (or), appareil réel à joints décalés, pose animée une fois au chargement, compteur qui monte à 120. Sur mobile, le mur passe sous le titre au lieu de disparaître dans un coin.

### 2. Deux identités pour un même projet
Site : rouge brique `#B23A24`, bleu `#1F3A5F`, or `#D9A441`, crème. Dossier PDF : vert nuit `#13251A`, vert `#1F4A35`, or `#E3C362`, crème. Le bleu du site n'apparaît nulle part dans le dossier ; le vert du dossier n'apparaît nulle part sur le site.
→ Aligner le site sur le dossier : le vert porte le sérieux (banque, coopérative), l'or porte la brique. Le rouge disparaît.

### 3. Tics du « design généré » qui affaiblissent la crédibilité
- Un mot rouge dans chaque titre H2 (« et après ? », « 300 € par mois », « se porte tout seul », « pas un don », « plafonné », « réponses franches ») : l'accent perd son sens quand il est systématique.
- Étiquettes en capitales espacées au-dessus de chaque section et dans le sous-titre du héros (« CASA BELGICA · COOPÉRATIVE DE LOGEMENT… · PORTÉE PAR… ») : sur mobile, trois lignes de capitales rouges avant le titre.
- Numéros « 01 / 02 / 03 / 04 » sur les conditions non négociables, qui ne sont pas une séquence.
- Tout est encadré d'un filet noir de 1,5 px : cartes de chiffres, tableaux, comparatif, mur, accordéons. Quand tout est encadré, plus rien n'est mis en avant.
→ Titres sans mot coloré. Étiquettes de section en bas-de-casse avec un simple tiret or. Numéros gardés uniquement là où il y a un ordre (années, mois, les trois demandes). Filets réservés aux tableaux.

### 4. Les chiffres sont écrits, pas dessinés
- Comparatif 565 € / 1 040 € : deux lignes de texte avec un gros chiffre. On ne voit pas que le loyer mange 58 % du revenu dans un cas et 22 % dans l'autre.
- Écart travaux 850 €/m² contre 1 100–1 800 €/m² : un paragraphe. C'est pourtant « le risque principal du projet ».
- Frise des vingt ans : quatre colonnes égales alors que les périodes durent 5, 5, 10 et « 21+ » ans.
- Quatre points de sortie : un tableau, alors que le PDF les met sur une règle 0–3–9–15–21 mois.
→ Barres à l'échelle de 1 340 €, jauge €/m² avec le curseur à 850 et la zone 1 100–1 800 hachurée, frise proportionnelle aux durées, règle des mois au-dessus de la liste.

### 5. Défauts techniques visibles
- Barre de navigation collante sans `scroll-margin-top` : en cliquant « Objections » ou « Les chiffres », le titre visé passe sous la barre (62 px).
- Nombres qui se coupent en fin de ligne (« 900 / 000 € », « 1 / 000 € ») : pas d'espace insécable.
- Sur mobile, la navigation disparaît entièrement ; il ne reste que EN et le bouton. Impossible d'aller aux objections sans faire défiler 12 000 px.
- Accordéons FAQ : cible de clic de 20 px de haut à peine sur le « + », pas d'animation d'ouverture, marqueur en texte brut.
- Aucun `prefers-reduced-motion`, aucun style de focus clavier défini (outline navigateur par défaut, invisible sur les boutons rouges).
- `theme-color` absent : la barre du navigateur mobile reste blanche au-dessus d'une page crème.

### 6. Détails typographiques
- Corps à 17 px, bon. Mais 16 tailles de police différentes en mobile (12 → 40 px) : l'échelle n'est pas tenue.
- Notes en 0,88 rem gris `#5C6066` sur crème : 5,26:1, ça passe, mais les paragraphes de 6 lignes en petit gris (contexte logement social, permis/incendie) sont là où l'œil décroche.
- Les tableaux en « card » crème sur fond crème avec cadre noir : trop de niveaux de fond pour une différence de 4 % de luminosité.

## Ce que fait la nouvelle version (`casa-belgica/fr.html`)

| Constat | Réponse |
|---|---|
| 1. Mur vide | Mur de 120 briques or en appareil décalé, pose animée, compteur, sous le titre en mobile |
| 2. Deux identités | Palette du dossier : vert nuit, vert, or, crème. Héros et appel final sur vert nuit |
| 3. Tics | Titres sans mot coloré, étiquettes bas-de-casse + tiret or, numéros seulement sur les séquences, filets réservés aux tableaux |
| 4. Chiffres | Barres du reste à vivre, jauge €/m², frise proportionnelle (5/5/10/3), règle 0–21 mois |
| 5. Technique | `scroll-margin-top`, nombres insécables, sous-navigation défilante en mobile, accordéons avec bouton rond 36 px et ouverture animée, `prefers-reduced-motion`, focus or visible, `theme-color` vert |
| 6. Typo | Échelle resserrée (Bricolage pour titres/chiffres, Instrument Sans pour le texte), notes regroupées |

Contrastes de la nouvelle version, tous ≥ 4,7:1 ; le plus faible (gris atténué sur vert de l'encart) a été éclairci.

## Ce qui reste à faire, hors de cette page

- `index.html` (version anglaise) garde l'ancien style : à aligner sur la même charte.
- Une vraie photo (façade bruxelloise, comme la page 3 du dossier) donnerait un ancrage que ni le mur ni les chiffres ne donnent. Placeholder prévu à côté du bloc « 50 chambres ».
- Le bouton « Comptez-moi parmi les 120 » ouvre un `mailto:` — un formulaire de promesse (nom, e-mail, montant) éviterait de perdre les lecteurs sans client mail configuré.

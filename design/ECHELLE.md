# Échelle et filets — proposition de la session de code à la session de design

François a la charte graphique de la session de design sous les yeux et juge le
rendu « fonctionnel, mais pas encore artistiquement bon ». Ce fichier dit
pourquoi, avec des nombres plutôt qu'avec des adjectifs, et propose le peu qui
manque. Les valeurs proposées sont marquées **à valider** : `design/tokens.json`
appartient à la session de design, et rien ici n'y a été écrit.

## Le diagnostic, en nombres

Comptage sur `src/` au commit qui précède ce fichier :

| Constat | Mesure |
|---|---|
| Corps posés depuis l'échelle | 436 |
| … dont aux deux plus petits crans (`2xs`, `xs`) | 313, soit **72 %** |
| Corps d'affichage inventés hors échelle, en `clamp()` | **7 valeurs différentes** : 2,1 / 2,2 / 2,7 / 2,8 / 2,9 / 3,0 / 4,2 rem |
| Épaisseurs de filet employées | **7** : 1, 1.5, 2, 3, 4, 6\*, 8, 9 px |

Trois choses s'en déduisent, et ce sont exactement les trois qui font qu'une
page paraît composée ou seulement remplie.

**1. L'écart de corps est trop faible.** La maquette pose le nom du journal à
environ quatre fois le corps du texte. Ici l'échelle s'arrêtait à `--oh-t-xl`,
soit deux fois — et les sept `clamp()` ont été inventés précisément pour aller
plus haut, chacun à son point d'usage, sans rapport entre eux. Résultat : sur
une même page cohabitaient 2,2 / 2,7 / 2,9 rem, trois corps que l'œil ne
distingue pas mais qui empêchent la page d'avoir un premier plan.

**2. Le blanc n'était pas organisé.** Une page de journal sépare par des filets,
pas par des marges. Il y avait bien des filets, mais leur hiérarchie était
inversée : la tête de section (`SectionHead`, 4 px) était **plus lourde** que le
bandeau de la page entière (3 px). Une section pesait donc plus que le journal.

**3. Le serif ne servait pas à lire — et c'était voulu.** `src/theme.css` définit
`--oh-font-serif` comme « la face de lecture — tout ce qui est écrit pour être lu
comme de la prose », et il n'était employé que pour des titres. J'en avais conclu
une contradiction et passé le corps des articles au serif. Le brief du
11 septembre tranche dans l'autre sens : titre en Newsreader, chapô en Newsreader
italique, **corps en Archivo 15 px sur deux colonnes**. Le serif est la face des
titres, des chapôs et des lettres ; le texte de labeur reste en Archivo. Le
commentaire de `theme.css` est donc plus large que l'intention, et c'est lui
qu'il faudrait resserrer, pas les articles.

\* le 6 px n'existait pas encore ; il est introduit ci-dessous.

## Ce qui est proposé

### L'échelle — deux marches, pas une échelle neuve

La session de design a déjà posé le pas : `1` → `1,42` → `2`, c'est-à-dire √2
deux fois. Il n'y a rien à réviser en dessous ; il manque seulement la suite du
même pas.

| Token | Valeur | **à valider** |
|---|---|---|
| `--oh-t-2xl` | `clamp(1.9rem, 3.4vw, 2.83rem)` | oui |
| `--oh-t-3xl` | `clamp(2.3rem, 5.4vw, 4rem)` | oui |

`4 rem / 1 rem = 4` : le rapport de la maquette, obtenu sans choisir un nombre,
en continuant celui qui était déjà là.

À coller dans `design/tokens.json`, section `echelle`, si la proposition tient :

```json
"--oh-t-2xl": "clamp(1.9rem, 3.4vw, 2.83rem)",
"--oh-t-3xl": "clamp(2.3rem, 5.4vw, 4rem)"
```

### Ce que chaque corps veut dire

Une échelle ne vaut que si chaque cran a un emploi et un seul. Les sept `clamp()`
ont été remplacés par ces rôles :

| Corps | Rôle | Combien par écran |
|---|---|---|
| `3xl` | **le nom de la page** — le bandeau du Bulletin, « Les Comptes », « Le Collège » | une fois, jamais deux |
| `2xl` | **la une** — l'unique texte que la page veut faire lire | une fois |
| `xl` | **un chiffre qui décide** — le solde, la date de la prochaine édition | quelques-uns |
| `md` | le titre d'une brève, un chapeau | |
| `base` | **le corps d'un article**, en serif | |
| `sm` `xs` `2xs` | légendes, petites capitales, tableaux | |

### Les filets — trois graisses, et pas une de plus

| Token | Valeur | Sens | **à valider** |
|---|---|---|---|
| `--oh-filet` | `1px` | **sépare** : colonnes, lignes, articles | oui |
| `--oh-filet-fort` | `3px` | **ferme** : tête et fin de section, marque de l'onglet actif, bord gauche d'une pièce | oui |
| `--oh-filet-manchette` | `6px` | **ouvre** : le bandeau d'une page, une seule fois par écran | oui |

À coller dans `design/tokens.json`, en nouvelle section `filet` :

```json
"filet": {
  "--oh-filet": "1px",
  "--oh-filet-fort": "3px",
  "--oh-filet-manchette": "6px"
}
```

Une quatrième épaisseur serait un filet qui ne dit rien. C'est pourquoi les
1,5 px, 2 px, 4 px, 8 px et 9 px ont disparu plutôt que d'être conservés : la
hiérarchie est rétablie, le bandeau d'une page pèse maintenant deux fois sa
tête de section.

### La couleur — un signal, pas un ornement

Rien de neuf à ajouter aux tokens ; une règle d'emploi à tenir, qui ne l'était
pas partout :

- `--oh-accent` (le bleu) ne marque que **ce que le joueur décide ou a décidé** :
  un ordre, un bouton, un onglet actif. Jamais un titre, jamais un trait de
  décoration.
- `--oh-alert` ne marque que **ce que le monde refuse**.
- `--oh-grant`, `--oh-caution` : ce qu'il accorde, ce qu'il fait payer.
- Tout le reste est de l'encre : `--oh-text`, `--oh-text-strong`,
  `--oh-text-dim`. Une page de journal est noire sur papier ; la couleur y est
  rare, et c'est ce qui la rend lisible comme un signal.

## Ce que cette proposition ne fait pas

- **Elle ne touche pas aux crans en dessous de `base`.** `2xs` `xs` `sm` sont à
  0,78 / 0,875 / 0,92 rem, trois corps presque identiques — c'est la convention
  du journal (un texte de labeur varie peu) mais c'est aussi ce qui explique les
  72 % ci-dessus. Si la session de design veut les écarter, c'est sa décision et
  elle se prend dans `tokens.json` ; le code suivra.
- **Elle ne renomme pas les 283 `1px solid` littéraux** restants en
  `var(--oh-filet)`. La valeur est la même, le rendu identique : ce serait un
  renommage sans effet visible, qui mérite son propre commit plutôt que de
  gonfler celui-ci.
- **Elle ne touche pas au Conseiller**, qui n'a pas encore été repris d'après la
  maquette (note de cabinet numérotée, situation en trois points, ordres proposés
  avec des boutons « Verser »).
- **Les tableaux des Caisses n'ont toujours pas été vus remplis.** Une partie
  neuve n'ouvre aucune bourse : il faudrait jouer plusieurs tours pour qu'une
  ligne y tombe, et le parcours de capture s'arrête au premier. Ce que
  `design/rendu/` montre de ce cahier est donc son état vide, qui est un état
  réel — pas une limite de la capture.

## Ce que le brief du 11 septembre a ajouté

La session de design a écrit un brief après avoir lu les captures. Il confirme le
diagnostic n° 1 dans ses propres termes — « aujourd'hui le rapport de taille
entre le plus grand et le plus petit texte de la colonne est d'environ 1,2 ; dans
la propal il est de 4 » — et les deux marches proposées ici donnent exactement ce
rapport. Ses valeurs en pixels tombent sur l'échelle sans qu'on les y force :
titre d'article 46 px ≈ `2xl` (2,83 rem), chapô 19 px ≈ `md`, corps 15 px ≈ `sm`.

Il demande aussi un filet de 4 px pour annoncer un verdict. C'est la seule
épaisseur du brief qui sorte des trois ci-dessus ; elle est rendue par
`--oh-filet-fort` (3 px), qui tient le même rôle. Si la session de design juge
que 3 px ne suffit pas à annoncer, c'est la valeur du token qu'il faut changer,
une fois, et non rouvrir une quatrième graisse.

Un point du brief reste sans réponse : il renvoie à six maquettes dans
`reference/`, dont `1-edition-du-jour.html` et `6-la-une-complete.html`. **Ce
dossier n'existe pas dans le dépôt** — ni sur `main`, ni dans l'historique. Le
travail a donc été fait d'après les valeurs écrites dans le brief lui-même, qui
sont assez précises pour cela. Committer `reference/` rendrait la prochaine passe
plus sûre.

## Où cela vit aujourd'hui

Les cinq tokens proposés sont déclarés dans le bloc `:root` de `src/theme.css`
avec un commentaire qui renvoie ici. `npm run tokens:check` ne s'en plaint pas :
il vérifie que les tokens de `tokens.json` sont conformes, pas que `theme.css`
n'en déclare aucun autre. Le jour où la session de design les reprend dans
`tokens.json`, `npm run tokens:sync` en devient la source et il n'y a rien à
changer dans les composants.

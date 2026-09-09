<!-- Saint-Siège — a Holy See edition of Open Historia, MIT (see LICENSE and src/Editor/LICENSE). -->

# Saint-Siège

**Vous êtes le pape.** Pas d'armée, pas de territoire à conquérir, pas de
frontière à défendre : un demi-kilomètre carré, un milliard et demi de baptisés,
une Curie qui vous survivra, et des comptes qui ne mentent pas.

Le jeu se lit comme un journal. Chaque tour imprime une édition : ce qui est
arrivé dans le monde, ce que vos ordres ont réellement produit, et ce que les
chiffres ont fait. Vous écrivez aux courants qui traversent l'Église, vous
parlez au collège des cardinaux et des évêques, et tout se mesure dans un
registre que le moteur remplit lui-même.

## Ce qui distingue cette édition

Le moteur ne se contente pas de raconter : il lit vos ordres et déplace l'état.

- **Le registre est non narratif.** Une ligne n'y apparaît que si un stock a
  réellement bougé. Une édition qui annonce une réforme dont le registre ne
  porte pas la trace est démentie par la page elle-même.
- **Les caisses sont réelles.** Un organisme a du capital, un rendement, un
  fonds de campagne, et reverse ce qui dépasse. Une promesse faite par un corps
  qui ne possède rien ne coûte rien à personne, et les chiffres le disent.
- **Le collège compte.** Cent soixante électeurs, chacun sur quatre axes à la
  fois : doctrine, région, fonction, et le courant qu'il suit. Les coalitions
  sont calculées à partir de la question posée, jamais stockées — on emporte la
  réforme de la Curie et on se casse les dents sur la doctrine, avec les mêmes
  cent soixante personnes.
- **Personne ne commence contre vous.** Chaque opinion part de zéro et se gagne
  ou se perd sur les chiffres. Si le collège se retourne, la date et la raison
  sont au dossier.
- **Les foules sont calculées.** Un rassemblement a un plafond de gens
  atteignables, un coût par tête, des recettes, et un renouveau de la foi que le
  registre des fidèles enregistre.

## Jouer

1. Téléchargez `Saint-Siege-Setup.exe` dans les *releases* et installez-le.
   L'exécutable n'est pas signé : Windows affichera un avertissement au premier
   lancement. Cliquez sur « Informations complémentaires », puis sur
   « Exécuter quand même ».
2. Au premier démarrage, le jeu demande une clé d'API. Le monde est écrit par un
   modèle de langage au fil de la partie : les éditions, les lettres, les
   réponses de vos rivaux. Google en donne une gratuitement sur
   [aistudio.google.com/apikey](https://aistudio.google.com/apikey). Elle reste
   sur votre machine.
3. Sans clé, le jeu tourne quand même, mais chaque édition est écrite par un
   simulateur hors-ligne qui ne juge aucun ordre et ne déplace aucun argent. La
   page vous le dit en tête d'édition, dans votre langue.

Aucune carte n'est téléchargée : cette édition se joue dans son journal.

## Compiler soi-même

```
npm install
npm run dev        # le jeu, avec le serveur de données sur le port 3000
npm test           # la suite complète
npm run dist:win   # l'installateur Windows
```

L'atlas est débranché par un interrupteur unique dans `src/runtime/edition.js`.
Le remettre à `true` rend la carte, l'onglet et le téléchargement des tuiles.

## Origine et licence

Ce dépôt est un **travail dérivé d'[Open Historia](https://github.com/Open-Historia/open-historia)**,
un jeu de grande stratégie en source ouverte. Tout le moteur vient de là. Le
README d'origine est conservé sous [`README.upstream.md`](README.upstream.md).

Sous licence MIT, comme le projet dont il dérive :

- Copyright (c) 2026 the Open-Historia Organization — voir [`LICENSE`](LICENSE) ;
- Copyright (c) 2026 Nicholas Krol pour les parties couvertes par
  [`src/Editor/LICENSE`](src/Editor/LICENSE), vers lequel pointe l'en-tête de la
  plupart des fichiers source.

Les deux notices sont conservées telles quelles, comme la licence l'exige. Les
ajouts propres à cette édition sont publiés sous la même licence.

Les photographies viennent de Wikimedia Commons sous licence Creative Commons,
avec leurs auteurs et leurs licences détaillés dans
[`public/CREDITS.md`](public/CREDITS.md). La géométrie de l'enclave du Vatican
provient d'OpenStreetMap (relation 36989), © les contributeurs d'OpenStreetMap,
sous licence [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).

# Comment lire ce dossier

Six fichiers HTML, un par écran. **Ouvre-les dans un navigateur** : chacun affiche d'abord une fiche (quel composant React modifier, quelles données brancher), puis la maquette réelle en dessous.

C'est le pont entre la propal et le code : le markup est réel, les valeurs sont exactes, il n'y a rien à interpréter.

| Fichier | Écran | Composant à modifier |
| --- | --- | --- |
| `1-edition-du-jour.html` | Page principale + barre commune | `bulletin.jsx` + nouvelle barre dans `main.jsx` |
| `2-bouton-tour-suivant.html` | Les trois états du bouton de tour | `time.jsx` (remplace `DateWidget`) |
| `3-conseiller.html` | Note de cabinet | `advisor.jsx` — page pleine, plus un tiroir |
| `4-les-comptes.html` | Cahier financier | `economyPanel.jsx` — à refaire de zéro |
| `5-le-courrier.html` | Fil de correspondance | `correspondence.jsx` |
| `6-la-une-complete.html` | La une complète | référence de composition |

## Comment s'en servir

**Ouvre le fichier à côté de ton éditeur.** Prends les valeurs directement dans le markup : tailles, graisses, interlettrages, épaisseurs de filet, couleurs. Ne les réinvente pas — elles sont le résultat des arbitrages de la propal.

**Les chiffres sont faux, le format est vrai.** « 47,1 M$ », « 62 sur 81 », « Mgr Aurelio Vance » sont du remplissage. Ce qui compte est qu'un montant soit tabulaire et aligné à droite, qu'un verdict porte sa raison chiffrée, que le conseiller ait un nom.

**Remplace les couleurs littérales par les jetons de `theme.css`** en portant le markup :

| Maquette | Jeton |
| --- | --- |
| `#f4f0e6` | `var(--oh-plate)` |
| `#14161a` | `var(--oh-line)` / `var(--oh-text-strong)` |
| `#2a2d33` | `var(--oh-text)` |
| `#4f535b` | `var(--oh-text-dim)` |
| `#1f3f86` | `var(--oh-accent)` |
| `#b8291d` | `var(--oh-alert)` |
| `#17643f` | `var(--oh-grant)` |
| `#7f4705` | `var(--oh-caution)` |

Les fontes de même : `Newsreader` → `var(--oh-font-serif)`, `Archivo` → `var(--oh-font-body)`, `Bricolage Grotesque` → `var(--oh-font-display)`.

## L'ordre de construction

1. **La barre commune** (`1-edition-du-jour.html`, en haut de la maquette) — elle touche toutes les pages et rend au « Tour suivant » son statut d'action principale.
2. **L'Édition du jour** — page d'accueil, et celle qui porte le sujet du jeu.
3. **Le Conseiller**, **les Comptes**, **le Courrier**.
4. Le nettoyage listé dans `../CORRECTIFS-GRAPHIQUES.md`, partie II — **jamais avant** : repeindre des écrans qu'on va reconstruire est du travail perdu.

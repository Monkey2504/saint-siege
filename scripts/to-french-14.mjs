// Quatorzième passe : le banc d'essai, de bout en bout.
//
// François vient de demander qu'on le lui rende accessible ; il n'est pas dit
// qu'il doive le rouvrir en anglais. Les treize sections, leurs sous-titres,
// leurs champs et leurs boutons.
//
// Ce qui NE bouge pas : les identifiants de sections (« master-ai »,
// « annex-country »…), qui sont des clés du code, et « Alexandria », un exemple
// de nom de ville.

import fs from "node:fs";
import path from "node:path";

const C = "src/Game/GameUI/cheats.jsx";

const EDITS = [
  // ── Les treize sections ──────────────────────────────────────────────────
  [C, 'title: "Master AI", subtitle: "Full control over the game with AI assistance"',
      'title: "Maître du jeu", subtitle: "La main sur toute la partie, avec le modèle pour l\'exécuter"'],
  [C, 'title: "Roll Back Turn", subtitle: "Restore the game to the start of an earlier turn"',
      'title: "Revenir en arrière", subtitle: "Rendre la partie à l\'état du début d\'un tour passé"'],
  [C, 'title: "Your Country", subtitle: "Change which country you\'re playing as"',
      'title: "Votre puissance", subtitle: "Changer celle que vous jouez"'],
  [C, 'title: "Difficulty", subtitle: "Adjust the game difficulty level"',
      'title: "Difficulté", subtitle: "Régler le tempérament de la partie"'],
  [C, 'title: "Annex Country", subtitle: "Click a country to annex it into another"',
      'title: "Annexer un pays", subtitle: "Cliquez un pays pour l\'annexer à un autre"'],
  [C, 'title: "Annex Regions", subtitle: "Click individual regions to transfer them to a country"',
      'title: "Annexer des régions", subtitle: "Cliquez des régions une à une pour les transférer"'],
  [C, 'title: "Edit Country", subtitle: "Modify existing country properties"',
      'title: "Modifier un pays", subtitle: "Changer les propriétés d\'un pays existant"'],
  [C, 'title: "Add Country", subtitle: "Create a new country on the map"',
      'title: "Ajouter un pays", subtitle: "Créer un pays sur la carte"'],
  [C, 'title: "Regions", subtitle: "Edit region names, tags, and properties"',
      'title: "Régions", subtitle: "Modifier les noms, les étiquettes et les propriétés"'],
  [C, 'title: "Edit Map Feature", subtitle: "Edit existing map features like cities and landmarks"',
      'title: "Modifier un repère", subtitle: "Changer un repère de la carte — une ville, un monument"'],
  [C, 'title: "Add Map Feature", subtitle: "Create new map features with custom properties"',
      'title: "Ajouter un repère", subtitle: "Poser un repère sur la carte, avec ses propriétés"'],
  [C, 'title: "Clear Map Features", subtitle: "Clean up old and irrelevant features"',
      'title: "Effacer les repères", subtitle: "Faire le ménage dans les repères devenus inutiles"'],
  [C, 'title: "Events", subtitle: "Edit historical events and their descriptions"',
      'title: "Événements", subtitle: "Modifier des événements et leurs descriptions"'],

  // ── Les champs ───────────────────────────────────────────────────────────
  [C, ">Command<", ">Ordre<"],
  [C, ">Loading restore points…<", ">Lecture des points de reprise…<"],
  [C, ">Roll back<", ">Revenir ici<"],
  [C, ">New country<", ">Nouvelle puissance<"],
  [C, ">Annex into<", ">Annexer à<"],
  [C, ">Country<", ">Pays<"],
  [C, ">Owner<", ">Propriétaire<"],
  [C, ">Title<", ">Titre<"],
  [C, ">Date<", ">Date<"],
  [C, ">Description<", ">Description<"],
  [C, ">Name<", ">Nom<"],

  // ── Les espaces réservés ─────────────────────────────────────────────────
  [C, 'placeholder="Pick the new owner…"', 'placeholder="Choisissez le nouveau propriétaire…"'],
  [C, 'placeholder="Unclaimed"', 'placeholder="Sans propriétaire"'],
  [C, 'placeholder="Search features…"', 'placeholder="Chercher un repère…"'],
  [C, 'placeholder="Search events…"', 'placeholder="Chercher un événement…"'],

  // ── Les boutons et les explications ──────────────────────────────────────
  [C, "            The AI interprets the command, applies its impacts to the map and countries, and records it as a game-master event.",
      "            Le modèle interprète l'ordre, en applique les effets à la carte et aux pays, et l'inscrit comme un événement du maître du jeu."],
  [C, "            Restore the game to how it was at the start of an earlier turn. This permanently discards every turn played after the one you pick.",
      "            Rend la partie à l'état du début d'un tour passé. Tous les tours joués après celui que vous choisissez sont définitivement perdus."],
  [C, "                No restore points yet — one is captured automatically at the start of each turn. Play a turn, then come back.",
      "                Aucun point de reprise — il s'en prend un tout seul au début de chaque tour. Jouez un tour, puis revenez."],
  [C, "            Currently playing: <strong>{nameOf(game?.country)}</strong>",
      "            Vous jouez actuellement : <strong>{nameOf(game?.country)}</strong>"],
  [C, "            Switch country\n", "            Changer de puissance\n"],
  [C, "            Start clicking the map\n", "            Cliquer sur la carte\n"],
  [C, "            The map repaints ownership within ~5 seconds of each change.",
      "            La carte repeint les appartenances dans les cinq secondes qui suivent chaque changement."],
  [C, "            Pick a region on the map\n", "            Choisissez une région sur la carte\n"],
  [C, "                Save region\n", "                Enregistrer la région\n"],
  [C, "                This map has no custom features yet — use Add Map Feature.",
      "                Cette carte n'a encore aucun repère propre — passez par « Ajouter un repère »."],
  [C, "                        Save feature\n", "                        Enregistrer le repère\n"],
  [C, "            Place on map\n", "            Poser sur la carte\n"],
  [C, "            On maps that still use the standard world cities, adding the first custom feature switches the map to custom features only.",
      "            Sur une carte qui se sert encore des villes du monde par défaut, le premier repère ajouté fait basculer la carte sur ses seuls repères propres."],
  [C, '            This map currently has <strong>{count}</strong> custom feature{count === 1 ? "" : "s"}.',
      '            Cette carte porte <strong>{count}</strong> repère{count === 1 ? "" : "s"} qui lui {count === 1 ? "est propre" : "sont propres"}.'],
  [C, "            Delete all custom features\n", "            Effacer tous les repères propres\n"],
  [C, "            Use the standard world cities instead\n", "            Revenir aux villes du monde par défaut\n"],
  [C, "                        Save event\n", "                        Enregistrer l'événement\n"],
];

let echecs = 0;
const touches = new Set();
for (const [fichier, avant, apres] of EDITS) {
  const chemin = path.resolve(fichier);
  const source = fs.readFileSync(chemin, "utf8");
  if (!source.includes(avant)) { console.error(`ABSENT  ${fichier} :: ${avant.slice(0, 70)}`); echecs++; continue; }
  fs.writeFileSync(chemin, source.split(avant).join(apres));
  touches.add(fichier);
}
console.log(`${EDITS.length - echecs}/${EDITS.length} remplacements dans ${touches.size} fichier(s).`);
if (echecs) process.exit(1);

// Les messages d'état du banc d'essai, ajoutés après coup : ils s'affichent
// sous le panneau, en réponse à ce que le joueur vient de faire.
const ETATS = [
  [C, 'setStatus(`Failed to load game data: ${error.message}`);', 'setStatus(`Lecture de la partie impossible : ${error.message}`);'],
  [C, 'setStatus(`Failed: ${error.message}`);', 'setStatus(`Échec : ${error.message}`);'],
  [C, 'setStatus(`${nameOf(source)} annexed into ${nameOf(owner)} (${count} regions). The map updates within a few seconds.`);',
      'setStatus(`${nameOf(source)} annexé à ${nameOf(owner)} (${count} régions). La carte suit dans quelques secondes.`);'],
  [C, 'setStatus(`${props.NAME_1 || props.GID_1} → ${nameOf(owner)}. Keep clicking, or press Done.`);',
      'setStatus(`${props.NAME_1 || props.GID_1} → ${nameOf(owner)}. Continuez à cliquer, ou appuyez sur Terminé.`);'],
  [C, 'notes.push("name unchanged — stock-map region names come from the map tiles and can\'t be renamed");',
      'notes.push("nom inchangé — les noms de régions d\'une carte standard viennent des tuiles et ne se renomment pas");'],
  [C, 'setStatus(`${name} placed. The map picks it up within a few seconds.`);',
      'setStatus(`${name} posé. La carte le reprend dans quelques secondes.`);'],
];
let e2 = 0;
for (const [fichier, avant, apres] of ETATS) {
  const chemin = path.resolve(fichier);
  const source = fs.readFileSync(chemin, "utf8");
  if (!source.includes(avant)) { console.error(`ABSENT  ${fichier} :: ${avant.slice(0, 70)}`); e2++; continue; }
  fs.writeFileSync(chemin, source.split(avant).join(apres));
}
console.log(`${ETATS.length - e2}/${ETATS.length} messages d'état.`);
if (e2) process.exit(1);

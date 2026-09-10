// Troisième passe : ce que le rendu réel montrait encore en anglais — le pupitre
// d'ordres, le reste du bulletin, et le panneau du tour.
//
// Trouvé en lisant document.body.innerText dans la page, pas en relisant les
// sources : l'extracteur statique rate tout ce qui est composé à l'exécution.

import fs from "node:fs";
import path from "node:path";

const EDITS = [
  // ── Le pupitre d'ordres ───────────────────────────────────────────────────
  ["src/Game/GameUI/actions.jsx", ">Orders</span>", ">Ordres</span>"],
  ["src/Game/GameUI/actions.jsx", ">Actions</span>", ">Ordres</span>"],
  ["src/Game/GameUI/actions.jsx", "        Your Submitted Actions\n", "        Vos ordres versés au dossier\n"],
  ["src/Game/GameUI/actions.jsx", "            No order standing yet. Write one below; the verdict appears the moment it is queued.", "            Aucun ordre en cours. Écrivez-en un ci-dessous : le verdict paraît dès qu'il est versé au dossier."],
  ["src/Game/GameUI/actions.jsx", "        Help brainstorm actions\n", "        M'aider à trouver des idées\n"],
  ["src/Game/GameUI/actions.jsx", '? "Loading AI suggestions..." : "Get AI suggestions")', '? "Suggestions en cours…" : "Demander des suggestions")'],
  ["src/Game/GameUI/actions.jsx", '>Choice to make</span>', '>Choix à faire</span>'],
  ["src/Game/GameUI/actions.jsx", 'title="Delete action"', 'title="Supprimer l\'ordre"'],
  ["src/Game/GameUI/actions.jsx", '"Queued — click to withdraw this order"', '"Versé au dossier — cliquez pour le retirer"'],
  ["src/Game/GameUI/actions.jsx", '"Queue this order"', '"Verser cet ordre au dossier"'],
  ["src/Game/GameUI/actions.jsx", '"Click again to withdraw"', '"Cliquez encore pour retirer"'],
  ["src/Game/GameUI/actions.jsx", '"Stop generating" : "Improve action text"', '"Arrêter" : "Améliorer le texte de l\'ordre"'],
  ["src/Game/GameUI/actions.jsx", '"Give an order… (Shift+Enter for a new line)"', '"Donnez un ordre… (Maj+Entrée pour une nouvelle ligne)"'],
  ["src/Game/GameUI/actions.jsx", '"Enter your action…  (Shift+Enter for a new line)"', '"Écrivez votre ordre…  (Maj+Entrée pour une nouvelle ligne)"'],

  // ── Le reste du bulletin ──────────────────────────────────────────────────
  ["src/Game/GameUI/bulletin.jsx", "            The presses wait: the pope takes a name and declares his programme before the first edition prints.", "            Les presses attendent : le pape prend un nom et déclare son programme avant que la première édition sorte."],
  ["src/Game/GameUI/bulletin.jsx", "        Written by the engine, never by the stories: a line appears here only when a stock actually moved.", "        Écrit par le moteur, jamais par les récits : une ligne ne paraît ici que si un stock a réellement bougé."],
  ["src/Game/GameUI/bulletin.jsx", "        Nothing has moved. Whatever the editions have said about money arriving, the stocks are where they started.", "        Rien n'a bougé. Quoi que les éditions aient dit d'argent qui arrive, les stocks sont là où ils étaient."],
  ["src/Game/GameUI/bulletin.jsx", "balance of the year", "solde de l'année"],
  ["src/Game/GameUI/bulletin.jsx", "of patrimony left", "de patrimoine restant"],
  ["src/Game/GameUI/bulletin.jsx", "`from ${fmtDate(from)}`", "`depuis le ${fmtDate(from)}`"],

  // ── Le panneau du tour ────────────────────────────────────────────────────
  ["src/Game/GameUI/time.jsx", "Orders this jump resolves", "Ordres que ce tour règle"],
  ["src/Game/GameUI/time.jsx", "Nothing is queued: this jump advances the world alone.", "Rien au dossier : ce tour fait avancer le monde seul."],
  ["src/Game/GameUI/time.jsx", "No event chain is available yet.", "Aucune suite d'événements n'est disponible."],
];

let changed = 0;
const missing = [];

for (const [file, from, to] of EDITS) {
  const full = path.resolve(file);
  const before = fs.readFileSync(full, "utf8");
  if (!before.includes(from)) { missing.push(`${file}: ${from.slice(0, 72)}`); continue; }
  changed += before.split(from).length - 1;
  fs.writeFileSync(full, before.split(from).join(to));
}

console.log(`${changed} remplacement(s) sur ${EDITS.length} paires.`);
if (missing.length) {
  console.log(`\nNON TROUVÉES (${missing.length}) :`);
  for (const m of missing) console.log(`  ${m}`);
}

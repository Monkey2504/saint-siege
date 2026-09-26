// Huitième passe : les lignes de registre qui interpolent un nom.
//
// La septième n'a pris que les phrases fixes. Celles-ci se construisent —
// « received from Une Seule Église », « endowed by Saint-Siège », « faith
// renewed by les JMJ » — et échappaient donc à une table de phrases entières.
//
// Même réserve : ces phrases sont recopiées dans world.record. La table
// d'affichage (GameUI/journal.jsx) porte pour elles des motifs plutôt que des
// clés, puisqu'il est impossible d'énumérer les noms d'organismes.

import fs from "node:fs";
import path from "node:path";

const EDITS = [
  ["src/runtime/treasuries.js", 'what: `kept ${child} open`', 'what: `a maintenu ${child} ouverte`'],
  ["src/runtime/treasuries.js", 'what: `distributed to ${Object.keys(shares).length} members`', 'what: `reversé à ${Object.keys(shares).length} membres`'],
  ["src/runtime/treasuries.js", 'what: `endowed ${move.body}`', 'what: `a doté ${move.body}`'],
  ["src/runtime/treasuries.js", 'what: `endowed by ${move.from}`', 'what: `dotée par ${move.from}`'],
  ["src/runtime/liabilities.js", 'what: `assumed an unfunded promise from ${player}`', 'what: `a repris une promesse non financée du ${player}`'],
  ["src/runtime/liabilities.js", 'what: `unfunded promises carried by ${carrier.body}`', 'what: `promesses non financées portées par ${carrier.body}`'],
  ["src/runtime/gatherings.js", 'what: `faith renewed by ${g.name}`', 'what: `foi ravivée par ${g.name}`'],
  ["src/runtime/gatherings.js", 'what: `faith renewed by its world gatherings`', 'what: `foi ravivée par ses rassemblements mondiaux`'],
  ["src/runtime/organizations.js", 'what: `founded ${name}`', 'what: `a fondé ${name}`'],
];

let echecs = 0;
const touches = new Set();
for (const [fichier, avant, apres] of EDITS) {
  const chemin = path.resolve(fichier);
  const source = fs.readFileSync(chemin, "utf8");
  const n = source.split(avant).length - 1;
  if (n === 0) { console.error(`ABSENT  ${fichier} :: ${avant.slice(0, 70)}`); echecs++; continue; }
  if (n > 1)   { console.error(`AMBIGU  ${fichier} (${n}×) :: ${avant.slice(0, 70)}`); echecs++; continue; }
  fs.writeFileSync(chemin, source.replace(avant, apres));
  touches.add(fichier);
}
console.log(`${EDITS.length - echecs}/${EDITS.length} remplacements dans ${touches.size} fichier(s).`);
if (echecs) process.exit(1);

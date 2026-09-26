// Neuvième passe, et la fin du registre : ce qui restait d'anglais dans les
// lignes construites — les mouvements de caisse entre membres, les plans
// permanents, le taux d'imposition et la façon de couvrir un déficit.
//
// Comme les deux passes précédentes : ces phrases sont recopiées dans
// world.record, la table d'affichage de GameUI/journal.jsx couvre les parties
// déjà commencées, et `source` reste une clé.

import fs from "node:fs";
import path from "node:path";

const EDITS = [
  // ── Les rassemblements ───────────────────────────────────────────────────
  ["src/runtime/gatherings.js", 'note: `Faith renewed by ${g.name}`', 'note: `Foi ravivée par ${g.name}`', 2],

  // ── Les caisses ──────────────────────────────────────────────────────────
  ["src/runtime/treasuries.js", 'what: `received from ${t.body}`', 'what: `reçu de ${t.body}`', 2],

  // ── Les promesses non financées ──────────────────────────────────────────
  ["src/runtime/liabilities.js",
    'what: `unfunded promises repriced by ${Math.round(share * 1000) / 10}%`',
    'what: `promesses non financées révisées de ${String(Math.round(share * 1000) / 10).replace(".", ",")}\\u202f%`', 1],

  // ── Les plans permanents ─────────────────────────────────────────────────
  ["src/runtime/intents.js",
    'const stanceWord = (it) => (it.stance === "hostile" ? "against" : it.stance === "supportive" ? "for" : "toward");',
    'const stanceWord = (it) => (it.stance === "hostile" ? "contre" : it.stance === "supportive" ? "pour" : "envers");', 1],
  ["src/runtime/intents.js", 'what: `pressed a standing plan on${aimedAt(after)}: ${short(after.summary, 90)}`',
    'what: `a poussé un plan permanent${aimedAt(after)} : ${short(after.summary, 90)}`', 1],
  ["src/runtime/intents.js", 'what: `abandoned a standing plan at stage ${before.stage}: ${short(after.summary, 90)}`',
    'what: `a abandonné un plan permanent au stade ${before.stage} : ${short(after.summary, 90)}`', 1],
  ["src/runtime/intents.js", 'what: `its secret plan${aimedAt(after)} is in the open at stage ${after.stage}: ${short(after.summary, 90)}`',
    'what: `son plan secret${aimedAt(after)} est au grand jour au stade ${after.stage} : ${short(after.summary, 90)}`', 1],
  ["src/runtime/intents.js", "what: `published ${after.owner}'s scheme`", 'what: `a rendu public le chantier de ${after.owner}`', 1],

  // ── L'impôt et la couverture d'un déficit ────────────────────────────────
  ["src/runtime/economyBridge.js", 'what: `tax rate moved from ${pct(before)} to ${pct(next.taxRate)}`',
    'what: `taux d\'imposition porté de ${pct(before)} à ${pct(next.taxRate)}`', 1],
  ["src/runtime/economyBridge.js", 'what: `deficits are now covered by ${FINANCING_WORDS[mode]}`',
    'what: `les déficits sont désormais couverts par ${FINANCING_WORDS[mode]}`', 1],
  ["src/runtime/economyBridge.js",
    'const FINANCING_WORDS = {\n  borrow: "borrowing",\n  print: "creating new money",\n  austerity: "austerity, cutting spending to what is collected",\n  drawdown: "eating the patrimony",\n};',
    'const FINANCING_WORDS = {\n  borrow: "l\'emprunt",\n  print: "la création de monnaie",\n  austerity: "l\'austérité, en ramenant la dépense à ce qui est encaissé",\n  drawdown: "la ponction sur le patrimoine",\n};', 1],
];

let echecs = 0;
const touches = new Set();
for (const [fichier, avant, apres, attendu] of EDITS) {
  const chemin = path.resolve(fichier);
  const source = fs.readFileSync(chemin, "utf8");
  const n = source.split(avant).length - 1;
  if (n !== attendu) { console.error(`${n === 0 ? "ABSENT" : "COMPTE"}  ${fichier} (${n} ≠ ${attendu}) :: ${avant.slice(0, 60)}`); echecs++; continue; }
  fs.writeFileSync(chemin, source.split(avant).join(apres));
  touches.add(fichier);
}
console.log(`${EDITS.length - echecs}/${EDITS.length} remplacements dans ${touches.size} fichier(s).`);
if (echecs) process.exit(1);

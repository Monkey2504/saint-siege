// Septième passe : les lignes que le moteur écrit AU REGISTRE, et les raisons
// qu'il donne aux mouvements du collège.
//
// La capture du joueur montrait, dans la colonne du registre : « legacies and
// unsolicited gifts », « budget shortfall over the period », « approves of how
// you are governing ». Ce ne sont ni des invites ni des clés : ce sont des
// phrases écrites pour être lues dans la colonne de droite de l'édition.
//
// Deux réserves, à connaître avant de relire ceci :
//
// 1. `what` et `reason` sont RECOPIÉS dans l'état enregistré (world.record).
//    Traduire la source ne francise que les lignes à venir ; les parties déjà
//    jouées gardent les leurs en anglais. Une table d'affichage s'en charge
//    (GameUI/journal.jsx, LIGNE_DE_REGISTRE), et c'est pourquoi les deux
//    doivent rester d'accord : une phrase changée ici sans l'être là-bas laisse
//    une ligne anglaise dans les vieilles parties.
// 2. `source` (« step:bequests », « order:dissolve ») n'est PAS traduit : c'est
//    la clé qui dit d'où vient la ligne, et rien ne l'affiche.

import fs from "node:fs";
import path from "node:path";

const EDITS = [
  // ── Ce que le pas du moteur écrit au registre ────────────────────────────
  ["src/Game/AI/gameplay.js", 'what: "legacies and unsolicited gifts"', 'what: "legs et dons non sollicités"'],
  ["src/Game/AI/gameplay.js", 'what: Number(flow.balance) < 0 ? "budget shortfall over the period" : "budget surplus over the period"', 'what: Number(flow.balance) < 0 ? "déficit du budget sur la période" : "excédent du budget sur la période"'],
  ["src/Game/AI/gameplay.js", 'what: "patrimony sold to pay the bills"', 'what: "patrimoine vendu pour payer les factures"'],
  ["src/Game/AI/gameplay.js", 'what: "borrowed"', 'what: "emprunté"'],

  // ── Les prêts et les campagnes ───────────────────────────────────────────
  ["src/runtime/gameState.js", 'what: "loan received"', 'what: "prêt reçu"'],
  ["src/runtime/gameState.js", 'what: "loan paid out"', 'what: "prêt versé"'],
  ["src/runtime/gameState.js", 'what: "collected on a drive"', 'what: "collecté par une campagne"'],

  // ── Les rassemblements ───────────────────────────────────────────────────
  ["src/runtime/gatherings.js", 'what: "faith renewed by its national gatherings"', 'what: "foi ravivée par ses rassemblements nationaux"'],

  // ── Les promesses non financées ──────────────────────────────────────────
  ["src/runtime/liabilities.js", 'what: "capital set aside against an unfunded promise"', 'what: "capital mis de côté contre une promesse non financée"'],
  ["src/runtime/liabilities.js", 'what: "unfunded promises covered"', 'what: "promesses non financées couvertes"'],
  ["src/runtime/liabilities.js", 'what: "terms rewritten on people already promised"', 'what: "conditions réécrites sur des gens à qui l\'on avait déjà promis"'],

  // ── Les caisses ──────────────────────────────────────────────────────────
  ["src/runtime/treasuries.js", 'what: "return on its placed capital"', 'what: "rendement de son capital placé"'],
  ["src/runtime/treasuries.js", 'what: "its assumed promise consumed what that capital earned"', 'what: "la promesse qu\'elle a reprise a mangé ce que ce capital rapportait"'],
  ["src/runtime/treasuries.js", 'what: "running costs met"', 'what: "frais de fonctionnement couverts"'],
  ["src/runtime/treasuries.js", 'what: "short of its running costs"', 'what: "à court pour ses frais de fonctionnement"'],
  ["src/runtime/treasuries.js", 'what: "cash placed as capital"', 'what: "liquidités placées en capital"'],

  // ── Un corps dissous ─────────────────────────────────────────────────────
  ["src/runtime/organizations.js", 'what: "dissolved"', 'what: "dissous"'],

  // ── Pourquoi le collège a bougé ──────────────────────────────────────────
  ["src/runtime/factions.js",
    'reason: moved > 0 ? "approves of how you are governing" : "disapproves of how you are governing",',
    'reason: moved > 0 ? "approuve votre façon de gouverner" : "désapprouve votre façon de gouverner",'],
  ["src/runtime/factions.js",
    'reason: moved > 0 ? "was talked round by those already with you" : "was talked round by those already against you",',
    'reason: moved > 0 ? "a été retourné par ceux qui vous sont déjà acquis" : "a été retourné par ceux qui vous sont déjà contraires",'],
  ["src/runtime/factions.js",
    'rows: [{ date, axis: "", group: "the whole room", seats: a.seats, step, reason: `${stale.length} scheme${stale.length === 1 ? "" : "s"} against you ran a year and produced nothing` }],',
    'rows: [{ date, axis: "", group: "toute la salle", seats: a.seats, step, reason: `${stale.length} chantier${stale.length === 1 ? "" : "s"} contre vous ${stale.length === 1 ? "a tourné" : "ont tourné"} un an sans rien produire` }],'],
];

let echecs = 0;
const touches = new Set();
for (const [fichier, avant, apres] of EDITS) {
  const chemin = path.resolve(fichier);
  if (!fs.existsSync(chemin)) { console.error(`MANQUE  ${fichier}`); echecs++; continue; }
  const source = fs.readFileSync(chemin, "utf8");
  const n = source.split(avant).length - 1;
  if (n === 0) { console.error(`ABSENT  ${fichier} :: ${avant.slice(0, 70)}`); echecs++; continue; }
  if (n > 1)   { console.error(`AMBIGU  ${fichier} (${n}×) :: ${avant.slice(0, 70)}`); echecs++; continue; }
  fs.writeFileSync(chemin, source.replace(avant, apres));
  touches.add(fichier);
}

console.log(`${EDITS.length - echecs}/${EDITS.length} remplacements appliqués dans ${touches.size} fichier(s).`);
if (echecs) { console.error(`${echecs} paire(s) sans correspondance — rien n'est deviné, corrigez la table.`); process.exit(1); }

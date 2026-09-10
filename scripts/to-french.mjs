// La copie de l'interface, en français, dans les mots que la consigne fixe.
//
// Consigne d'implémentation §1 : traduire EN DUR dans les composants, jamais via
// le traducteur d'exécution — il lui faut un modèle, et le joueur sans clé est
// justement celui qui lit l'écran. Publié sur Vercel, le jeu s'ouvrait à moitié
// en anglais.
//
// Écrit comme un script à TABLE explicite, et non comme une expression
// régulière : une regex lâchée sur du code finit toujours par remplacer un mot
// à l'intérieur d'un identifiant, d'un commentaire ou d'une URL. Chaque paire
// ci-dessous est un fragment de ligne complet et unique ; une paire qui ne
// trouve rien est signalée, jamais passée sous silence.

import fs from "node:fs";
import path from "node:path";

const EDITS = [
  // ── Le bulletin ───────────────────────────────────────────────────────────
  ["src/Game/GameUI/bulletin.jsx", ">The situation</SectionHead>", ">La situation</SectionHead>"],
  ["src/Game/GameUI/bulletin.jsx", '"No opening situation has been written for this start."', '"Aucune situation d\'ouverture n\'a été écrite pour ce début."'],
  ["src/Game/GameUI/bulletin.jsx", '`since ${row.from == null ? "the start" : format(row.from)}`', '`depuis ${row.from == null ? "le début" : format(row.from)}`'],
  ["src/Game/GameUI/bulletin.jsx", '{held ? format(row.value) : "not held"}', '{held ? format(row.value) : "non mesuré"}'],
  ["src/Game/GameUI/bulletin.jsx", '>The six fronts</SectionHead>', '>Les six fronts</SectionHead>'],
  ["src/Game/GameUI/bulletin.jsx", 'aside="since the pontificate began"', 'aside="depuis le début du pontificat"'],
  ["src/Game/GameUI/bulletin.jsx", "A pontificate is judged on all six at once. Money is one of them.", "Un pontificat se juge sur les six à la fois. L'argent est l'un d'eux."],
  ["src/Game/GameUI/bulletin.jsx", '"The edition could not be printed."', '"L\'édition n\'a pas pu être imprimée."'],
  ["src/Game/GameUI/bulletin.jsx", '>Next edition</span>', '>Prochaine édition</span>'],
  ["src/Game/GameUI/bulletin.jsx", '{byHand ? "the date the next sheet will bear"', '{byHand ? "la date que portera la prochaine feuille"'],
  ["src/Game/GameUI/bulletin.jsx", '`set by ${auto.reason}', '`fixée par ${auto.reason}'],
  ["src/Game/GameUI/bulletin.jsx", '{byHand ? "let the desk set the date" : "set the date myself"}', '{byHand ? "laisser le dossier fixer la date" : "régler la date moi-même"}'],
  ["src/Game/GameUI/bulletin.jsx", ">At the presses…</span>", ">Sous presse…</span>"],
  ["src/Game/GameUI/bulletin.jsx", ">the world answers your orders</span>", ">le monde répond à vos ordres</span>"],
  ["src/Game/GameUI/bulletin.jsx", ">Stop</button>", ">Arrêter</button>"],
  ["src/Game/GameUI/bulletin.jsx", "        Go to press\n", "        Mettre sous presse\n"],
  ["src/Game/GameUI/bulletin.jsx", ">Money being raised</SectionHead>", ">Campagnes</SectionHead>"],
  ["src/Game/GameUI/bulletin.jsx", '"Nothing moved since the last edition, whatever the stories say."', '"Rien n\'a bougé depuis la dernière édition, quoi qu\'en disent les récits."'],
  ["src/Game/GameUI/bulletin.jsx", '>The record</SectionHead>', '>Le registre</SectionHead>'],
  ["src/Game/GameUI/bulletin.jsx", '`${rows.length} entries` : "nothing moved"', '`${rows.length} lignes` : "rien n\'a bougé"'],
  ["src/Game/GameUI/bulletin.jsx", ">Bodies with a purse</SectionHead>", ">Caisses</SectionHead>"],
  ["src/Game/GameUI/bulletin.jsx", ">Crowds</SectionHead>", ">Rassemblements</SectionHead>"],
  ["src/Game/GameUI/bulletin.jsx", "<>no capital</>", "<>sans capital</>"],
  ["src/Game/GameUI/bulletin.jsx", '{edition.length ? "This turn\'s edition" : "Opening edition"}', '{edition.length ? "Édition du tour" : "Première édition"}'],
  ["src/Game/GameUI/bulletin.jsx", 'aside="this year">Ledger — {player}', 'aside="cette année">Comptes — {player}'],
  ["src/Game/GameUI/bulletin.jsx", "<tr><td>In hand</td>", "<tr><td>En main</td>"],
  ["src/Game/GameUI/bulletin.jsx", "<tr><td>Faithful</td>", "<tr><td>Fidèles</td>"],
  ["src/Game/GameUI/bulletin.jsx", "<tr><td>Patrimony placed</td>", "<tr><td>Patrimoine placé</td>"],
  ["src/Game/GameUI/bulletin.jsx", "<tr><td>Yield on patrimony</td>", "<tr><td>Rendement du patrimoine</td>"],
  ["src/Game/GameUI/bulletin.jsx", "<tr><td>Transfers received</td>", "<tr><td>Dons reçus</td>"],
  ["src/Game/GameUI/bulletin.jsx", "<tr><td>Paid by its own bodies</td>", "<tr><td>Versé par ses propres organismes</td>"],
  ["src/Game/GameUI/bulletin.jsx", "<tr><td>Tax revenue</td>", "<tr><td>Recettes fiscales</td>"],
  ["src/Game/GameUI/bulletin.jsx", "<tr><td>Unfunded promises</td>", "<tr><td>Promesses non financées</td>"],
  ["src/Game/GameUI/bulletin.jsx", "<tr><td>Legitimacy</td>", "<tr><td>Légitimité</td>"],

  // ── Les six fronts, tels qu'ils s'intitulent (runtime/fronts.js) ──────────
  ["src/runtime/fronts.js", '{ key: "unity", label: "Unity of the Church", unit: "share" }', '{ key: "unity", label: "Unité de l\'Église", unit: "share" }'],
  ["src/runtime/fronts.js", '{ key: "safeguarding", label: "Abuse: files answered", unit: "share" }', '{ key: "safeguarding", label: "Abus : dossiers jugés", unit: "share" }'],
  ["src/runtime/fronts.js", '{ key: "governance", label: "Synodality and governance", unit: "share" }', '{ key: "governance", label: "Synodalité et gouvernement", unit: "share" }'],
  ["src/runtime/fronts.js", '{ key: "vocations", label: "Vocations", unit: "count" }', '{ key: "vocations", label: "Vocations", unit: "count" }'],
  ["src/runtime/fronts.js", '{ key: "peace", label: "Diplomacy and peace", unit: "count" }', '{ key: "peace", label: "Diplomatie et paix", unit: "count" }'],
  ["src/runtime/fronts.js", '{ key: "finances", label: "Finances", unit: "money" }', '{ key: "finances", label: "Finances", unit: "money" }'],
];

let changed = 0;
const missing = [];

for (const [file, from, to] of EDITS) {
  const full = path.resolve(file);
  const before = fs.readFileSync(full, "utf8");
  if (!before.includes(from)) { missing.push(`${file}: ${from.slice(0, 70)}`); continue; }
  const n = before.split(from).length - 1;
  fs.writeFileSync(full, before.split(from).join(to));
  changed += n;
}

console.log(`${changed} remplacement(s) sur ${EDITS.length} paires.`);
if (missing.length) {
  console.log(`\nNON TROUVÉES (${missing.length}) — à reprendre à la main :`);
  for (const m of missing) console.log(`  ${m}`);
}

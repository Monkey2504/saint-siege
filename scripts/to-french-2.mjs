// Deuxième passe : le Courrier, le Collège, et les mots que le moteur donne à
// lire (temper() dans factions.js). Même méthode qu'à la première passe — une
// table de fragments complets, jamais une expression régulière sur du code.

import fs from "node:fs";
import path from "node:path";

const EDITS = [
  // ── Le Courrier ───────────────────────────────────────────────────────────
  ["src/Game/GameUI/correspondence.jsx", '|| "Unknown";', '|| "Inconnu";'],
  ["src/Game/GameUI/correspondence.jsx", '"No letter exchanged yet."', '"Aucune lettre échangée."'],
  ["src/Game/GameUI/correspondence.jsx", 'title={confirming ? "Click again to file this correspondence away" : "File away"}', 'title={confirming ? "Cliquez encore pour classer cette correspondance" : "Classer"}'],
  ["src/Game/GameUI/correspondence.jsx", '{confirming ? "file?" : "×"}', '{confirming ? "classer ?" : "×"}'],
  ["src/Game/GameUI/correspondence.jsx", '{ id: "all", label: "All" }', '{ id: "all", label: "Tous" }'],
  ["src/Game/GameUI/correspondence.jsx", '{ id: "current", label: "Currents" }', '{ id: "current", label: "Courants" }'],
  ["src/Game/GameUI/correspondence.jsx", '{ id: "state", label: "States" }', '{ id: "state", label: "États" }'],
  ["src/Game/GameUI/correspondence.jsx", '{ id: "body", label: "Bodies" }', '{ id: "body", label: "Organismes" }'],
  ["src/Game/GameUI/correspondence.jsx", "        The Post\n", "        Le Courrier\n"],
  ["src/Game/GameUI/correspondence.jsx", '`${unread} unread · ` : ""}replies go out with the next edition', '`${unread} non lues · ` : ""}les réponses partent avec la prochaine édition'],
  ["src/Game/GameUI/correspondence.jsx", "        Nothing filed here yet. Open a letter below: a state, a current, or a body of the era.", "        Rien de classé ici. Ouvrez une lettre ci-dessous : un État, un courant, ou un organisme de l'époque."],
  ["src/Game/GameUI/correspondence.jsx", "        New letter\n", "        Nouvelle lettre\n"],
  ["src/Game/GameUI/correspondence.jsx", "            Address all {addressableFactions.length} currents at once", "            Écrire aux {addressableFactions.length} courants à la fois"],
  ["src/Game/GameUI/correspondence.jsx", "        A letter is worth what your standing is worth. It reaches only those still listening, and anything the record contradicts costs you ground.", "        Une lettre vaut ce que vaut votre position. Elle n'atteint que ceux qui écoutent encore, et ce que le registre contredit vous fait perdre du terrain."],
  ["src/Game/GameUI/correspondence.jsx", '`${(activeChat.countries ?? []).length} at the table`', '`${(activeChat.countries ?? []).length} à la table`'],
  ["src/Game/GameUI/correspondence.jsx", '=== "current" ? "a current of the college" : kindOf(activeChat) === "body" ? "a body of the era" : "a state"}', '=== "current" ? "un courant du collège" : kindOf(activeChat) === "body" ? "un organisme de l\'époque" : "un État"}'],
  ["src/Game/GameUI/correspondence.jsx", '${activeStanding.seats === 1 ? "elector" : "electors"}', '${activeStanding.seats === 1 ? "électeur" : "électeurs"}'],
  ["src/Game/GameUI/correspondence.jsx", '{where.seats} {where.seats === 1 ? "elector" : "electors"}', '{where.seats} {where.seats === 1 ? "électeur" : "électeurs"}'],
  ["src/Game/GameUI/correspondence.jsx", '<span className="oh-label" style={{ color: "var(--oh-text-dim)" }}>Letters</span>', '<span className="oh-label" style={{ color: "var(--oh-text-dim)" }}>Lettres</span>'],
  ["src/Game/GameUI/correspondence.jsx", "            Choose a correspondent on the left, or write a new letter. What you write is read in character by the power you address, and what it answers is held against what it actually wants.", "            Choisissez un correspondant à gauche, ou écrivez une nouvelle lettre. Ce que vous écrivez est lu dans son propre caractère par la puissance à qui vous l'adressez, et ce qu'elle répond est jugé sur ce qu'elle veut vraiment."],
  ["src/Game/GameUI/correspondence.jsx", 'title="New letter"', 'title="Nouvelle lettre"'],
  ["src/Game/GameUI/correspondence.jsx", 'subtitle="Choose who receives it: a state, a faction, or a body of the era. Several at once make a round table."', 'subtitle="Choisissez qui la reçoit : un État, un courant, ou un organisme de l\'époque. Plusieurs à la fois font une table ronde."'],
  ["src/Game/GameUI/correspondence.jsx", 'selectedLabel="Addressed to"', 'selectedLabel="Adressée à"'],
  ["src/Game/GameUI/correspondence.jsx", 'emptyLabel="No one chosen yet"', 'emptyLabel="Personne de choisi"'],
  ["src/Game/GameUI/correspondence.jsx", '`Open the table with ${n}` : "Write the letter")', '`Ouvrir la table à ${n}` : "Écrire la lettre")'],
  ["src/Game/GameUI/correspondence.jsx", '`${playerCountry} · section` : "section"', '`${playerCountry} · cahier` : "cahier"'],

  // ── Le Collège ────────────────────────────────────────────────────────────
  ["src/Game/GameUI/college.jsx", 'word: "would follow you anywhere"', 'word: "vous suivraient partout"'],
  ["src/Game/GameUI/college.jsx", 'word: "with you"', 'word: "avec vous"'],
  ["src/Game/GameUI/college.jsx", 'word: "undecided"', 'word: "indécis"'],
  ["src/Game/GameUI/college.jsx", 'word: "against you"', 'word: "contre vous"'],
  ["src/Game/GameUI/college.jsx", 'word: "past arguing"', 'word: "au-delà de la discussion"'],
  ["src/Game/GameUI/college.jsx", "<h1 style={{ color: \"var(--oh-text-strong)\", fontFamily: \"var(--oh-font-display)\", fontSize: \"var(--oh-t-xl)\", margin: 0 }}>No assembly</h1>", "<h1 style={{ color: \"var(--oh-text-strong)\", fontFamily: \"var(--oh-font-display)\", fontSize: \"var(--oh-t-xl)\", margin: 0 }}>Aucune assemblée</h1>"],
  ["src/Game/GameUI/college.jsx", ">This scenario has no body of electors yet.</p>", ">Ce scénario n'a pas encore de corps d'électeurs.</p>"],
  ["src/Game/GameUI/college.jsx", "Cardinals assembled in consistory", "Cardinaux réunis en consistoire"],
  ["src/Game/GameUI/college.jsx", "            Carrying a decision — {pact.need} needed", "            Pour emporter une décision — il en faut {pact.need}"],
  ["src/Game/GameUI/college.jsx", "{pact.alone} follow you.</b>", "{pact.alone} vous suivent.</b>"],
  ["src/Game/GameUI/college.jsx", '"You carry this body alone and need nobody."', '"Vous emportez ce corps seul, sans personne."'],
  ["src/Game/GameUI/college.jsx", "<>With the {pact.partners.length} {pact.partners.length === 1 ? \"current\" : \"currents\"} you have sat down with, {pact.held}.", "<>Avec {pact.partners.length === 1 ? \"le courant\" : `les ${pact.partners.length} courants`} avec qui vous vous êtes assis, {pact.held}."],
  ["src/Game/GameUI/college.jsx", '>That carries it.</b>', '>Cela l\'emporte.</b>'],
  ["src/Game/GameUI/college.jsx", "<>Still {pact.short} short. {pact.unattached} electors follow no current at all — those are the ones in play.</>", "<>Il en manque {pact.short}. {pact.unattached} électeurs ne suivent aucun courant — ce sont eux qui sont en jeu.</>"],
  ["src/Game/GameUI/college.jsx", "Speak to the whole college", "Parler au collège"],
  ["src/Game/GameUI/college.jsx", "What you will tell them, and why they should follow you.", "Ce que vous allez leur dire, et pourquoi ils devraient vous suivre."],
  ["src/Game/GameUI/college.jsx", "Put it to them", "Le leur dire"],
  ["src/Game/GameUI/college.jsx", "Queued. It is delivered, and judged, on the next edition.", "Versé au dossier. Livré et jugé à la prochaine édition."],
  ["src/Game/GameUI/college.jsx", '`${seated.length} electors by ${axis}`', '`${seated.length} électeurs par ${axis}`'],
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

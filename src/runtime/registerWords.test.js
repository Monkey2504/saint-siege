import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ligneDeRegistre } from "./registerWords.js";

const ici = path.dirname(fileURLToPath(import.meta.url));

// Le joueur a ouvert sa partie et lu, dans une colonne par ailleurs entièrement
// française : « legacies and unsolicited gifts », « budget shortfall over the
// period », « approves of how you are governing ». Le moteur écrit maintenant
// ces lignes en français — mais `what` est RECOPIÉ dans world.record au moment
// où la ligne tombe, et une partie commencée avant garde les siennes.
//
// On ne réécrit pas l'état enregistré : le registre est ce que le moteur a
// écrit, et le réécrire après coup est exactement ce que ce jeu promet de ne
// jamais faire. On le traduit à l'affichage.
test("les lignes d'une partie commencée en anglais se lisent en français", () => {
  assert.equal(ligneDeRegistre("legacies and unsolicited gifts"), "legs et dons non sollicités");
  assert.equal(ligneDeRegistre("budget shortfall over the period"), "déficit du budget sur la période");
  assert.equal(ligneDeRegistre("approves of how you are governing"), "approuve votre façon de gouverner");
  assert.equal(ligneDeRegistre("the whole room"), "toute la salle");
});

test("celles qui portent un nom ou un nombre passent par un motif", () => {
  assert.equal(ligneDeRegistre("received from Une Seule Église"), "reçu de Une Seule Église");
  assert.equal(ligneDeRegistre("distributed to 3 members"), "reversé à 3 membres");
  assert.equal(ligneDeRegistre("distributed to 1 member"), "reversé à 1 membre");
  assert.equal(ligneDeRegistre("2 schemes against you ran a year and produced nothing"),
    "2 chantiers contre vous ont tourné un an sans rien produire");
  assert.equal(ligneDeRegistre("1 scheme against you ran a year and produced nothing"),
    "1 chantier contre vous a tourné un an sans rien produire");
});

// L'ordre des motifs compte : le cas particulier doit passer avant le général,
// sinon « its world gathering » se retrouve traité comme un nom de rassemblement.
test("le rassemblement mondial n'est pas pris pour un nom de rassemblement", () => {
  assert.equal(ligneDeRegistre("faith renewed by its world gathering"), "foi ravivée par son rassemblement mondial");
  assert.equal(ligneDeRegistre("faith renewed by les JMJ de Séoul"), "foi ravivée par les JMJ de Séoul");
});

test("une phrase inconnue s'affiche telle quelle plutôt que de disparaître", () => {
  assert.equal(ligneDeRegistre("something nobody has ever written"), "something nobody has ever written");
  assert.equal(ligneDeRegistre(""), "");
  assert.equal(ligneDeRegistre(null), "");
});

// La table d'affichage et les passes de francisation doivent rester d'accord :
// une phrase traduite dans le moteur sans l'être ici laisse une ligne anglaise
// dans les parties déjà commencées. Ce test lit les scripts eux-mêmes.
test("chaque phrase francisée par une passe est connue de la table d'affichage", () => {
  const scripts = ["to-french-7.mjs", "to-french-8.mjs", "to-french-9.mjs"]
    .map((f) => path.resolve(ici, "..", "..", "scripts", f))
    .filter((f) => fs.existsSync(f));
  assert.ok(scripts.length === 3, "les trois passes du registre doivent exister");

  const manquantes = [];
  for (const script of scripts) {
    const source = fs.readFileSync(script, "utf8");
    // Les paires simples, `what: "..."` → `what: "..."`, sont les seules qu'une
    // table de phrases entières peut couvrir ; les gabarits sont couverts par
    // les motifs, testés au-dessus.
    for (const [, anglais] of source.matchAll(/\[\s*"[^"]+",\s*'what: "([^"]+)"'/g)) {
      if (ligneDeRegistre(anglais) === anglais) manquantes.push(anglais);
    }
  }
  assert.deepEqual(manquantes, [], `phrases traduites dans le moteur mais inconnues de la table :\n${manquantes.join("\n")}`);
});

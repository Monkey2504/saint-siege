/*! Saint-Siège — un refus du modèle s'apprend une fois, pas à chaque tour. */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "main.jsx"),
  "utf8",
);

// Mesuré sur le projet du joueur, palier gratuit, Gemini 3.5 Flash Lite :
// requêtes par minute 13/15, requêtes par jour 284/500, et JETONS PAR MINUTE
// 339 950 contre un plafond de 250 000. Seule la troisième saute.
//
// Elle saute parce qu'un 400 fait renvoyer la charge ENTIÈRE, deux fois : le
// schéma du tour pèse ~11 500 jetons, les blocs invariants ~10 000. Et les deux
// drapeaux qui disent quoi laisser de côté vivaient DANS callGemini, donc
// repartaient à faux à chaque appel : un modèle qui refuse le budget de
// réflexion le refusait à tous les tours, et le jeu repayait indéfiniment le
// même 400 et la même reprise.
//
// Monter main.jsx ici tirerait React, le DOM et le routeur web. On éprouve donc
// la structure, qui est ce que ce correctif change.
test("le refus est mémorisé hors de callGemini, pour survivre d'un tour à l'autre", () => {
  const dansLaFonction = SRC.indexOf("async function callGemini");
  const memoire = SRC.indexOf("const GEMINI_REFUS = new Map()");
  assert.ok(memoire > 0, "la mémoire des refus existe");
  assert.ok(memoire < dansLaFonction, "elle vit au niveau du module, pas dans l'appel");
  assert.ok(
    /let dropThinking = appris\.thinking/.test(SRC),
    "l'appel démarre sur ce qui a déjà été refusé, au lieu de repartir à faux",
  );
});

test("un refus n'est retenu que s'il est confirmé par une requête acceptée", () => {
  // Sinon une erreur passagère dégraderait la session entière pour rien.
  assert.ok(/if \(dropThinking && !aDemarreSansReflexion\) retenirLeRefus/.test(SRC));
  assert.ok(/if \(dropToolSchema && !aDemarreSansOutil\) retenirLeRefus/.test(SRC));
  // Et ce qu'on portait déjà en entrant n'apprend rien : pas de réécriture.
  assert.ok(/const aDemarreSansReflexion = dropThinking/.test(SRC));
});

test("la branche en flux respecte le refus appris", () => {
  // Elle lève sur un 400 sans rien réessayer : renvoyer un budget de réflexion
  // déjà refusé y coûte une requête ET laisse le joueur sans réponse.
  assert.ok(/getReasoningEnabled\(\) && !refusDe\(model\)\.thinking/.test(SRC));
});

import test from "node:test";
import assert from "node:assert/strict";
import { composeTaskSystemPrompt } from "./promptAssembly.js";

// Le joueur a vu son quota de jetons par minute à 92 % pour douze requêtes dans
// la journée, et a posé la bonne question : « plutôt qu'envoyer un bon paquet en
// même temps, on devrait avoir un fonds qui est envoyé à part ».
//
// C'est exactement ce que le cache implicite de Gemini fait — il est actif par
// défaut sur les modèles 2.5 et suivants — à une condition que l'assemblage ne
// remplissait pas : le préfixe doit être identique d'une requête à l'autre.
// Google : « Try putting large and common contents at the beginning of your
// prompt ». Les règles, la table des actions et la consigne de langue étaient
// ajoutées À LA FIN, derrière un gabarit où la date du tour est interpolée très
// tôt : deux requêtes ne partageaient que 2 400 jetons, sous le seuil de 4 096,
// et le cache ne pouvait jamais s'accrocher.
//
// Ce test garde l'ordre. Il ne vérifie pas que le cache est touché — cela se
// passe chez le fournisseur — mais que la condition nécessaire est tenue.

const SEUIL_DE_CACHE = 4096; // jetons, Gemini 3.5 Flash
const jetons = (texte) => Math.round(texte.length / 4);

// Un gabarit réduit, mais bâti comme les vrais : de la prose fixe, puis la date
// du tour très tôt, puis le reste.
const GABARIT = 'Tu simules un tour.\n\n**Date:** ${date}\n\n**Monde:** ${worldSummary}';

const composer = (variables) => composeTaskSystemPrompt("jumpForward", {
  template: GABARIT,
  variables: { playerPolity: "Saint-Siège", ...variables },
  difficultyText: "[Difficulté]\nRéaliste et équilibré.",
});

const prefixeCommun = (a, b) => {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n += 1;
  return n;
};

test("deux tours d'une même partie partagent un préfixe assez long pour être mis en cache", () => {
  const septembre = composer({ date: "2026-09-01", worldSummary: "Le monde au premier septembre." });
  const octobre = composer({ date: "2026-10-01", worldSummary: "Le monde au premier octobre, tout autre." });

  const partage = jetons(septembre.slice(0, prefixeCommun(septembre, octobre)));
  assert.ok(partage >= SEUIL_DE_CACHE,
    `le préfixe partagé fait ${partage} jetons, il en faut ${SEUIL_DE_CACHE} pour que le cache implicite s'accroche`);
});

test("le fonds vient en premier, avant tout ce que le tour apporte", () => {
  const invite = composer({ date: "2026-09-01", worldSummary: "Le monde." });
  assert.ok(invite.startsWith("[Langue]"), `l'invite commence par « ${invite.slice(0, 40)}… »`);
  // La table des actions est le plus gros bloc fixe : elle doit être devant le
  // gabarit, pas derrière lui.
  assert.ok(invite.indexOf("[Actions You Can Take]") < invite.indexOf("Tu simules un tour."),
    "la table des actions doit précéder le gabarit du tour");
});

test("rien n'a été perdu au passage : le fonds et le tour sont tous les deux là", () => {
  const invite = composer({ date: "2026-09-01", worldSummary: "Le monde au premier septembre." });
  for (const attendu of ["[Langue]", "[Player Agency]", "[Actions You Can Take]", "[Region and City Capture", "Tu simules un tour.", "2026-09-01", "Le monde au premier septembre."]) {
    assert.ok(invite.includes(attendu), `bloc absent de l'invite : ${attendu}`);
  }
});

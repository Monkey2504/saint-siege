/*! Saint-Siège — ce que le jeu n'utilise pas ne part pas au modèle. */
import assert from "node:assert/strict";
import test from "node:test";

import { ACTIONS_REFERENCE, referenceSansLaCarte } from "./promptAssembly.js";
import {
  AUTO_JUMP_FORWARD_TOOL,
  LEVIERS_DE_CARTE,
  laCarteEstEnJeu,
  outilSansLeviers,
} from "./gameplaySchemas.js";

const jetons = (v) => Math.round(JSON.stringify(v).length / 4);
const leviers = (tool) => tool.schema.properties.events.items.properties.impacts.properties;

// « Retirer tout ce que le jeu n'utilise pas comme jeton. »
//
// Mesuré chez le joueur : jetons par minute 339 950 pour un plafond de 250 000,
// alors que les requêtes par jour n'étaient qu'à 284 sur 500. C'est la minute
// qui saute, et le schéma du tour y entre pour 11 462 jetons envoyés avant le
// moindre mot de contenu.
test("un monde sans carte n'envoie plus les leviers d'une guerre sur une carte", () => {
  const maigre = outilSansLeviers(AUTO_JUMP_FORWARD_TOOL, LEVIERS_DE_CARTE);
  for (const levier of LEVIERS_DE_CARTE) {
    assert.ok(levier in leviers(AUTO_JUMP_FORWARD_TOOL), `${levier} existe dans le schéma entier`);
    assert.ok(!(levier in leviers(maigre)), `${levier} est retiré`);
  }

  // Et ce que ce jeu utilise VRAIMENT reste : les caisses, les campagnes, les
  // rassemblements, les fidèles, les chantiers, les corps.
  for (const garde of ["treasuryOps", "driveOps", "gatheringOps", "faithfulOps", "intentOps", "organizationOps", "polityChanges"]) {
    assert.ok(garde in leviers(maigre), `${garde} est gardé — le jeu s'en sert`);
  }

  const gagne = jetons(AUTO_JUMP_FORWARD_TOOL) - jetons(maigre);
  assert.ok(gagne > 2000, `l'économie doit être réelle, mesurée : ${gagne} jetons`);
});

test("la prose qui décrit ces leviers part avec eux", () => {
  // Les décrire à un modèle dont le schéma ne les porte plus, ce serait lui
  // promettre ce qu'il ne peut pas tenir — et payer deux fois la promesse.
  const allegee = referenceSansLaCarte();
  for (const mot of ["unitOps", "markerOps", "regionTransfers"]) {
    assert.ok(ACTIONS_REFERENCE.includes(`• ${mot}`), `${mot} est décrit dans la référence entière`);
    assert.ok(!allegee.includes(`• ${mot}`), `${mot} n'est plus décrit`);
  }
  for (const garde of ["intentOps", "organizationOps", "canonFacts", "polityChanges"]) {
    assert.ok(allegee.includes(`• ${garde}`), `${garde} est gardé`);
  }
  assert.ok(ACTIONS_REFERENCE.length - allegee.length > 2000, "l'économie de prose est réelle");
});

test("dans le doute, le schéma entier — jamais un levier que le monde ne peut plus actionner", () => {
  assert.equal(laCarteEstEnJeu({ units: [], wars: [] }), false, "le Saint-Siège ne tient ni unités ni guerres");
  assert.equal(laCarteEstEnJeu({ units: [{ id: "u1" }] }), true, "un monde qui tient des unités garde tout");
  assert.equal(laCarteEstEnJeu({ wars: [{ id: "w1" }] }), true, "un monde en guerre aussi");
  assert.equal(laCarteEstEnJeu(null), true, "un monde illisible aussi");
  assert.equal(laCarteEstEnJeu(undefined), true);

  // Rien à retirer : l'outil revient tel quel, sans recopie inutile du schéma.
  assert.equal(outilSansLeviers(AUTO_JUMP_FORWARD_TOOL, []), AUTO_JUMP_FORWARD_TOOL);
});

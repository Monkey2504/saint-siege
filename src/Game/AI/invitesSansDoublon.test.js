import test from "node:test";
import assert from "node:assert/strict";
import { composeTaskSystemPrompt } from "./promptAssembly.js";
import { buildWorldSummary } from "./promptContext.js";

// Le quota de jetons par minute de François était à 92 % pour douze requêtes.
// En mesurant ce que le jeu envoie, une invite de jumpForward pesait 35 500
// jetons — dont 2 100 envoyés DEUX FOIS : les règles de simulation arrivaient
// par leur propre substitution ET recopiées dans le résumé de la carte.
//
// Un doublon ne coûte pas seulement des jetons : il dit au modèle, deux fois,
// la même chose, ce qu'aucune invite bien faite ne fait.

const REGLES = "[Mode de jeu — Pape réformateur]\nLe joueur est le pape.";

const variables = {
  playerPolity: "Saint-Siège",
  simulationRules: REGLES,
  HISTORICAL_PRESET_SIMULATION_RULES: REGLES,
  worldSummary: "Player polity: Saint-Siège\nCurrent round: 4",
  GRAND_MAP_DESCRIPTION_NO_CITY: "Player polity: Saint-Siège\nCurrent round: 4",
};

const compose = (taskKey, template) =>
  composeTaskSystemPrompt(taskKey, { template, variables, difficultyText: "" });

test("un gabarit qui demande les règles ne les reçoit qu'une fois", () => {
  const invite = compose("jumpForward", "Simule un tour.\n\n${HISTORICAL_PRESET_SIMULATION_RULES}\n\n${GRAND_MAP_DESCRIPTION_NO_CITY}");
  assert.equal(invite.split(REGLES).length - 1, 1, "les règles de simulation sont envoyées deux fois");
});

// L'inverse, et c'est le piège qui rendait le retrait dangereux : le gabarit
// `actions` ne porte PAS la substitution des règles — il ne les recevait que
// recopiées dans le résumé de la carte. Les retirer de là sans compenser les
// lui aurait fait perdre en silence.
test("un gabarit qui ne les demande pas les reçoit quand même", () => {
  const invite = compose("actions", "Propose des ordres.\n\n${GRAND_MAP_DESCRIPTION_NO_CITY}");
  assert.equal(invite.split(REGLES).length - 1, 1, "le gabarit `actions` a perdu les règles de simulation");
});

test("le résumé de la carte ne recopie plus les règles", async () => {
  const bundle = {
    game: { country: "Saint-Siège", round: 4, difficulty: "standard" },
    world: { simulationRules: REGLES, regionOwnershipOverrides: {}, polityOverrides: {} },
    chats: [],
  };
  const resume = await buildWorldSummary(bundle, []);
  assert.ok(!resume.includes(REGLES),
    "le résumé de la carte recopie les règles de simulation — elles partent alors en double");
});

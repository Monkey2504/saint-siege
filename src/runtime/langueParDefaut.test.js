import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LANGUAGE, languageDirective } from "./i18n.js";

// François, après une journée entière passée à demander le jeu en français :
// « j'ai passé la journée à te dire de rendre l'application en français ».
// Et un cardinal lui répondait « Most Holy Father, while material provisions
// are governed by the Providence that feeds the birds of pangs and fields… »
//
// La cause n'était pas une chaîne oubliée. Quatre passes de francisation
// avaient pris l'interface, les invites, les événements, les verdicts et le
// registre. C'était DEFAULT_LANGUAGE, qui valait « en ».
//
// Cette constante ne dit pas quelle langue on préfère : elle dit dans quelle
// langue le jeu est ÉCRIT. Un joueur qui n'a jamais ouvert les Réglages n'a
// rien de stocké ; le jeu retombait donc sur « en », et collait à la FIN de
// chaque invite de chat — la position la plus forte — l'ordre d'écrire en
// anglais, par-dessus le bloc [Langue] français posé ailleurs.

test("la langue par défaut est celle dans laquelle le jeu est écrit", () => {
  assert.equal(DEFAULT_LANGUAGE, "fr",
    "le jeu est écrit en français en dur (voir designTokens.test.js) : le défaut doit le dire");
});

test("un joueur qui n'a rien choisi ne se voit rien demander", () => {
  // Rien à demander au modèle : il écrit déjà dans la langue du jeu.
  assert.equal(languageDirective(DEFAULT_LANGUAGE), "");
});

test("et surtout, le jeu ne demande JAMAIS l'anglais à un joueur qui n'a rien choisi", () => {
  // Le chat force la consigne même quand la langue est celle du jeu
  // (i18n.js le dit : sans cela un chat dérive vers la langue de son
  // interlocuteur). Forcée sur le défaut, elle doit épingler le français.
  const forcee = languageDirective(DEFAULT_LANGUAGE, { force: true });
  assert.match(forcee, /French/, `la consigne forcée dit : « ${forcee.slice(0, 90)}… »`);
  assert.doesNotMatch(forcee, /reads English/, "le jeu demandait l'anglais au modèle");
});

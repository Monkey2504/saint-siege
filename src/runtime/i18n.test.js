/*! Saint-Siège — la langue d'un joueur qui n'a rien choisi. */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_LANGUAGE, preferredLanguage } from "./i18n.js";

const ICI = path.dirname(fileURLToPath(import.meta.url));

// Mesuré sur la page réelle : l'écran des clés rendait « One thing before you
// begin » pendant que le reste de la page disait « N° 1 · AN 1 DU PONTIFICAT ».
//
// preferredLanguage() lisait la langue du NAVIGATEUR à défaut de choix. C'était
// juste du temps où l'interface était écrite en anglais — le navigateur était
// alors le seul indice qu'un joueur français existait. Depuis que tout le jeu
// est écrit en français, l'indice s'est retourné : sur un navigateur réglé en
// anglais, et c'est le cas le plus courant du monde, le tout premier écran
// s'affichait en anglais devant une interface entièrement française.
const memoire = new Map();
globalThis.localStorage = {
  getItem: (k) => (memoire.has(k) ? memoire.get(k) : null),
  setItem: (k, v) => memoire.set(k, String(v)),
  removeItem: (k) => memoire.delete(k),
};

test("sans choix du joueur, c'est la langue du jeu qui parle", () => {
  memoire.clear();
  assert.equal(DEFAULT_LANGUAGE, "fr", "la langue du jeu est celle dans laquelle il est écrit");
  assert.equal(preferredLanguage(), "fr", "rien de choisi : le jeu parle sa langue");

  // Un joueur qui CHOISIT l'anglais l'obtient : c'est son choix, pas une
  // devinette faite sur son navigateur.
  memoire.set("ui_language", "en");
  assert.equal(preferredLanguage(), "en", "un choix explicite l'emporte");

  memoire.delete("ui_language");
  assert.equal(preferredLanguage(), "fr", "et son retrait rend la parole au jeu");
});

test("le navigateur ne décide plus de la langue", () => {
  // Le stubber ici est impossible — `navigator` n'a qu'un accesseur en lecture
  // sous Node — et ce serait de toute façon la mauvaise épreuve : ce qu'il faut
  // garantir, c'est que cette fonction ne le CONSULTE plus du tout.
  const source = fs.readFileSync(path.join(ICI, "i18n.js"), "utf8");
  const debut = source.indexOf("export const preferredLanguage");
  assert.ok(debut > 0, "la fonction existe");
  const corps = source.slice(debut, source.indexOf("\n};", debut));
  assert.ok(!/navigator/.test(corps), "preferredLanguage ne lit plus le navigateur");
});

/*! Saint-Siège — un nom de pays garde ses majuscules. */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ICI = path.dirname(fileURLToPath(import.meta.url));

// « Ces devenu n'importe quoi les reponse. » Sur la capture : le pape écrit à
// « antigua and barbuda », lit « akrotiri and dhekelia » dans son courrier, et
// le champ lui propose de « Répondre à antigua and barbuda ».
//
// La cause tient en une ligne d'assets.js : la Map de dédoublonnage gardait
// `nom en minuscules → code`, et la liste se reconstruisait à partir de ses
// CLÉS. Tout le jeu nommait donc les pays en minuscules — les sélecteurs, les
// en-têtes de lettre, et l'invite envoyée au modèle, à qui l'on annonçait
// « vous êtes antigua and barbuda ».
//
// Monter assets.js ici tirerait les tuiles et le réseau. On éprouve donc les
// deux bouts : la liste livrée porte de vraies majuscules, et le code ne
// ressort plus les clés de sa Map comme noms.
test("la liste livrée porte de vraies majuscules", async () => {
  const { default: livree } = await import("./countryNames.js");
  const liste = Array.isArray(livree) ? livree : [];
  assert.ok(liste.length > 100, "la liste des pays est bien chargée");
  const fautifs = liste
    .map((e) => String(e?.name ?? ""))
    .filter((nom) => nom && nom === nom.toLowerCase() && /[a-z]/.test(nom));
  assert.deepEqual(fautifs, [], `noms livrés tout en minuscules :\n${fautifs.join("\n")}`);

  const antigua = liste.find((e) => String(e?.name ?? "").toLowerCase() === "antigua and barbuda");
  assert.equal(antigua?.name, "Antigua and Barbuda", "le nom que le joueur a vu en minuscules");
});

test("loadCountryNames ne ressort plus les clés de sa Map comme noms", () => {
  const source = fs.readFileSync(path.join(ICI, "assets.js"), "utf8");
  assert.ok(
    !/seen\.set\(nameKey, code\)/.test(source),
    "la Map ne doit plus garder le code seul sous une clé en minuscules",
  );
  assert.ok(
    /Array\.from\(seen\.values\(\)\)/.test(source),
    "la liste se reconstruit sur les VALEURS, qui portent le nom propre",
  );
});

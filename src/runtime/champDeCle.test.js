/*! Saint-Siège — une clé annoncée enregistrée doit être relisible. */
import assert from "node:assert/strict";
import test from "node:test";

// « Vérifie que la clé que je mets est bien entrée comme nouvelle clé. »
//
// Ce test ne monte pas React : il éprouve le contrat que le champ repose sur —
// providerConfig écrit et relit le stockage SANS cache, donc une clé relue est
// une clé que le prochain appel au modèle utilisera. Si ce contrat tombait, le
// champ annoncerait un enregistrement que le moteur ne verrait pas.

const memoire = new Map();
globalThis.localStorage = {
  getItem: (k) => (memoire.has(k) ? memoire.get(k) : null),
  setItem: (k, v) => { memoire.set(k, String(v)); },
  removeItem: (k) => { memoire.delete(k); },
  clear: () => memoire.clear(),
};

const { getProviderSettings, setProviderField } = await import("../Game/AI/providerConfig.js");

test("une clé écrite est relue immédiatement, sans cache et sans rechargement", () => {
  memoire.clear();
  assert.equal(getProviderSettings("gemini").apiKey, "", "on part de rien");

  setProviderField("gemini", "apiKey", "AIza-premiere");
  assert.equal(getProviderSettings("gemini").apiKey, "AIza-premiere");

  // Le cas de François : une nouvelle clé remplace l'ancienne sur-le-champ.
  // Un cache quelque part et le jeu continuerait d'envoyer la précédente.
  setProviderField("gemini", "apiKey", "AIza-seconde");
  assert.equal(getProviderSettings("gemini").apiKey, "AIza-seconde", "la nouvelle clé écrase l'ancienne, tout de suite");
});

test("un stockage qui refuse l'écriture se voit à la relecture, il ne se devine pas", () => {
  memoire.clear();
  const vrai = globalThis.localStorage.setItem;
  // Fenêtre privée, données de site bloquées, espace plein : setItem lève.
  globalThis.localStorage.setItem = () => { throw new Error("QuotaExceededError"); };
  let leve = false;
  try { setProviderField("gemini", "apiKey", "AIza-perdue"); } catch { leve = true; }
  globalThis.localStorage.setItem = vrai;

  assert.ok(leve, "l'écriture lève bien, c'est ce que le champ doit rattraper");
  // Et c'est la relecture qui tranche : rien n'a été gardé, donc rien ne doit
  // être annoncé comme gardé.
  assert.equal(getProviderSettings("gemini").apiKey, "", "une clé perdue se relit vide");
});

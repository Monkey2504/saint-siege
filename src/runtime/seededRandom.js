/*! Open Historia — one deterministic stream of numbers per seed © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */

// A seeded generator belongs to the engine, not to the battlefield.
//
// It lived in Game/Map/unitCombat.js, so runtime/succession.js — the conclave,
// the most Holy-See-specific mechanism in the game, the thing that makes a pope
// mortal and opens an election — imported a 358-line combat module to get one
// line of arithmetic. An edition with no armies, no units and no map still
// carried its whole combat engine because the death of a pope depended on it.
//
// The same seed always yields the same sequence. That is what lets the engine
// re-derive a battle, a death roll or an election from state alone instead of
// remembering a dice throw: a save reloaded on another machine reaches the same
// outcome, and nothing has to store the throw itself.

const xmur3 = (str) => {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
};

const mulberry32 = (seed) => () => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const seededRandom = (seed) => mulberry32(xmur3(String(seed ?? ""))());

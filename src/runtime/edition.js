/*! Open Historia — what this edition of the game is © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */

// One switch, in one file, for the difference between the atlas game and the
// newspaper game.
//
// The Holy See campaign is played in a bulletin, a college, a correspondence and
// a ledger. Its polity owns a single enclave of half a square kilometre, has no
// units, fights no wars and never moves a frontier — the player's own words for
// it were that the map "n'est pas vraiment importante, là où elle est la base
// dans les autres". And it is not free: the map costs a new player a 289 MB
// download before the first turn, of which 105 MB is region geometry and 63 MB
// is country geometry whose only use to this scenario was the list of NAMES —
// now shipped as 8 kB by scripts/extract-country-names.mjs.
//
// So the map is switched off here rather than torn out. Tearing it out would
// mean touching two hundred files and would cost the engine a generality the
// rest of this codebase was deliberately built to keep: everything written for
// the Holy See — purses, gatherings, assemblies, unfunded promises — works for
// any scenario, and a scenario with armies still wants its atlas.

// False in the Holy See edition. Flip it to true to get the atlas game back:
// the map mounts, its tiles are downloaded on first run, and the Map tab
// returns to the navigation bar.
export const HAS_MAP = false;

// What the app shows when no page is chosen. With the map gone the front door is
// the bulletin, which is the right front door for a newspaper game anyway.
export const HOME_SECTION = HAS_MAP ? "map" : "bulletin";

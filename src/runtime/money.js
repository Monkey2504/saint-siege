/*! Open Historia — la monnaie que le lecteur lit © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */

// Le moteur compte en années-subsistance (AS) et ancre leur valeur en dollars :
// `usdPerSY` vient de anchorUnitValue, et l'ancre du Saint-Siège est le PIB par
// tête de Rome, publié en dollars. Mais les comptes du Saint-Siège, eux, SONT
// tenus en euros — HOLY_SEE_ACCOUNTS_2024 ne contient que des montants en
// euros — et le préréglage les convertit en dollars uniquement pour entrer dans
// l'unité du moteur.
//
// Le joueur lisait donc des dollars pour une trésorerie qui n'en a jamais vu.
// Ce module referme l'aller-retour : la conversion vers l'euro à l'affichage
// rend très exactement les montants d'origine, au taux qui a servi à les
// convertir. Un seul endroit décide de la monnaie du lecteur, comme un seul
// endroit décide de ses couleurs.

/** Moyenne annuelle BCE 2024. Le préréglage et les campagnes s'en servent aussi. */
export const EUR_USD_2024 = 1.0824;

/** Des dollars du moteur vers les euros du lecteur. */
export const usdToEur = (usd) => {
  const n = Number(usd);
  return Number.isFinite(n) ? n / EUR_USD_2024 : 0;
};

const decimale = (n, chiffres) => n.toFixed(chiffres).replace(".", ",");

/**
 * Une somme en euros, écrite comme on l'écrit en français : le symbole après le
 * nombre, l'échelle collée au symbole (2,6 Md€), la virgule décimale, l'espace
 * fine insécable aux milliers. Rend null pour zéro — l'appelant décide alors
 * quoi dire, ce qui évite « 0 € en main » là où il n'y a pas de caisse du tout.
 */
export const fmtEur = (eur) => {
  const n = Number(eur);
  if (!Number.isFinite(n) || n === 0) return null;
  const abs = Math.abs(n);
  const signe = n < 0 ? "−" : "";
  if (abs >= 1e9) return `${signe}${decimale(abs / 1e9, 1)} Md€`;
  if (abs >= 1e6) return `${signe}${Math.round(abs / 1e6)} M€`;
  if (abs >= 1e3) return `${signe}${Math.round(abs / 1e3).toLocaleString("fr-FR")} k€`;
  return `${signe}${Math.round(abs)} €`;
};

/** Une somme du moteur (en dollars) écrite en euros pour le lecteur. */
export const fmtMoneyFromUsd = (usd) => fmtEur(usdToEur(usd));

/** Le nom de l'unité, tel qu'il paraît en tête d'un cahier. */
export const NOM_DE_LA_MONNAIE = "euros";

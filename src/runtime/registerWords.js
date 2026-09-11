/*! Open Historia — le registre d'une partie commencée en anglais © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */

/**
 * Les lignes du registre déjà écrites en anglais, rendues lisibles.
 *
 * `what` et `reason` sont recopiés dans l'état enregistré au moment où la ligne
 * tombe : franciser le moteur (scripts/to-french-7.mjs) ne francise que les
 * lignes à venir. Une partie commencée avant garde les siennes en anglais, et
 * le joueur lisait « legacies and unsolicited gifts » dans une colonne par
 * ailleurs entièrement française.
 *
 * On ne réécrit pas l'état enregistré — le registre est ce que le moteur a
 * écrit, et le réécrire après coup est exactement ce que ce jeu promet de ne
 * jamais faire. On le traduit à l'affichage. Une phrase inconnue s'affiche
 * telle quelle plutôt que de disparaître.
 *
 * Cette table doit rester d'accord avec scripts/to-french-7.mjs.
 */
const LIGNE_DE_REGISTRE = new Map([
  ["legacies and unsolicited gifts", "legs et dons non sollicités"],
  ["budget shortfall over the period", "déficit du budget sur la période"],
  ["budget surplus over the period", "excédent du budget sur la période"],
  ["patrimony sold to pay the bills", "patrimoine vendu pour payer les factures"],
  ["borrowed", "emprunté"],
  ["loan received", "prêt reçu"],
  ["loan paid out", "prêt versé"],
  ["collected on a drive", "collecté par une campagne"],
  ["faith renewed by its national gatherings", "foi ravivée par ses rassemblements nationaux"],
  ["capital set aside against an unfunded promise", "capital mis de côté contre une promesse non financée"],
  ["unfunded promises covered", "promesses non financées couvertes"],
  ["terms rewritten on people already promised", "conditions réécrites sur des gens à qui l'on avait déjà promis"],
  ["return on its placed capital", "rendement de son capital placé"],
  ["its assumed promise consumed what that capital earned", "la promesse qu'elle a reprise a mangé ce que ce capital rapportait"],
  ["running costs met", "frais de fonctionnement couverts"],
  ["short of its running costs", "à court pour ses frais de fonctionnement"],
  ["cash placed as capital", "liquidités placées en capital"],
  ["dissolved", "dissous"],
  ["approves of how you are governing", "approuve votre façon de gouverner"],
  ["disapproves of how you are governing", "désapprouve votre façon de gouverner"],
  ["was talked round by those already with you", "a été retourné par ceux qui vous sont déjà acquis"],
  ["was talked round by those already against you", "a été retourné par ceux qui vous sont déjà contraires"],
  ["the whole room", "toute la salle"],
  // Nées en français : elles ne sont ici que pour que la table reste le
  // catalogue de ce que le registre peut dire.
  ["dons perdus avec les fidèles", "dons perdus avec les fidèles"],
  ["dons gagnés avec les fidèles", "dons gagnés avec les fidèles"],
]);

/**
 * Les lignes qui portent un nom d'organisme ou un nombre : une table de
 * phrases entières ne peut pas les énumérer, puisque le nom vient de la partie.
 * Premier motif qui correspond gagne, et l'ordre compte — « faith renewed by
 * its world gathering » doit passer avant « faith renewed by … ».
 */
const MOTIFS_DE_REGISTRE = [
  [/^(\d+) schemes? against you ran a year and produced nothing$/i,
    (m) => `${m[1]} chantier${Number(m[1]) === 1 ? "" : "s"} contre vous ${Number(m[1]) === 1 ? "a tourné" : "ont tourné"} un an sans rien produire`],
  [/^faith renewed by its world gathering$/i, () => "foi ravivée par son rassemblement mondial"],
  [/^faith renewed by (.+)$/i, (m) => `foi ravivée par ${m[1]}`],
  [/^received from (.+)$/i, (m) => `reçu de ${m[1]}`],
  [/^kept (.+) open$/i, (m) => `a maintenu ${m[1]} ouverte`],
  [/^distributed to (\d+) members?$/i, (m) => `reversé à ${m[1]} membre${Number(m[1]) === 1 ? "" : "s"}`],
  [/^endowed by (.+)$/i, (m) => `dotée par ${m[1]}`],
  [/^endowed (.+)$/i, (m) => `a doté ${m[1]}`],
  [/^assumed an unfunded promise from (.+)$/i, (m) => `a repris une promesse non financée du ${m[1]}`],
  [/^unfunded promises carried by (.+)$/i, (m) => `promesses non financées portées par ${m[1]}`],
  [/^unfunded promises repriced by ([\d.]+)%$/i, (m) => `promesses non financées révisées de ${m[1].replace(".", ",")}\u202f%`],
  [/^founded (.+)$/i, (m) => `a fondé ${m[1]}`],
  [/^published (.+)'s scheme$/i, (m) => `a rendu public le chantier de ${m[1]}`],
  [/^tax rate moved from (.+) to (.+)$/i, (m) => `taux d'imposition porté de ${m[1]} à ${m[2]}`],
  [/^deficits are now covered by borrowing$/i, () => "les déficits sont désormais couverts par l'emprunt"],
  [/^deficits are now covered by creating new money$/i, () => "les déficits sont désormais couverts par la création de monnaie"],
  [/^deficits are now covered by austerity, cutting spending to what is collected$/i,
    () => "les déficits sont désormais couverts par l'austérité, en ramenant la dépense à ce qui est encaissé"],
  [/^deficits are now covered by eating the patrimony$/i, () => "les déficits sont désormais couverts par la ponction sur le patrimoine"],
];

/** Une phrase de registre en français, quelle que soit la langue où elle est tombée. */
export const ligneDeRegistre = (phrase) => {
  const brut = String(phrase ?? "").trim();
  const connu = LIGNE_DE_REGISTRE.get(brut) || LIGNE_DE_REGISTRE.get(brut.toLowerCase());
  if (connu) return connu;
  for (const [motif, rendu] of MOTIFS_DE_REGISTRE) {
    const m = brut.match(motif);
    if (m) return rendu(m);
  }
  return brut;
};

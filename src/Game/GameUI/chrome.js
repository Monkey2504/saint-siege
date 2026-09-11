// La géométrie de la barre commune, en un seul endroit.
//
// La maquette de la session de design met une seule barre en haut de chaque
// page — les cahiers et le bouton du tour. Les pages (l'édition, les lettres,
// le collège) sont en position fixe et couvraient tout l'écran : elles doivent
// maintenant lui laisser sa bande. Une page qui oublierait cette constante
// passerait sous la barre, ce qui ne se voit qu'à l'usage.
//
// Vit dans son propre module pour que les pages n'aient pas à importer main.jsx,
// qui les importe déjà.

/** Hauteur de la barre de session (bibliothèque, sortie de partie). */
export const BARRE_SESSION = "4rem";

/** Hauteur de la barre des cahiers, sous la barre de session. */
export const BARRE_CAHIERS = "2.9rem";

/** Où commence le contenu d'une page : sous les deux barres. */
export const CONTENU_TOP = `calc(${BARRE_SESSION} + ${BARRE_CAHIERS})`;

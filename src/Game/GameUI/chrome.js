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

/** Où commence le contenu d'une page.
 *
 * Zéro : la maquette journal commence par le bandeau, en haut de la feuille.
 * La navigation n'est plus une barre posée sur l'écran mais une ligne du
 * journal (navigation.jsx), et la session flotte par-dessus sans réserver de
 * bande. Ce qui reste constant, c'est que les pages partent du bord. */
export const CONTENU_TOP = 0;

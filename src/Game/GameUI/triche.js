/* Le crochet qui ouvre le banc d'essai, dans un module neutre.
 *
 * « Redonne-moi l'accès au bouton triche, là où je mettais la clé. » Le panneau
 * vit derrière les Réglages, eux-mêmes derrière un bouton que le journal ne
 * montre pas : depuis que la feuille part du bord de l'écran, il n'y avait plus
 * d'endroit d'où l'atteindre en jouant.
 *
 * Pourquoi ici plutôt que dans main.jsx : la ligne des cahiers (navigation.jsx)
 * est rendue PAR chaque page et n'a aucun moyen de remonter jusqu'à l'état de
 * main.jsx. Le crochet doit donc vivre au niveau du module — mais le poser dans
 * main.jsx ferait importer main.jsx par navigation.jsx, que main.jsx monte :
 * un cycle. Le dépôt a déjà tranché ce cas une fois (journal.jsx : « Un module
 * neutre coupe le cycle »), et c'est la même issue ici.
 */

let _ouvrir = null;

/** Posé par le composant monté, retiré à son démontage. */
export const poserLaTriche = (fn) => { _ouvrir = typeof fn === "function" ? fn : null; };

/** Ouvre le banc d'essai. Sans composant monté, ne fait rien plutôt que lever. */
export const ouvrirLaTriche = () => { _ouvrir?.(); };

/** Si le panneau est atteignable — une page peut ainsi ne pas offrir le bouton. */
export const laTricheEstAtteignable = () => typeof _ouvrir === "function";

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

// Les crochets vivent sur globalThis, pas dans une variable de module.
//
// Le premier essai les gardait en variables de module, et le banc d'essai
// marchait pendant que l'écran des clés restait muet : le crochet POSÉ et le
// crochet LU n'étaient pas le même, parce que le module qui les porte peut se
// retrouver en deux exemplaires — ses deux lecteurs ne sont pas toujours
// empaquetés ensemble. Une clé unique sur globalThis ne peut pas se dédoubler.
const REGISTRE = Symbol.for("saint-siege.crochets");
const crochets = globalThis[REGISTRE] ?? (globalThis[REGISTRE] = {});


/** Posé par le composant monté, retiré à son démontage. */
export const poserLaTriche = (fn) => { crochets.triche = typeof fn === "function" ? fn : null; };

/** Ouvre le banc d'essai. Sans composant monté, ne fait rien plutôt que lever. */
export const ouvrirLaTriche = () => { crochets.triche?.(); };

/** Si le panneau est atteignable — une page peut ainsi ne pas offrir le bouton. */
export const laTricheEstAtteignable = () => typeof crochets.triche === "function";

// ── Et l'écran des clés ──────────────────────────────────────────────────────
//
// « Redonne-moi accès à l'écran originel où poser les clés. »
//
// FirstRunKey ne paraît qu'une fois : App.jsx lit hasProviderKey() AU MONTAGE et
// ne le relit jamais. Une fois une clé donnée, l'écran qui explique ce qu'est
// une clé, où la prendre et ce qu'on perd sans elle devenait inatteignable —
// alors que c'est précisément l'écran qu'on veut rouvrir le jour où la clé ne
// marche plus. Même mécanisme que ci-dessus, et pour la même raison : la ligne
// des cahiers ne peut pas remonter jusqu'à l'état de App.jsx.
/** Posé par App.jsx au montage, retiré à son démontage. */
export const poserLEcranDesCles = (fn) => { crochets.cles = typeof fn === "function" ? fn : null; };

/** Rouvre l'écran des clés. Sans App monté, ne fait rien plutôt que lever. */
export const ouvrirLEcranDesCles = () => { crochets.cles?.(); };

/** Si l'écran est atteignable — une page peut ainsi ne pas offrir le bouton. */
export const lEcranDesClesEstAtteignable = () => typeof crochets.cles === "function";

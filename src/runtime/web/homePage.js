/*! Saint-Siège — la porte d'entrée du site © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
//
// Ce qu'un visiteur rencontrait ici, bloquant 3 du brief du 11 septembre : une
// colonnade dorique le long des deux bords, un dégradé d'or sur le mot
// « Historia », une carte arrondie à ombre portée, un badge « community-hosted
// alternative to Pax Historia », un bouton « ⚔ Enter Open Historia », un tableau
// de bord de connexion à des nœuds communautaires, et une fenêtre expliquant
// qu'il faut télécharger l'application de bureau. Tout cela en anglais, et rien
// de tout cela n'a de rapport avec ce jeu : on y est le pape, on y lit un
// journal, la carte n'y paraît jamais.
//
// Ce portail est maintenant la une avant la une : le papier du journal, son
// bandeau, sa devise, et une porte. Les tokens viennent de theme.css, chargé par
// main.jsx avant que cette surcouche ne soit posée, et les polices sont celles
// que le projet héberge lui-même — la page allait chercher Cinzel et EB Garamond
// chez Google, ce que fonts.css existe précisément pour ne plus faire.
//
// Trois choses tombent avec le décor :
//
//   — Le tableau des nœuds. Il servait à choisir d'où descendent les tuiles de
//     carte. La carte ne vit ici que dans l'éditeur de scénario, derrière le
//     menu ⋮ ; en faire la porte d'entrée d'un jeu qui se lit au journal était
//     un contresens. La connexion tourne toujours, en fond, pour l'éditeur.
//
//   — Le bouton désactivé le temps de la connexion. Il restait inerte treize
//     secondes et demie — le canal de rendu s'y était cassé les dents. Plus rien
//     n'attend un nœud pour entrer : aucune page du journal n'en demande.
//
//   — La fenêtre « ceci est une démo, prenez l'application de bureau ». Il n'y a
//     pas d'application de bureau pour ce jeu, et le lien menait aux versions de
//     l'amont.

const ENTERED_KEY = "oh:entered";

// Le papier du journal, et rien d'autre. Tout est en tokens : une seule couleur
// écrite en dur ici et la porte cesserait d'appartenir au même journal que la
// page qu'elle ouvre.
const css = `
.oh-home{
  position:fixed;inset:0;z-index:99999;overflow:auto;
  display:flex;align-items:center;justify-content:center;
  padding:2rem 1.5rem;
  background:var(--oh-plate);color:var(--oh-text);
  font-family:var(--oh-font-body);
}
.oh-home *{box-sizing:border-box}
.oh-porte{width:100%;max-width:44rem;text-align:center}

/* Le bandeau, comme celui de l'édition : un nom, une devise, un filet de
   manchette. C'est à son bandeau qu'un journal se reconnaît. */
.oh-porte-nom{
  font-family:var(--oh-font-serif);font-weight:700;
  font-size:var(--oh-t-3xl);line-height:0.92;letter-spacing:-0.025em;
  color:var(--oh-text-strong);margin:0;
}
.oh-porte-devise{
  font-family:var(--oh-font-serif);font-style:italic;
  font-size:var(--oh-t-sm);color:var(--oh-text-dim);
  margin:0.45rem 0 0;
}
.oh-porte-filet{
  border:0;border-top:var(--oh-filet-manchette) solid var(--oh-text-strong);
  margin:0.9rem 0 1.4rem;
}
.oh-porte-sus{
  font-family:var(--oh-font-label);font-size:var(--oh-t-2xs);
  letter-spacing:var(--oh-label-track);text-transform:uppercase;
  color:var(--oh-text-dim);margin:0 0 0.6rem;
}
.oh-porte-texte{
  font-family:var(--oh-font-serif);font-size:var(--oh-t-md);
  line-height:1.55;color:var(--oh-text);
  margin:0 auto 1.6rem;max-width:46ch;
}

/* Une porte, à l'encre. Le journal n'imprime pas en couleur. */
.oh-porte-entrer{
  background:var(--oh-text-strong);color:var(--oh-plate);
  border:0;border-radius:var(--oh-r-flat);cursor:pointer;
  font-family:var(--oh-font-label);font-size:var(--oh-t-xs);font-weight:700;
  letter-spacing:var(--oh-label-track);text-transform:uppercase;
  padding:0.85rem 2.2rem;
}
.oh-porte-pied{
  font-size:var(--oh-t-2xs);color:var(--oh-text-dim);
  margin:1.6rem 0 0;line-height:1.5;
}
`;

const el = (tag, props = {}, ...kids) => { const n = document.createElement(tag); Object.assign(n, props); for (const k of kids) if (k != null) n.append(k); return n; };

let overlay;

const entrer = () => {
  try { sessionStorage.setItem(ENTERED_KEY, "1"); } catch { /* navigation privée */ }
  overlay?.remove();
  overlay = null;
};

export const showHomePage = () => {
  if (typeof document === "undefined" || document.getElementById("oh-home-root")) return;
  document.head.append(el("style", { textContent: css }));

  const entrerBouton = el("button", {
    className: "oh-porte-entrer",
    type: "button",
    textContent: "Entrer",
    onclick: entrer,
  });

  const porte = el("div", { className: "oh-porte" },
    el("p", { className: "oh-porte-sus", textContent: "Mensuel des affaires de l'Église" }),
    el("h1", { className: "oh-porte-nom", textContent: "Saint-Siège" }),
    el("p", { className: "oh-porte-devise", textContent: "« Vous êtes le pape. Les comptes ne mentent pas. »" }),
    el("hr", { className: "oh-porte-filet" }),
    el("p", { className: "oh-porte-texte", textContent:
      "Pas d'armée, un demi-kilomètre carré, un milliard et demi de baptisés. "
      + "Vous gouvernez par ordres écrits, et chaque mois une édition vous dit ce qu'ils ont produit. "
      + "Le collège vote. Les comptes ne mentent pas." }),
    entrerBouton,
    el("p", { className: "oh-porte-pied", textContent: "Vos parties sont gardées sur cet appareil." }),
  );

  overlay = el("div", { className: "oh-home", id: "oh-home-root" }, porte);
  document.body.append(overlay); // posé tout de suite — pas d'éclair du jeu derrière
  entrerBouton.focus();

  // Aucune connexion à un nœud n'est ouverte ici. Elle l'était à chaque
  // chargement, pour choisir d'où descendraient des tuiles de carte que ce jeu
  // ne montre jamais : un appel au registre de l'amont, et un battement de cœur
  // qui comptait le joueur parmi les utilisateurs d'un nœud communautaire qu'il
  // n'utilisait pas. resolveContentUrl (web/contentTrust.js) résout le registre
  // lui-même, à la première tuile réellement demandée — c'est-à-dire quand
  // l'éditeur de scénario s'ouvre, et jamais avant.
};

// Si cette porte doit s'ouvrir au chargement (une fois franchie, plus pour cet
// onglet).
export const shouldShowHome = () => {
  try { return sessionStorage.getItem(ENTERED_KEY) !== "1"; } catch { return true; }
};

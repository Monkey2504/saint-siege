import assert from "node:assert/strict";
import test from "node:test";

import { regardeLEglise, sansPrelatsReels, trierPourLeJournal } from "./churchPaper.js";

test("les vrais prélats deviennent leur rôle, accordé à l'article", () => {
  assert.equal(
    sansPrelatsReels("Une délégation du bloc des dubia, emmenée par le cardinal Burke, a été reçue."),
    "Une délégation du bloc des dubia, emmenée par un cardinal du bloc des dubia, a été reçue.",
  );
  assert.equal(
    sansPrelatsReels("Cette fuite contraint la Curie. Le cardinal Farrell sollicite des instructions."),
    "Cette fuite contraint la Curie. Le camerlingue sollicite des instructions.",
  );
  assert.equal(sansPrelatsReels("une note du cardinal Parolin"), "une note du secrétaire d'État");
  assert.equal(sansPrelatsReels("selon le cardinal Víctor Manuel Fernández"), "selon le préfet de la Doctrine de la Foi");
});

test("un nom court n'est remplacé que précédé d'un titre", () => {
  assert.equal(sansPrelatsReels("Sarah, une employée de l'APSA"), "Sarah, une employée de l'APSA");
  assert.equal(sansPrelatsReels("les écrits de Karl Marx"), "les écrits de Karl Marx");
  assert.equal(sansPrelatsReels("le cardinal Marx répond"), "Un cardinal allemand du Chemin synodal répond");
});

test("les affaires intérieures d'un État sans lien avec l'Église ne sont pas imprimées", () => {
  const japon = { title: "Adoption de nouvelles mesures budgétaires par la Diète à Tokyo", description: "Un plan de relance de 3 200 milliards de yens.", kind: "world", playerRelated: false };
  const kinshasa = { title: "Ouverture de l'assemblée des évêques en RDC", description: "Les séminaires locaux…", kind: "world", playerRelated: false };
  const joueur = { title: "Réforme", description: "…", kind: "player", playerRelated: true };
  assert.equal(regardeLEglise(japon), false);
  assert.equal(regardeLEglise(kinshasa), true);
  const { gardes, retires } = trierPourLeJournal([japon, kinshasa, joueur]);
  assert.equal(gardes.length, 2);
  assert.equal(retires[0].title, japon.title);
});

test("un chiffre du récit que les comptes contredisent reçoit la note du registre", async () => {
  const { noteDuRegistre } = await import("./churchPaper.js");
  const comptes = { revenue: 500e6, spending: 528e6, balance: -28e6, treasury: 10e6, endowment: 2.6e9, unfundedLiabilities: 614e6 };
  assert.equal(
    noteDuRegistre("pour atténuer le déficit structurel, évalué à 44,5 millions d'euros par an", comptes),
    "Au registre : solde de l'année (cœur du Saint-Siège, hors produits exceptionnels) en déficit de 28,0 M€.",
  );
  assert.equal(noteDuRegistre("un déficit de 29 millions d'euros", comptes), "", "un arrondi n'est pas une contradiction");
  assert.equal(noteDuRegistre("le passif du fonds de pension, estimé à 664 millions de dollars", comptes), "", "des dollars convertis");
});

test("« de » et « à » devant un nom s'accordent aussi", () => {
  assert.equal(sansPrelatsReels("l'invitation de cardinal Burke"), "l'invitation d'un cardinal du bloc des dubia");
  assert.equal(sansPrelatsReels("une lettre de Pietro Parolin"), "une lettre du secrétaire d'État");
  assert.equal(sansPrelatsReels("écrire à Kevin Farrell"), "écrire au camerlingue");
});

test("« annoncée » n'est pas un nonce, et le budget de Moscou n'est pas vérifié contre les comptes du Saint-Siège", async () => {
  const { parleDesComptesDuSaintSiege } = await import("./churchPaper.js");
  const moscou = { title: "Restructuration budgétaire annoncée par Moscou", description: "Les dépenses publiques sont projetées à 3,46 milliards ; les promesses du gouvernement…", kind: "world", playerRelated: false };
  assert.equal(regardeLEglise(moscou), false);
  assert.equal(parleDesComptesDuSaintSiege(moscou), false);
  assert.equal(parleDesComptesDuSaintSiege({ title: "Point sur le fonds de pension de la Curie", description: "", playerRelated: false }), true);
});

test("un décompte du collège que le moteur ne connaît pas reçoit le vrai", async () => {
  const { decomptesDuCollege, noteDuCollege } = await import("./churchPaper.js");
  const { applyChurchPreset, HOLY_SEE } = await import("./churchPreset.js");
  const w = applyChurchPreset({}, { date: "2026-09-01" });
  const d = decomptesDuCollege(w.assembly, HOLY_SEE);
  assert.match(noteDuCollege("42 voix acquises à votre courant, 15 oppositions déclarées et 103 électeurs indécis", d), /^Au collège : 160 électeurs ; votre courant vote avec vous \(42 voix\), il en faut 81/);
  assert.equal(noteDuCollege("le seuil de 81 voix sur 160 électeurs, votre courant en compte 42", d), "");
  assert.equal(noteDuCollege("cinq cardinaux, puis 3 votants", d), "");
});

test("les alliés invités et les électeurs sans courant sont des décomptes réels", async () => {
  const { decomptesDuCollege, noteDuCollege } = await import("./churchPaper.js");
  const { applyChurchPreset, HOLY_SEE } = await import("./churchPreset.js");
  const w = applyChurchPreset({}, { date: "2026-09-01" });
  const d = decomptesDuCollege(w.assembly, HOLY_SEE, [{ courant: "Compagnie de Jésus" }, { courant: "Chemin synodal allemand" }]);
  assert.equal(noteDuCollege("42 voix acquises et 33 voix alliées, soit 75 voix, 6 de moins que les 81 requises ; les 38 électeurs sans étiquette", d), "");
});

test("une tendance des séminaires que le moteur ne tient pas reçoit les siennes", async () => {
  const { noteDesSeminaires } = await import("./churchPaper.js");
  const seminaires = [
    { nom: "Afrique", tendance: 0.008 },
    { nom: "Europe", tendance: -0.041 },
  ];
  assert.equal(noteDesSeminaires("Les séminaires d'Europe reculent de 4,1 % par an.", seminaires), "");
  assert.match(noteDesSeminaires("Les séminaires d'Europe, en recul de 3,2 %.", seminaires), /^Aux séminaires : Afrique \+0,8 % par an, Europe −4,1 % par an\.$/);
  assert.equal(noteDesSeminaires("Les dons représentent 43 % des recettes du Denier.", seminaires), "", "pas de séminaire, pas de note");
  assert.equal(noteDesSeminaires("Les séminaires d'Afrique accueillent 43 % des séminaristes du monde.", seminaires), "", "une part n'est pas une tendance");
});

test("l'argent tient au plus un tiers de l'édition, les ordres du pape restent", async () => {
  const { plafondDeLArgent, parleDArgent } = await import("./churchPaper.js");
  const ev = (title, extra = {}) => ({ title, description: "", importance: "notable", ...extra });
  const edition = [
    ev("Déficit de l'APSA : la Curie s'inquiète"),
    ev("Le Denier de Saint-Pierre recule en Allemagne"),
    ev("Vente conclue : immeuble de Milan", { playerRelated: true }),
    ev("Canonisation de trois martyrs coréens"),
    ev("Un évêque arrêté au Nicaragua"),
    ev("Le synode d'Afrique s'ouvre à Kinshasa"),
  ];
  assert.equal(parleDArgent(edition[3]), false);
  assert.equal(parleDArgent(edition[0]), true);
  const { gardes, retires } = plafondDeLArgent(edition);
  assert.equal(retires.length, 1, "trois nouvelles d'argent sur six : une de trop");
  assert.ok(gardes.includes(edition[2]), "le compte rendu d'un ordre reste");
  assert.equal(gardes.length, 5);
  const calme = plafondDeLArgent(edition.slice(3));
  assert.equal(calme.retires.length, 0);
});

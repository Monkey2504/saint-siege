/*! Open Historia — the college: a hundred and sixty people, drawn © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { readActionsState, readGameData, readWorldState, writeActionsState } from "../../runtime/gameState.js";
import { useSurface } from "../../runtime/useSurface.js";
import { CONTENU_TOP } from "./chrome.js";
import { CahierVide, EnTeteDeCahier, SectionHead, fmtDate } from "./journal.jsx";
import {
    AXES, HOSTILE_AT, LOYAL_AT, RADICAL_AT, ZEALOUS_AT,
    coalition, groupsOn, normalizeAssembly, putToTheVote, speechOrderText, standing, temper,
} from "../../runtime/factions.js";

// What it takes to carry a decision in this body. A threshold, because that is
// how a body's own rules read — not a share the interface invents.
const NEEDED = 50;

// A number in a table is not a room. The college is a hundred and sixty people
// and the player has to SEE them — where they sit, which of them have come over,
// which have stopped listening — and then walk up to a group and argue with it.
//
// Nobody belongs to a party here, so the drawing has no fixed colour scheme: the
// reader picks an axis and the same hundred and sixty people recolour by
// doctrine, by region or by role. That IS the mechanic, made visible.

const MOOD = [
    { at: ZEALOUS_AT, tone: "var(--oh-grant)", word: "vous suivraient partout" },
    { at: LOYAL_AT, tone: "var(--oh-grant)", word: "avec vous" },
    { at: HOSTILE_AT + 1, tone: "var(--oh-text-dim)", word: "indécis" },
    { at: RADICAL_AT + 1, tone: "var(--oh-caution)", word: "contre vous" },
    { at: -Infinity, tone: "var(--oh-alert)", word: "au-delà de la discussion" },
];
const moodOf = (approval) => MOOD.find((m) => approval >= m.at) ?? MOOD[MOOD.length - 1];

// Les clés du moteur restent anglaises : `AXES` vient de runtime/factions.js,
// les noms de groupes sont ceux du préréglage (churchPreset.js), et les deux
// circulent dans les invites et dans l'état enregistré. Seul l'affichage est
// français, par table — une valeur inconnue s'affiche telle quelle plutôt que
// de disparaître.
const AXE_LABEL = { doctrine: "Doctrine", region: "Région", role: "Charge", follows: "Courant", opinion: "Opinion" };
const GROUPE_LABEL = {
    africa: "Afrique", americas: "Amériques", asia: "Asie", europe: "Europe", oceania: "Océanie",
    traditional: "Traditionnels", centrist: "Centristes", reforming: "Réformateurs",
    curia: "Curie", diplomacy: "Diplomatie", bishops: "Évêques", orders: "Ordres", temporal: "Temporel",
};
const nomDeGroupe = (v) => GROUPE_LABEL[String(v || "").toLowerCase()] || v;

// One hue per group on the chosen axis, spread so neighbours never blur.
const hues = (names) => Object.fromEntries(names.map((n, i) => [n, `hsl(${Math.round((i / Math.max(1, names.length)) * 320) + 14} 56% 52%)`]));

/**
 * The horseshoe: rows of increasing length, filled outward, so a group sits
 * together and the size of a wedge is the size of the group.
 */
const seatPositions = (total) => {
    const rows = [];
    let placed = 0;
    let row = 0;
    while (placed < total) {
        const capacity = 14 + row * 5;
        const take = Math.min(capacity, total - placed);
        rows.push(take);
        placed += take;
        row += 1;
    }
    const points = [];
    rows.forEach((take, r) => {
        const radius = 32 + (r / Math.max(1, rows.length - 1 || 1)) * 64;
        for (let i = 0; i < take; i += 1) {
            const t = take === 1 ? 0.5 : i / (take - 1);
            const angle = Math.PI * (0.05 + t * 0.9);
            points.push({ x: 100 - Math.cos(angle) * radius, y: 101 - Math.sin(angle) * radius });
        }
    });
    return points;
};

const Hemicycle = ({ electors, axis, colours, selected, onSelect, byMood }) => {
    // Sorted by the chosen axis so each group is one wedge, not confetti.
    const seated = useMemo(() => [...electors].sort((a, b) => String(a[axis]).localeCompare(String(b[axis]))), [electors, axis]);
    const points = useMemo(() => seatPositions(seated.length), [seated.length]);
    return (
        <svg viewBox="0 0 200 112" role="img" aria-label={`${seated.length} électeurs par ${(AXE_LABEL[axis] || axis).toLowerCase()}`} style={{ display: "block", width: "100%" }}>
        {points.map((p, i) => {
            const e = seated[i];
            if (!e) return null;
            const group = e[axis];
            const dim = selected && group !== selected;
            return (
                <circle
                key={i} cx={p.x} cy={p.y} r={2.2}
                fill={byMood ? moodOf(e.approval).tone : colours[group]}
                opacity={dim ? 0.2 : 1}
                stroke={group === selected ? "var(--oh-text-strong)" : "none"} strokeWidth={0.6}
                style={{ cursor: "pointer" }}
                onClick={() => onSelect(group === selected ? "" : group)}
                >
                <title>{`${nomDeGroupe(e.doctrine)} · ${nomDeGroupe(e.region)} · ${nomDeGroupe(e.role)} (${e.approval > 0 ? "+" : ""}${Math.round(e.approval)})`}</title>
                </circle>
            );
        })}
        </svg>
    );
};

/**
 * Le collège vu depuis l'édition : l'hémicycle et le compte de la salle, tels
 * que la maquette les met en bas de colonne droite.
 *
 * C'est le MÊME hémicycle que le cahier, coloré par humeur. Un second dessin
 * finirait par montrer une salle que le cahier dément, et c'est le genre de
 * contradiction que ce journal promet de ne pas imprimer. Les marques n'y sont
 * pas cliquables : d'ici on lit la salle, on ne l'interroge pas.
 */
export const ApercuDuCollege = ({ assembly: brut }) => {
    const assembly = useMemo(() => normalizeAssembly(brut), [brut]);
    const room = useMemo(() => (assembly ? standing(assembly) : null), [assembly]);
    if (!assembly || !room) return null;
    return (
        <section>
        <SectionHead aside={`${room.seats} électeurs`}>Le collège</SectionHead>
        <Hemicycle
            electors={assembly.electors}
            axis="doctrine"
            colours={{}}
            selected=""
            onSelect={() => {}}
            byMood
        />
        <p style={{ fontSize: "var(--oh-t-xs)", lineHeight: 1.5, margin: "0.4rem 0 0" }}>
        <b style={{ color: "var(--oh-grant)" }}>{room.with}</b> avec vous ·{" "}
        <b style={{ color: "var(--oh-text-dim)" }}>{room.undecided}</b> indécis ·{" "}
        <b style={{ color: "var(--oh-caution)" }}>{room.against}</b> contre
        </p>
        <p style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)", lineHeight: 1.5, margin: "0.2rem 0 0" }}>
        Il en faut {room.majority} pour emporter une décision.
        </p>
        </section>
    );
};

export const College = ({ nav = null }) => {
    useSurface("chamber");
    const [world, setWorld] = useState(null);
    const [game, setGame] = useState(null);
    const [axis, setAxis] = useState("region");
    // L'écran s'ouvre sur l'opinion, pas sur la géographie : la question qu'on se
    // pose en entrant dans la salle est « ai-je la majorité », pas « d'où
    // viennent-ils ». La légende disait « indécis (0) » pour cinq continents,
    // la couleur parlant géographie pendant que le texte parlait vote.
    const [selected, setSelected] = useState("");
    const [byMood, setByMood] = useState(true);
    const [draft, setDraft] = useState("");
    const [sent, setSent] = useState(false);
    const [tick, setTick] = useState(0);

    useEffect(() => {
        let alive = true;
        Promise.all([readWorldState({ force: true }).catch(() => null), readGameData().catch(() => null)])
        .then(([w, g]) => { if (alive) { setWorld(w); setGame(g); } });
        return () => { alive = false; };
    }, [tick]);

    const assembly = useMemo(() => normalizeAssembly(world?.assembly), [world]);
    const parAxe = useMemo(() => (assembly ? groupsOn(assembly, axis) : []), [assembly, axis]);
    const parHumeur = useMemo(() => {
        if (!assembly) return [];
        const par = new Map();
        for (const e of assembly.electors) {
            const m = moodOf(e.approval);
            const g = par.get(m.word) || { name: m.word, seats: 0, somme: 0, tone: m.tone };
            g.seats += 1;
            g.somme += e.approval;
            par.set(m.word, g);
        }
        return [...par.values()]
            .map((g) => ({ ...g, approval: g.somme / Math.max(1, g.seats) }))
            .sort((x, y) => y.approval - x.approval);
    }, [assembly]);
    const groups = byMood ? parHumeur : parAxe;
    const colours = useMemo(() => hues(groups.map((g) => g.name)), [groups]);
    const room = useMemo(() => (assembly ? standing(assembly) : null), [assembly]);
    // What a reform pleasing this group and offending nobody else would carry.
    const test = useMemo(
        () => (assembly && selected ? putToTheVote(assembly, { pleases: [selected] }) : null),
        [assembly, selected],
    );
    // What the player COMMANDS, as opposed to what merely likes them this month,
    // and who would have to be sat down with to carry a decision.
    const player = game?.country || "";
    const [sitWith, setSitWith] = useState([]);
    const pact = useMemo(
        () => (assembly && player ? coalition(assembly, { player, need: NEEDED, sitWith }) : null),
        [assembly, player, sitWith],
    );
    const currents = useMemo(
        () => (assembly ? groupsOn(assembly, "follows").filter((g) => g.name && g.name !== player) : []),
        [assembly, player],
    );

    const address = useCallback(async () => {
        if (!draft.trim() || !assembly) return;
        const actions = await readActionsState().catch(() => []);
        await writeActionsState([...(Array.isArray(actions) ? actions : []), {
            id: `action-speech-${Date.now().toString(36)}`,
            kind: "action", status: "planned", date: new Date().toISOString(),
            title: `Address ${selected || assembly.name}`,
            text: speechOrderText(assembly.name, selected, draft),
        }]);
        setSent(true);
        setDraft("");
    }, [draft, selected, assembly]);

    if (!world) return null;
    if (!assembly || !room) {
        return (
            // Un cahier vide reste un cahier : même bandeau, même gouttière,
            // même colonne de lecture que les cinq autres. Sans cela la barre
            // des cahiers venait buter contre le bord de l'écran.
            <div data-surface="chamber" style={{ background: "var(--oh-plate)", bottom: 0, color: "var(--oh-text)", left: 0, overflowY: "auto", position: "fixed", right: 0, top: CONTENU_TOP, zIndex: 10002 }}>
            <div style={{ margin: "0 auto", maxWidth: "74rem", padding: "1.6rem 1.5rem 3rem" }}>
            <EnTeteDeCahier titre="Le Collège" mention={game?.gameDate ? `Rome, ${fmtDate(game.gameDate)}` : null} />
            {nav && nav()}
            <CahierVide quoiFaire="Un scénario qui tient un collège le déclare dans son état de départ ; celui-ci n'en a pas encore.">
            Aucune assemblée. Ce scénario n&apos;a pas encore de corps d&apos;électeurs.
            </CahierVide>
            </div>
            </div>
        );
    }

    const chip = (label, active, onClick) => (
        <button type="button" onClick={onClick} key={label}
        style={{
            background: active ? "var(--oh-accent)" : "transparent",
            border: `1px solid ${active ? "var(--oh-accent)" : "var(--oh-line)"}`,
            color: active ? "var(--oh-on-accent)" : "var(--oh-text)",
            cursor: "pointer", fontFamily: "var(--oh-font-label)", fontSize: "var(--oh-t-2xs)",
            letterSpacing: "var(--oh-label-track)", padding: "0.3rem 0.7rem", textTransform: "uppercase",
        }}>{label}</button>
    );

    // The room that votes, and it should feel like leaving the office to walk
    // into it: stone rather than paper, cooler and heavier
    // (theme.css, [data-surface="chamber"]).
    return (
        <div data-surface="chamber" style={{ background: "var(--oh-plate)", bottom: 0, color: "var(--oh-text)", left: 0, overflowY: "auto", position: "fixed", right: 0, top: CONTENU_TOP, zIndex: 10002 }}>
        {nav && nav()}
        <div style={{ margin: "0 auto", maxWidth: "74rem", padding: "1.6rem 1.5rem 3rem" }}>

        {/* The room itself, so a reader who has never seen a consistory knows
            what the hundred and sixty marks below actually are. Wikimedia
            Commons, CC BY 3.0 — the licence is met by naming the author, so the
            credit sits on the image rather than only in public/CREDITS.md. */}
        <figure style={{ margin: "0 0 1rem", position: "relative" }}>
        <img
        src="/college.png"
        alt="Cardinaux réunis en consistoire"
        style={{ display: "block", height: "clamp(7rem, 16vw, 11rem)", objectFit: "cover", objectPosition: "center 40%", width: "100%" }}
        />
        <figcaption
        style={{
            background: "var(--oh-plate)", bottom: 0, color: "var(--oh-text-dim)",
            fontSize: "var(--oh-t-2xs)", padding: "0.15rem 0.4rem", position: "absolute", right: 0,
        }}
        >
        Centro Televisivo Vaticano, CC BY 3.0
        </figcaption>
        </figure>

        {/* Ce cahier composait son bandeau à la main : Bricolage au lieu de
            Newsreader, et le nom de l'assemblée en manchette là où les cinq
            autres titrent leur cahier. Il passe par le même en-tête qu'eux, et
            le nom de l'assemblée descend en sous-mention, où il renseigne sans
            prétendre être le titre de la page. */}
        <EnTeteDeCahier
        titre="Le Collège"
        mention={game?.gameDate ? `Rome, ${fmtDate(game.gameDate)}` : null}
        sousMention={assembly.name}
        />
        <div style={{ alignItems: "baseline", borderBottom: "1px solid var(--oh-line)", display: "flex", flexWrap: "wrap", gap: "1rem", justifyContent: "space-between", marginBottom: "1.2rem", padding: "0.4rem 0 0.7rem" }}>
        <span className="oh-label" style={{ color: "var(--oh-text-dim)" }}>{room.seats} électeurs</span>
        <span style={{ fontSize: "var(--oh-t-sm)", fontVariantNumeric: "tabular-nums" }}>
        {/* Opinion only. What CARRIES a decision is the bloc that follows you
            plus whoever you sit with, and that count lives in its own panel —
            printing a second, different threshold here said two contradictory
            things about winning a vote on one screen. */}
        <b style={{ color: "var(--oh-grant)" }}>{room.with}</b> vous sont acquis ·{" "}
        <b style={{ color: "var(--oh-text-dim)" }}>{room.undecided}</b> indécis ·{" "}
        <b style={{ color: "var(--oh-caution)" }}>{room.against}</b> contre
        </span>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.8rem" }}>
        {AXES.map((a) => chip(AXE_LABEL[a] || a, axis === a && !byMood, () => { setAxis(a); setSelected(""); setByMood(false); }))}
        {chip(AXE_LABEL.opinion, byMood, () => setByMood(!byMood))}
        </div>

        <div style={{ display: "grid", gap: "1.5rem", gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)" }}>
        <div>
        <Hemicycle electors={assembly.electors} axis={axis} colours={colours} selected={selected} onSelect={setSelected} byMood={byMood} />
        <p style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-xs)", lineHeight: 1.5, margin: "0.3rem 0 0" }}>
        Une marque, un électeur. Personne n'appartient à un parti : les mêmes cent soixante personnes se regroupent par doctrine, par région ou par charge, et c'est pourquoi une réforme populaire sur un axe échoue sur un autre.
        </p>
        </div>

        <div>
        {groups.map((g) => {
            const mood = moodOf(g.approval);
            return (
                <button key={g.name} type="button" disabled={byMood} onClick={() => setSelected(g.name === selected ? "" : g.name)}
                style={{
                    background: g.name === selected ? "var(--oh-plate-2)" : "transparent", border: "none",
                    borderBottom: "1px dotted var(--oh-line)", cursor: byMood ? "default" : "pointer", display: "block",
                    padding: "0.5rem 0.4rem", textAlign: "left", width: "100%",
                }}>
                <div style={{ alignItems: "center", display: "flex", gap: "0.5rem" }}>
                <span style={{ background: byMood ? g.tone : colours[g.name], borderRadius: "50%", flexShrink: 0, height: "0.7rem", width: "0.7rem" }} />
                <span style={{ color: "var(--oh-text-strong)", fontFamily: "var(--oh-font-display)", fontSize: "var(--oh-t-sm)", fontWeight: 700 }}>{nomDeGroupe(g.name)}</span>
                <span style={{ color: "var(--oh-text-strong)", fontSize: "var(--oh-t-sm)", fontVariantNumeric: "tabular-nums", marginLeft: "auto" }}>{g.seats}</span>
                </div>
                <div style={{ color: mood.tone, fontSize: "var(--oh-t-xs)", marginTop: "0.1rem", paddingLeft: "1.2rem" }}>
                {/* Groupé par humeur, le nom du groupe est déjà le mot — la ligne
                    se lisait « indécis 160 » puis « (0) », un nombre sans son
                    nom. Groupé autrement, le mot renseigne et la parenthèse
                    suffit. */}
                {byMood
                    ? `approbation moyenne ${g.approval > 0 ? "+" : ""}${Math.round(g.approval)}`
                    : `${mood.word} (${g.approval > 0 ? "+" : ""}${Math.round(g.approval)})`}
                </div>
                </button>
            );
        })}
        {test && (
            <div style={{ border: "1px solid var(--oh-line)", fontSize: "var(--oh-t-xs)", lineHeight: 1.5, marginTop: "0.8rem", padding: "0.6rem 0.7rem" }}>
            Une mesure qui plairait aux {nomDeGroupe(selected)} sans froisser personne emporterait{" "}
            <b style={{ color: test.passed ? "var(--oh-grant)" : "var(--oh-caution)" }}>{test.ayes} voix sur les {test.majority} qu'il en faut</b>
            {test.noes ? `, contre ${test.noes}` : ""}
            {test.abstain ? `, ${test.abstain} restant indifférents` : ""}.
            </div>
        )}
        </div>
        </div>

        {/* Your own bloc, the threshold, and who you would have to sit with.
            A pontificate either commands the votes or it negotiates for them. */}
        {pact && (
            <section style={{ marginTop: "1.6rem" }}>
            <div className="oh-label" style={{ borderBottom: "var(--oh-filet-fort) solid var(--oh-text-strong)", color: "var(--oh-text-strong)", paddingBottom: "0.4rem" }}>
            Pour emporter une décision — il en faut {pact.need}
            </div>
            <p style={{ fontSize: "var(--oh-t-sm)", lineHeight: 1.6, margin: "0.8rem 0 0.6rem", maxWidth: "70ch" }}>
            <b style={{ color: pact.carriesAlone ? "var(--oh-grant)" : "var(--oh-text-strong)" }}>{pact.alone} vous suivent.</b>{" "}
            {pact.carriesAlone
                ? "Vous emportez ce corps seul, sans personne."
                : <>Avec {pact.partners.length === 1 ? "le courant" : `les ${pact.partners.length} courants`} avec qui vous vous êtes assis, {pact.held}. {pact.carries
                    ? <b style={{ color: "var(--oh-grant)" }}>Cela l'emporte.</b>
                    : <>Il en manque {pact.short}. {pact.unattached} électeurs ne suivent aucun courant — ce sont eux qui sont en jeu.</>}</>}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            {currents.map((c) => {
                const on = sitWith.includes(c.name);
                const refused = pact.refused.find((r) => r.name === c.name);
                return (
                    <button key={c.name} type="button"
                    onClick={() => setSitWith((prev) => (on ? prev.filter((n) => n !== c.name) : [...prev, c.name]))}
                    title={refused ? refused.why : `${c.seats} électeurs les suivent`}
                    style={{
                        background: on && !refused ? "var(--oh-accent)" : "transparent",
                        border: `1px solid ${refused && on ? "var(--oh-alert)" : on ? "var(--oh-accent)" : "var(--oh-line)"}`,
                        color: on && !refused ? "var(--oh-on-accent)" : refused && on ? "var(--oh-alert)" : "var(--oh-text)",
                        cursor: "pointer", fontSize: "var(--oh-t-xs)", padding: "0.35rem 0.7rem",
                    }}>
                    {c.name} · {c.seats}
                    </button>
                );
            })}
            </div>
            {pact.refused.filter((r) => sitWith.includes(r.name)).map((r) => (
                <p key={r.name} style={{ color: "var(--oh-alert)", fontSize: "var(--oh-t-xs)", lineHeight: 1.5, margin: "0.5rem 0 0" }}>
                {r.name} will not sit down: {r.why}.
                </p>
            ))}
            </section>
        )}

        <section style={{ marginTop: "1.6rem" }}>
        <div className="oh-label" style={{ borderBottom: "var(--oh-filet-fort) solid var(--oh-text-strong)", color: "var(--oh-text-strong)", paddingBottom: "0.4rem" }}>
        {selected ? `Parler aux ${selected}` : "Parler au collège"}
        </div>
        <textarea value={draft} onChange={(e) => { setDraft(e.target.value); setSent(false); }} rows={4}
        placeholder="Ce que vous allez leur dire, et pourquoi ils devraient vous suivre."
        style={{
            background: "var(--oh-plate-2)", border: "1px solid var(--oh-line)", color: "var(--oh-text-strong)",
            fontFamily: "var(--oh-font-body)", fontSize: "var(--oh-t-base)", marginTop: "0.8rem",
            padding: "0.7rem 0.8rem", width: "100%",
        }} />
        <div style={{ alignItems: "center", display: "flex", gap: "1rem", marginTop: "0.6rem" }}>
        <button type="button" onClick={address} disabled={!draft.trim()}
        style={{
            background: draft.trim() ? "var(--oh-accent)" : "var(--oh-plate-2)", border: "none",
            color: draft.trim() ? "var(--oh-on-accent)" : "var(--oh-text-dim)",
            cursor: draft.trim() ? "pointer" : "default", fontFamily: "var(--oh-font-label)",
            fontSize: "var(--oh-t-2xs)", letterSpacing: "var(--oh-label-track)", padding: "0.55rem 1.1rem", textTransform: "uppercase",
        }}>Le leur dire</button>
        {sent && <span style={{ color: "var(--oh-grant)", fontSize: "var(--oh-t-xs)" }}>Versé au dossier. Livré et jugé à la prochaine édition.</span>}
        <button type="button" onClick={() => setTick((t) => t + 1)}
        style={{ background: "transparent", border: "none", color: "var(--oh-text-dim)", cursor: "pointer", fontSize: "var(--oh-t-xs)", marginLeft: "auto" }}>Rafraîchir</button>
        </div>
        <p style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-xs)", lineHeight: 1.55, margin: "0.9rem 0 0", maxWidth: "72ch" }}>
        Personne ici ne commence contre vous. Chaque opinion a été gagnée par ce que vous avez fait, et les chiffres qui la portent sont ceux du moteur. Un discours vaut ce que vaut votre crédit et n'atteint que ceux qui écoutent encore ; une affirmation que les comptes démentent fait perdre du terrain au lieu d'en gagner. La salle se gagne en gouvernant bien, et le discours ne fait que l'affermir.
        </p>
        </section>
        </div>
        </div>
    );
};

export default College;

/*! Open Historia — the college: a hundred and sixty people, drawn © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { readActionsState, readGameData, readWorldState, writeActionsState } from "../../runtime/gameState.js";
import { useSurface } from "../../runtime/useSurface.js";
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
    { at: ZEALOUS_AT, tone: "var(--oh-grant)", word: "would follow you anywhere" },
    { at: LOYAL_AT, tone: "var(--oh-grant)", word: "with you" },
    { at: HOSTILE_AT + 1, tone: "var(--oh-text-dim)", word: "undecided" },
    { at: RADICAL_AT + 1, tone: "var(--oh-caution)", word: "against you" },
    { at: -Infinity, tone: "var(--oh-alert)", word: "past arguing" },
];
const moodOf = (approval) => MOOD.find((m) => approval >= m.at) ?? MOOD[MOOD.length - 1];

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
        <svg viewBox="0 0 200 112" role="img" aria-label={`${seated.length} electors by ${axis}`} style={{ display: "block", width: "100%" }}>
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
                <title>{`${e.doctrine} · ${e.region} · ${e.role} (${e.approval > 0 ? "+" : ""}${Math.round(e.approval)})`}</title>
                </circle>
            );
        })}
        </svg>
    );
};

export const College = () => {
    useSurface("chamber");
    const [world, setWorld] = useState(null);
    const [game, setGame] = useState(null);
    const [axis, setAxis] = useState("region");
    const [selected, setSelected] = useState("");
    const [byMood, setByMood] = useState(false);
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
    const groups = useMemo(() => (assembly ? groupsOn(assembly, axis) : []), [assembly, axis]);
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
            <div data-surface="chamber" style={{ background: "var(--oh-plate)", bottom: "2.6rem", color: "var(--oh-text)", left: 0, overflowY: "auto", position: "fixed", right: 0, top: 0, zIndex: 10002 }}>
            <div style={{ margin: "0 auto", maxWidth: "42rem", padding: "3rem 1.5rem" }}>
            <h1 style={{ color: "var(--oh-text-strong)", fontFamily: "var(--oh-font-display)", fontSize: "var(--oh-t-xl)", margin: 0 }}>No assembly</h1>
            <p style={{ fontSize: "var(--oh-t-base)", lineHeight: 1.6 }}>This scenario has no body of electors yet.</p>
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
        <div data-surface="chamber" style={{ background: "var(--oh-plate)", bottom: "2.6rem", color: "var(--oh-text)", left: 0, overflowY: "auto", position: "fixed", right: 0, top: 0, zIndex: 10002 }}>
        <div style={{ margin: "0 auto", maxWidth: "70rem", padding: "1.6rem 1.5rem 3rem" }}>

        {/* The room itself, so a reader who has never seen a consistory knows
            what the hundred and sixty marks below actually are. Wikimedia
            Commons, CC BY 3.0 — the licence is met by naming the author, so the
            credit sits on the image rather than only in public/CREDITS.md. */}
        <figure style={{ margin: "0 0 1rem", position: "relative" }}>
        <img
        src="/college.png"
        alt="Cardinals assembled in consistory"
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

        <header style={{ borderBottom: "4px solid var(--oh-text-strong)", paddingBottom: "0.5rem" }}>
        <h1 style={{ color: "var(--oh-text-strong)", fontFamily: "var(--oh-font-display)", fontSize: "clamp(1.9rem, 4vw, 3rem)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1, margin: 0 }}>
        {assembly.name}
        </h1>
        </header>
        <div style={{ alignItems: "baseline", borderBottom: "1px solid var(--oh-line)", display: "flex", flexWrap: "wrap", gap: "1rem", justifyContent: "space-between", marginBottom: "1.2rem", padding: "0.4rem 0 0.7rem" }}>
        <span className="oh-label" style={{ color: "var(--oh-text-dim)" }}>{room.seats} electors · {game?.gameDate || ""}</span>
        <span style={{ fontSize: "var(--oh-t-sm)", fontVariantNumeric: "tabular-nums" }}>
        {/* Opinion only. What CARRIES a decision is the bloc that follows you
            plus whoever you sit with, and that count lives in its own panel —
            printing a second, different threshold here said two contradictory
            things about winning a vote on one screen. */}
        <b style={{ color: "var(--oh-grant)" }}>{room.with}</b> think well of you ·{" "}
        <b style={{ color: "var(--oh-text-dim)" }}>{room.undecided}</b> undecided ·{" "}
        <b style={{ color: "var(--oh-caution)" }}>{room.against}</b> against
        </span>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.8rem" }}>
        {AXES.map((a) => chip(a, axis === a && !byMood, () => { setAxis(a); setSelected(""); setByMood(false); }))}
        {chip("opinion", byMood, () => setByMood(!byMood))}
        </div>

        <div style={{ display: "grid", gap: "1.5rem", gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)" }}>
        <div>
        <Hemicycle electors={assembly.electors} axis={axis} colours={colours} selected={selected} onSelect={setSelected} byMood={byMood} />
        <p style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-xs)", lineHeight: 1.5, margin: "0.3rem 0 0" }}>
        One mark, one elector. Nobody belongs to a party: the same hundred and sixty people regroup by doctrine, by region or by role, which is why a reform popular on one axis can fail on another.
        </p>
        </div>

        <div>
        {groups.map((g) => {
            const mood = moodOf(g.approval);
            return (
                <button key={g.name} type="button" onClick={() => setSelected(g.name === selected ? "" : g.name)}
                style={{
                    background: g.name === selected ? "var(--oh-plate-2)" : "transparent", border: "none",
                    borderBottom: "1px dotted var(--oh-line)", cursor: "pointer", display: "block",
                    padding: "0.5rem 0.4rem", textAlign: "left", width: "100%",
                }}>
                <div style={{ alignItems: "center", display: "flex", gap: "0.5rem" }}>
                <span style={{ background: colours[g.name], borderRadius: "50%", flexShrink: 0, height: "0.7rem", width: "0.7rem" }} />
                <span style={{ color: "var(--oh-text-strong)", fontFamily: "var(--oh-font-display)", fontSize: "var(--oh-t-sm)", fontWeight: 700 }}>{g.name}</span>
                <span style={{ color: "var(--oh-text-strong)", fontSize: "var(--oh-t-sm)", fontVariantNumeric: "tabular-nums", marginLeft: "auto" }}>{g.seats}</span>
                </div>
                <div style={{ color: mood.tone, fontSize: "var(--oh-t-xs)", marginTop: "0.1rem", paddingLeft: "1.2rem" }}>
                {mood.word} ({g.approval > 0 ? "+" : ""}{Math.round(g.approval)})
                </div>
                </button>
            );
        })}
        {test && (
            <div style={{ border: "1px solid var(--oh-line)", fontSize: "var(--oh-t-xs)", lineHeight: 1.5, marginTop: "0.8rem", padding: "0.6rem 0.7rem" }}>
            A measure that pleased {selected} and offended nobody would take{" "}
            <b style={{ color: test.passed ? "var(--oh-grant)" : "var(--oh-caution)" }}>{test.ayes} of the {test.majority} it needs</b>
            {test.noes ? `, against ${test.noes}` : ""}
            {test.abstain ? `, with ${test.abstain} indifferent` : ""}.
            </div>
        )}
        </div>
        </div>

        {/* Your own bloc, the threshold, and who you would have to sit with.
            A pontificate either commands the votes or it negotiates for them. */}
        {pact && (
            <section style={{ marginTop: "1.6rem" }}>
            <div className="oh-label" style={{ borderBottom: "4px solid var(--oh-text-strong)", color: "var(--oh-text-strong)", paddingBottom: "0.4rem" }}>
            Carrying a decision — {pact.need} needed
            </div>
            <p style={{ fontSize: "var(--oh-t-sm)", lineHeight: 1.6, margin: "0.8rem 0 0.6rem", maxWidth: "70ch" }}>
            <b style={{ color: pact.carriesAlone ? "var(--oh-grant)" : "var(--oh-text-strong)" }}>{pact.alone} follow you.</b>{" "}
            {pact.carriesAlone
                ? "You carry this body alone and need nobody."
                : <>With the {pact.partners.length} {pact.partners.length === 1 ? "current" : "currents"} you have sat down with, {pact.held}. {pact.carries
                    ? <b style={{ color: "var(--oh-grant)" }}>That carries it.</b>
                    : <>Still {pact.short} short. {pact.unattached} electors follow no current at all — those are the ones in play.</>}</>}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            {currents.map((c) => {
                const on = sitWith.includes(c.name);
                const refused = pact.refused.find((r) => r.name === c.name);
                return (
                    <button key={c.name} type="button"
                    onClick={() => setSitWith((prev) => (on ? prev.filter((n) => n !== c.name) : [...prev, c.name]))}
                    title={refused ? refused.why : `${c.seats} electors follow them`}
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
        <div className="oh-label" style={{ borderBottom: "4px solid var(--oh-text-strong)", color: "var(--oh-text-strong)", paddingBottom: "0.4rem" }}>
        {selected ? `Speak to the ${selected}` : "Speak to the whole college"}
        </div>
        <textarea value={draft} onChange={(e) => { setDraft(e.target.value); setSent(false); }} rows={4}
        placeholder="What you will tell them, and why they should follow you."
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
        }}>Put it to them</button>
        {sent && <span style={{ color: "var(--oh-grant)", fontSize: "var(--oh-t-xs)" }}>Queued. It is delivered, and judged, on the next edition.</span>}
        <button type="button" onClick={() => setTick((t) => t + 1)}
        style={{ background: "transparent", border: "none", color: "var(--oh-text-dim)", cursor: "pointer", fontSize: "var(--oh-t-xs)", marginLeft: "auto" }}>Refresh</button>
        </div>
        <p style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-xs)", lineHeight: 1.55, margin: "0.9rem 0 0", maxWidth: "72ch" }}>
        Nobody in this room begins against you. Every opinion here was earned by what you actually did, and the figures behind it are the engine&apos;s own. A speech is worth what your standing is worth and reaches only those still listening; claims the ledger contradicts lose ground rather than winning it. The room is carried by governing well, and only steadied by speaking.
        </p>
        </section>
        </div>
        </div>
    );
};

export default College;

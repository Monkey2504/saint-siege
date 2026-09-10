/*! Open Historia — the correspondence: the pope's letters, as a page © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
import React, { useEffect, useMemo, useState } from "react";
import { readGameData, readWorldState } from "../../runtime/gameState.js";
import { groupsOn, normalizeAssembly, temper } from "../../runtime/factions.js";
import { useSurface } from "../../runtime/useSurface.js";
import { ensureOrganizations } from "./organizationsView.jsx";
import {
    ConversationView,
    CountrySelectorModal,
    chatMessageCount,
    countryMatchesIdentity,
    isChatUnread,
    loadAllChats,
    loadCountryNames,
    readSeen,
    saveAllChats,
    seenTotals,
    writeSeen,
} from "./chat.jsx";

// The Post — the design proposal's letter box (option 2b), built as it was
// drawn: a 320px column of correspondents against a full-height rule, the
// letters of the one chosen beside it, and nothing else on the page.
//
// It prints on the house's own paper. The proposal is explicit about that — all
// five of its sections use this stock, this ink, this ministry blue — and an
// earlier attempt to give each page a paper of its own is what the player
// rejected: "depuis que tu as touché, c'est beaucoup moins bien visuellement."
// What makes this a letter box rather than a page of the paper is the layout
// and the reading face, never the palette.
//
// Two things the proposal adds that the page never had. A correspondent's row
// carries where they stand — a coloured edge and a line of standing — so the
// box says who is with you before you open anything. And the foot of the column
// says what a letter is worth, because a player who thinks writing is free
// writes differently from one who knows it costs standing.

const fmtDate = (value) => {
    if (!value) return "";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
};

const fmtShort = (value) => {
    if (!value) return "";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

// Which drawer a correspondent belongs in. The proposal files them in four; the
// game's own three kinds are states, the currents that carry intents, and the
// bodies of the era, so those are the four tabs it gets.
const KINDS = [
    { id: "all", label: "All" },
    { id: "current", label: "Currents" },
    { id: "state", label: "States" },
    { id: "body", label: "Bodies" },
];

const kindOf = (chat) => {
    const list = Array.isArray(chat?.countries) ? chat.countries : [];
    if (list.some((c) => c?.faction)) return "current";
    if (list.every((c) => c?.organization)) return "body";
    return "state";
};

// Where a correspondent stands, when the assembly knows. A current that holds
// seats has an average approval, which is what the edge and the standing line
// report; anyone else has neither, and gets neither rather than a made-up one.
const standingOf = (chat, blocs) => {
    const names = (Array.isArray(chat?.countries) ? chat.countries : []).map((c) => String(c?.name ?? "").toLowerCase());
    const bloc = blocs.find((g) => names.includes(String(g.name).toLowerCase()));
    if (!bloc) return null;
    const approval = Math.round(bloc.approval);
    const mood = temper(bloc.approval);
    return {
        seats: bloc.seats,
        approval,
        mood,
        // The token by role, not a hue picked for looks: what is with you is the
        // grant, what is against is the alert, what has gone further is caution.
        tone: approval >= 20 ? "grant" : approval <= -50 ? "alert" : approval <= -20 ? "caution" : "accent",
    };
};

const toneVar = (tone) => `var(--oh-${tone})`;

// One correspondent in the column: who, where they stand, the last line
// exchanged, and a mark when something arrived unread.
const CorrespondentRow = ({ chat, active, unread, standing: where, onOpen, onDelete }) => {
    const [confirming, setConfirming] = useState(false);
    const names = (chat.countries ?? []).map((c) => c.name).join(", ") || "Unknown";
    const last = chat.messages?.at(-1);
    const preview = last?.text ? `${last.speaker ? `${last.speaker}: ` : ""}${last.text}` : "No letter exchanged yet.";
    const edge = where ? toneVar(where.tone) : "var(--oh-line)";
    return (
        <div
        style={{
            background: active ? "var(--oh-plate-2)" : "transparent",
            borderBottom: "1px solid var(--oh-line)",
            borderLeft: `4px solid ${edge}`,
            display: "flex",
            gap: "0.5rem",
            padding: "0.85rem 0.9rem 0.9rem 1rem",
        }}
        >
        <button
        type="button"
        onClick={onOpen}
        style={{ background: "none", border: 0, color: "inherit", cursor: "pointer", flex: 1, minWidth: 0, padding: 0, textAlign: "left" }}
        >
        <div style={{ alignItems: "baseline", display: "flex", gap: "0.5rem", justifyContent: "space-between" }}>
        <span style={{ color: "var(--oh-text-strong)", fontFamily: "var(--oh-font-display)", fontSize: "var(--oh-t-base)", fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {names}
        {unread && <span style={{ background: "var(--oh-alert)", borderRadius: "var(--oh-r-pill)", display: "inline-block", height: "0.45rem", marginLeft: "0.35rem", verticalAlign: "middle", width: "0.45rem" }} />}
        </span>
        <span style={{ color: "var(--oh-text-dim)", flexShrink: 0, fontSize: "var(--oh-t-2xs)" }}>{fmtShort(last?.time)}</span>
        </div>
        {/* Two lines of the last letter, clamped: enough to recognise the
            exchange, never enough to read it here. */}
        <div style={{ WebkitBoxOrient: "vertical", WebkitLineClamp: 2, color: "var(--oh-text)", display: "-webkit-box", fontSize: "var(--oh-t-xs)", lineHeight: 1.45, marginTop: "0.25rem", overflow: "hidden" }}>
        {preview}
        </div>
        {where && (
            <div style={{ color: toneVar(where.tone), fontSize: "var(--oh-t-2xs)", fontWeight: 600, marginTop: "0.35rem" }}>
            {where.seats} {where.seats === 1 ? "elector" : "electors"} · {where.mood} ({where.approval > 0 ? "+" : ""}{where.approval})
            </div>
        )}
        </button>
        <button
        type="button"
        title={confirming ? "Click again to file this correspondence away" : "File away"}
        onClick={() => { if (confirming) onDelete(); else setConfirming(true); }}
        onBlur={() => setConfirming(false)}
        style={{ background: confirming ? "var(--oh-alert-soft)" : "none", border: 0, color: confirming ? "var(--oh-text-strong)" : "var(--oh-text-dim)", cursor: "pointer", flexShrink: 0, fontSize: "var(--oh-t-sm)", height: "1.4rem", lineHeight: 1, padding: "0.15rem 0.3rem" }}
        >
        {confirming ? "file?" : "×"}
        </button>
        </div>
    );
};

const Correspondence = () => {
    useSurface("desk");
    const [game, setGame] = useState(null);
    const [world, setWorld] = useState(null);
    const [chats, setChats] = useState([]);
    const [countries, setCountries] = useState([]);
    // The currents that act in the world, kept apart so they can be addressed
    // together in one letter — a consistory, not seven private notes.
    const [factions, setFactions] = useState([]);
    const [loadingCountries, setLoadingCountries] = useState(true);
    const [activeId, setActiveId] = useState(null);
    const [composing, setComposing] = useState(false);
    const [kind, setKind] = useState("all");
    const [unreadIds, setUnreadIds] = useState(() => new Set());

    const playerCountry = game?.country || "";
    const gameDate = game?.gameDate || "";

    // Load once: the game, the correspondents, and the bodies of the era that can
    // be written to like a state. Then snapshot what is unread and count it seen.
    useEffect(() => {
        let active = true;
        (async () => {
            const [nextGame, saved, countryList] = await Promise.all([
                readGameData().catch(() => null),
                loadAllChats({ force: true }).catch(() => []),
                loadCountryNames().catch(() => []),
            ]);
            const date = nextGame?.gameDate || "";
            const bodies = await ensureOrganizations(date).then((list) => list.filter((o) => o.status === "active").map((o) => ({ name: o.name, code: "", organization: true }))).catch(() => []);
            // Anyone who ACTS in the world can be written to. The list held
            // countries and organizations only, so the currents carrying the
            // standing intents — the ones actually working for and against the
            // player — could write to him and could not be written to. A player
            // who reads a warning from a faction and finds no way to answer it
            // is looking at a wall, not at a correspondence.
            const nextWorld = await readWorldState().catch(() => null);
            const currents = [...new Set((Array.isArray(nextWorld?.intents) ? nextWorld.intents : [])
                .map((i) => String(i?.owner ?? "").trim())
                .filter(Boolean))]
                .filter((name) => !bodies.some((b) => b.name.toLowerCase() === name.toLowerCase()))
                .map((name) => ({ name, code: "", organization: true, faction: true }));
            if (!active) return;
            setGame(nextGame);
            setWorld(nextWorld);
            const list = Array.isArray(saved) ? saved : [];
            setChats(list);
            setFactions(currents);
            setCountries([...(Array.isArray(countryList) ? countryList : []), ...bodies, ...currents]);
            setLoadingCountries(false);
            const open = list.filter((c) => c.status !== "closed");
            setUnreadIds(new Set(open.filter((c) => isChatUnread(c, readSeen())).map((c) => String(c.id))));
            writeSeen(seenTotals(open));
        })();
        return () => { active = false; };
    }, []);

    // Letters that land from outside — a jump's invitation, the idle outreach —
    // must appear while the page is open, without clobbering an exchange in flight.
    useEffect(() => {
        let cancelled = false;
        const sync = () => loadAllChats({ force: true }).then((saved) => {
            if (cancelled || !Array.isArray(saved)) return;
            setChats((prev) => {
                const sig = (l) => l.map((c) => `${c.id}:${c.status}:${chatMessageCount(c)}`).join("|");
                if (sig(saved) === sig(prev)) return prev;
                setUnreadIds((ids) => {
                    const next = new Set(ids);
                    for (const c of saved) {
                        const before = prev.find((p) => p.id === c.id);
                        if (c.status !== "closed" && String(c.id) !== String(activeId) && chatMessageCount(c) > chatMessageCount(before)) next.add(String(c.id));
                    }
                    return next;
                });
                return saved.map((c) => {
                    const mine = prev.find((p) => p.id === c.id);
                    // The open conversation keeps its own copy unless storage holds more.
                    return mine && String(c.id) === String(activeId) && chatMessageCount(mine) >= chatMessageCount(c) ? mine : c;
                });
            });
        }).catch(() => {});
        const iv = setInterval(sync, 5000);
        return () => { cancelled = true; clearInterval(iv); };
    }, [activeId]);

    // The blocs the assembly actually holds, so a row can say where its
    // correspondent stands instead of guessing from the letters.
    const blocs = useMemo(() => {
        const assembly = normalizeAssembly(world?.assembly);
        return assembly ? groupsOn(assembly, "follows") : [];
    }, [world]);

    const openChats = useMemo(() => chats.filter((c) => c.status !== "closed"), [chats]);
    const filtered = useMemo(
        () => (kind === "all" ? openChats : openChats.filter((c) => kindOf(c) === kind)),
        [openChats, kind],
    );
    const ordered = useMemo(() => [
        ...filtered.filter((c) => unreadIds.has(String(c.id))),
        ...filtered.filter((c) => !unreadIds.has(String(c.id))),
    ], [filtered, unreadIds]);
    const activeChat = useMemo(() => openChats.find((c) => String(c.id) === String(activeId)) ?? null, [openChats, activeId]);
    const availableCountries = useMemo(() => countries.filter((c) => !countryMatchesIdentity(c, playerCountry)), [countries, playerCountry]);
    // The player carries standing intents of their own, so their polity appears
    // among the currents. Addressing "everyone" must not seat the pope in his
    // own consistory — the picker drops him and this shortcut has to as well.
    const addressableFactions = useMemo(
        () => factions.filter((f) => !countryMatchesIdentity(f, playerCountry)),
        [factions, playerCountry],
    );
    const activeStanding = useMemo(() => (activeChat ? standingOf(activeChat, blocs) : null), [activeChat, blocs]);

    const openChat = (chat) => {
        setActiveId(chat.id);
        setUnreadIds((ids) => { const next = new Set(ids); next.delete(String(chat.id)); return next; });
        writeSeen({ ...(readSeen() || {}), [String(chat.id)]: chatMessageCount(chat) });
    };

    const startChat = (selected) => {
        const chat = { id: Date.now(), countries: selected, messages: [], status: "open" };
        setChats((prev) => { const u = [chat, ...prev]; saveAllChats(u); return u; });
        setComposing(false);
        setActiveId(chat.id);
    };

    // Filing away hides the thread; it does not erase it — the world still holds it.
    const fileAway = (id) => {
        setChats((prev) => { const u = prev.map((c) => (c.id === id ? { ...c, status: "closed" } : c)); saveAllChats(u); return u; });
        if (String(activeId) === String(id)) setActiveId(null);
    };

    const onMessagesUpdate = (chatId, messages) => {
        writeSeen({ ...(readSeen() || {}), [String(chatId)]: Array.isArray(messages) ? messages.length : 0 });
        setChats((prev) => { const u = prev.map((c) => (c.id === chatId ? { ...c, messages } : c)); saveAllChats(u); return u; });
    };

    const unread = ordered.filter((c) => unreadIds.has(String(c.id))).length;
    const activeNames = (activeChat?.countries ?? []).map((c) => c.name).join(", ");

    return (
        <div data-surface="desk" style={{ background: "var(--oh-plate)", bottom: "2.6rem", color: "var(--oh-text)", display: "grid", gridTemplateColumns: "minmax(17rem, 20rem) minmax(0, 1fr)", left: 0, overflow: "hidden", position: "fixed", right: 0, top: 0, zIndex: 10002 }}>

        {/* ── The column of correspondents ─────────────────────────────────── */}
        <div style={{ borderRight: "1px solid var(--oh-line)", display: "flex", flexDirection: "column", minHeight: 0 }}>

        <div style={{ borderBottom: "1px solid var(--oh-line)", flexShrink: 0, padding: "1.35rem 1.2rem 0.9rem" }}>
        <span className="oh-label" style={{ color: "var(--oh-text-dim)" }}>{playerCountry ? `${playerCountry} · section` : "section"}</span>
        <h1 style={{ color: "var(--oh-text-strong)", fontFamily: "var(--oh-font-display)", fontSize: "var(--oh-t-xl)", fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 0.95, margin: "0.4rem 0 0" }}>
        The Post
        </h1>
        <p style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-xs)", lineHeight: 1.45, margin: "0.55rem 0 0" }}>
        {unread > 0 ? `${unread} unread · ` : ""}replies go out with the next edition
        </p>
        </div>

        {/* Which drawer. */}
        <div style={{ borderBottom: "1px solid var(--oh-line)", display: "flex", flexShrink: 0, flexWrap: "wrap", gap: "0.35rem", padding: "0.7rem 1.2rem" }}>
        {KINDS.map((k) => {
            const on = k.id === kind;
            return (
                <button
                key={k.id}
                type="button"
                onClick={() => setKind(k.id)}
                style={{
                    background: on ? "var(--oh-text-strong)" : "transparent",
                    border: `1px solid ${on ? "var(--oh-text-strong)" : "var(--oh-line)"}`,
                    color: on ? "var(--oh-plate)" : "var(--oh-text)",
                    cursor: "pointer",
                    fontFamily: "var(--oh-font-label)",
                    fontSize: "var(--oh-t-2xs)",
                    fontWeight: 700,
                    letterSpacing: "var(--oh-label-track)",
                    padding: "0.35rem 0.55rem",
                    textTransform: "var(--oh-label-case)",
                }}
                >
                {k.label}
                </button>
            );
        })}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", scrollbarWidth: "none" }}>
        {ordered.length === 0 && (
            <p style={{ color: "var(--oh-text-dim)", fontFamily: "var(--oh-font-serif)", fontSize: "var(--oh-t-sm)", fontStyle: "italic", lineHeight: 1.5, margin: "1.1rem 1.2rem" }}>
            Nothing filed here yet. Open a letter below: a state, a current, or a body of the era.
            </p>
        )}
        {ordered.map((chat) => (
            <CorrespondentRow
            key={chat.id}
            chat={chat}
            active={String(chat.id) === String(activeId)}
            unread={unreadIds.has(String(chat.id))}
            standing={standingOf(chat, blocs)}
            onOpen={() => openChat(chat)}
            onDelete={() => fileAway(chat.id)}
            />
        ))}
        </div>

        <div style={{ borderTop: "1px solid var(--oh-line)", display: "flex", flexDirection: "column", flexShrink: 0, gap: "0.4rem", padding: "0.9rem 1.2rem 1rem" }}>
        <button
        type="button"
        onClick={() => setComposing(true)}
        style={{ background: "var(--oh-accent)", border: 0, color: "var(--oh-on-accent)", cursor: "pointer", fontFamily: "var(--oh-font-label)", fontSize: "var(--oh-t-xs)", fontWeight: 700, letterSpacing: "var(--oh-label-track)", padding: "0.7rem 1rem", textTransform: "var(--oh-label-case)" }}
        >
        New letter
        </button>
        {/* One letter to every current at once. Writing to seven of them one at a
            time is seven private notes; a pope addresses them together, and they
            answer in front of each other. */}
        {addressableFactions.length > 1 && (
            <button
            type="button"
            onClick={() => startChat(addressableFactions)}
            style={{ background: "transparent", border: "1px solid var(--oh-line)", color: "var(--oh-text)", cursor: "pointer", fontFamily: "var(--oh-font-label)", fontSize: "var(--oh-t-2xs)", letterSpacing: "var(--oh-label-track)", padding: "0.5rem 1rem", textTransform: "var(--oh-label-case)" }}
            >
            Address all {addressableFactions.length} currents at once
            </button>
        )}
        {/* What a letter costs. Left unsaid, a player writes as though writing
            were free — and the engine judges every letter against the record. */}
        <p style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)", lineHeight: 1.5, margin: "0.3rem 0 0" }}>
        A letter is worth what your standing is worth. It reaches only those still listening, and anything the record contradicts costs you ground.
        </p>
        </div>
        </div>

        {/* ── The letters of the correspondent chosen ──────────────────────── */}
        <div className="oh-letters" style={{ display: "flex", flexDirection: "column", minHeight: 0, position: "relative" }}>
        {activeChat ? (
            <>
            <div style={{ alignItems: "baseline", borderBottom: "1px solid var(--oh-line)", display: "flex", flexShrink: 0, gap: "1.5rem", justifyContent: "space-between", padding: "1.35rem 1.8rem 0.8rem" }}>
            <div style={{ minWidth: 0 }}>
            <div style={{ color: "var(--oh-text-strong)", fontFamily: "var(--oh-font-display)", fontSize: "var(--oh-t-lg)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1 }}>{activeNames}</div>
            <div style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-xs)", marginTop: "0.4rem" }}>
            {(activeChat.countries ?? []).length > 1 ? `${(activeChat.countries ?? []).length} at the table` : kindOf(activeChat) === "current" ? "a current of the college" : kindOf(activeChat) === "body" ? "a body of the era" : "a state"}
            {activeStanding ? ` · ${activeStanding.seats} ${activeStanding.seats === 1 ? "elector" : "electors"}` : ""}
            </div>
            </div>
            <div style={{ color: "var(--oh-text-dim)", flexShrink: 0, fontSize: "var(--oh-t-xs)", lineHeight: 1.5, textAlign: "right" }}>
            {activeStanding && (
                <div>Opinion <b style={{ color: toneVar(activeStanding.tone) }}>{activeStanding.approval > 0 ? "+" : ""}{activeStanding.approval}, {activeStanding.mood}</b></div>
            )}
            <div>{chatMessageCount(activeChat)} exchanged · {fmtDate(gameDate)}</div>
            </div>
            </div>
            <ConversationView
            key={activeChat.id}
            chat={activeChat}
            playerCountry={playerCountry}
            gameDate={gameDate}
            onDelete={() => fileAway(activeChat.id)}
            onBack={() => setActiveId(null)}
            onMessagesUpdate={onMessagesUpdate}
            page
            />
            </>
        ) : (
            <div style={{ margin: "auto", maxWidth: "46ch", padding: "2rem" }}>
            <span className="oh-label" style={{ color: "var(--oh-text-dim)" }}>Letters</span>
            <p style={{ color: "var(--oh-text)", fontFamily: "var(--oh-font-serif)", fontSize: "var(--oh-t-md)", lineHeight: 1.55, margin: "0.8rem 0 0" }}>
            Choose a correspondent on the left, or write a new letter. What you write is read in character by the power you address, and what it answers is held against what it actually wants.
            </p>
            </div>
        )}
        </div>

        {/* Who the letter goes to: the picker in a sheet over the page, sized as
            a sheet, not stretched to the page. */}
        {composing && (
            <div className="oh-letters" style={{ alignItems: "center", background: "rgba(var(--oh-plate-rgb), 0.88)", display: "flex", gridColumn: "1 / -1", inset: 0, justifyContent: "center", position: "absolute", zIndex: 20 }}>
            <div className="oh-picker" style={{ border: "1px solid var(--oh-text-strong)", height: "min(42rem, 88vh)", position: "relative", width: "min(44rem, 94vw)" }}>
            <CountrySelectorModal
            countries={availableCountries}
            loading={loadingCountries}
            onStart={startChat}
            onCancel={() => setComposing(false)}
            title="New letter"
            subtitle="Choose who receives it: a state, a faction, or a body of the era. Several at once make a round table."
            selectedLabel="Addressed to"
            emptyLabel="No one chosen yet"
            confirmLabel={(n) => (n > 1 ? `Open the table with ${n}` : "Write the letter")}
            />
            </div>
            </div>
        )}
        </div>
    );
};

export { Correspondence };
export default Correspondence;

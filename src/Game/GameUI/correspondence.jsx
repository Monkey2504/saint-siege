/*! Open Historia — the correspondence: the pope's letters, as a page © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
import React, { useEffect, useMemo, useState } from "react";
import { readGameData, readWorldState } from "../../runtime/gameState.js";
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

// Written as a page, not as the map's drawer stretched wide. A masthead like the
// bulletin's, then two columns: the correspondents on the left, the letters of
// the one chosen on the right. The conversation itself — the dispatches with
// their letterheads, the composer, the model's replies — is the one mechanism
// the map's panel already runs (chat.jsx ConversationView); only the page
// around it is new.

const fmtDate = (value) => {
    if (!value) return "";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
};

const SectionHead = ({ children, aside }) => (
    <div style={{ alignItems: "baseline", borderBottom: "4px solid var(--oh-text-strong)", display: "flex", gap: "1rem", justifyContent: "space-between", paddingBottom: "0.4rem" }}>
    <span className="oh-label" style={{ color: "var(--oh-text-strong)" }}>{children}</span>
    {aside && <span style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)" }}>{aside}</span>}
    </div>
);

// One correspondent in the margin: who, the last line exchanged, and a mark
// when something arrived that the player has not read.
const CorrespondentRow = ({ chat, active, unread, onOpen, onDelete }) => {
    const [confirming, setConfirming] = useState(false);
    const names = (chat.countries ?? []).map((c) => c.name).join(", ") || "Unknown";
    const last = chat.messages?.at(-1);
    const preview = last?.text ? `${last.speaker ? `${last.speaker}: ` : ""}${last.text}` : "No letter exchanged yet.";
    return (
        <div
        style={{
            alignItems: "flex-start",
            borderBottom: "1px solid var(--oh-line)",
            borderLeft: `4px solid ${active ? "var(--oh-accent)" : "transparent"}`,
            display: "flex",
            gap: "0.6rem",
            padding: "0.75rem 0.6rem 0.8rem 0.8rem",
        }}
        >
        <button
        type="button"
        onClick={onOpen}
        style={{ background: "none", border: 0, color: "inherit", cursor: "pointer", flex: 1, minWidth: 0, padding: 0, textAlign: "left" }}
        >
        <div style={{ alignItems: "baseline", display: "flex", gap: "0.5rem" }}>
        <span style={{ color: "var(--oh-text-strong)", fontFamily: "var(--oh-font-display)", fontSize: "var(--oh-t-md)", fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1.15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{names}</span>
        {unread && <span className="oh-label" style={{ background: "var(--oh-alert)", color: "var(--oh-on-accent)", flexShrink: 0, fontSize: "var(--oh-t-2xs)", padding: "0.05rem 0.35rem" }}>new</span>}
        </div>
        <div style={{ color: unread ? "var(--oh-text)" : "var(--oh-text-dim)", fontSize: "var(--oh-t-sm)", lineHeight: 1.4, marginTop: "0.2rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preview}</div>
        </button>
        <button
        type="button"
        title={confirming ? "Click again to file this correspondence away" : "File away"}
        onClick={() => { if (confirming) onDelete(); else setConfirming(true); }}
        onBlur={() => setConfirming(false)}
        style={{ background: confirming ? "var(--oh-alert-soft)" : "none", border: 0, color: confirming ? "var(--oh-text-strong)" : "var(--oh-text-dim)", cursor: "pointer", flexShrink: 0, fontSize: "var(--oh-t-sm)", lineHeight: 1, padding: "0.15rem 0.35rem" }}
        >
        {confirming ? "file away?" : "×"}
        </button>
        </div>
    );
};

const Correspondence = () => {
    const [game, setGame] = useState(null);
    const [chats, setChats] = useState([]);
    const [countries, setCountries] = useState([]);
    // The currents that act in the world, kept apart so they can be addressed
    // together in one letter — a consistory, not seven private notes.
    const [factions, setFactions] = useState([]);
    const [loadingCountries, setLoadingCountries] = useState(true);
    const [activeId, setActiveId] = useState(null);
    const [composing, setComposing] = useState(false);
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
            const world = await readWorldState().catch(() => null);
            const currents = [...new Set((Array.isArray(world?.intents) ? world.intents : [])
                .map((i) => String(i?.owner ?? "").trim())
                .filter(Boolean))]
                .filter((name) => !bodies.some((b) => b.name.toLowerCase() === name.toLowerCase()))
                .map((name) => ({ name, code: "", organization: true, faction: true }));
            if (!active) return;
            setGame(nextGame);
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

    const openChats = useMemo(() => chats.filter((c) => c.status !== "closed"), [chats]);
    const ordered = useMemo(() => [
        ...openChats.filter((c) => unreadIds.has(String(c.id))),
        ...openChats.filter((c) => !unreadIds.has(String(c.id))),
    ], [openChats, unreadIds]);
    const activeChat = useMemo(() => openChats.find((c) => String(c.id) === String(activeId)) ?? null, [openChats, activeId]);
    const availableCountries = useMemo(() => countries.filter((c) => !countryMatchesIdentity(c, playerCountry)), [countries, playerCountry]);
    // The player carries standing intents of their own, so their polity appears
    // among the currents. Addressing "everyone" must not seat the pope in his
    // own consistory — the picker drops him and this shortcut has to as well.
    const addressableFactions = useMemo(
        () => factions.filter((f) => !countryMatchesIdentity(f, playerCountry)),
        [factions, playerCountry],
    );

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

    return (
        <div style={{ background: "var(--oh-plate)", bottom: "2.6rem", color: "var(--oh-text)", left: 0, overflow: "hidden", position: "fixed", right: 0, top: 0, zIndex: 10002, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", flex: 1, flexDirection: "column", margin: "0 auto", maxWidth: "74rem", minHeight: 0, padding: "1.6rem 1.5rem 0", width: "100%" }}>

        {/* The masthead: the same sheet as the bulletin, a different section. */}
        <header style={{ borderBottom: "4px solid var(--oh-text-strong)", flexShrink: 0, paddingBottom: "0.5rem" }}>
        <h1 style={{ color: "var(--oh-text-strong)", fontFamily: "var(--oh-font-display)", fontSize: "clamp(2.2rem, 5vw, 3.6rem)", fontWeight: 800, letterSpacing: "-0.035em", lineHeight: 0.95, margin: 0 }}>
        {playerCountry || "Correspondence"}
        </h1>
        </header>
        <div style={{ alignItems: "baseline", borderBottom: "1px solid var(--oh-line)", display: "flex", flexShrink: 0, gap: "1rem", justifyContent: "space-between", marginBottom: "1.2rem", padding: "0.4rem 0 0.7rem" }}>
        <span className="oh-label" style={{ color: "var(--oh-text-strong)" }}>Correspondence</span>
        <span style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-xs)" }}>{fmtDate(gameDate)}</span>
        </div>

        <div style={{ display: "grid", flex: 1, gap: "2rem", gridTemplateColumns: "minmax(16rem, 22rem) minmax(0, 1fr)", minHeight: 0 }}>

        {/* Left: who the pope writes to. */}
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
        <SectionHead aside={`${openChats.length} ${openChats.length === 1 ? "thread" : "threads"}`}>Correspondents</SectionHead>
        <button
        type="button"
        onClick={() => setComposing(true)}
        style={{ background: "var(--oh-accent)", border: 0, color: "var(--oh-on-accent)", cursor: "pointer", flexShrink: 0, fontFamily: "var(--oh-font-label)", fontSize: "var(--oh-t-xs)", fontWeight: 700, letterSpacing: "var(--oh-label-track)", margin: "0.8rem 0 0.4rem", padding: "0.75rem 1rem", textTransform: "var(--oh-label-case)" }}
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
            style={{ background: "transparent", border: "1px solid var(--oh-line)", color: "var(--oh-text)", cursor: "pointer", flexShrink: 0, fontFamily: "var(--oh-font-label)", fontSize: "var(--oh-t-2xs)", letterSpacing: "var(--oh-label-track)", marginBottom: "0.4rem", padding: "0.55rem 1rem", textTransform: "var(--oh-label-case)" }}
            >
            Address all {addressableFactions.length} currents at once
            </button>
        )}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", scrollbarWidth: "none" }}>
        {ordered.length === 0 && (
            <p style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-sm)", fontStyle: "italic", margin: "0.9rem 0", maxWidth: "36ch" }}>
            No letter has been sent or received yet. Open one below: a state, a faction, or a body of the era.
            </p>
        )}
        {ordered.map((chat) => (
            <CorrespondentRow key={chat.id} chat={chat} active={String(chat.id) === String(activeId)} unread={unreadIds.has(String(chat.id))} onOpen={() => openChat(chat)} onDelete={() => fileAway(chat.id)} />
        ))}
        </div>
        </div>

        {/* Right: the letters of the correspondent chosen. */}
        <div className="oh-letters" style={{ display: "flex", flexDirection: "column", minHeight: 0, position: "relative" }}>
        {activeChat ? (
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
        ) : (
            <>
            <SectionHead>Letters</SectionHead>
            <p style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-md)", fontStyle: "italic", lineHeight: 1.5, margin: "1rem 0", maxWidth: "48ch" }}>
            Choose a correspondent on the left, or write a new letter. What you write is read in character by the power you address, and what it answers is held against what it actually wants.
            </p>
            </>
        )}
        </div>
        </div>
        </div>

        {/* Who the letter goes to: the picker in a sheet over the page, sized as
            a sheet, not stretched to the page. */}
        {composing && (
            <div className="oh-letters" style={{ alignItems: "center", background: "rgba(var(--oh-plate-rgb), 0.88)", display: "flex", inset: 0, justifyContent: "center", position: "absolute", zIndex: 20 }}>
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

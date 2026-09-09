/*! Open Historia — portions (era diplomacy + mobile panel sizing) © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { dedupeByName } from "../../runtime/countryList.js";
import ReactDOM from "react-dom";
import ReactMarkdown from "react-markdown";
import { sendDiplomaticMessage, startDiplomaticChat, loadDiplomaticHistory } from "../AI/main.jsx";
import { chooseNextDiplomaticSpeaker } from "../AI/gameplay.js";
import OrganizationsView, { ensureOrganizations } from "./organizationsView.jsx";
import {
    JSON_URLS,
    getNationColors,
    getNationFlags,
    loadCountryNames as loadCachedCountryNames,
    readJson,
} from "../../runtime/assets.js";
import { flagImageUrlFromGid } from "../../runtime/countryFlags.js";
import { fetchCommunityFlags, loadCommunityFlagDataUrl } from "../../runtime/communityFlags.js";
import { readChatsState, writeChatsState, readWorldState, normalizeWorldState } from "../../runtime/gameState.js";
import { normalizeIntents } from "../../runtime/intents.js";

// ── Who is writing to you ─────────────────────────────────────────────────────
// A dispatch carries a letterhead: the institution, who actually leads it, and
// the position it has DECLARED (its public standing intents). Secret schemes
// stay secret — the deception mechanism depends on it — so an interlocutor
// with only hidden aims shows "no declared position", which is itself a tell.
const useLetterheads = (names) => {
    const key = (names ?? []).join("|");
    const [heads, setHeads] = useState({});
    useEffect(() => {
        let cancelled = false;
        if (!key) { setHeads({}); return undefined; }
        readWorldState({ force: false }).then((raw) => {
            if (cancelled) return;
            const world = normalizeWorldState(raw);
            const active = normalizeIntents(world.intents).filter((it) => it.status === "active");
            const next = {};
            for (const name of key.split("|")) {
                const stats = world.countryStats?.[name] ?? {};
                const own = active.filter((it) => it.owner === name);
                next[name] = {
                    note: String(world.polityOverrides?.[name]?.note ?? "").trim(),
                    // The name chosen at the inauguration outranks the leader a
                    // jump wrote on the sheet (runtime/gameState.js enforces the
                    // same on read; this covers a world read before that).
                    leader: String(world.polityOverrides?.[name]?.leader ?? "").trim() || String(stats.leader ?? "").trim(),
                    government: String(stats.government ?? "").trim(),
                    // What it is KNOWN to care about: its public character
                    // (tags) plus the subjects its OPENLY declared aims name.
                    // A secret scheme contributes nothing here — not its plan,
                    // not its subject, not the fact that it exists.
                    remit: [...new Set([
                        ...(world.countryTags?.[name] ?? []).filter((t) => t && t !== "church-faction"),
                        ...own.filter((it) => !it.secret).flatMap((it) => it.scope),
                    ])].slice(0, 8),
                    declared: own.filter((it) => !it.secret).map((it) => it.summary),
                };
            }
            setHeads(next);
        }).catch(() => {});
        return () => { cancelled = true; };
    }, [key]);
    return heads;
};

// The dispatch's letterhead: who is writing, who signs it, what they are known
// to be about, and what they have SAID they want. Never what they are hiding —
// a secret scheme is learned by talking, by watching what it fights, or when it
// is exposed, and the engine keeps it out of here on purpose.
const Letterhead = ({ name, head, flagUrl }) => {
    if (!head) return null;
    const hasAnything = head.note || head.leader || head.government || head.declared.length || head.remit?.length;
    if (!hasAnything) return null;
    return (
        <div className="oh-plate" style={{ padding: "0.8rem 0.95rem 0.75rem", alignSelf: "stretch" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
        <FlagImg url={flagUrl} alt={name} size="1em" />
        <span className="oh-label" style={{ color: "var(--oh-text-strong)" }}>{name}</span>
        </div>
        {(head.leader || head.government) && (
            <div style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-xs)", lineHeight: 1.4, marginTop: "0.25rem" }}>
            {head.leader}{head.leader && head.government ? " — " : ""}{head.government}
            </div>
        )}
        {head.note && (
            <div style={{ color: "var(--oh-text-strong)", fontSize: "var(--oh-t-xs)", lineHeight: 1.45, marginTop: "0.35rem", fontStyle: "italic" }}>
            {head.note.length > 260 ? `${head.note.slice(0, 257)}…` : head.note}
            </div>
        )}
        <div className="oh-rule" style={{ margin: "0.55rem 0 0.45rem" }} />
        {head.remit?.length > 0 && (
            <div style={{ fontSize: "var(--oh-t-xs)", lineHeight: 1.4, marginBottom: "0.35rem" }}>
            <span className="oh-label" style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)" }}>Its ground</span>
            <div data-no-translate style={{ color: "var(--oh-text-strong)", marginTop: "0.1rem" }}>{head.remit.join(" · ")}</div>
            </div>
        )}
        <div style={{ fontSize: "var(--oh-t-xs)", lineHeight: 1.4 }}>
        <span className="oh-label" style={{ color: "var(--oh-alert)", fontSize: "var(--oh-t-2xs)" }}>What it says it wants</span>
        {head.declared.length ? (
            <ul style={{ margin: "0.2rem 0 0", paddingLeft: "1.1rem", color: "var(--oh-text-strong)" }}>
            {head.declared.map((line, i) => <li key={i}>{line}</li>)}
            </ul>
        ) : (
            <div style={{ color: "var(--oh-text-dim)", marginTop: "0.15rem" }}>Nothing declared. What it really wants, you will have to make it say — or infer from what it fights.</div>
        )}
        </div>
        </div>
    );
};

// ── Storage ───────────────────────────────────────────────────────────────────

const saveAllChats = async (chats) => {
    try {
        await writeChatsState(chats);
    } catch (err) { console.error("Failed to save chats:", err); }
};

const loadAllChats = async ({ force = false } = {}) => {
    try {
        return await readChatsState({ force });
    } catch { return []; }
};

// ── PMTiles country loader ────────────────────────────────────────────────────

const loadCountryNames = async () => {
    return loadCachedCountryNames();
};

const countryMatchesIdentity = (country, identity) => {
    const normalizedIdentity = String(identity ?? "").trim().toLowerCase();
    if (!normalizedIdentity) return false;
    return [country?.name, country?.code]
        .some(value => String(value ?? "").trim().toLowerCase() === normalizedIdentity);
};

// ── Flags ─────────────────────────────────────────────────────────────────────
// Country flags render as images rather than emoji. Resolution order per
// country: 1 flagcdn.com artwork via countryFlags.js 2. for a custom nation that table doesn't know, the map
// author's own flag for that owner code, from the scenario's flags.json getNationFlags) 

const FALLBACK_FLAG_EMOJI = "🏳";

// "code::name" -> Promise<string|null>. Module-level so every component asking
// about the same country shares one resolution, and the hub/flags.json are
// each fetched once.
const flagUrlCache = new Map();
let communityFlagsPromise = null;
let nationFlagsPromise = null;

const getCommunityFlagPosts = () => {
    if (!communityFlagsPromise) communityFlagsPromise = fetchCommunityFlags().catch(() => []);
    return communityFlagsPromise;
};

// getNationFlags() itself memoizes on the scenario token and is invalidated on
// write (see assets.js), so this wrapper only needs its own promise for the
// duration of one resolveFlagImageUrl batch
const getScenarioFlagMap = () => {
    if (!nationFlagsPromise) nationFlagsPromise = getNationFlags().catch(() => ({}));
    return nationFlagsPromise;
};

const findCommunityFlagPost = (posts, { code, name }) => {
    const normalizedCode = String(code ?? "").trim().toUpperCase();
    const normalizedName = String(name ?? "").trim().toLowerCase();
    return posts.find((post) => {
        if (post.fromScenario || !post.imageUrl) return false;
        if (normalizedCode && post.code && post.code.toUpperCase() === normalizedCode) return true;
        return normalizedName && String(post.title ?? "").trim().toLowerCase() === normalizedName;
    }) ?? null;
};

const resolveFlagImageUrl = ({ code, name } = {}) => {
    if (!code && !name) return Promise.resolve(null);
    const key = `${code ?? ""}::${name ?? ""}`;
    if (flagUrlCache.has(key)) return flagUrlCache.get(key);

    const builtIn = flagImageUrlFromGid(code) ?? flagImageUrlFromGid(name);
    const promise = builtIn
        ? Promise.resolve(builtIn)
        : getScenarioFlagMap()
            .then((flags) => (code && flags?.[code]) || null)
            .catch(() => null)
            .then((scenarioFlag) => {
                if (scenarioFlag) return scenarioFlag;
                return getCommunityFlagPosts()
                    .then((posts) => {
                        const match = findCommunityFlagPost(posts, { code, name });
                        return match ? loadCommunityFlagDataUrl(match).catch(() => null) : null;
                    })
                    .catch(() => null);
            });

    flagUrlCache.set(key, promise);
    return promise;
};

const useCountryFlagUrl = ({ code, name } = {}) => {
    const [url, setUrl] = useState(null);
    useEffect(() => {
        let cancelled = false;
        setUrl(null);
        resolveFlagImageUrl({ code, name }).then((resolved) => { if (!cancelled) setUrl(resolved); });
        return () => { cancelled = true; };
    }, [code, name]);
    return url;
};

const useCountryFlagUrls = (countries) => {
    const depsKey = countries.map(c => `${c.name}:${c.code ?? ""}`).join(",");
    const [urls, setUrls] = useState({});
    useEffect(() => {
        let cancelled = false;
        Promise.all(
            countries.map(({ name, code }) => resolveFlagImageUrl({ code, name }).then((url) => [name, url])),
        ).then((entries) => { if (!cancelled) setUrls(Object.fromEntries(entries)); });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [depsKey]);
    return urls;
};

// Renders the resolved flag image, or the fallback glyph while unresolved/unmatched.
const FlagImg = ({ url, alt = "", size = "1em", width, height }) => {
    const w = width ?? size;
    const h = height ?? size;
    return url ? (
        <img
            src={url}
            alt={alt}
            style={{
                width: w, height: h, objectFit: "cover", borderRadius: "2px",
                display: "inline-block", verticalAlign: "middle",
                boxShadow: "0 0 0 1px rgba(255,255,255,0.12)", flexShrink: 0,
            }}
        />
    ) : (
        <span aria-hidden="true" style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: w, height: h, verticalAlign: "middle", fontSize: size, flexShrink: 0,
        }}>{FALLBACK_FLAG_EMOJI}</span>
    );
};

// ── Nation colors (from colors.json, same source as WorldMap) ─────────────────
const countryAccentColor = (name) => {
    const colors = ["var(--oh-alert)","#f97316","#eab308","var(--oh-grant)","#14b8a6","var(--oh-accent)","var(--oh-accent)","#ec4899"];
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return colors[h % colors.length];
};

// ── Nation colors ─────────────────────────────────────────────────────────────

const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const nationColorFromCode = (code, map) => {
    if (!code) return null;
    if (map && map[code]) {
        const [r, g, b] = map[code];
        return `rgb(${r},${g},${b})`;
    }
    if (code.length >= 3) {
        const r = 64 + ALPHA.indexOf(code[0]) * 5;
        const g = 64 + ALPHA.indexOf(code[2]) * 5;
        const b = 64 + ALPHA.indexOf(code[1]) * 5;
        return `rgb(${r},${g},${b})`;
    }
    return null;
};

const useNationColor = (code) => {
    const [color, setColor] = useState(null);
    useEffect(() => {
        if (!code) return;
        let cancelled = false;
        getNationColors().then(map => {
            if (!cancelled) setColor(nationColorFromCode(code, map));
        });
            return () => { cancelled = true; };
    }, [code]);
    return color;
};

// ── Markdown styles ───────────────────────────────────────────────────────────

const markdownStyles = `
.chat-markdown p { margin: 0 0 0.5rem 0; }
.chat-markdown p:last-child { margin-bottom: 0; }
.chat-markdown ul, .chat-markdown ol { margin: 0.25rem 0 0.5rem 1.25rem; padding: 0; }
.chat-markdown li { margin-bottom: 0.2rem; }
.chat-markdown strong { color: var(--oh-text-strong); }
.chat-markdown em { color: var(--oh-text-dim); }
.chat-markdown blockquote { border-left: 2px solid var(--oh-accent-soft); margin: 0.5rem 0; padding-left: 0.75rem; color: var(--oh-text-dim); }
`;

const MarkdownStyleInjector = () => {
    useEffect(() => {
        if (!document.getElementById("chat-md-styles")) {
            const style = document.createElement("style");
            style.id = "chat-md-styles";
            style.textContent = markdownStyles;
            document.head.appendChild(style);
        }
    }, []);
    return null;
};

// ── ThinkingDots ──────────────────────────────────────────────────────────────

const ThinkingDots = () => {
    const [dots, setDots] = useState(0);
    useEffect(() => {
        const iv = setInterval(() => setDots(d => (d + 1) % 4), 500);
        return () => clearInterval(iv);
    }, []);
    return <span style={{ opacity: 0.6 }}>Thinking{".".repeat(dots)}&nbsp;</span>;
};

// ── Icons ─────────────────────────────────────────────────────────────────────

const SearchIcon = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
    </svg>
);

const BackIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 12H5M12 5l-7 7 7 7"/>
    </svg>
);

// Drawn rather than typed, like every other icon here. The list row used the
// U+1F5D1 emoji, which has no colour glyph in Windows' default UI font and falls
// back to a monochrome symbol face; an inline SVG renders the same everywhere and
// matches the stroke weight of its neighbours.
const TrashIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M3 6h18" />
    <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    </svg>
);





// ── Message bubble ────────────────────────────────────────────────────────────

const MessageBubble = ({ msg }) => {
    const isPlayer = msg.role === "user";
    const isError  = msg.role === "error";
    const flagUrl  = useCountryFlagUrl(isPlayer || isError ? {} : { code: msg.code, name: msg.speaker });
    const reactions = Object.entries(msg.reactions ?? {});
    const reactionFlags = useCountryFlagUrls(reactions.map(([name, { code }]) => ({ name, code })));
    const nationColor = useNationColor(!isPlayer && !isError ? msg.code : null);
    const accentColor = nationColor ?? ((!isPlayer && !isError) ? countryAccentColor(msg.speaker ?? "") : null);

    const received = msg.time
        ? new Date(msg.time).toLocaleDateString([], { year: "numeric", month: "long", day: "numeric" })
        : "";

    // A dispatch is a document: a ruled masthead naming who sent it and when,
    // a drop cap, and a reading measure. The player's own note stays ink on
    // the desk — smaller, darker, unadorned, so the two never read alike.
    if (!isPlayer && !isError) {
        return (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", overflow: "visible" }}>
            <div className="oh-plate oh-dispatch" style={{ borderTop: `3px solid ${accentColor}`, padding: "0.85rem 1.05rem 0.9rem", boxSizing: "border-box" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "0.8rem" }}>
            <span className="oh-label" style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", color: "var(--oh-text-strong)" }}>
            <FlagImg url={flagUrl} alt={msg.speaker} size="0.95em" />{msg.speaker}
            </span>
            {received && (
                <span style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-xs)", fontStyle: "italic", textAlign: "right", whiteSpace: "nowrap" }}>
                Dispatch<br />received {received}
                </span>
            )}
            </div>
            <div className="oh-rule" style={{ margin: "0.5rem 0 0.6rem" }} />
            <div className="chat-markdown oh-dispatch-body">
            <ReactMarkdown>{msg.text}</ReactMarkdown>
            </div>
            </div>
            </div>
        );
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: isPlayer ? "flex-end" : "flex-start", overflow: "visible" }}>
        <div style={{ position: "relative", maxWidth: "90%", overflow: "visible" }}>

        {isError && (
            <span className="oh-label" style={{ color: "var(--oh-alert)", marginBottom: "0.3rem", display: "inline-block" }}>⚠️ Error</span>
        )}

        {isPlayer && reactions.length > 0 && (
            <div style={{ display: "flex", flexDirection: "row-reverse", gap: "0.15rem", marginBottom: "0.3rem" }}>
            {reactions.map(([country, { emoji, code }]) => (
                <ReactionBubble key={country} country={country} emoji={emoji} flagUrl={reactionFlags[country] ?? null} code={code} />
            ))}
            </div>
        )}

        {/* Player-typed text stays verbatim under UI translation. */}
        <div data-no-translate={isPlayer ? "" : undefined} style={{
            padding: "0.6rem 0.85rem",
            borderRadius: "2px",
            backgroundColor: isPlayer ? "var(--oh-accent)" : "var(--oh-alert-soft)",
            fontSize: "var(--oh-t-sm)", lineHeight: "1.5", whiteSpace: "pre-wrap", wordBreak: "break-word",
            border: isPlayer ? "1px solid var(--oh-accent-soft)" : "1px solid var(--oh-alert-soft)",
            color: isPlayer ? "var(--oh-on-accent)" : "var(--oh-text)",
            boxSizing: "border-box",
        }}>
        {isPlayer ? msg.text : <div className="chat-markdown"><ReactMarkdown>{msg.text}</ReactMarkdown></div>}
        </div>
        </div>
        </div>
    );
};

// ── Reaction bubble ───────────────────────────────────────────────────────────

const ReactionBubble = ({ country, emoji, flagUrl, code }) => {
    const [hovered, setHovered] = useState(false);
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const anchorRef = useRef(null);
    const nationColor = useNationColor(code ?? null);

    const handleMouseEnter = () => {
        if (anchorRef.current) {
            const r = anchorRef.current.getBoundingClientRect();
            setPos({ x: r.left + r.width / 2, y: r.top });
        }
        setHovered(true);
    };

    const tooltip = hovered ? ReactDOM.createPortal(
        <div style={{
            position: "fixed",
            left: pos.x,
            top: pos.y - 2,
            transform: "translate(-50%, -100%)",
                                                    backgroundColor: "var(--oh-plate)",
                                                    border: "1px solid var(--oh-line)",
                                                    borderRadius: "6px",
                                                    padding: "0.2rem 0.45rem",
                                                    fontSize: "var(--oh-t-2xs)",
                                                    color: "var(--oh-text-strong)",
                                                    whiteSpace: "nowrap",
                                                    pointerEvents: "none",
                                                    zIndex: 99999,
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    gap: "0.3rem",
        }}>
        <FlagImg url={flagUrl} alt={country} size="0.9em" /> {country}
        </div>,
        document.body
    ) : null;

    return (
        <div style={{ position: "relative", marginBottom: "-1rem" }}>
        {tooltip}
        <div
        ref={anchorRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setHovered(false)}
        style={{
            width: "1.6rem", height: "1.6rem", borderRadius: "50%",
            backgroundColor: nationColor
            ? `color-mix(in srgb, ${nationColor} 25%, var(--oh-plate-2))`
            : "var(--oh-plate-2)",
            border: nationColor
            ? `1.5px solid ${nationColor}`
            : "1px solid var(--oh-line)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "var(--oh-t-xs)", cursor: "default", lineHeight: 1,
        }}
        >
        {emoji}
        </div>
        </div>
    );
};

const TypingBubble = ({ speaker, code }) => {
    const flagUrl = useCountryFlagUrl({ code, name: speaker });
    return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontSize: "var(--oh-t-2xs)", color: "var(--oh-text-dim)", marginBottom: "0.25rem" }}><FlagImg url={flagUrl} alt={speaker} size="0.95em" /> {speaker}</span>
        <div style={{ padding: "0.6rem 0.85rem", borderRadius: "12px 12px 12px 4px", backgroundColor: "var(--oh-plate-2)", fontSize: "var(--oh-t-xs)" }}>
        <ThinkingDots />
        </div>
        </div>
    );
};

// ── Country selector ──────────────────────────────────────────────────────────

const CountryTile = ({ country, code, flagUrl, isSelected, onToggle }) => {
    const [hovered, setHovered] = React.useState(false);
    const shortName = country.length > 12 ? country.slice(0, 11) + "…" : country;
    return (
        <button
        onClick={onToggle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.35rem",
            height: "5.5rem",
            padding: "0 0.4rem",
            borderRadius: "10px",
            border: isSelected
            ? "1px solid var(--oh-accent-soft)"
            : hovered
            ? "1px solid var(--oh-line)"
            : "1px solid var(--oh-line)",
            background: isSelected
            ? "var(--oh-accent-soft)"
            : hovered
            ? "var(--oh-plate-2)"
            : "var(--oh-plate-2)",
            cursor: "pointer",
            transition: "all 0.12s ease",
            fontFamily: "inherit",
            position: "relative",
            width: "100%",
            boxSizing: "border-box",
        }}
        >
        {isSelected && (
            <div style={{ position: "absolute", top: "0.3rem", right: "0.3rem", width: "14px", height: "14px", borderRadius: "50%", background: "var(--oh-accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "var(--oh-t-2xs)", color: "var(--oh-on-accent)", fontWeight: 700 }}>✓</div>
        )}
        <FlagImg url={flagUrl} alt={country} width="2.3rem" height="1.6rem" />
        <span style={{ fontSize: "var(--oh-t-xs)", color: "var(--oh-text-strong)", textAlign: "center", lineHeight: 1.3 }}>{shortName}</span>
        </button>
    );
};

const CountrySelectorModal = ({
    countries, loading, onStart, onCancel,
    title = "Start New Diplomatic Chat",
    subtitle = "Select countries to invite to the conversation",
    selectedLabel = "Selected Countries",
    emptyLabel = "No countries selected yet",
    confirmLabel = (n) => `Chat with ${n} ${n === 1 ? "country" : "countries"}`,
    single = false,
}) => {
    const [search, setSearch]     = React.useState("");
    const [selected, setSelected] = React.useState([]);
    // Deduped before anything is rendered: the tiles and the selection are both
    // keyed by name, so a repeated name collides React keys — the same country
    // appears several times, a search misses what it matched, and clicking one
    // tile marks another selected without highlighting it. countryList.js fixes
    // the source of the duplicates; this makes the picker safe from any source.
    const filtered = useMemo(
        () => dedupeByName(countries).filter(c => c.name.toLowerCase().includes(search.toLowerCase())),
        [countries, search],
    );
    const filteredFlagUrls = useCountryFlagUrls(filtered);
    const selectedFlagUrls = useCountryFlagUrls(selected);
    const isSelectedName = (name) => selected.some(s => s.name === name);
    // single: the picker holds ONE country, so picking another replaces the pick
    // rather than adding to it, and picking the same one again clears it.
    const toggle = ({ name, code }) => setSelected(prev => prev.some(s => s.name === name)
        ? prev.filter(s => s.name !== name)
        : single ? [{ name, code }] : [...prev, { name, code }]);

    return (
        <div style={{ position: "absolute", inset: 0, backgroundColor: "var(--oh-plate)", borderRadius: "16px", display: "flex", flexDirection: "column", zIndex: 10 }}>
        <div style={{ padding: "1.1rem 1.25rem 0.6rem", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
        <div style={{ fontWeight: 700, fontSize: "var(--oh-t-base)", color: "var(--oh-text-strong)" }}>{title}</div>
        <div style={{ fontSize: "var(--oh-t-xs)", color: "var(--oh-text-strong)", marginTop: "0.2rem" }}>{subtitle}</div>
        </div>
        <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--oh-text-strong)", fontSize: "var(--oh-t-md)", padding: "0.1rem 0.3rem", borderRadius: "6px", lineHeight: 1 }}
        onMouseEnter={e => { e.currentTarget.style.color = "var(--oh-text-strong)"; e.currentTarget.style.background = "var(--oh-plate-2)"; }}
        onMouseLeave={e => { e.currentTarget.style.color = "var(--oh-text-dim)"; e.currentTarget.style.background = "none"; }}>✕</button>
        </div>
        <div style={{ marginTop: "0.85rem", padding: "0.65rem 0.9rem", borderRadius: "10px", backgroundColor: "var(--oh-plate-2)", border: "1px solid var(--oh-line)" }}>
        <div style={{ fontSize: "var(--oh-t-xs)", fontWeight: 600, color: "var(--oh-text-strong)" }}>{selectedLabel}{single ? "" : ` (${selected.length})`}:</div>
        <div style={{ fontSize: "var(--oh-t-xs)", color: "var(--oh-text-strong)", marginTop: "0.2rem", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.4rem" }}>
        {selected.length === 0 ? emptyLabel : selected.map((c, i) => (
            <span key={c.name} style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
            <FlagImg url={selectedFlagUrls[c.name]} alt={c.name} size="0.9em" />{c.name}{i < selected.length - 1 ? "," : ""}
            </span>
        ))}
        </div>
        </div>
        <div style={{ position: "relative", display: "flex", alignItems: "center", marginTop: "0.75rem" }}>
        <span style={{ position: "absolute", left: "0.75rem", color: "var(--oh-text-strong)", display: "flex", pointerEvents: "none" }}><SearchIcon /></span>
        <input type="text" placeholder="Search countries..." value={search} onChange={e => setSearch(e.target.value)}
        style={{ width: "100%", padding: "0.55rem 0.85rem 0.55rem 2.2rem", borderRadius: "10px", border: "1px solid var(--oh-line)", background: "var(--oh-plate-2)", color: "var(--oh-text-strong)", fontSize: "var(--oh-t-xs)", outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
        onFocus={e => e.target.style.borderColor = "var(--oh-accent-soft)"}
        onBlur={e => e.target.style.borderColor = "var(--oh-line)"} />
        </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", scrollbarWidth: "none", padding: "0.5rem 1rem", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gridAutoRows: "5.5rem", gap: "0.5rem", alignContent: "start" }}>
        {loading && <p style={{ gridColumn: "1/-1", color: "var(--oh-text-strong)", fontSize: "var(--oh-t-xs)", fontStyle: "italic", textAlign: "center" }}>Loading countries…</p>}
        {filtered.map(c => (
            <CountryTile key={c.name} country={c.name} code={c.code} flagUrl={filteredFlagUrls[c.name] ?? null} isSelected={isSelectedName(c.name)} onToggle={() => toggle(c)} />
        ))}
        </div>
        <div style={{ padding: "0.75rem 1rem", borderTop: "1px solid var(--oh-line)", display: "flex", gap: "0.5rem", flexShrink: 0 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: "0.65rem", borderRadius: "10px", border: "1px solid var(--oh-line)", background: "var(--oh-plate-2)", color: "var(--oh-text-strong)", fontSize: "var(--oh-t-xs)", fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}
        onMouseEnter={e => e.currentTarget.style.background = "var(--oh-plate-2)"}
        onMouseLeave={e => e.currentTarget.style.background = "var(--oh-plate-2)"}>Cancel</button>
        <button onClick={() => selected.length > 0 && onStart(selected)} disabled={selected.length === 0}
        style={{ flex: 2, padding: "0.65rem", borderRadius: "10px", border: "none", background: selected.length > 0 ? "var(--oh-accent)" : "var(--oh-accent-soft)", color: selected.length > 0 ? "var(--oh-on-accent)" : "var(--oh-text-strong)", fontSize: "var(--oh-t-xs)", fontWeight: 600, cursor: selected.length > 0 ? "pointer" : "not-allowed", fontFamily: "inherit" }}
        onMouseEnter={e => { if (selected.length > 0) e.currentTarget.style.background = "var(--oh-accent)"; }}
        onMouseLeave={e => { if (selected.length > 0) e.currentTarget.style.background = "var(--oh-accent)"; }}>
        {confirmLabel(selected.length)}
        </button>
        </div>
        </div>
    );
};

// ── Conversation view ─────────────────────────────────────────────────────────

// `page`: set on the letters page, where the page itself carries the head and
// the list of correspondents — the panel's own header (back, delete, close)
// is not drawn, and the composer reads as a letter, not a chat line.
const ConversationView = ({ chat, playerCountry, gameDate, onDelete, onBack, onMessagesUpdate, page = false }) => {
    // Two-step delete, matching the list row. Disarms on blur so a half-pressed
    // delete never sits waiting to catch a later click.
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const countries = useMemo(
        () => Array.isArray(chat?.countries)
            ? chat.countries.filter((country) => country && (country.name || country.code))
            : [],
        [chat?.countries],
    );
    const isGroup = countries.length > 1;

    const [messages, setMessages]               = useState(chat.messages ?? []);
    const [phase, setPhase]                     = useState("player");
    const [isLoading, setIsLoading]             = useState(false);
    const [playerInput, setPlayerInput]         = useState("");
    const [pendingCountry, setPendingCountry]   = useState(null);
    const [remainingQueue, setRemainingQueue]   = useState([]);
    const [speakingCountry, setSpeakingCountry] = useState(null);

    const nextSpeakerIdx    = useRef(0);
    const lastPlayerMessage = useRef("");
    // "Let them all answer" runs the rest of the queue with no prompt between
    // speakers. A ref, not state: fetchLeaderResponse recurses through
    // offerNextCountry inside one async chain, and must read the flag as it
    // stands now rather than as it was at the render the chain started from.
    const answerWholeQueue  = useRef(false);
    const messagesEndRef    = useRef(null);
    const messagesRef       = useRef(chat.messages ?? []);

    useEffect(() => {
        countries.forEach(({ name, code }) => resolveFlagImageUrl({ code, name }));
    }, [countries]);

    useEffect(() => {
        const saved = chat.messages ?? [];
        if (saved.length > 0) loadDiplomaticHistory(saved);
        else startDiplomaticChat();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chat.id]);

        useEffect(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }, [messages, isLoading, phase]);

        // The list polls storage and adopts its copy of this chat when a message
        // landed from outside (a jump's invitation, the idle outreach drip). The
        // conversation kept its own state from the first render and never noticed,
        // so the new message sat in storage, invisible, until the chat was reopened.
        useEffect(() => {
            const incoming = chat.messages ?? [];
            if (incoming.length > messagesRef.current.length) {
                messagesRef.current = incoming;
                setMessages(incoming);
            }
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [chat.messages?.length]);

        const pushMessages = (updated) => {
            messagesRef.current = updated;
            setMessages(updated);
            onMessagesUpdate(chat.id, updated);
        };

        const isPlayerCountry = (country) => countryMatchesIdentity(country, playerCountry);

        const fetchLeaderResponse = async (country, playerMessage, queueAfter) => {
            if (isPlayerCountry(country)) {
                answerWholeQueue.current = false;
                setPendingCountry(null);
                setRemainingQueue([]);
                setPhase("player");
                return;
            }
            setIsLoading(true);
            setSpeakingCountry(country);
            try {
                // The thread itself goes along, so the prompt's "ongoing chat" is
                // THIS one and not whichever thread with the same correspondent
                // happens to be first in storage.
                const { reply, reaction } = await sendDiplomaticMessage(playerMessage, country.name, countries, { chat: { ...chat, messages: messagesRef.current }, playerCountry });

                if (reaction) {
                    const msgs = [...messagesRef.current];
                    const lastUserIdx = msgs.map(m => m.role).lastIndexOf("user");
                    if (lastUserIdx !== -1) {
                        msgs[lastUserIdx] = {
                            ...msgs[lastUserIdx],
                            reactions: { ...(msgs[lastUserIdx].reactions ?? {}), [country.name]: { emoji: reaction, code: country.code } },
                        };
                        pushMessages([...msgs, { role: "leader", speaker: country.name, code: country.code, text: reply, time: gameDate }]);
                    } else {
                        pushMessages([...msgs, { role: "leader", speaker: country.name, code: country.code, text: reply, time: gameDate }]);
                    }
                } else {
                    pushMessages([...messagesRef.current, { role: "leader", speaker: country.name, code: country.code, text: reply, time: gameDate }]);
                }
            } catch (err) {
                pushMessages([...messagesRef.current, { role: "error", speaker: country.name, code: country.code, text: err.message, time: gameDate }]);
            } finally {
                setIsLoading(false);
                setSpeakingCountry(null);
            }
            if (queueAfter.length > 0) {
                offerNextCountry(queueAfter);
            } else {
                answerWholeQueue.current = false;
                setPhase("player");
            }
        };

        const buildRoundQueue = () => {
            const n = countries.length;
            if (n === 0) return [];
            const s = nextSpeakerIdx.current % n;
            return [...countries.slice(s), ...countries.slice(0, s)];
        };

        const buildResponsiveQueue = async (updatedMessages) => {
            const rotatedQueue = buildRoundQueue();
            const suggestedSpeaker = await chooseNextDiplomaticSpeaker({
                chat: {
                    ...chat,
                    messages: updatedMessages,
                },
                excludeSpeaker: updatedMessages.at(-1)?.speaker || updatedMessages.at(-1)?.role || "",
            }).catch(() => "");

            if (!suggestedSpeaker) {
                return rotatedQueue;
            }

            const suggestedCountry = rotatedQueue.find((country) => country.name.toLowerCase() === suggestedSpeaker.toLowerCase());
            if (!suggestedCountry) {
                return rotatedQueue;
            }

            return [
                suggestedCountry,
                ...rotatedQueue.filter((country) => country.name !== suggestedCountry.name),
            ];
        };

        const offerNextCountry = (queue) => {
            const [next, ...rest] = queue;
            if (!next || countries.length === 0) {
                answerWholeQueue.current = false;
                setPhase("player");
                return;
            }
            nextSpeakerIdx.current = (nextSpeakerIdx.current + 1) % countries.length;
            if (isPlayerCountry(next)) {
                answerWholeQueue.current = false;
                setPendingCountry(null);
                setRemainingQueue([]);
                setPhase("player");
                return;
            }
            // The player asked for the whole queue at once, so no prompt: chain
            // straight into the reply and let its tail come back here for the next.
            if (answerWholeQueue.current) {
                setPendingCountry(null);
                setRemainingQueue(rest);
                fetchLeaderResponse(next, lastPlayerMessage.current, rest);
                return;
            }
            setPendingCountry(next);
            setRemainingQueue(rest);
            setPhase("pending");
        };

        const handlePlayerSubmit = async () => {
            const text = playerInput.trim();
            if (!text || isLoading) return;
            lastPlayerMessage.current = text;
            const nextMessages = [...messagesRef.current, { role: "user", speaker: playerCountry, text, time: gameDate }];
            pushMessages(nextMessages);
            setPlayerInput("");
            // Counterparts still owed a turn when the player interjected are not
            // re-sequenced: they answer this letter first, in the order they were
            // already waiting in, which is what stops an interjection from losing
            // them. Only a thread with nobody waiting asks who should speak next.
            const waiting = remainingQueue;
            setRemainingQueue([]);
            const queue = waiting.length > 0 ? waiting : await buildResponsiveQueue(nextMessages);
            if (queue.length === 0) {
                pushMessages([...nextMessages, { role: "error", speaker: "System", text: "This chat has no valid participants.", time: gameDate }]);
                return;
            }
            if (isGroup) {
                offerNextCountry(queue);
            } else {
                await fetchLeaderResponse(queue[0], text, []);
            }
        };

        // Field report: this used to clear remainingQueue as well. In a thread
        // opened with all seven currents at once, one click on "Speak" silently
        // cancelled the six counterparts still waiting — they never answered and
        // nothing on screen said the answers had been lost. Interjecting drops
        // only the speaker on offer; the rest stay queued and answer the player's
        // next letter. Do not put the blanket clear back.
        const handleSpeakInstead = () => {
            setPendingCountry(null);
            setPhase("player");
        };

        const handleLetSpeak = async () => {
            const country = pendingCountry;
            const rest    = remainingQueue;
            setPendingCountry(null);
            setRemainingQueue([]);
            await fetchLeaderResponse(country, lastPlayerMessage.current, rest);
        };

        // The escape from seven prompts in a row: everyone still waiting answers
        // in turn, uninterrupted, and the thread lands back on the player once.
        const handleLetAllSpeak = async () => {
            const country = pendingCountry;
            const rest    = remainingQueue;
            answerWholeQueue.current = true;
            setPendingCountry(null);
            setRemainingQueue([]);
            await fetchLeaderResponse(country, lastPlayerMessage.current, rest);
        };

        const typingSpeaker = speakingCountry ?? countries[0];
        const letterheads = useLetterheads(countries.map((c) => c.name));
        const letterheadFlags = useCountryFlagUrls(countries);

        const addressee = countries.map(c => c.name).join(", ") || "unknown participant";

        return (
            <>
            {page ? (
                <div style={{ alignItems: "baseline", borderBottom: "4px solid var(--oh-text-strong)", display: "flex", flexShrink: 0, gap: "1rem", justifyContent: "space-between", paddingBottom: "0.4rem" }}>
                <span className="oh-label" style={{ color: "var(--oh-text-strong)" }}>Letters</span>
                <span style={{ color: "var(--oh-text-strong)", fontFamily: "var(--oh-font-display)", fontSize: "var(--oh-t-md)", fontWeight: 700, letterSpacing: "-0.01em", minWidth: 0, overflow: "hidden", textAlign: "right", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{addressee}</span>
                </div>
            ) : (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.85rem 1rem", borderBottom: "1px solid var(--oh-line)", flexShrink: 0 }}>
            <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--oh-text-strong)", display: "flex", padding: "0.2rem", borderRadius: "6px" }}
            onMouseEnter={e => { e.currentTarget.style.color = "var(--oh-text-strong)"; e.currentTarget.style.background = "var(--oh-plate-2)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "var(--oh-text)"; e.currentTarget.style.background = "none"; }}>
            <BackIcon />
            </button>
            <span style={{ flex: 1, minWidth: 0 }}>
            <span className="oh-label" style={{ color: "var(--oh-accent)", display: "block" }}>Correspondence</span>
            <span style={{ display: "block", fontFamily: "var(--oh-font-display)", fontWeight: 500, fontSize: "var(--oh-t-sm)", color: "var(--oh-text-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {countries.map(c => c.name).join(", ") || "unknown participant"}
            </span>
            </span>
            {/* Two-step, same as the list row: one click arms, the next confirms. */}
            <button title={confirmingDelete ? "Click again to delete this chat" : "Delete chat"}
            aria-label={confirmingDelete ? "Confirm deleting this chat" : "Delete chat"}
            onClick={() => { if (confirmingDelete) { onDelete?.(); } else { setConfirmingDelete(true); } }}
            onBlur={() => setConfirmingDelete(false)}
            style={{ display: "flex", alignItems: "center", gap: "0.3rem", background: confirmingDelete ? "var(--oh-alert-soft)" : "none", border: `1px solid ${confirmingDelete ? "var(--oh-alert-soft)" : "transparent"}`, cursor: "pointer", color: confirmingDelete ? "var(--oh-alert)" : "var(--oh-alert-soft)", fontSize: "var(--oh-t-xs)", fontWeight: 600, fontFamily: "inherit", padding: confirmingDelete ? "0.25rem 0.5rem" : "0.25rem", borderRadius: "6px", lineHeight: 1 }}
            onMouseEnter={e => { if (!confirmingDelete) { e.currentTarget.style.color = "var(--oh-alert)"; e.currentTarget.style.background = "var(--oh-alert-soft)"; } }}
            onMouseLeave={e => { if (!confirmingDelete) { e.currentTarget.style.color = "var(--oh-alert)"; e.currentTarget.style.background = "none"; } }}>
            {confirmingDelete ? "Delete?" : <TrashIcon />}
            </button>
            <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--oh-text-strong)", fontSize: "var(--oh-t-base)", lineHeight: 1, padding: "0.25rem 0.3rem", borderRadius: "6px" }}
            onMouseEnter={e => { e.currentTarget.style.color = "var(--oh-text-strong)"; e.currentTarget.style.background = "var(--oh-plate-2)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "var(--oh-text-dim)"; e.currentTarget.style.background = "none"; }}>✕</button>
            </div>
            )}

            <div style={{ flex: 1, overflowY: "auto", overflowX: "visible", scrollbarWidth: "none", padding: page ? "1rem 0" : "0.75rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
            {countries.map((c) => (
                <Letterhead key={c.name} name={c.name} head={letterheads[c.name]} flagUrl={letterheadFlags[c.name] ?? null} />
            ))}
            {messages.length === 0 && !isLoading && (
                <p style={{ fontSize: page ? "var(--oh-t-md)" : "var(--oh-t-sm)", color: "var(--oh-text-dim)", fontStyle: "italic", textAlign: page ? "left" : "center", marginTop: page ? "0.5rem" : "1.5rem", maxWidth: page ? "48ch" : undefined, lineHeight: 1.5 }}>
                {page ? `Nothing has been written to ${addressee} yet. Your letter opens the exchange; the answer comes in its own voice, on its own terms.` : "Begin the diplomatic conversation."}
                </p>
            )}
            {messages.map((msg, i) => <MessageBubble key={i} msg={msg} chatCountries={countries} />)}
            {isLoading && typingSpeaker && <TypingBubble speaker={typingSpeaker.name} code={typingSpeaker.code} />}
            <div ref={messagesEndRef} />
            </div>

            {phase === "pending" && !isLoading && pendingCountry ? (
                <div style={{ padding: "0.75rem 1rem 0.9rem", borderTop: "1px solid var(--oh-line)", backgroundColor: "var(--oh-plate-2)", flexShrink: 0 }}>
                <p style={{ margin: "0 0 0.55rem 0", fontSize: "var(--oh-t-xs)", color: "var(--oh-text-strong)", textAlign: "center" }}>
                <CountryTurnLabel country={pendingCountry} remaining={remainingQueue.length} />
                </p>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                onClick={handleSpeakInstead}
                style={{ flex: 1, padding: "0.58rem 0.7rem", borderRadius: "10px", border: "1px solid var(--oh-line)", background: "var(--oh-plate-2)", color: "var(--oh-text-strong)", fontSize: "var(--oh-t-sm)", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s ease" }}
                onMouseEnter={e => { e.currentTarget.style.background = "var(--oh-plate-2)"; e.currentTarget.style.borderColor = "var(--oh-line)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "var(--oh-plate-2)"; e.currentTarget.style.borderColor = "var(--oh-line)"; }}
                >Speak</button>
                <button
                onClick={handleLetSpeak}
                style={{ flex: 2, padding: "0.58rem 0.7rem", borderRadius: "10px", border: "1px solid var(--oh-accent-soft)", background: "var(--oh-accent-soft)", color: "var(--oh-text-strong)", fontSize: "var(--oh-t-xs)", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s ease" }}
                onMouseEnter={e => { e.currentTarget.style.background = "var(--oh-accent-soft)"; e.currentTarget.style.borderColor = "var(--oh-accent-soft)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "var(--oh-accent-soft)"; e.currentTarget.style.borderColor = "var(--oh-accent-soft)"; }}
                >Let {pendingCountry.name} speak →</button>
                </div>
                {remainingQueue.length > 0 && (
                <button
                onClick={handleLetAllSpeak}
                style={{ width: "100%", marginTop: "0.5rem", padding: "0.45rem 0.7rem", borderRadius: "10px", border: "1px solid var(--oh-line)", background: "none", color: "var(--oh-text-dim)", fontSize: "var(--oh-t-xs)", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s ease" }}
                onMouseEnter={e => { e.currentTarget.style.color = "var(--oh-text-strong)"; e.currentTarget.style.borderColor = "var(--oh-accent-soft)"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "var(--oh-text-dim)"; e.currentTarget.style.borderColor = "var(--oh-line)"; }}
                >Let all {remainingQueue.length + 1} answer in turn</button>
                )}
                </div>
            ) : phase === "player" && !isLoading ? (
                <div style={{ padding: page ? "1rem 0 1.2rem" : "1rem", borderTop: "1px solid var(--oh-line)", display: "flex", alignItems: page ? "flex-end" : "center", gap: "0.5rem", flexShrink: 0 }}>
                <textarea
                placeholder={page ? `Write to ${addressee}… (Shift+Enter for a new line)` : "Send a diplomatic message…"}
                rows={1} value={playerInput}
                onChange={e => setPlayerInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handlePlayerSubmit(); } }}
                onInput={e => { e.target.style.height = "auto"; }}
                style={{ flex: 1, backgroundColor: "var(--oh-plate-2)", border: "1px solid var(--oh-line)", borderRadius: "10px", color: "var(--oh-text-strong)", fontSize: "var(--oh-t-sm)", padding: "0.6rem 0.75rem", resize: "none", outline: "none", fontFamily: "inherit", lineHeight: "1.5", overflowY: "hidden", transition: "border-color 0.2s" }}
                onFocus={e => e.target.style.borderColor = "var(--oh-accent-soft)"}
                onBlur={e => e.target.style.borderColor = "var(--oh-line)"}
                />
                <button onClick={handlePlayerSubmit} disabled={!playerInput.trim()}
                style={{ backgroundColor: playerInput.trim() ? "var(--oh-accent)" : "var(--oh-accent-soft)", color: playerInput.trim() ? "var(--oh-on-accent)" : "var(--oh-text-strong)", border: "none", borderRadius: "10px", width: page ? "auto" : "2.5rem", height: page ? "auto" : "2.5rem", padding: page ? "0.8rem 1.4rem" : 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: playerInput.trim() ? "pointer" : "not-allowed", flexShrink: 0, fontFamily: page ? "var(--oh-font-label)" : "inherit", fontSize: page ? "var(--oh-t-xs)" : "var(--oh-t-base)", fontWeight: 700, letterSpacing: page ? "var(--oh-label-track)" : undefined, textTransform: page ? "var(--oh-label-case)" : undefined, transition: "background-color 0.2s" }}
                onMouseEnter={e => { if (playerInput.trim()) e.currentTarget.style.backgroundColor = "var(--oh-accent)"; }}
                onMouseLeave={e => { if (playerInput.trim()) e.currentTarget.style.backgroundColor = "var(--oh-accent)"; }}
                >{page ? "Send" : "🚀"}</button>
                </div>
            ) : null}
            </>
        );
};

const CountryTurnLabel = ({ country, remaining }) => {
    const flagUrl = useCountryFlagUrl({ code: country.code, name: country.name });
    return (
        <>
        <FlagImg url={flagUrl} alt={country.name} size="0.95em" /> <strong style={{ color: "var(--oh-text)", fontWeight: 600 }}>{country.name}</strong> would like to respond
        {remaining > 0 && <span style={{ color: "var(--oh-text-dim)" }}> · {remaining} more after</span>}
        </>
    );
};

// ── Unread tracking ───────────────────────────────────────────────────────────

// Message totals per chat as of the last time the panel was open. Module-level
// AND persisted because two separate components need the SAME baseline: the
// toolbar's unread badge and the panel's chat list. It used to be a useRef
// inside the toolbar button, so the list could not read it and every remount
// silently reset it.
const SEEN_KEY = "oh:chat-seen";

// null (not {}) when nothing has ever been recorded — the two cases differ: no
// baseline at all means "first run, don't shout about chats that were already
// there", while an empty baseline means every chat really is new.
const readSeen = () => {
    try {
        const raw = localStorage.getItem(SEEN_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch { return null; }
};

const writeSeen = (totals) => {
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(totals)); } catch { /* private mode / quota */ }
};

const chatMessageCount = (chat) => chat?.messages?.length ?? 0;
const seenTotals = (list) => Object.fromEntries(list.map((c) => [String(c.id), chatMessageCount(c)]));

// Unread = more messages than when the panel was last open. A chat with no entry
// is unread (that is how a brand-new conversation surfaces) — but only once a
// baseline exists, so a first run doesn't light up every existing chat.
const isChatUnread = (chat, seen) => {
    if (!seen) return false;
    const prev = seen[String(chat.id)];
    return prev === undefined || chatMessageCount(chat) > prev;
};

// ── Chat list item ────────────────────────────────────────────────────────────

const ChatListItem = ({ chat, onClick, onDelete, unread = false }) => {
    const [hovered, setHovered] = React.useState(false);
    // Deleting a chat is not undoable, so the bin arms first and deletes on the
    // second click. Resets whenever the pointer leaves the row, so a half-pressed
    // delete never sits waiting to catch a later click.
    const [confirming, setConfirming] = React.useState(false);
    const previewCountries = chat.countries.slice(0, 4);
    const flagUrlMap = useCountryFlagUrls(previewCountries);
    const names    = chat.countries.map(c => c.name).join(", ");
    const lastMsg  = chat.messages?.at(-1);
    const preview  = lastMsg ? lastMsg.text.replace(/\*\*/g, "").slice(0, 60) + (lastMsg.text.length > 60 ? "…" : "") : "No messages yet";

    return (
        <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => { setHovered(false); setConfirming(false); }} style={{ position: "relative" }}>
        <button onClick={onClick} style={{ width: "100%", padding: "0.7rem 0.9rem", borderRadius: "10px", border: "1px solid var(--oh-line)", background: hovered ? "var(--oh-plate-2)" : "var(--oh-plate-2)", display: "flex", alignItems: "center", gap: "0.75rem", cursor: "pointer", transition: "background 0.15s", fontFamily: "inherit", textAlign: "left" }}>
        {/* Fixed-width slot, always rendered, so read and unread rows stay aligned. */}
        <div style={{ width: "0.5rem", flexShrink: 0, display: "flex", justifyContent: "center" }} aria-hidden="true">
        {unread && <div style={{ width: "0.5rem", height: "0.5rem", borderRadius: "50%", background: "var(--oh-accent)" }} />}
        </div>
        <div style={{ display: "flex", gap: "0.15rem", flexShrink: 0 }}>
        {previewCountries.map((c) => (
            <FlagImg key={c.name} url={flagUrlMap[c.name] ?? null} alt={c.name} width="1.3rem" height="0.9rem" />
        ))}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "var(--oh-t-xs)", fontWeight: unread ? 700 : 600, color: unread ? "var(--oh-text-strong)" : "var(--oh-text-strong)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{names}{unread && <span style={{ fontWeight: 400, fontSize: "var(--oh-t-2xs)", color: "var(--oh-accent)", marginLeft: "0.4rem" }}>new</span>}</div>
        <div style={{ fontSize: "var(--oh-t-xs)", color: unread ? "var(--oh-text)" : "var(--oh-text-dim)", marginTop: "0.15rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{preview}</div>
        </div>
        </button>
        {hovered && (
            <button onClick={e => { e.stopPropagation(); if (confirming) { onDelete(); } else { setConfirming(true); } }}
            title={confirming ? "Click again to delete this chat" : "Delete chat"}
            aria-label={confirming ? "Confirm deleting this chat" : "Delete chat"}
            style={{ position: "absolute", top: "50%", right: "0.6rem", transform: "translateY(-50%)", display: "flex", alignItems: "center", gap: "0.3rem", background: confirming ? "var(--oh-alert-soft)" : "none", border: `1px solid ${confirming ? "var(--oh-alert-soft)" : "transparent"}`, cursor: "pointer", color: confirming ? "var(--oh-alert)" : "var(--oh-alert-soft)", fontSize: "var(--oh-t-xs)", fontWeight: 600, fontFamily: "inherit", padding: confirming ? "0.25rem 0.5rem" : "0.25rem", borderRadius: "6px", lineHeight: 1 }}
            onMouseEnter={e => { if (!confirming) { e.currentTarget.style.color = "var(--oh-alert)"; e.currentTarget.style.background = "var(--oh-alert-soft)"; } }}
            onMouseLeave={e => { if (!confirming) { e.currentTarget.style.color = "var(--oh-alert)"; e.currentTarget.style.background = "none"; } }}>
            {confirming ? "Delete?" : <TrashIcon />}</button>
        )}
        </div>
    );
};

// ── Main ChatPanel ────────────────────────────────────────────────────────────

// Bridge so the map region popup can request a diplomatic chat with a country.
const _chatOpenSubs = new Set();
export const requestDiplomaticChat = (country) => {
    if (!country || !country.name) return;
    _chatOpenSubs.forEach((fn) => { try { fn(country); } catch { /* noop */ } });
};

const ChatPanel = ({ isOpen, onClose, requestedCountry, onConsumeRequest, fullPage = false }) => {
    // "chats" is the diplomacy the player is party to; "orgs" the international bodies.
    const [view, setView] = useState("chats");
    const [countries, setCountries]               = useState([]);
    const [loadingCountries, setLoadingCountries] = useState(true);
    const [playerCountry, setPlayerCountry]       = useState("your nation");
    const [gameDate, setGameDate]                 = useState("");
    const [chats, setChats]                       = useState([]);
    const [activeChat, setActiveChat]             = useState(null);
    const [showSelector, setShowSelector]         = useState(false);
    const [hasLoadedInitialData, setHasLoadedInitialData] = useState(false);
    const openChats = chats.filter((chat) => chat.status !== "closed" && Array.isArray(chat.countries) && chat.countries.length > 0);

    // Which chats to flag as unread, snapshotted when the panel OPENS and held
    // until it closes — rows must not reshuffle under the cursor while the player
    // is reading them. Reopening the panel is what re-sorts.
    const [unreadIds, setUnreadIds] = useState(() => new Set());
    const snapshotTakenRef = useRef(false);

    useEffect(() => {
        if (!isOpen) { snapshotTakenRef.current = false; return; }
        if (snapshotTakenRef.current || !hasLoadedInitialData) return;
        snapshotTakenRef.current = true;
        setUnreadIds(new Set(openChats.filter((chat) => isChatUnread(chat, readSeen())).map((chat) => String(chat.id))));
        // Everything on screen now counts as seen: the toolbar badge clears, and the
        // next open only flags what arrived in between.
        writeSeen(seenTotals(openChats));
    }, [isOpen, hasLoadedInitialData, openChats]);

    // Unread first, everything else in the order it already had — a stable
    // partition, so chats the player has read don't jump around too.
    const orderedChats = [
        ...openChats.filter((chat) => unreadIds.has(String(chat.id))),
        ...openChats.filter((chat) => !unreadIds.has(String(chat.id))),
    ];

    // Opening a chat marks it read, so messages that landed while the panel was
    // already open don't come back flagged on the next open.
    const openChatFromList = (chat) => {
        setActiveChat(chat);
        writeSeen({ ...(readSeen() || {}), [String(chat.id)]: chatMessageCount(chat) });
    };

    useEffect(() => {
        if (!isOpen || hasLoadedInitialData) return;

        let cancelled = false;
        // The bodies of the era sit in the same list as the countries: the IMF,
        // the WTO or the African Union can be chosen as a counterpart like a state.
        const loadBodies = () => ensureOrganizations(gameDate).then((list) => list.filter((o) => o.status === "active").map((o) => ({ name: o.name, code: "", organization: true }))).catch(() => []);
        Promise.all([loadCountryNames(), loadAllChats(), loadBodies()])
        .then(([countryList, savedChats, bodies]) => {
            if (cancelled) return;
            setCountries([...(Array.isArray(countryList) ? countryList : []), ...bodies]);
            setLoadingCountries(false);
            if (savedChats.length > 0) setChats(savedChats);
            setHasLoadedInitialData(true);
        })
        .catch(() => {
            if (!cancelled) {
                setLoadingCountries(false);
                setHasLoadedInitialData(true);
            }
        });

        return () => { cancelled = true; };
    }, [hasLoadedInitialData, isOpen]);

    useEffect(() => {
        if (!isOpen) return;

        let cancelled = false;
        const go = () => readJson(JSON_URLS.game, { defaultValue: {}, force: true })
        .then((data) => {
            if (cancelled) return;
            if (data.country) setPlayerCountry(data.country);
            if (data.gameDate) setGameDate(data.gameDate);
        })
        .catch(() => {});

        go();
        const iv = setInterval(go, 5000);
        return () => {
            cancelled = true;
            clearInterval(iv);
        };
    }, [isOpen]);

    // Chats created OUTSIDE this panel — a jump's diplomatic invitations, the
    // idle outreach drip — used to be invisible until a full page reload (the
    // list loaded exactly once). Poll the stored list while the panel is open
    // and merge additions/updates in; the active conversation object is left
    // alone so an in-flight exchange is never clobbered mid-reply.
    useEffect(() => {
        if (!isOpen || !hasLoadedInitialData) return;

        let cancelled = false;
        const sync = () => loadAllChats({ force: true })
        .then((saved) => {
            if (cancelled || !Array.isArray(saved)) return;
            setChats((prev) => {
                const signature = (list) => list.map((c) => `${c.id}:${c.status}:${c.messages?.length ?? 0}`).join("|");
                if (signature(saved) === signature(prev)) return prev;
                setActiveChat((ac) => {
                    if (!ac) return ac;
                    const updated = saved.find((c) => c.id === ac.id);
                    // Only adopt storage's copy when it has MORE messages (an
                    // outreach note landed); otherwise the in-panel state wins.
                    return updated && (updated.messages?.length ?? 0) > (ac.messages?.length ?? 0) ? updated : ac;
                });
                return saved;
            });
        })
        .catch(() => {});

        const iv = setInterval(sync, 5000);
        return () => {
            cancelled = true;
            clearInterval(iv);
        };
    }, [isOpen, hasLoadedInitialData]);

    const availableCountries = useMemo(
        () => countries.filter(country => !countryMatchesIdentity(country, playerCountry)),
                                       [countries, playerCountry]
    );

    const handleMessagesUpdate = (chatId, newMessages) => {
        // The player is in this conversation: every message it holds is read by
        // definition. Without this the baseline stayed at the count seen when the
        // chat was opened, and the player's own exchange came back as "new".
        writeSeen({ ...(readSeen() || {}), [String(chatId)]: Array.isArray(newMessages) ? newMessages.length : 0 });
        setChats(prev => {
            const updated = prev.map(c => c.id === chatId ? { ...c, messages: newMessages } : c);
            saveAllChats(updated);
            setActiveChat(ac => ac?.id === chatId ? { ...ac, messages: newMessages } : ac);
            return updated;
        });
    };

    const handleStartChat = (selected) => {
        const newChat = { id: Date.now(), countries: selected, messages: [], status: "open" };
        setChats(prev => { const u = [newChat, ...prev]; saveAllChats(u); return u; });
        setShowSelector(false);
        setActiveChat(newChat);
    };

    // From the Organizations tab: open (or resume) a one-to-one chat with a body.
    const talkToOrganization = (name) => {
        setChats(prev => {
            const existing = prev.find((c) => c.status !== "closed" && Array.isArray(c.countries) && c.countries.length === 1
                && (c.countries[0]?.name || "").toLowerCase() === String(name).toLowerCase());
            if (existing) { setActiveChat(existing); return prev; }
            const newChat = { id: Date.now(), countries: [{ name, code: "" }], messages: [], status: "open" };
            const u = [newChat, ...prev];
            saveAllChats(u);
            setActiveChat(newChat);
            return u;
        });
        setView("chats");
    };

    // Deleting hides the thread from the player; it does NOT erase it. gameplay.js
    // feeds closed chats back to the model as concluded-negotiation history, so
    // dropping the record outright would make the AI act as though the talks never
    // happened. Closing also means the next approach from that country opens a
    // FRESH chat instead of reviving this one — closed chats are excluded from the
    // "already talking to them" lookup.
    //
    // This is what the old Archive button did, so there is no separate archive
    // control any more: two buttons that both close a chat only invited the
    // question of which one really deleted it.
    const handleDeleteChat = (id) => {
        setChats(prev => {
            const updated = prev.map(chat => chat.id === id ? { ...chat, status: "closed" } : chat);
            saveAllChats(updated);
            return updated;
        });
        if (activeChat?.id === id) setActiveChat(null);
    };

    // Open (or reuse) a 1-on-1 chat with a country requested from the region popup.
    const consumePending = (country) => {
        setShowSelector(false);
        setChats(prev => {
            const existing = prev.find(
                c => c.status !== "closed" && Array.isArray(c.countries) && c.countries.length === 1 &&
                     (c.countries[0]?.name || "").toLowerCase() === country.name.toLowerCase(),
            );
            if (existing) { setActiveChat(existing); return prev; }
            const newChat = { id: Date.now(), countries: [{ name: country.name, code: country.code || "" }], messages: [], status: "open" };
            const u = [newChat, ...prev];
            saveAllChats(u);
            setActiveChat(newChat);
            return u;
        });
    };

    useEffect(() => {
        if (!isOpen || !requestedCountry) return;
        consumePending(requestedCountry);
        onConsumeRequest?.();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, requestedCountry]);

        return (
            <>
            <MarkdownStyleInjector />
            <div style={{
                // As a section of the paper the correspondence takes the page,
                // clearing the top bar and the standing tab bar; on the map it
                // stays the narrow panel it was.
                ...(fullPage
                    ? { position: "fixed", top: "3.9rem", bottom: "2.6rem", left: 0, right: 0, width: "auto", height: "auto", backgroundColor: "var(--oh-plate)", borderRadius: 0, border: 0, boxShadow: "none", zIndex: 10040 }
                    : { position: "fixed", bottom: isOpen ? "4.25rem" : "-40rem", left: "0rem", width: "26.25rem", maxWidth: "calc(100vw - 1rem)", height: "min(calc(100vh - 9rem), max(calc(100vh - 33rem), 30rem))", minHeight: "10rem", backgroundColor: "var(--oh-plate)", borderRadius: "16px", border: "1px solid var(--oh-line)", boxShadow: "-4px 0 24px rgba(0,0,0,0.4),inset 0 1px 0 var(--oh-line)", zIndex: 9998, transition: "bottom 0.35s cubic-bezier(0.4,0,0.2,1),opacity 0.35s ease" }),
                overflow: "hidden", opacity: isOpen ? 1 : 0, pointerEvents: isOpen ? "auto" : "none", fontFamily: "inherit", color: "var(--oh-text)", display: "flex", flexDirection: "column",
            }}>

            <div style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0, margin: fullPage ? "0 auto" : undefined, maxWidth: fullPage ? "62rem" : undefined, width: "100%" }}>
            {showSelector && <CountrySelectorModal countries={availableCountries} loading={loadingCountries} onStart={handleStartChat} onCancel={() => setShowSelector(false)} />}

            {activeChat && Array.isArray(activeChat.countries) && activeChat.countries.length > 0 ? (
                <ConversationView chat={activeChat} playerCountry={playerCountry} gameDate={gameDate} onDelete={() => handleDeleteChat(activeChat.id)} onBack={() => setActiveChat(null)} onMessagesUpdate={handleMessagesUpdate} />
            ) : (
                <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem 0.75rem", borderBottom: "1px solid var(--oh-line)", flexShrink: 0 }}>
                <div style={{ display: "flex", gap: "0.35rem" }}>
                {[["chats", "Diplomacy"], ["orgs", "Organizations"]].map(([key, label]) => (
                    <button key={key} onClick={() => setView(key)} style={{ padding: "0.3rem 0.7rem", borderRadius: "8px", fontSize: "var(--oh-t-xs)", fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                        border: "1px solid " + (view === key ? "var(--oh-accent-soft)" : "transparent"), background: view === key ? "var(--oh-accent-soft)" : "transparent", color: view === key ? "var(--oh-text-strong)" : "var(--oh-text-dim)" }}>
                    {label}
                    </button>
                ))}
                </div>
                <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--oh-text-dim)", cursor: "pointer", fontSize: "var(--oh-t-md)", lineHeight: 1, padding: "0.15rem 0.3rem", borderRadius: "6px" }}
                onMouseEnter={e => { e.currentTarget.style.color = "var(--oh-text-strong)"; e.currentTarget.style.background = "var(--oh-plate-2)"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "var(--oh-text-dim)"; e.currentTarget.style.background = "none"; }}>✕</button>
                </div>
                {view === "orgs" ? (
                    <OrganizationsView playerCountry={playerCountry} gameDate={gameDate} onTalk={talkToOrganization} />
                ) : (
                <>
                <div style={{ flex: 1, overflowY: "auto", scrollbarWidth: "none", padding: "0.75rem 1rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {openChats.length === 0 ? (
                    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--oh-text-dim)", fontSize: "var(--oh-t-xs)", fontStyle: "italic", textAlign: "center", padding: "2rem" }}>
                    No diplomatic conversations yet.<br />Start one below.
                    </div>
                ) : orderedChats.map(chat => <ChatListItem key={chat.id} chat={chat} unread={unreadIds.has(String(chat.id))} onClick={() => openChatFromList(chat)} onDelete={() => handleDeleteChat(chat.id)} />)}
                </div>
                <div style={{ padding: "0.75rem 1rem", borderTop: "1px solid var(--oh-line)", flexShrink: 0 }}>
                <button onClick={() => setShowSelector(true)} style={{ width: "100%", padding: "0.7rem", borderRadius: "10px", border: "1px solid var(--oh-line)", background: "var(--oh-plate-2)", color: "var(--oh-text-strong)", fontSize: "var(--oh-t-xs)", fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--oh-plate-2)"}
                onMouseLeave={e => e.currentTarget.style.background = "var(--oh-plate-2)"}>Start New Chat</button>
                </div>
                </>
                )}
                </>
            )}
            </div>
            </div>
            </>
        );
};

// ── Chat toolbar button ───────────────────────────────────────────────────────

const Chat = ({ hovered, setHovered, isOpen, onToggle }) => {
    const [hasOpened, setHasOpened] = useState(false);
    const [pendingCountry, setPendingCountry] = useState(null);
    const [unseenCount, setUnseenCount] = useState(0);
    const setChatOpen = () => { onToggle(); };

    useEffect(() => {
        if (isOpen) setHasOpened(true);
    }, [isOpen]);

    // Unread badge: countries now message the player unprompted (jump
    // invitations, the idle outreach drip), so the toolbar button must say so.
    // A cheap poll of the stored chat list counts open chats that gained
    // messages (or appeared) since the panel was last open.
    useEffect(() => {
        let cancelled = false;
        const check = () => loadAllChats({ force: true })
        .then((saved) => {
            if (cancelled || !Array.isArray(saved)) return;
            const open = saved.filter((c) => c.status !== "closed" && Array.isArray(c.countries) && c.countries.length > 0);
            // The badge only READS the baseline. The panel writes it when it opens,
            // and it must be the only writer: if this poll also wrote on isOpen it
            // could clear the baseline first and the list would find nothing unread.
            if (isOpen) { setUnseenCount(0); return; }
            const seen = readSeen();
            if (seen === null) {
                // First look ever — seed the baseline instead of declaring every
                // chat that already existed unread.
                writeSeen(seenTotals(open));
                setUnseenCount(0);
                return;
            }
            setUnseenCount(open.filter((c) => isChatUnread(c, seen)).length);
        })
        .catch(() => {});

        check();
        const iv = setInterval(check, 15000);
        return () => {
            cancelled = true;
            clearInterval(iv);
        };
    }, [isOpen]);

    useEffect(() => {
        const handler = (country) => {
            setPendingCountry(country);
            if (!isOpen) onToggle();
        };
        _chatOpenSubs.add(handler);
        return () => _chatOpenSubs.delete(handler);
    }, [isOpen, onToggle]);
        return (
            <>
            {hasOpened && <ChatPanel isOpen={isOpen} onClose={onToggle} requestedCountry={pendingCountry} onConsumeRequest={() => setPendingCountry(null)} />}
            <button title="Chat" style={{ width: "3.3rem", height: "3.3rem", borderRadius: "10px", border: hovered ? "1px solid var(--oh-line)" : isOpen ? "1px solid var(--oh-accent-soft)" : "1px solid var(--oh-line)", background: isOpen ? "linear-gradient(145deg,var(--oh-accent),var(--oh-accent))" : hovered ? "linear-gradient(145deg,var(--oh-plate-2),var(--oh-plate-2))" : "linear-gradient(145deg,var(--oh-plate-2),var(--oh-plate-2))", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all 0.12s ease", boxShadow: hovered ? "inset 0 1px 0 var(--oh-line),0 2px 8px rgba(0,0,0,0.4)" : "inset 0 1px 0 var(--oh-line),inset 0 -1px 0 var(--oh-plate-2),0 2px 6px rgba(0,0,0,0.35)", fontSize: "var(--oh-t-md)", outline: "none", transform: hovered ? "translateY(-1px)" : "translateY(0)", color: "var(--oh-text-strong)", fontFamily: "inherit", flexShrink: 0 }}
            onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
            onClick={() => setChatOpen(o => !o)}>
            <span style={{ position: "relative", display: "inline-flex" }}>
                💬
                {unseenCount > 0 && !isOpen && (
                    <span style={{ position: "absolute", top: "-0.55rem", right: "-0.8rem", minWidth: "1.05rem", height: "1.05rem", padding: "0 0.2rem", borderRadius: "999px", background: "var(--oh-alert)", border: "1px solid var(--oh-line)", color: "var(--oh-on-accent)", fontSize: "var(--oh-t-2xs)", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1, boxShadow: "0 1px 4px rgba(0,0,0,0.5)" }}>
                        {unseenCount > 9 ? "9+" : unseenCount}
                    </span>
                )}
            </span>
            </button>
            </>
        );
};

// ── Toolbar ───────────────────────────────────────────────────────────────────

const Toolbar = memo(({ onOpenAdvisor, activePanel, onTogglePanel }) => {
    const [hoveredChat, setHoveredChat]       = useState(false);
    return (
        <div style={{ position: "fixed", bottom: "3.1rem", left: "0.5rem", height: "4rem", width: "8.75rem", gap: "0.75rem", padding: "0 0.1rem", backgroundColor: "var(--oh-plate)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--oh-text)", fontFamily: "inherit", borderRadius: "14px", border: "1px solid var(--oh-line)", boxShadow: "0 8px 24px rgba(0,0,0,0.5),inset 0 1px 0 var(--oh-line)" }}>
        <Chat hovered={hoveredChat} setHovered={setHoveredChat} isOpen={activePanel === "chat"} onToggle={() => onTogglePanel("chat")} />
        </div>
    );
});

export { Toolbar, Chat, ChatPanel, countryMatchesIdentity, loadCountryNames, ConversationView, CountrySelectorModal, loadAllChats, saveAllChats, readSeen, writeSeen, isChatUnread, seenTotals, chatMessageCount };

/*! Open Historia — national stats pane © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { JSON_URLS, getNationFlags } from "../../runtime/assets.js";
import { isPolityLandless, readGameData, readWorldState } from "../../runtime/gameState.js";
import { useLibraryState } from "../../runtime/library.js";
import { useCountryDisplayName } from "../../runtime/polityNames.js";
import { flagImageUrlFromGid } from "../../runtime/countryFlags.js";
import COUNTRY_NAMES from "../../runtime/generated/countryNames.js";
import { setRegionClickObserver } from "../Selection/Regions.jsx";
import { generateCountryStatSheet } from "../AI/gameplay.js";
import { validateGameplayPayload } from "../AI/gameplaySchemas.js";
import EconomyPanel, { FaithfulPanel, ProgramPanel } from "./economyPanel.jsx";
import { HOLY_SEE } from "../../runtime/churchPreset.js";
import { economyIndicators } from "../../runtime/economy.js";
import { unitsOf } from "../../runtime/economyBridge.js";

// Sheets are regenerated when the game date moves; within a date they persist
// across reloads so flipping between countries stays instant.
const STORAGE_KEY = "oh-stat-sheets";
const MAX_STORED_SHEETS = 60;
const memoryCache = new Map();
const isValidStatSheet = (value) => validateGameplayPayload("countryStatSheet", value).valid;

// world.countryStats holds a PARTIAL sheet: applyEventImpactsToWorld merges only the
// fields the AI actually changed, so after a coup it can hold nothing but
// {leader, government, stability}. Validating that whole and dropping it when
// incomplete is why an AI-installed leader never appeared — the pane fell straight
// back to the full sheet it had generated BEFORE the coup, old leader and all.
// Layer the AI's fields on top of that full sheet instead: the AI always wins, and
// every partial change (leader, government, stability, a single index) shows up.
const mergeStatSheet = (base, override) => {
    if (!override || typeof override !== "object") return base;
    if (!base || typeof base !== "object") return override;
    const merged = { ...base, ...override };
    for (const group of ["indices", "economy", "gdpBreakdown"]) {
        if (override[group] && typeof override[group] === "object") {
            merged[group] = { ...(base[group] || {}), ...override[group] };
        }
    }
    return merged;
};

const readStoredSheets = () => {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
    } catch {
        return {};
    }
};

const storeSheet = (key, entry) => {
    try {
        const all = readStoredSheets();
        all[key] = entry;
        const keys = Object.keys(all);
        if (keys.length > MAX_STORED_SHEETS) {
            for (const stale of keys.slice(0, keys.length - MAX_STORED_SHEETS)) delete all[stale];
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch {
        // Quota errors just mean no persistence — the memory cache still works.
    }
};

const clamp01 = (value) => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));

const INDEX_ROWS = [
    { key: "sovereignty", label: "Sovereignty", icon: "⚑", color: "var(--oh-accent)" },
    { key: "foodAutonomy", label: "Food autonomy", icon: "🌾", color: "var(--oh-grant)" },
    { key: "energyAutonomy", label: "Energy autonomy", icon: "⚡", color: "#eab308" },
    { key: "economicIndependence", label: "Economic independence", icon: "🏦", color: "#06b6d4" },
    { key: "internalSecurity", label: "Internal security", icon: "🛡", color: "#f43f5e" },
    { key: "internationalReputation", label: "International reputation", icon: "🤝", color: "var(--oh-accent)" },
];

const sectionTitleStyle = {
    color: "var(--oh-accent)",
    fontFamily: "var(--oh-font-display)",
    fontSize: "var(--oh-t-2xs)",
    fontWeight: 500,
    letterSpacing: "var(--oh-label-track)",
    margin: "1.1rem 0 0.6rem",
    textTransform: "var(--oh-label-case)",
};

const cardStyle = {
    backgroundColor: "var(--oh-plate-2)",
    border: "1px solid var(--oh-accent-soft)",
    borderRadius: "2px",
    padding: "0.6rem 0.7rem",
};

const Bar = ({ value, color }) => (
    <div style={{ backgroundColor: "var(--oh-plate-2)", borderRadius: "999px", height: "6px", overflow: "hidden" }}>
    <div style={{ backgroundColor: color, borderRadius: "999px", height: "100%", width: `${clamp01(value)}%`, transition: "width 0.4s" }} />
    </div>
);

// The AI writes economic figures however it likes — "30000000000",
// "$30,000,000,000", "2.1%", "1.2 trillion caps". Raw long numbers overflow
// the card, so purely numeric values from a million up render compactly
// (30000000000 → 30.0B) with any currency prefix preserved; everything else
// (percentages, prose) passes through untouched.
const compactEconomyValue = (value) => {
    if (value === null || value === undefined) return value;
    const text = String(value).trim();
    const match = /^([^0-9-]{0,4})(-?\d[\d,]*)(?:\.(\d+))?$/.exec(text);
    if (!match) return value;
    const number = Number(`${match[2].replace(/,/g, "")}${match[3] ? `.${match[3]}` : ""}`);
    if (!Number.isFinite(number) || Math.abs(number) < 1e6) return value;
    const prefix = match[1] ?? "";
    const abs = Math.abs(number);
    const [divisor, suffix] = abs >= 1e12 ? [1e12, "T"] : abs >= 1e9 ? [1e9, "B"] : [1e6, "M"];
    const compact = (number / divisor).toFixed(abs / divisor >= 100 ? 0 : 1);
    return `${prefix}${compact}${suffix}`;
};

const EconomyCard = ({ label, value, sub, tone }) => (
    <div style={cardStyle}>
    <div style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)", fontWeight: 700, letterSpacing: "var(--oh-label-track)", marginBottom: "0.3rem", textTransform: "var(--oh-label-case)" }}>
    {label}
    </div>
    <div data-no-translate style={{ color: tone, fontSize: "var(--oh-t-base)", fontWeight: 800 }}>{compactEconomyValue(value) || "—"}</div>
    {sub && <div style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)", marginTop: "0.15rem" }}>{sub}</div>}
    </div>
);

const stabilityColor = (value) => (value < 40 ? "var(--oh-alert)" : value < 70 ? "var(--oh-caution)" : "var(--oh-grant)");

const StatsPane = ({ active }) => {
    const { activeGameId } = useLibraryState();
    const [player, setPlayer] = useState({ code: "", date: "", gameKey: "game" });
    const [targetCountry, setTargetCountry] = useState("");
    const [polity, setPolity] = useState(null); // world.polityOverrides[target]
    const [state, setState] = useState({ status: "idle", sheet: null, error: "" });
    const [flagFailed, setFlagFailed] = useState(false);
    // Is the PLAYER stateless (holds no territory)? A landless player's code may
    // still resolve to a real country, but they are not it — so their own row
    // must show the neutral initials, never that country's flag.
    const [playerLandless, setPlayerLandless] = useState(false);
    // Author-set flags from the scenario (flags.json). Memoized in assets.js, so
    // this is one fetch per scenario; {} for every scenario that sets none.
    const [customFlags, setCustomFlags] = useState({});
    const displayName = useCountryDisplayName(targetCountry);
    const [engine, setEngine] = useState({ economy: null, flows: null, program: null, allEconomies: null, church: null });

    // Which game and which date are we in? Also seeds the target: your country.
    useEffect(() => {
        let cancelled = false;
        getNationFlags()
            .then((flags) => { if (!cancelled) setCustomFlags(flags || {}); })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [activeGameId]);

    useEffect(() => {
        if (!active) return undefined;
        let cancelled = false;
        const refreshPlayer = async () => {
            try {
                const game = await readGameData({ force: true });
                if (cancelled) return;
                const code = String(game?.country || "").trim();
                const nextPlayer = {
                    code,
                    date: String(game?.gameDate || game?.startDate || ""),
                    gameKey: String(JSON_URLS.game || game?.id || game?.name || "game"),
                };
                if (player.gameKey !== nextPlayer.gameKey) {
                    setTargetCountry(code);
                    setState({ status: "idle", sheet: null, error: "" });
                } else {
                    setTargetCountry((target) => target || code);
                }
                setPlayer((current) =>
                    current.code === nextPlayer.code &&
                    current.date === nextPlayer.date &&
                    current.gameKey === nextPlayer.gameKey
                        ? current
                        : nextPlayer);
            } catch {
                // Without game data the pane just shows its empty state.
            }
        };
        refreshPlayer();
        const intervalId = window.setInterval(refreshPlayer, 5000);
        return () => {
            cancelled = true;
            window.clearInterval(intervalId);
        };
    }, [active, activeGameId, player.gameKey]);

    // While the pane is showing, clicking any country on the map inspects it.
    useEffect(() => {
        if (!active) return undefined;
        setRegionClickObserver((props) => {
            // One namespace: the owning country's NAME. The gid0/GID_0 tail is the
            // region's GADM provenance — a code — so falling through to it used to
            // hand this pane "RUS" for an unowned region while every owned one gave
            // a name. The sheet is keyed by country, and the two never matched.
            const gid0 = String(props?.gid0 || props?.GID_0 || "").trim();
            const country = String(props?.owner || "").trim() || COUNTRY_NAMES[gid0] || gid0;
            if (country) setTargetCountry(country);
        });
        return () => setRegionClickObserver(null);
    }, [active]);

    const loadSheet = useCallback(async ({ force = false } = {}) => {
        const code = targetCountry;
        if (!code) return;
        const cacheKey = `${player.gameKey}:${code}`;
        // The AI's partial stat changes, kept aside so they can be layered over
        // whichever full sheet we end up with (cached or freshly generated).
        let aiOverride = null;
        if (!force) {
            // The persisted, AI-maintained sheet in world state wins and SURVIVES date
            // changes — it changes only when the AI changes it (polityChanges.stats).
            try {
                const world = await readWorldState({ force: false });
                const persisted = world?.countryStats?.[code];
                if (persisted && isValidStatSheet(persisted)) {
                    memoryCache.set(cacheKey, { date: player.date, sheet: persisted });
                    setState({ status: "ready", sheet: persisted, error: "" });
                    return;
                }
                // Incomplete on its own, but still the AI's word on the fields it names.
                if (persisted && typeof persisted === "object") aiOverride = persisted;
            } catch { /* fall through to the device cache / regenerate */ }
            // Device-cache fallback — no longer date-gated, so it persists across dates.
            const cached = memoryCache.get(cacheKey) ?? readStoredSheets()[cacheKey];
            if (cached && isValidStatSheet(cached.sheet)) {
                const sheet = mergeStatSheet(cached.sheet, aiOverride);
                memoryCache.set(cacheKey, { date: player.date, sheet });
                setState({ status: "ready", sheet, error: "" });
                return;
            }
        }
        setState({ status: "loading", sheet: null, error: "" });
        try {
            const generated = await generateCountryStatSheet({ code, name: displayName || code });
            const validation = validateGameplayPayload("countryStatSheet", generated);
            if (!validation.valid) throw new Error(`The stat sheet failed validation: ${validation.error}`);
            // A sheet generated now describes the country as it was BEFORE this game's
            // events, so the AI's recorded changes still have to win over it.
            const sheet = mergeStatSheet(generated, aiOverride);
            const entry = { date: player.date, sheet };
            memoryCache.set(cacheKey, entry);
            storeSheet(cacheKey, entry);
            setState((current) =>
                targetCountry === code ? { status: "ready", sheet, error: "" } : current);
        } catch (error) {
            setState((current) =>
                targetCountry === code
                    ? { status: "error", sheet: null, error: error?.message || "The stat sheet failed." }
                    : current);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [targetCountry, player.gameKey, player.date, displayName]);

    useEffect(() => {
        if (!active || !targetCountry) return;
        setFlagFailed(false);
        loadSheet();
        readWorldState({ force: false })
            .then((world) => {
                setPolity(world?.polityOverrides?.[targetCountry] ?? null);
                setEngine({ economy: world?.economies?.[targetCountry] ?? null, flows: world?.lastEconomyFlows?.[targetCountry] ?? null, program: world?.programs?.[targetCountry] ?? null, allEconomies: world?.economies ?? null, church: world?.church ?? null, units: unitsOf(world?.units, targetCountry) });
                setPlayerLandless(isPolityLandless(world, player.code));
            })
            .catch(() => { setPolity(null); setPlayerLandless(false); });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, targetCountry, player.date]);

    const sheet = state.sheet;
    const isPlayer = targetCountry && targetCountry.toUpperCase() === String(player.code).toUpperCase();
    // An author-set flag (scenario flags.json) wins over the code-derived one, so a
    // custom era polity shows the flag its map-maker drew instead of initials.
    // But a landless PLAYER never borrows the code-derived country flag (a
    // stateless actor is not the country its code resolves to) — their own row
    // falls through to the neutral initials unless they set a flag of their own.
    const suppressDerivedFlag = isPlayer && playerLandless;
    const flagUrl = customFlags[targetCountry] || polity?.flag || (suppressDerivedFlag ? "" : flagImageUrlFromGid(targetCountry));
    const initials = String(targetCountry).replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() || "??";

    const breakdown = useMemo(() => {
        const raw = sheet?.gdpBreakdown ?? {};
        const parts = [
            { key: "agriculture", label: "Agriculture", color: "var(--oh-grant)", value: clamp01(raw.agriculture) },
            { key: "industry", label: "Industry", color: "var(--oh-accent)", value: clamp01(raw.industry) },
            { key: "services", label: "Services", color: "var(--oh-accent)", value: clamp01(raw.services) },
        ];
        const total = parts.reduce((sum, part) => sum + part.value, 0) || 1;
        return parts.map((part) => ({ ...part, share: (part.value / total) * 100 }));
    }, [sheet]);

    const budgetNegative = String(sheet?.economy?.budgetBalance ?? "").trim().startsWith("-");
    // The engine's own reading of this economy, when it tracks one. A polity whose
    // revenue is almost entirely non-tax has no meaningful GDP line (see the
    // economy cards below).
    const engineIndicators = engine?.economy ? economyIndicators(engine.economy) : null;
    const noTaxEntity = Boolean(engineIndicators && engineIndicators.nonTaxShare > 0.9);

    return (
        <div style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0 }}>
        <div style={{ flex: 1, overflowY: "auto", padding: "0.9rem 1rem 1.25rem", scrollbarWidth: "none" }}>

        {!targetCountry && (
            <p style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-xs)" }}>
            No active game. Start one to see national statistics.
            </p>
        )}

        {targetCountry && (
            <>
            {/* Country header */}
            <div style={{ alignItems: "flex-start", display: "flex", gap: "0.7rem" }}>
            <div style={{ alignItems: "center", backgroundColor: "var(--oh-accent-soft)", border: "1px solid var(--oh-line)", borderRadius: "10px", color: "var(--oh-accent)", display: "flex", flexShrink: 0, fontSize: "var(--oh-t-sm)", fontWeight: 800, height: "2.6rem", justifyContent: "center", overflow: "hidden", width: "2.6rem" }}>
            {flagUrl && !flagFailed ? (
                <img
                alt=""
                src={flagUrl}
                onError={() => setFlagFailed(true)}
                style={{ height: "100%", objectFit: "cover", width: "100%" }}
                />
            ) : initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ alignItems: "center", display: "flex", gap: "0.5rem" }}>
            <span style={{ fontSize: "var(--oh-t-base)", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {displayName || targetCountry}
            </span>
            {isPlayer && (
                <span style={{ backgroundColor: "var(--oh-caution-soft)", border: "1px solid var(--oh-caution-soft)", borderRadius: "999px", color: "var(--oh-caution)", flexShrink: 0, fontSize: "var(--oh-t-2xs)", fontWeight: 700, padding: "0.14rem 0.5rem" }}>
                Your country
                </span>
            )}
            </div>
            {sheet && (
                <>
                <div style={{ color: "var(--oh-text)", fontSize: "var(--oh-t-xs)", marginTop: "0.15rem" }}>
                {[sheet.capital, sheet.continent].filter(Boolean).join(" · ")}
                </div>
                {sheet.government && (
                    <div style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-xs)", marginTop: "0.1rem" }}>
                    {sheet.government}
                    </div>
                )}
                {sheet.leader && (
                    <div style={{ color: "var(--oh-caution)", fontSize: "var(--oh-t-xs)", marginTop: "0.1rem" }}>
                    Leader: {sheet.leader}
                    </div>
                )}
                </>
            )}
            </div>
            {state.status !== "loading" && (
                <button
                onClick={() => loadSheet({ force: true })}
                title="Regenerate this stat sheet"
                style={{ background: "none", border: "none", color: "var(--oh-text-dim)", cursor: "pointer", fontSize: "var(--oh-t-base)", padding: 0 }}
                >↻</button>
            )}
            </div>

            {state.status === "loading" && (
                <p style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-xs)", marginTop: "1rem" }}>
                Compiling the stat sheet…
                </p>
            )}

            {state.status === "error" && (
                <div style={{ backgroundColor: "var(--oh-alert-soft)", border: "1px solid var(--oh-alert-soft)", borderRadius: "10px", fontSize: "var(--oh-t-xs)", marginTop: "1rem", padding: "0.7rem 0.8rem" }}>
                {state.error}
                <button
                onClick={() => loadSheet({ force: true })}
                style={{ background: "none", border: "none", color: "var(--oh-accent)", cursor: "pointer", display: "block", fontSize: "var(--oh-t-xs)", fontWeight: 700, marginTop: "0.4rem", padding: 0 }}
                >Try again</button>
                </div>
            )}

            {sheet && state.status === "ready" && (
                <>
                {/* National stability */}
                <div style={{ ...cardStyle, marginTop: "1rem" }}>
                <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: "0.45rem" }}>
                <span style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)", fontWeight: 700, letterSpacing: "var(--oh-label-track)", textTransform: "var(--oh-label-case)" }}>
                ⚠ National stability
                </span>
                <span data-no-translate style={{ fontSize: "var(--oh-t-xs)", fontWeight: 800 }}>
                {clamp01(sheet.stability)}/100
                </span>
                </div>
                <Bar value={sheet.stability} color={stabilityColor(clamp01(sheet.stability))} />
                </div>

                {/* Strategic indices */}
                <div style={sectionTitleStyle}>⚑ Strategic indices</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
                {INDEX_ROWS.map((row) => {
                    const value = clamp01(sheet.indices?.[row.key]);
                    return (
                        <div key={row.key} style={cardStyle}>
                        <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                        <span style={{ color: "var(--oh-text)", fontSize: "var(--oh-t-xs)" }}>
                        {row.icon} {row.label}
                        </span>
                        <span data-no-translate style={{ fontSize: "var(--oh-t-xs)", fontWeight: 800 }}>{value}%</span>
                        </div>
                        <Bar value={value} color={row.color} />
                        </div>
                    );
                })}
                </div>

                {/* Economy */}
                <div style={sectionTitleStyle}>📈 Economy</div>
                <div style={{ display: "grid", gap: "0.55rem", gridTemplateColumns: "1fr 1fr" }}>
                {/* A state that lives on patrimony and transfers rather than tax has a
                    "GDP" that counts only its residents: for the Holy See that is 500
                    people, while the engine tracks revenue twenty-five times larger.
                    Printing that GDP misleads; the engine's revenue is the figure. */}
                {noTaxEntity ? (
                    <EconomyCard label="Revenue (engine)" value={`${Math.round(engineIndicators.revenue).toLocaleString()} SY/yr`} sub="no tax; patrimony and transfers" tone="var(--oh-grant)" />
                ) : (
                    <EconomyCard label="GDP" value={sheet.economy?.gdp} sub={sheet.economy?.gdpGrowth} tone="var(--oh-grant)" />
                )}
                <EconomyCard label="GDP/capita" value={sheet.economy?.gdpPerCapita} sub={sheet.economy?.currency} tone="var(--oh-text-strong)" />
                <EconomyCard label="Inflation" value={sheet.economy?.inflation} tone="var(--oh-grant)" />
                <EconomyCard label="Unemployment" value={sheet.economy?.unemployment} tone="var(--oh-grant)" />
                <EconomyCard label="Public debt" value={sheet.economy?.publicDebt} tone="var(--oh-grant)" />
                <EconomyCard
                label="Budget balance"
                value={sheet.economy?.budgetBalance}
                sub={budgetNegative ? "Deficit" : "Surplus"}
                tone={budgetNegative ? "var(--oh-alert)" : "var(--oh-grant)"}
                />
                </div>

                {/* GDP breakdown */}
                <div style={{ ...cardStyle, marginTop: "0.9rem" }}>
                <div style={{ color: "var(--oh-text)", fontSize: "var(--oh-t-xs)", marginBottom: "0.5rem" }}>
                GDP breakdown
                </div>
                <div style={{ borderRadius: "999px", display: "flex", height: "10px", overflow: "hidden" }}>
                {breakdown.map((part) => (
                    <div key={part.key} style={{ backgroundColor: part.color, width: `${part.share}%` }} />
                ))}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem 0.8rem", marginTop: "0.5rem" }}>
                {breakdown.map((part) => (
                    <span key={part.key} style={{ alignItems: "center", color: "var(--oh-text)", display: "flex", fontSize: "var(--oh-t-2xs)", gap: "0.3rem" }}>
                    <span style={{ backgroundColor: part.color, borderRadius: "2px", height: "7px", width: "7px" }} />
                    {part.label} <span data-no-translate>{part.value}%</span>
                    </span>
                ))}
                </div>
                </div>
                </>
            )}

            {targetCountry === HOLY_SEE && engine.church && (
                <FaithfulPanel church={engine.church} />
            )}

            {targetCountry && engine.economy && (
                <EconomyPanel code={displayName || targetCountry} economy={engine.economy} flows={engine.flows} allEconomies={engine.allEconomies} units={engine.units} />
            )}

            {targetCountry && engine.economy && engine.program && (
                <ProgramPanel code={displayName || targetCountry} economy={engine.economy} program={engine.program} />
            )}

            <p style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)", marginTop: "1rem" }}>
            Click any country on the map to inspect it.
            </p>
            </>
        )}
        </div>
        </div>
    );
};

export default StatsPane;

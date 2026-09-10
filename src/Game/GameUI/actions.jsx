/*! Open Historia — portions (panel sizing on small screens) © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
import React from "react";
import dayjs from "dayjs";
import advancedFormat from "dayjs/plugin/advancedFormat";
import { JSON_URLS, readJson } from "../../runtime/assets.js";
import { useCountryDisplayName } from "../../runtime/polityNames.js";
import { generateActionSuggestions, refinePlayerAction } from "../AI/gameplay.js";
import { revertUnitOrder } from "../Map/unitsController.js";
import { driveNeedsFigure } from "../../runtime/drives.js";
import {
    buildActionDisplayText,
    normalizeActionEntry,
    normalizeWorldState,
    readActionsState,
    writeActionsState,
} from "../../runtime/gameState.js";
import { assessAction } from "../../runtime/realityCheck.js";
import { RealityTally } from "./verdict.jsx";

// The verdict the next jump will hold the order to (runtime/realityCheck.js),
// shown the moment it is queued — so the player argues with the world before
// the turn, not after.
dayjs.extend(advancedFormat);

const ACTIONS_STYLE_ID = "actions-style";

const ensureActionsStyles = () => {
    if (typeof document === "undefined" || document.getElementById(ACTIONS_STYLE_ID)) {
        return;
    }

    const style = document.createElement("style");
    style.id = ACTIONS_STYLE_ID;
    style.textContent = `
    @keyframes actions-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }

    .actions-composer {
        -ms-overflow-style: none;
        scrollbar-width: none;
    }

    .actions-composer::-webkit-scrollbar {
        display: none;
    }
    `;
    document.head.appendChild(style);
};

const SparkleIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 2L13.5 9.5L21 11L13.5 12.5L12 20L10.5 12.5L3 11L10.5 9.5L12 2Z" />
    </svg>
);

const StopIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
);

const SendIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
);

const SpinnerRing = ({ size = 14, tone = "var(--oh-text-dim)" }) => {
    React.useEffect(() => {
        ensureActionsStyles();
    }, []);

    return (
        <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        style={{ animation: "actions-spin 0.7s linear infinite" }}
        >
        <circle cx="12" cy="12" r="8" stroke="var(--oh-line)" strokeWidth="2.2" />
        <path d="M12 4a8 8 0 0 1 8 8" stroke={tone} strokeWidth="2.2" strokeLinecap="round" />
        </svg>
    );
};

const saveActions = async (actions) => writeActionsState(actions);
const loadActions = async () => readActionsState();

const createManualAction = (input) =>
normalizeActionEntry({
    kind: "action",
    rawInput: input,
    source: "manual",
    status: "planned",
    text: input,
    title: input,
});

const normalizeSuggestionAction = (action) =>
normalizeActionEntry({
    ...action,
    source: "suggested",
    status: "planned",
});

const ActionItem = ({ action, onDelete, realityContext }) => {
    const [hovered, setHovered] = React.useState(false);
    const normalized = normalizeActionEntry(action);
    const assessment = React.useMemo(
        () => (realityContext && normalized && normalized.kind !== "chat" ? assessAction(normalized, realityContext) : null),
        [realityContext, normalized],
    );

    if (!normalized) {
        return null;
    }

    const label = buildActionDisplayText(normalized);
    const showTitle = normalized.title && normalized.title !== label;

    return (
        <div
        className="oh-plate"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
            alignItems: "flex-start",
            display: "flex",
            gap: "0.6rem",
            justifyContent: "space-between",
            lineHeight: "1.5",
            padding: "0.65rem 0.85rem 0.6rem",
            transform: hovered ? "translateY(-1px)" : "none",
            transition: "transform 0.15s",
        }}
        >
        <div style={{ flex: 1, minWidth: 0 }}>
        <div className="oh-label" style={{ color: "var(--oh-text-dim)", marginBottom: "0.2rem" }}>
        {normalized.kind === "chat" ? "Outreach" : "Order"} · {normalized.status}
        </div>
        {showTitle && (
            <div style={{ color: "var(--oh-text-strong)", fontSize: "var(--oh-t-base)", fontWeight: 600, marginBottom: "0.1rem" }}>
            {normalized.title}
            </div>
        )}
        <div style={{ color: "var(--oh-text-strong)", fontSize: "var(--oh-t-sm)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
        {label}
        </div>
        <RealityTally assessment={assessment} />
        </div>
        <button
        type="button"
        onClick={onDelete}
        title="Supprimer l'ordre"
        style={{
            alignItems: "center",
            background: hovered ? "var(--oh-alert-soft)" : "none",
            border: "none",
            borderRadius: "6px",
            // Red on a red tint cannot reach 4.5:1: the tint is the warning, the
            // glyph goes to ink while hovered.
            color: hovered ? "var(--oh-text-strong)" : "var(--oh-alert)",
            cursor: "pointer",
            display: "flex",
            flexShrink: 0,
            fontSize: "var(--oh-t-base)",
            lineHeight: 1,
            opacity: hovered ? 1 : 0,
            padding: "0.18rem 0.3rem",
            pointerEvents: hovered ? "auto" : "none",
            transition: "opacity 0.15s, color 0.15s, background 0.15s",
        }}
        >
        {"\u2715"}
        </button>
        </div>
    );
};

// A topic and its options. When the topic names a dilemma, its options are
// philosophies set against each other: each carries the stance it embodies
// and the dilemma line says what the choice costs. A queued option is a
// toggle — clicking it again withdraws the order it queued.
const SuggestionCard = ({ topic, onQueue, queuedIds }) => {
    const contested = Boolean(topic.dilemma);
    return (
        <div
        style={{
            background: "var(--oh-plate-2)",
            border: "1px solid var(--oh-line)",
            borderLeft: contested ? "4px solid var(--oh-caution)" : "1px solid var(--oh-line)",
            borderRadius: "12px",
            display: "flex",
            flexDirection: "column",
            gap: "0.55rem",
            padding: "0.7rem 0.8rem",
        }}
        >
        <div>
        <div style={{ color: "var(--oh-text-strong)", fontSize: "var(--oh-t-xs)", fontWeight: 700 }}>{topic.title}</div>
        <div style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-xs)", lineHeight: "1.5", marginTop: "0.2rem" }}>
        {topic.description}
        </div>
        {contested && (
            <div style={{ color: "var(--oh-text-strong)", fontSize: "var(--oh-t-xs)", fontStyle: "italic", lineHeight: "1.5", marginTop: "0.4rem" }}>
            <span className="oh-label" style={{ color: "var(--oh-caution)", fontStyle: "normal", marginRight: "0.4rem" }}>Choix à faire</span>
            {topic.dilemma}
            </div>
        )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        {topic.actions.map((action) => {
            const isQueued = queuedIds?.has(action.id);
            return (
                <button
                key={action.id}
                type="button"
                title={isQueued ? "Versé au dossier — cliquez pour le retirer" : "Verser cet ordre au dossier"}
                onClick={() => onQueue(action, isQueued)}
                style={{
                    background: isQueued ? "var(--oh-grant-soft)" : "var(--oh-accent-soft)",
                    border: isQueued ? "1px solid var(--oh-grant)" : "1px solid var(--oh-accent-soft)",
                    borderRadius: "10px",
                    color: "var(--oh-text-strong)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    padding: "0.55rem 0.7rem",
                    textAlign: "left",
                }}
                >
                {action.stance && (
                    <div className="oh-label" style={{ color: isQueued ? "var(--oh-grant)" : "var(--oh-accent)", fontSize: "var(--oh-t-2xs)", marginBottom: "0.15rem" }}>{action.stance}</div>
                )}
                <div style={{ fontSize: "var(--oh-t-xs)", fontWeight: 700 }}>
                {isQueued ? `✓ Queued — ${action.title}` : action.title}
                </div>
                <div style={{ color: "var(--oh-text)", fontSize: "var(--oh-t-xs)", lineHeight: "1.45", marginTop: "0.18rem" }}>
                {action.text}
                </div>
                {isQueued && (
                    <div style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)", marginTop: "0.25rem" }}>Cliquez encore pour retirer</div>
                )}
                </button>
            );
        })}
        </div>
        </div>
    );
};

const ActionsPanel = ({ isOpen, onClose, onOpenAdvisor, embedded = false }) => {
    const [actions, setActions] = React.useState([]);
    const [inputValue, setInputValue] = React.useState("");
    const [country, setCountry] = React.useState("your nation");
    // The normalized world (plus a cheap change stamp) behind the live verdicts.
    const [realityWorld, setRealityWorld] = React.useState(null);
    const realityContext = React.useMemo(
        () => (realityWorld?.world && country
            ? { playerPolity: country, economy: realityWorld.world.economies?.[country] ?? null, world: realityWorld.world, jumpDays: 0 }
            : null),
        [realityWorld, country],
    );
    // Full display name for the header, never the code.
    const countryDisplayName = useCountryDisplayName(country);
    const [gameDate, setGameDate] = React.useState("the current date");
    const [suggestions, setSuggestions] = React.useState([]);
    const [hasRequestedSuggestions, setHasRequestedSuggestions] = React.useState(false);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [isImproving, setIsImproving] = React.useState(false);
    // Holds the in-flight improve's AbortController so the button can stop it,
    // the same shape as the timeline jump's cancel (time.jsx jumpAbortRef).
    const improveAbortRef = React.useRef(null);
    const [isSuggesting, setIsSuggesting] = React.useState(false);
    const inputRef = React.useRef(null);
    const lastRoundRef = React.useRef(null);

    React.useEffect(() => {
        if (!isOpen) {
            return undefined;
        }

        let cancelled = false;
        ensureActionsStyles();
        setSuggestions([]);
        setHasRequestedSuggestions(false);

        loadActions().then((saved) => {
            if (!cancelled) {
                setActions(saved);
            }
        });

        const fetchGameData = () => {
            // The world rides along so each queued order can be judged live
            // against the player's real numbers, bodies and rivals' schemes.
            readJson(JSON_URLS.world, { defaultValue: {}, force: true })
            .then((world) => {
                if (cancelled) return;
                const normalized = normalizeWorldState(world);
                setRealityWorld((prev) => (JSON.stringify(prev?.stamp) === JSON.stringify([normalized.intents, normalized.organizations.length, normalized.economies]) ? prev : { world: normalized, stamp: [normalized.intents, normalized.organizations.length, normalized.economies] }));
            })
            .catch(() => {});
            readJson(JSON_URLS.game, { defaultValue: {}, force: true })
            .then((data) => {
                if (cancelled) {
                    return;
                }

                if (data.country) {
                    setCountry(data.country);
                }

                if (data.gameDate) {
                    setGameDate(dayjs(data.gameDate).format("MMMM Do, YYYY"));
                }

                // After a jump, applySimulationResult re-marks last round's actions
                // "resolved" (submittedActions filters those out) — but this panel never
                // re-read the store, so they lingered. Reload when the round advances so
                // the previous turn's actions clear automatically. First tick just seeds
                // the ref (no spurious reload); a freshly queued next-turn action is
                // already persisted, so the reload keeps it.
                if (typeof data.round === "number") {
                    if (lastRoundRef.current !== null && data.round !== lastRoundRef.current) {
                        loadActions().then((saved) => { if (!cancelled) setActions(saved); });
                    }
                    lastRoundRef.current = data.round;
                }
            })
            .catch(() => {});
        };

        fetchGameData();
        const interval = setInterval(fetchGameData, 5000);

        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [isOpen]);

    const persistActions = async (nextActions) => {
        setActions(nextActions);
        try {
            await saveActions(nextActions);
        } catch (error) {
            console.error("Failed to save actions:", error);
        }
    };

    const submittedActions = React.useMemo(
        () =>
        actions
        .map((action, index) => ({
            normalized: normalizeActionEntry(action, index),
                                 originalIndex: index,
        }))
        .filter(({ normalized }) => normalized?.status === "planned"),
                                           [actions],
    );

    const handleSubmit = async () => {
        const trimmed = inputValue.trim();
        if (!trimmed || isSubmitting || isImproving) {
            return;
        }

        const nextAction = createManualAction(trimmed);
        if (!nextAction) {
            return;
        }

        setIsSubmitting(true);
        try {
            await persistActions([...actions, nextAction]);
            setInputValue("");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleImprove = async () => {
        const trimmed = inputValue.trim();
        if (!trimmed || isImproving || isSubmitting) {
            return;
        }

        setIsImproving(true);
        const controller = new AbortController();
        improveAbortRef.current = controller;
        try {
            const refined = await refinePlayerAction(trimmed, { persist: false, signal: controller.signal });
            const improvedText = refined?.text || buildActionDisplayText(refined) || trimmed;
            setInputValue(improvedText);
            inputRef.current?.focus();
        } catch (error) {
            // Stopping on purpose is not a failure, and it must leave the text the
            // player typed exactly as it was.
            if (error?.name !== "AbortError") {
                console.error("Failed to improve action:", error);
            }
        } finally {
            improveAbortRef.current = null;
            setIsImproving(false);
        }
    };

    const handleStopImprove = () => {
        improveAbortRef.current?.abort(new DOMException("Improve cancelled.", "AbortError"));
    };

    const handleDelete = async (index) => {
        const removed = actions[index];
        // Deleting a queued troop order also undoes what it did to the map —
        // otherwise a manual move/deploy stays in place while the AI is never
        // told about it (#368). Only planned orders carry a revert; anything
        // already resolved by a jump keeps its outcome.
        if (removed?.unitRevert && (removed.status ?? "planned") === "planned") {
            try {
                await revertUnitOrder(removed.unitRevert);
            } catch (error) {
                console.warn("[actions] could not revert the unit order:", error);
            }
        }
        await persistActions(actions.filter((_, actionIndex) => actionIndex !== index));
    };

    // Which suggested options stand queued — read off the orders themselves
    // (a queued suggestion keeps the suggestion's id), so the mark survives a
    // reopen, clears when the order is deleted from the list, and never says
    // "queued" about an order that is no longer there.
    const queuedSuggestionIds = React.useMemo(
        () => new Set(submittedActions.map(({ normalized }) => normalized?.id).filter(Boolean)),
        [submittedActions],
    );

    // A toggle: queue the option, or withdraw the order it queued.
    const handleQueueSuggestion = async (action, isQueued = false) => {
        if (isQueued) {
            await persistActions(actions.filter((entry) => normalizeActionEntry(entry)?.id !== action.id));
            return;
        }
        const queuedAction = normalizeSuggestionAction(action);
        if (!queuedAction) {
            // Malformed AI suggestion — say so instead of doing nothing.
            console.warn("[actions] suggestion could not be queued (no usable text):", action);
            return;
        }
        await persistActions([...actions, queuedAction]);
    };

    const refreshSuggestions = async () => {
        if (isSuggesting) {
            return;
        }

        setHasRequestedSuggestions(true);
        setIsSuggesting(true);
        try {
            const topics = await generateActionSuggestions({ force: true });
            setSuggestions(topics);
        } catch (error) {
            console.error("Failed to generate suggestions:", error);
            setSuggestions([]);
        } finally {
            setIsSuggesting(false);
        }
    };

    const handleKeyDown = (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            handleSubmit();
        }
    };

    const suggestionButtonLabel = hasRequestedSuggestions
    ? (isSuggesting ? "Refreshing AI suggestions..." : "Refresh AI suggestions")
    : (isSuggesting ? "Suggestions en cours…" : "Demander des suggestions");

    return (
        <div
        className={embedded ? "oh-desk" : undefined}
        style={{
            // Embedded in the bulletin the desk is a column of the page: no
            // floating chrome, the page's own ground. On the map it floats.
            ...(embedded
                ? { background: "transparent", border: 0, borderRadius: 0, boxShadow: "none" }
                : {
                    backgroundColor: "var(--oh-plate)",
                    border: "1px solid var(--oh-line)",
                    borderRadius: "16px",
                    bottom: isOpen ? "4.25rem" : "-30rem",
                    boxShadow: "-4px 0 24px rgba(0,0,0,0.4), inset 0 1px 0 var(--oh-line)",
                }),
            color: "var(--oh-text)",
            display: "flex",
            flexDirection: "column",
            fontFamily: "inherit",
            // Grow to use the height a taller screen offers (leaving ~16rem for the
            // top bar), never dropping below a usable 30rem floor for laptops/phones,
            // and never past the 9rem the top UI needs (so it can't overflow up).
            ...(embedded
                ? { height: "auto", minHeight: "10rem", overflow: "visible", position: "static", width: "100%" }
                : {
                    height: "min(calc(100vh - 9rem), max(calc(100vh - 16rem), 30rem))",
                    minHeight: "10rem",
                    left: "0rem",
                    maxWidth: "calc(100vw - 1rem)",
                    opacity: isOpen ? 1 : 0,
                    overflow: "hidden",
                    pointerEvents: isOpen ? "auto" : "none",
                    position: "fixed",
                    transition: "bottom 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.35s ease",
                    width: "26.25rem",
                    zIndex: 9998,
                }),
        }}
        >
        <div
        style={{
            alignItems: "baseline",
            borderBottom: embedded ? "4px solid var(--oh-text-strong)" : "1px solid var(--oh-line)",
            display: "flex",
            justifyContent: "space-between",
            padding: embedded ? "0 0 0.4rem" : "1rem 1.25rem 0.75rem",
        }}
        >
        {embedded
            ? <span className="oh-label" style={{ color: "var(--oh-text-strong)" }}>Ordres</span>
            : <span style={{ fontSize: "var(--oh-t-base)", fontWeight: 700, letterSpacing: "0.01em" }}>Ordres</span>}
        {!embedded && <button
        type="button"
        onClick={onClose}
        style={{
            background: "none",
            border: "none",
            borderRadius: "6px",
            color: "var(--oh-text-dim)",
            cursor: "pointer",
            fontSize: "var(--oh-t-md)",
            lineHeight: 1,
            padding: "0.15rem 0.3rem",
            transition: "color 0.15s, background 0.15s",
        }}
        onMouseEnter={(event) => {
            event.currentTarget.style.color = "var(--oh-text-strong)";
            event.currentTarget.style.background = "var(--oh-plate-2)";
        }}
        onMouseLeave={(event) => {
            event.currentTarget.style.color = "var(--oh-text-dim)";
            event.currentTarget.style.background = "none";
        }}
        >
        {"\u2715"}
        </button>}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem", padding: embedded ? "0.875rem 0" : "0.875rem 1.25rem", flex: 1, minHeight: 0, overflow: embedded ? "visible" : "hidden" }}>
        <p
        style={{
            color: "var(--oh-text)",
            fontSize: embedded ? "var(--oh-t-sm)" : "var(--oh-t-xs)",
            lineHeight: "1.55",
            margin: 0,
        }}
        >
        {embedded
            ? <>Orders in the name of {countryDisplayName}, to take effect from {gameDate}. Each one is held to the budget, the reach of the apparatus, the schemes already running and the bodies that must vote, before the world answers it.</>
            : <>Submit actions for {countryDisplayName} for {gameDate}. Your actions will affect how the game world responds.</>}
        </p>

        <button
        type="button"
        onClick={onOpenAdvisor}
        style={{
            background: "var(--oh-accent-soft)",
            border: "1px solid var(--oh-accent-soft)",
            borderRadius: "10px",
            color: "var(--oh-accent)",
            cursor: "pointer",
            fontSize: "var(--oh-t-xs)",
            fontWeight: 500,
            letterSpacing: "0.01em",
            padding: "0.55rem 1rem",
            transition: "background 0.15s, border-color 0.15s",
            width: "100%",
        }}
        onMouseEnter={(event) => {
            event.currentTarget.style.background = "var(--oh-accent-soft)";
            event.currentTarget.style.borderColor = "var(--oh-accent-soft)";
        }}
        onMouseLeave={(event) => {
            event.currentTarget.style.background = "var(--oh-accent-soft)";
            event.currentTarget.style.borderColor = "var(--oh-accent-soft)";
        }}
        >
        M'aider à trouver des idées
        </button>

        <button
        type="button"
        onClick={refreshSuggestions}
        style={{
            alignItems: "center",
            background: "var(--oh-plate-2)",
            border: "1px solid var(--oh-line)",
            borderRadius: "10px",
            color: "var(--oh-text)",
            cursor: "pointer",
            display: "flex",
            fontSize: "var(--oh-t-xs)",
            gap: "0.5rem",
            justifyContent: "center",
            padding: "0.52rem 1rem",
            transition: "background 0.15s, border-color 0.15s",
            width: "100%",
        }}
        onMouseEnter={(event) => {
            event.currentTarget.style.background = "var(--oh-plate-2)";
            event.currentTarget.style.borderColor = "var(--oh-line)";
        }}
        onMouseLeave={(event) => {
            event.currentTarget.style.background = "var(--oh-plate-2)";
            event.currentTarget.style.borderColor = "var(--oh-line)";
        }}
        >
        {isSuggesting && <SpinnerRing size={14} />}
        <span>{suggestionButtonLabel}</span>
        </button>

        {(hasRequestedSuggestions || isSuggesting || suggestions.length > 0) && (
            <div
            style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
                maxHeight: embedded ? "none" : "13rem",
                overflowY: embedded ? "visible" : "auto",
                scrollbarWidth: "none",
            }}
            >
            {hasRequestedSuggestions && !isSuggesting && suggestions.length === 0 && (
                <p style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-xs)", fontStyle: "italic", margin: 0 }}>
                No AI suggestions generated yet.
                </p>
            )}
            {suggestions.map((topic) => (
                <SuggestionCard key={topic.id} topic={topic} onQueue={handleQueueSuggestion} queuedIds={queuedSuggestionIds} />
            ))}
            </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
        <p
        style={{
            color: "var(--oh-text-strong)",
            fontSize: "var(--oh-t-xs)",
            fontWeight: 700,
            letterSpacing: "var(--oh-label-track)",
            margin: "0 0 0.5rem 0",
            textTransform: "var(--oh-label-case)",
        }}
        >
        Vos ordres versés au dossier
        </p>

        <div
        style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.4rem",
            flex: embedded ? "none" : 1,
            overflowY: embedded ? "visible" : "auto",
            scrollbarWidth: "none",
        }}
        >
        {submittedActions.length === 0 && (
            <p style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-sm)", fontStyle: "italic", margin: 0 }}>
            Aucun ordre en cours. Écrivez-en un ci-dessous : le verdict paraît dès qu'il est versé au dossier.
            </p>
        )}
        {submittedActions.map(({ normalized, originalIndex }) => (
            <ActionItem key={normalized.id || originalIndex} action={normalized} onDelete={() => handleDelete(originalIndex)} realityContext={realityContext} />
        ))}
        </div>
        </div>
        </div>

        {/* A drive the ledger cannot follow: said before the order is queued,
            so the player writes the figure in their own words rather than
            discovering ten rounds later that nothing was ever counted. */}
        {driveNeedsFigure(inputValue) && (
            <div
            style={{
                background: "var(--oh-caution-soft)",
                borderLeft: "4px solid var(--oh-caution)",
                color: "var(--oh-text-strong)",
                fontSize: "var(--oh-t-sm)",
                lineHeight: 1.5,
                margin: embedded ? "0.6rem 0 0" : "0 1rem",
                padding: "0.6rem 0.8rem",
            }}
            >
            This order raises money but names no figure. Say what it seeks — “raise 500 million euros” — or the ledger has no number to follow, and nothing it brings in can ever be counted.
            </div>
        )}

        <div
        style={{
            alignItems: "center",
            backgroundColor: "var(--oh-plate-2)",
            borderTop: "1px solid var(--oh-line)",
            display: "flex",
            gap: "0.5rem",
            padding: "0.75rem 1rem",
        }}
        >
        <div style={{ alignItems: "stretch", display: "flex", flex: 1, position: "relative" }}>
        <textarea
        ref={inputRef}
        className="actions-composer"
        placeholder={embedded ? "Donnez un ordre… (Maj+Entrée pour une nouvelle ligne)" : "Écrivez votre ordre…  (Maj+Entrée pour une nouvelle ligne)"}
        value={inputValue}
        onChange={(event) => setInputValue(event.target.value)}
        onKeyDown={handleKeyDown}
        style={{
            background: "var(--oh-plate-2)",
            border: "1px solid var(--oh-line)",
            borderRadius: "10px",
            boxSizing: "border-box",
            color: "var(--oh-text)",
            fontFamily: "inherit",
            fontSize: embedded ? "var(--oh-t-base)" : "var(--oh-t-xs)",
            outline: "none",
            padding: embedded ? "0.9rem 3rem 0.9rem 1rem" : "0.7rem 2.8rem 0.7rem 0.85rem",
            resize: "vertical",
            transition: "border-color 0.2s",
            minHeight: embedded ? "8rem" : "3rem",
            lineHeight: "1.45",
            overflowY: "auto",
            width: "100%",
        }}
        onFocus={(event) => {
            event.target.style.borderColor = "var(--oh-accent-soft)";
        }}
        onBlur={(event) => {
            event.target.style.borderColor = "var(--oh-line)";
        }}
        />
        <button
        type="button"
        onClick={isImproving ? handleStopImprove : handleImprove}
        title={isImproving ? "Arrêter" : "Améliorer le texte de l'ordre"}
        aria-label={isImproving ? "Arrêter" : "Améliorer le texte de l'ordre"}
        style={{
            alignItems: "center",
            background: "none",
            border: "none",
            borderRadius: "8px",
            color: isImproving || inputValue.trim() ? "var(--oh-accent)" : "var(--oh-accent)",
            cursor: isImproving || inputValue.trim() ? "pointer" : "default",
            display: "flex",
            height: "1.8rem",
            justifyContent: "center",
            padding: 0,
            position: "absolute",
            right: "0.45rem",
            top: "0.55rem",
            width: "1.8rem",
        }}
        >
        {isImproving ? <StopIcon /> : <SparkleIcon />}
        </button>
        </div>

        <button
        type="button"
        onClick={handleSubmit}
        disabled={!inputValue.trim() || isSubmitting || isImproving}
        style={{
            alignItems: "center",
            background: inputValue.trim() && !isSubmitting && !isImproving ? "var(--oh-accent)" : "var(--oh-accent-soft)",
            border: "none",
            borderRadius: "10px",
            color: inputValue.trim() && !isSubmitting && !isImproving ? "var(--oh-on-accent)" : "var(--oh-text)",
            cursor: inputValue.trim() && !isSubmitting && !isImproving ? "pointer" : "not-allowed",
            display: "flex",
            flexShrink: 0,
            height: "2.2rem",
            justifyContent: "center",
            transition: "background 0.15s",
            width: "2.2rem",
        }}
        onMouseEnter={(event) => {
            if (inputValue.trim() && !isSubmitting && !isImproving) {
                event.currentTarget.style.background = "var(--oh-accent)";
            }
        }}
        onMouseLeave={(event) => {
            if (inputValue.trim() && !isSubmitting && !isImproving) {
                event.currentTarget.style.background = "var(--oh-accent)";
            }
        }}
        >
        {isSubmitting ? <SpinnerRing size={14} /> : <SendIcon />}
        </button>
        </div>
        </div>
    );
};

const Actions = ({ onOpenAdvisor, hovered, setHovered, isOpen, onToggle }) => {
    const [hasOpened, setHasOpened] = React.useState(false);

    React.useEffect(() => {
        if (isOpen) {
            setHasOpened(true);
        }
    }, [isOpen]);

    return (
        <>
        {hasOpened && (
            <ActionsPanel
            isOpen={isOpen}
            onClose={onToggle}
            onOpenAdvisor={onOpenAdvisor}
            />
        )}
        <button
        type="button"
        title="Actions"
        style={{
            alignItems: "center",
            background: isOpen
            ? "linear-gradient(145deg, var(--oh-accent), var(--oh-accent))"
            : hovered
            ? "linear-gradient(145deg, var(--oh-plate-2), var(--oh-plate-2))"
            : "linear-gradient(145deg, var(--oh-plate-2), var(--oh-plate-2))",
            border: hovered
            ? "1px solid var(--oh-line)"
            : isOpen
            ? "1px solid var(--oh-accent-soft)"
            : "1px solid var(--oh-line)",
            borderRadius: "10px",
            boxShadow: hovered
            ? "inset 0 1px 0 var(--oh-line), 0 2px 8px rgba(0,0,0,0.4)"
            : "inset 0 1px 0 var(--oh-line), inset 0 -1px 0 var(--oh-plate-2), 0 2px 6px rgba(0,0,0,0.35)",
            color: "var(--oh-text)",
            cursor: "pointer",
            display: "flex",
            fontFamily: "inherit",
            fontSize: "var(--oh-t-md)",
            height: "3.3rem",
            justifyContent: "center",
            outline: "none",
            transform: hovered ? "translateY(-1px)" : "translateY(0)",
            transition: "all 0.12s ease",
            width: "3.3rem",
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={onToggle}
        >
        <SparkleIcon />
        </button>
        </>
    );
};

export { Actions, ActionsPanel };

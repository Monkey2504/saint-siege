/*! Open Historia — Forces panel © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
import React, { useCallback, useEffect, useState } from "react";
import {
  subscribeUnits,
  getUnits,
  getPlayerCode,
  getAllowedUnitTypes,
  getInteractionMode,
  setInteractionMode,
  clearInteractionMode,
} from "../Map/unitsController.js";
import { UNIT_TYPES } from "../../runtime/gameState.js";
import { ensurePolityNames, polityDisplayName } from "../../runtime/polityNames.js";

const TYPE_LABEL = {
  infantry: "Infantry",
  armor: "Armor",
  air: "Air",
  naval: "Naval",
  artillery: "Artillery",
  garrison: "Garrison",
};
const TYPE_GLYPH = {
  infantry: "🛡",
  armor: "⚙",
  air: "✈",
  naval: "⚓",
  artillery: "💥",
  garrison: "🏰",
};

const MODE_HINT = {
  deploy: "Click the map to place your unit",
  move: "Click a destination to move the unit",
  attack: "Click an enemy unit, a city, or a structure to attack",
};

const surface = {
  backgroundColor: "var(--oh-plate)",
 
  WebkitBackdropFilter: "blur(6px)",
  border: "1px solid var(--oh-line)",
  borderRadius: "12px",
  color: "var(--oh-text)",
  fontFamily: "inherit",
  boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
};

const UnitRow = ({ unit, dimmed, onClick }) => (
  <button
    onClick={onClick}
    style={{
      display: "flex",
      alignItems: "center",
      gap: "8px",
      width: "100%",
      background: "var(--oh-plate-2)",
      border: "1px solid var(--oh-line)",
      borderRadius: "8px",
      padding: "6px 8px",
      marginBottom: "5px",
      cursor: "pointer",
      color: "var(--oh-text)",
      textAlign: "left",
      opacity: dimmed ? 0.65 : 1,
    }}
  >
    <span style={{ fontSize: "var(--oh-t-md)", lineHeight: 1 }}>{TYPE_GLYPH[unit.type] ?? "🛡"}</span>
    <div style={{ minWidth: 0, flex: 1 }}>
      <div style={{ fontSize: "var(--oh-t-xs)", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {unit.name}
      </div>
      <div style={{ fontSize: "var(--oh-t-2xs)", color: "var(--oh-text-dim)" }}>
        {TYPE_LABEL[unit.type] ?? unit.type} · {polityDisplayName(unit.ownerCode)} · {unit.status}
      </div>
    </div>
    <span style={{ fontSize: "var(--oh-t-xs)", fontWeight: 700, color: unit.strength > 600 ? "var(--oh-grant)" : unit.strength > 250 ? "var(--oh-caution)" : "var(--oh-alert)" }}>
      {unit.strength}
    </span>
  </button>
);

// Controlled panel: the launcher button lives in the bottom toolbar (chat.jsx
// Toolbar) alongside Chat and Actions; main.jsx owns the open state.
export const ForcesPanel = ({ mapRef, topOffset = "0px", open = false, onToggle }) => {
  const setOpen = (next) => {
    const resolved = typeof next === "function" ? next(open) : next;
    if (resolved !== open) onToggle?.();
  };
  const [units, setUnits] = useState(getUnits());
  const [mode, setMode] = useState(getInteractionMode());
  const [allowedTypes, setAllowedTypes] = useState(getAllowedUnitTypes());
  const [deployType, setDeployType] = useState("infantry");
  const [deployStrength, setDeployStrength] = useState(100);
  const [deployName, setDeployName] = useState("");

  useEffect(() => {
    const unsubscribe = subscribeUnits(() => {
      setUnits(getUnits());
      setMode(getInteractionMode());
      setAllowedTypes(getAllowedUnitTypes());
    });
    return unsubscribe;
  }, []);

  // Owner codes render as full names; re-render once the lookup is warm.
  const [, setNamesEpoch] = useState(0);
  useEffect(() => {
    ensurePolityNames().then(() => setNamesEpoch((epoch) => epoch + 1)).catch(() => {});
  }, [units.length]);

  // The scenario may restrict deployable troop types (e.g. no air in 1200).
  const availableTypes =
    Array.isArray(allowedTypes) && allowedTypes.length
      ? UNIT_TYPES.filter((t) => allowedTypes.includes(t))
      : UNIT_TYPES;

  useEffect(() => {
    if (availableTypes.length && !availableTypes.includes(deployType)) {
      setDeployType(availableTypes[0]);
    }
  }, [availableTypes, deployType]);

  const playerCode = getPlayerCode();
  const myUnits = units.filter((u) => u.ownerCode && u.ownerCode === playerCode);
  const otherUnits = units.filter((u) => !playerCode || u.ownerCode !== playerCode);

  const flyTo = useCallback(
    (unit) => {
      const map = mapRef?.current?.getMap?.() ?? mapRef?.current;
      map?.flyTo?.({ center: [unit.lng, unit.lat], zoom: Math.max(map.getZoom?.() ?? 4, 4.5) });
    },
    [mapRef],
  );

  const startDeploy = () => {
    const name = deployName.trim() || `${TYPE_LABEL[deployType]} ${myUnits.length + 1}`;
    setInteractionMode({
      kind: "deploy",
      params: { type: deployType, strength: Math.max(1, Math.min(1000, Number(deployStrength) || 100)), name },
    });
    setOpen(false);
  };

  return (
    <>
      {/* Mode banner — global instruction while deploying / moving / attacking. */}
      {mode.kind !== "idle" && (
        <div
          style={{
            ...surface,
            position: "fixed",
            top: "4.5rem",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "8px 14px",
            fontSize: "var(--oh-t-xs)",
          }}
        >
          <span>{MODE_HINT[mode.kind] ?? "Select a target"}</span>
          <button
            onClick={() => clearInteractionMode()}
            style={{
              background: "var(--oh-alert-soft)",
              border: "1px solid var(--oh-line)",
              borderRadius: "6px",
              color: "var(--oh-text)",
              cursor: "pointer",
              fontSize: "var(--oh-t-2xs)",
              padding: "3px 9px",
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {open && (
        <div
          style={{
            ...surface,
            position: "fixed",
            bottom: "4.75rem",
            left: "0.5rem",
            width: "17rem",
            maxHeight: "60vh",
            display: "flex",
            flexDirection: "column",
            zIndex: 9999,
            padding: "12px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <strong style={{ fontSize: "var(--oh-t-sm)" }}>Forces</strong>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: "var(--oh-text)", cursor: "pointer", fontSize: "var(--oh-t-sm)" }}
            >
              ✕
            </button>
          </div>

          {/* Deploy controls */}
          <div style={{ background: "var(--oh-plate-2)", borderRadius: "8px", padding: "8px", marginBottom: "10px" }}>
            <div style={{ fontSize: "var(--oh-t-2xs)", color: "var(--oh-text)", marginBottom: "6px" }}>Deploy a unit</div>
            <div style={{ display: "flex", gap: "5px", marginBottom: "6px" }}>
              <select
                value={deployType}
                onChange={(e) => setDeployType(e.target.value)}
                style={{ flex: 1, background: "var(--oh-plate-2)", color: "var(--oh-text)", border: "1px solid var(--oh-line)", borderRadius: "6px", padding: "4px", fontSize: "var(--oh-t-xs)" }}
              >
                {availableTypes.map((t) => (
                  <option key={t} value={t} style={{ color: "var(--oh-text-strong)" }}>
                    {TYPE_LABEL[t] ?? t}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                max={1000}
                value={deployStrength}
                onChange={(e) => setDeployStrength(e.target.value)}
                title="Strength"
                style={{ width: "4rem", background: "var(--oh-plate-2)", color: "var(--oh-text)", border: "1px solid var(--oh-line)", borderRadius: "6px", padding: "4px", fontSize: "var(--oh-t-xs)" }}
              />
            </div>
            <input
              type="text"
              value={deployName}
              placeholder="Unit name (optional)"
              onChange={(e) => setDeployName(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", background: "var(--oh-plate-2)", color: "var(--oh-text)", border: "1px solid var(--oh-line)", borderRadius: "6px", padding: "4px", fontSize: "var(--oh-t-xs)", marginBottom: "6px" }}
            />
            <button
              onClick={startDeploy}
              style={{ width: "100%", background: "var(--oh-accent-soft)", border: "1px solid var(--oh-line)", borderRadius: "6px", color: "var(--oh-text)", cursor: "pointer", fontSize: "var(--oh-t-xs)", fontWeight: 600, padding: "6px 0" }}
            >
              Place on map →
            </button>
          </div>

          <div style={{ overflowY: "auto", flex: 1 }}>
            <div style={{ fontSize: "var(--oh-t-2xs)", color: "var(--oh-text)", margin: "0 0 5px" }}>
              Your units ({myUnits.length})
            </div>
            {myUnits.length === 0 && (
              <div style={{ fontSize: "var(--oh-t-2xs)", color: "var(--oh-text-dim)", marginBottom: "8px" }}>
                None yet — deploy a unit above, or jump time to let the war unfold.
              </div>
            )}
            {myUnits.map((u) => (
              <UnitRow key={u.id} unit={u} onClick={() => flyTo(u)} />
            ))}

            {otherUnits.length > 0 && (
              <>
                <div style={{ fontSize: "var(--oh-t-2xs)", color: "var(--oh-text)", margin: "8px 0 5px" }}>
                  Other forces ({otherUnits.length})
                </div>
                {otherUnits.map((u) => (
                  <UnitRow key={u.id} unit={u} dimmed onClick={() => flyTo(u)} />
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default ForcesPanel;

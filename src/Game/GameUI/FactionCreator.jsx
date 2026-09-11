/*! Open Historia — new-game faction creator © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
// The "Create faction" tab of the new-game country picker. Lets a player invent
// the power they want to lead — name, flag, colour, lore — and either claim a set
// of starting regions or begin LANDLESS (a government-in-exile, a movement with no
// territory yet). It collects the choice and hands one object to onCreate; the
// parent (libraryBar) owns persistence, because a faction is written across the
// game's world.json, colors.json and flags.json.

import { lazy, Suspense, useState } from "react";
import { createPortal } from "react-dom";
import { HOLY_SEE } from "../../runtime/churchPreset.js";

// The editor's flag picker drops in unchanged — it is prop-driven and pulls in no
// editor stores. It returns a flag STRING (a flagcdn URL or a PNG data URL) or
// null via onPick.
const CountryPickerMap = lazy(() => import("./CountryPickerMap.jsx"));
const FlagPicker = lazy(() => import("../../Editor/FlagPicker.jsx"));

const label = { color: "var(--oh-text)", fontSize: "var(--oh-t-xs)", fontWeight: 700, margin: "0.1rem 0 0.3rem" };
const field = {
  background: "var(--oh-plate-2)",
  border: "1px solid var(--oh-line)",
  borderRadius: 8,
  color: "var(--oh-text-strong)",
  fontFamily: "inherit",
  fontSize: "var(--oh-t-xs)",
  outline: "none",
  padding: "0.55rem 0.7rem",
  width: "100%",
  boxSizing: "border-box",
};
const pill = (active) => ({
  background: active ? "var(--oh-accent-soft)" : "var(--oh-plate-2)",
  border: `1px solid ${active ? "var(--oh-accent-soft)" : "var(--oh-line)"}`,
  borderRadius: 999,
  color: "var(--oh-text-strong)",
  cursor: "pointer",
  fontSize: "var(--oh-t-xs)",
  fontWeight: 700,
  padding: "0.35rem 0.85rem",
});

const FactionCreator = ({ regionsGeojson, onCreate, onCancel, busy }) => {
  const [name, setName] = useState("");
  const [color, setColor] = useState("var(--oh-accent)");
  const [flag, setFlag] = useState(null); // string (URL / data URL) or null
  const [lore, setLore] = useState("");
  const [landless, setLandless] = useState(true);
  const [regionIds, setRegionIds] = useState(() => new Set());
  const [flagOpen, setFlagOpen] = useState(false);

  const toggleRegion = (id) => {
    setRegionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const trimmedName = name.trim();
  const canCreate = trimmedName.length > 0 && !busy;

  const submit = () => {
    if (!canCreate) return;
    onCreate({
      name: trimmedName,
      color,
      flag: flag || null,
      lore: lore.trim(),
      // Landless is the explicit toggle. Even with the "claim territory" mode open,
      // a faction that selected nothing starts landless — the toggle just makes that
      // a deliberate, visible choice rather than an accident.
      regionIds: landless ? [] : [...regionIds],
    });
  };

  // A ready-made faction, not a blank one: the Holy See as the reforming pope,
  // with the Church's real counter-powers, governing bodies, finances and
  // starting intents (see runtime/churchPreset.js). Its territory — the real
  // Vatican City enclave — is added by the preset itself, not claimed here.
  const submitChurch = () => {
    if (busy) return;
    onCreate({ name: HOLY_SEE, color: "var(--oh-caution)", flag: null, lore: "", regionIds: [], preset: "church" });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <div style={{ ...field, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.8rem", background: "var(--oh-accent-soft)", borderColor: "var(--oh-accent-soft)" }}>
        <div>
          <div style={{ fontWeight: 700 }}>Jouer le pape réformateur</div>
          <div style={{ color: "var(--oh-text)", fontSize: "var(--oh-t-xs)" }}>Le Saint-Siège, depuis la vraie Cité du Vatican (0,49 km² dans Rome) — réformer l'Église contre ses vrais contre-pouvoirs, avec ses vraies administrations et ses vraies finances.</div>
        </div>
        <button type="button" onClick={submitChurch} disabled={busy} style={pill(true)}>Commencer</button>
      </div>
      <div>
        <div style={label}>Nom</div>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="par exemple : Cascadia libre, le Gouvernement provisoire…"
          style={field}
        />
      </div>

      <div style={{ display: "flex", gap: "0.8rem", alignItems: "flex-end" }}>
        <div>
          <div style={label}>Couleur</div>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            style={{ width: 48, height: 34, background: "none", border: "1px solid var(--oh-line)", borderRadius: 8, cursor: "pointer" }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <div style={label}>Drapeau</div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {flag ? (
              <img src={flag} alt="" style={{ width: 34, height: 22, objectFit: "contain", borderRadius: 3, border: "1px solid var(--oh-line)" }} />
            ) : (
              <span aria-hidden="true" style={{ fontSize: "var(--oh-t-lg)" }}>🏳️</span>
            )}
            <button type="button" onClick={() => setFlagOpen(true)} style={pill(false)}>
              {flag ? "Changer de drapeau" : "Choisir un drapeau"}
            </button>
            {flag && (
              <button type="button" onClick={() => setFlag(null)} style={pill(false)}>Retirer</button>
            )}
          </div>
        </div>
      </div>

      <div>
        <div style={label}>Ce qu&apos;elle est</div>
        <textarea
          value={lore}
          onChange={(e) => setLore(e.target.value)}
          placeholder="Qui est cette puissance ? Son histoire, sa cause, ses ambitions. C'est ce qui oriente le récit que le modèle en fera."
          rows={3}
          style={{ ...field, resize: "vertical", minHeight: "3.4rem" }}
        />
      </div>

      <div>
        <div style={label}>Territoire de départ</div>
        <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.4rem" }}>
          <button type="button" onClick={() => setLandless(true)} style={pill(landless)}>Commencer sans terre</button>
          <button type="button" onClick={() => setLandless(false)} style={pill(!landless)}>Revendiquer des régions</button>
        </div>
        {landless ? (
          <div style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-xs)" }}>
            Vous commencez sans un pouce de terre — une puissance sans État. Votre campagne
            consiste à en gagner, ou à en reprendre.
          </div>
        ) : (
          <>
            <div style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-xs)", marginBottom: "0.3rem" }}>
              {regionIds.size} région{regionIds.size === 1 ? "" : "s"} revendiquée{regionIds.size === 1 ? "" : "s"}
            </div>
            <Suspense fallback={<div style={{ color: "var(--oh-text-dim)", padding: "2rem 0", textAlign: "center" }}>Loading map…</div>}>
              <CountryPickerMap
                countryOptions={[]}
                onPickCountry={() => {}}
                regionsGeojson={regionsGeojson}
                selectionMode="regions"
                selectedRegionIds={regionIds}
                onToggleRegion={toggleRegion}
                selectionColor={color}
              />
            </Suspense>
          </>
        )}
      </div>

      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.2rem" }}>
        <button
          type="button"
          onClick={submit}
          disabled={!canCreate}
          style={{
            ...pill(true),
            flex: 1,
            opacity: canCreate ? 1 : 0.5,
            cursor: canCreate ? "pointer" : "not-allowed",
            padding: "0.55rem",
          }}
        >
          {busy ? "Création…" : "Créer et jouer"}
        </button>
        <button type="button" onClick={onCancel} style={{ ...pill(false), padding: "0.55rem 1rem" }}>Annuler</button>
      </div>

      {/* Portalled to <body>, exactly as the editor mounts it outside its own
          backdrop-filtered panel. Two things trap it otherwise: the new-game modal
          card has backdrop-filter, which makes a containing block for position:fixed
          — so the picker's full-screen overlay resolves to the card's box, not the
          viewport, and its top is cut off (its own comment documents this). And the
          picker's overlay is z-index 130 while the modal is 10060, so even freed it
          would sit behind. The portal escapes the containing block; the wrapper's
          stacking context (above the modal) lifts it in front. */}
      {flagOpen && createPortal(
        <Suspense fallback={null}>
          <div style={{ position: "relative", zIndex: 10070 }}>
            <FlagPicker
              open
              onClose={() => setFlagOpen(false)}
              ownerCode={trimmedName}
              currentFlag={flag}
              onPick={(picked) => setFlag(picked || null)}
            />
          </div>
        </Suspense>,
        document.body,
      )}
    </div>
  );
};

export default FactionCreator;

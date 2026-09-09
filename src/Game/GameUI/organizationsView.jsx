/*! Open Historia — the Organizations tab: the bodies of this world, and the player's moves in them © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
// Beside Diplomacy. Lists every league, alliance, bloc and council the
// world holds (world.organizations), who sits in it, and its latest vote; and
// lets the player queue the moves that are theirs to make — apply, leave,
// propose a resolution, found a body. Each move is an ordinary planned action
// the next jump resolves, and the other members answer in character.
import React, { useCallback, useEffect, useState } from "react";
import { normalizeActionEntry, readActionsState, readWorldState, writeActionsState, writeWorldState } from "../../runtime/gameState.js";
import { isMember, normalizeOrganizations, seedOrganizations } from "../../runtime/organizations.js";
import { yearOf } from "../../runtime/economyBridge.js";

// The bodies of the era exist from the first day of a game: if the world has
// none recorded, the catalogue fills it in once and persists it, so the IMF
// can be spoken to before any turn has been played.
export const ensureOrganizations = async (gameDate) => {
  const world = await readWorldState({ force: true });
  const existing = normalizeOrganizations(world?.organizations);
  const seeded = seedOrganizations(existing, yearOf(gameDate));
  if (seeded.length > existing.length) {
    try { await writeWorldState({ ...world, organizations: seeded }); } catch { /* the prompt seeds again if this did not stick */ }
  }
  return seeded;
};

const card = { backgroundColor: "var(--oh-plate-2)", border: "1px solid var(--oh-line)", borderRadius: "10px", padding: "0.7rem 0.8rem", marginBottom: "0.55rem" };
const muted = { color: "var(--oh-text-dim)", fontSize: "var(--oh-t-xs)" };
const button = (active) => ({ padding: "0.3rem 0.6rem", borderRadius: "8px", fontSize: "var(--oh-t-xs)", fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
  border: "1px solid " + (active ? "var(--oh-accent-soft)" : "var(--oh-line)"), background: active ? "var(--oh-accent-soft)" : "var(--oh-plate-2)", color: "var(--oh-text)" });
const KIND_ICON = { alliance: "🤝", security: "🛡", trade: "⚖️", monetary: "🪙", political: "🏛", religious: "⛪", league: "🏺", other: "🌐" };

const queue = async (title, text) => {
  const actions = await readActionsState();
  const action = normalizeActionEntry({ kind: "action", rawInput: text, source: "manual", status: "planned", text, title });
  await writeActionsState([...(Array.isArray(actions) ? actions : []), action]);
};

const OrganizationsView = ({ playerCountry, gameDate, onTalk }) => {
  const [organizations, setOrganizations] = useState([]);
  const [composer, setComposer] = useState(null); // { orgName, mode: "propose" | "found" }
  const [draft, setDraft] = useState("");
  const [queued, setQueued] = useState("");
  const [showDissolved, setShowDissolved] = useState(false);

  const load = useCallback(async () => {
    try {
      setOrganizations(await ensureOrganizations(gameDate));
    } catch { setOrganizations([]); }
  }, [gameDate]);
  useEffect(() => { load(); }, [load]);

  const act = async (title, text) => {
    await queue(title, text);
    setQueued(title);
    setComposer(null);
    setDraft("");
    setTimeout(() => setQueued(""), 2500);
  };

  const visible = organizations.filter((o) => showDissolved || o.status === "active");

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "0.9rem 1.1rem" }}>
      {queued && <div style={{ ...card, borderColor: "var(--oh-grant)", color: "var(--oh-grant)", fontSize: "var(--oh-t-xs)" }}>Queued for the next turn: {queued}</div>}

      {visible.length === 0 && (
        <div style={{ ...muted, fontStyle: "italic", marginBottom: "0.8rem" }}>
          No international body is recorded yet. The world founds the ones of its era on the first turn, and you can found your own.
        </div>
      )}

      {visible.map((o) => {
        const member = isMember(o, playerCountry);
        const last = o.resolutions.at(-1);
        return (
          <div key={o.id} style={{ ...card, opacity: o.status === "dissolved" ? 0.55 : 1 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "0.5rem" }}>
              <div style={{ fontWeight: 800, fontSize: "var(--oh-t-sm)" }}>{KIND_ICON[o.kind] || "🌐"} {o.name}</div>
              <div style={muted}>{o.kind}{o.status === "dissolved" ? " · dissolved" : ""}</div>
            </div>
            <div style={{ ...muted, marginTop: "0.2rem" }}>
              {o.founded ? `Founded ${o.founded}. ` : ""}{o.seat ? `Seat: ${o.seat}. ` : ""}{o.leader ? `Led by ${o.leader}. ` : ""}Rule: {o.votingRule}.
            </div>
            {o.charter && <div style={{ ...muted, color: "var(--oh-text)", marginTop: "0.3rem" }}>{o.charter}</div>}
            <div style={{ marginTop: "0.4rem", fontSize: "var(--oh-t-xs)" }}>
              <span style={muted}>Members{o.universal ? "" : ` (${o.members.length})`}: </span>
              <span data-no-translate>{o.universal ? `every recognised state${o.members.length ? ` — notably ${o.members.join(", ")}` : ""}` : o.members.join(", ") || "—"}</span>
              {member && <span style={{ color: "var(--oh-accent)", fontWeight: 700 }}> · you are a member</span>}
            </div>
            {last && (
              <div style={{ marginTop: "0.45rem", padding: "0.45rem 0.55rem", borderRadius: "8px", background: "var(--oh-plate-2)", fontSize: "var(--oh-t-xs)" }}>
                <span style={{ color: last.passed ? "var(--oh-grant)" : "var(--oh-alert)", fontWeight: 700 }}>{last.passed ? "PASSED" : "FAILED"}</span>
                <span style={muted}> {last.date ? `${last.date} · ` : ""}{last.proposedBy ? `proposed by ${last.proposedBy} · ` : ""}{last.votesFor.length} for, {last.votesAgainst.length} against</span>
                <div style={{ marginTop: "0.2rem" }}>{last.title}</div>
                {last.sanctions && <div style={{ ...muted, color: "var(--oh-caution)" }}>Sanctions on {last.sanctions.target} at {Math.round(last.sanctions.intensity * 100)}%</div>}
              </div>
            )}
            {o.status === "active" && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.55rem" }}>
                {typeof onTalk === "function" && (
                  <button style={button(true)} onClick={() => onTalk(o.name)}>💬 Talk to {o.name}</button>
                )}
                {member ? (
                  <>
                    <button style={button(false)} onClick={() => setComposer({ orgName: o.name, mode: "propose" })}>Propose a resolution</button>
                    <button style={button(false)} onClick={() => act(`Leave ${o.name}`, `${playerCountry} formally withdraws from ${o.name}, notifying its members and the seat at ${o.seat || "its headquarters"}.`)}>Leave</button>
                  </>
                ) : (
                  <button style={button(false)} onClick={() => act(`Apply to join ${o.name}`, `${playerCountry} formally applies for membership of ${o.name}, accepting its charter${o.charter ? ` (${o.charter})` : ""}; the members are to vote on admission under the body's ${o.votingRule} rule.`)}>Apply to join</button>
                )}
              </div>
            )}
            {composer && composer.orgName === o.name && composer.mode === "propose" && (
              <div style={{ marginTop: "0.5rem" }}>
                <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="What the resolution says, and what you want the members to vote on." rows={3}
                  style={{ width: "100%", boxSizing: "border-box", background: "var(--oh-plate-2)", color: "var(--oh-text)", border: "1px solid var(--oh-line)", borderRadius: "8px", padding: "0.45rem", fontSize: "var(--oh-t-xs)", fontFamily: "inherit" }} />
                <div style={{ display: "flex", gap: "0.35rem", marginTop: "0.35rem" }}>
                  <button style={button(true)} disabled={!draft.trim()} onClick={() => act(`Resolution at ${o.name}`, `${playerCountry} tables the following resolution at ${o.name} and calls a vote under its ${o.votingRule} rule: ${draft.trim()}`)}>Table it</button>
                  <button style={button(false)} onClick={() => { setComposer(null); setDraft(""); }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.4rem" }}>
        <button style={button(composer?.mode === "found")} onClick={() => setComposer(composer?.mode === "found" ? null : { orgName: "", mode: "found" })}>Found an organization</button>
        {organizations.some((o) => o.status === "dissolved") && (
          <button style={button(showDissolved)} onClick={() => setShowDissolved((v) => !v)}>{showDissolved ? "Hide dissolved" : "Show dissolved"}</button>
        )}
      </div>
      {composer?.mode === "found" && (
        <div style={{ marginTop: "0.5rem" }}>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Name it, say what it is for (alliance, trade bloc, monetary union, council...), whom you invite, where it sits and how it votes." rows={4}
            style={{ width: "100%", boxSizing: "border-box", background: "var(--oh-plate-2)", color: "var(--oh-text)", border: "1px solid var(--oh-line)", borderRadius: "8px", padding: "0.45rem", fontSize: "var(--oh-t-xs)", fontFamily: "inherit" }} />
          <div style={{ display: "flex", gap: "0.35rem", marginTop: "0.35rem" }}>
            <button style={button(true)} disabled={!draft.trim()} onClick={() => act("Found an international organization", `${playerCountry} convenes the founding of a new international body and invites the named polities to sign its charter: ${draft.trim()}`)}>Convene</button>
            <button style={button(false)} onClick={() => { setComposer(null); setDraft(""); }}>Cancel</button>
          </div>
        </div>
      )}
      <div style={{ ...muted, marginTop: "0.8rem", fontSize: "var(--oh-t-2xs)" }}>
        Each move is queued as an action for your next turn; the other members answer in character — admission can be refused and a resolution voted down.
      </div>
    </div>
  );
};

export default OrganizationsView;

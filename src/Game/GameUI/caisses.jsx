/* Le cahier des Caisses, d'après la maquette « Les Comptes ».
 *
 * Ce n'est pas une liste d'indicateurs : c'est un cahier financier, avec ses
 * cotations en tête, son article d'analyse à gauche et ses tableaux à droite.
 *
 * Règle de la maison, et raison d'être de cet écran : aucun chiffre n'est
 * narratif. L'analyse n'est pas rédigée par un modèle — elle est assemblée à
 * partir des mêmes nombres que les tableaux, et une phrase ne paraît que si le
 * chiffre qui la porte existe. Un cahier des comptes qui broderait sur un
 * chiffre absent vaudrait moins que pas de cahier du tout.
 */
import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import "dayjs/locale/fr";
import { readGameData, readWorldState } from "../../runtime/gameState.js";
import { normalizeTreasuries } from "../../runtime/treasuries.js";
import { normalizeDrives } from "../../runtime/drives.js";
import { normalizeGatherings } from "../../runtime/gatherings.js";
import { CONTENU_TOP } from "./chrome.js";
import { SectionHead, fmtCount, moneyOf } from "./journal.jsx";

const cell = { fontSize: "var(--oh-t-xs)", padding: "0.35rem 0", verticalAlign: "baseline" };
const chiffre = { ...cell, fontVariantNumeric: "tabular-nums", textAlign: "right", whiteSpace: "nowrap" };

/** Le cours d'une caisse, tracé sur ce que son journal a enregistré. */
const Courbe = ({ points, ton = "var(--oh-accent)" }) => {
  if (!Array.isArray(points) || points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const etendue = max - min || 1;
  const d = points
    .map((v, i) => `${(i / (points.length - 1)) * 100},${28 - ((v - min) / etendue) * 26}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" style={{ display: "block", height: "1.6rem", width: "100%" }}>
      <polyline points={d} fill="none" stroke={ton} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

/**
 * Le bandeau de cotations. La maquette le met en tête, en direct : ce qu'on
 * regarde d'abord dans un cahier financier, c'est où en sont les caisses.
 * La variation est celle que le journal de la caisse porte, jamais une
 * estimation — sans deux points, aucune flèche n'est affichée.
 */
const Cotations = ({ caisses, usdPerSY, heure }) => {
  if (!caisses.length) return null;
  const variation = (t) => {
    const montants = t.log.filter((l) => Number.isFinite(l.amount)).map((l) => l.amount);
    if (montants.length < 2) return null;
    const avant = montants[montants.length - 2];
    const apres = montants[montants.length - 1];
    if (!avant) return null;
    return (apres - avant) / Math.abs(avant);
  };
  return (
    <div
      style={{
        alignItems: "baseline",
        background: "var(--oh-line-strong)",
        color: "var(--oh-on-accent)",
        display: "flex",
        flexWrap: "nowrap",
        fontSize: "var(--oh-t-2xs)",
        gap: "1.4rem",
        margin: "0 0 1.2rem",
        overflowX: "auto",
        padding: "0.45rem 0.9rem",
      }}
    >
      <span className="oh-label" style={{ flexShrink: 0, opacity: 0.75 }}>
        ● En direct{heure ? ` ${heure}` : ""}
      </span>
      {caisses.map((t) => {
        const v = variation(t);
        return (
          <span key={t.body} style={{ flexShrink: 0, whiteSpace: "nowrap" }}>
            <b style={{ fontWeight: 700 }}>{t.body}</b>{" "}
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{moneyOf(t.capital || t.treasury, usdPerSY)}</span>
            {v != null && (
              <span style={{ color: v >= 0 ? "var(--oh-grant)" : "var(--oh-alert)", marginLeft: "0.35rem" }}>
                {v >= 0 ? "▲" : "▼"} {Math.abs(v * 100).toFixed(1)} %
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
};

/**
 * L'analyse. Chaque paragraphe est conditionné au chiffre qui le fonde : pas de
 * caisse, pas de phrase sur les caisses. C'est ce qui distingue cette colonne
 * d'un récit — elle ne peut pas dire ce que les tableaux ne montrent pas.
 */
const Analyse = ({ caisses, campagnes, rassemblements, usdPerSY }) => {
  const reversetotal = caisses.reduce((s, t) => s + t.deliveredPerYear, 0);
  const premiere = [...caisses].sort((a, b) => b.deliveredPerYear - a.deliveredPerYear)[0];
  const part = premiere && reversetotal > 0 ? premiere.deliveredPerYear / reversetotal : 0;
  const enMain = caisses.reduce((s, t) => s + t.treasury, 0);
  const courtes = caisses.filter((t) => t.annualTarget > 0 && t.deliveredPerYear < t.annualTarget);
  const ouvertes = campagnes.filter((d) => d.status === "open");
  const prevus = rassemblements.filter((g) => g.status === "planned");

  const titre = premiere && part >= 0.4
    ? `La générosité du Saint-Siège est financée à ${Math.round(part * 100)} % par une seule caisse`
      + (premiere.parent || premiere.beneficiary ? ", et cette caisse ne lui appartient pas" : "")
    : caisses.length
      ? `${caisses.length} caisse${caisses.length > 1 ? "s" : ""} tiennent ${moneyOf(enMain, usdPerSY)} en main`
      : "Aucune caisse n'est encore ouverte";

  return (
    <div>
      <SectionHead aside={caisses.length ? "d'après le registre" : ""}>Analyse</SectionHead>
      <h2
        style={{
          color: "var(--oh-text-strong)",
          fontFamily: "var(--oh-font-serif)",
          fontSize: "clamp(1.5rem, 2.4vw, 2.1rem)",
          fontWeight: 700,
          letterSpacing: "-0.02em",
          lineHeight: 1.04,
          margin: "0.8rem 0 0.5rem",
          textWrap: "balance",
        }}
      >
        {titre}
      </h2>

      {!caisses.length && (
        <p style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-sm)", fontStyle: "italic", lineHeight: 1.5, margin: 0, maxWidth: "46ch" }}>
          Rien à analyser tant qu&apos;aucun organisme ne tient de bourse. Ouvrez-en une par un ordre, et
          ce cahier se remplira de lui-même — ses lignes ne viennent que du registre.
        </p>
      )}

      {premiere && premiere.deliveredPerYear > 0 && (
        <p style={{ color: "var(--oh-text-dim)", fontFamily: "var(--oh-font-serif)", fontSize: "var(--oh-t-sm)", fontStyle: "italic", lineHeight: 1.5, margin: "0 0 0.9rem", maxWidth: "46ch" }}>
          {premiere.body} reverse {moneyOf(premiere.deliveredPerYear, usdPerSY)} par an
          {premiere.beneficiary ? ` à ${premiere.beneficiary}` : ""}.
        </p>
      )}

      {caisses.length > 0 && (
        <p style={{ fontSize: "var(--oh-t-sm)", lineHeight: 1.5, margin: "0 0 0.7rem", maxWidth: "46ch" }}>
          Les {caisses.length} caisse{caisses.length > 1 ? "s" : ""} tiennent {moneyOf(enMain, usdPerSY)} en main
          {reversetotal > 0 ? `, et reversent ${moneyOf(reversetotal, usdPerSY)} par an` : ", et ne reversent rien"}.
          {premiere && premiere.parent
            ? ` La plus grosse, ${premiere.body}, est tenue au sein de ${premiere.parent} : le Saint-Siège n'en décide pas l'emploi.`
            : ""}
        </p>
      )}

      {courtes.length > 0 && (
        <p style={{ fontSize: "var(--oh-t-sm)", lineHeight: 1.5, margin: "0 0 0.7rem", maxWidth: "46ch" }}>
          <b>À surveiller.</b>{" "}
          {courtes.map((t) => `${t.body} livre ${moneyOf(t.deliveredPerYear, usdPerSY)} sur les ${moneyOf(t.annualTarget, usdPerSY)} pour lesquels il a été fondé`).join(" ; ")}.
        </p>
      )}

      {ouvertes.length > 0 && (
        <p style={{ fontSize: "var(--oh-t-sm)", lineHeight: 1.5, margin: "0 0 0.7rem", maxWidth: "46ch" }}>
          {ouvertes.length} campagne{ouvertes.length > 1 ? "s sont ouvertes" : " est ouverte"} :{" "}
          {ouvertes.map((d) => `${d.name}, ${moneyOf(d.collected, usdPerSY)} encaissés sur ${moneyOf(d.target, usdPerSY)}`).join(" ; ")}.
        </p>
      )}

      {prevus.length > 0 && (
        <p style={{ fontSize: "var(--oh-t-sm)", lineHeight: 1.5, margin: "0 0 0.7rem", maxWidth: "46ch" }}>
          {prevus.length === 1 ? "Un rassemblement est prévu" : `${prevus.length} rassemblements sont prévus`} :{" "}
          {prevus.map((g) => `${g.name}${g.date ? ` le ${dayjs(g.date).locale("fr").format("D MMMM")}` : ""}${g.cost > 0 ? `, ${moneyOf(g.cost, usdPerSY)} budgétés` : ""}`).join(" ; ")}.
        </p>
      )}

      <p style={{ borderTop: "1px solid var(--oh-line)", color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)", lineHeight: 1.5, margin: "1.2rem 0 0", maxWidth: "46ch", paddingTop: "0.5rem" }}>
        Assemblé par le moteur à partir du registre. Aucun chiffre n&apos;est narratif : une phrase
        ne paraît ici que si la ligne qui la porte existe dans les tableaux ci-contre.
      </p>
    </div>
  );
};

/* ------------------------------------------------------------------ tableaux */

const TableCaisses = ({ caisses, usdPerSY }) => {
  const enMain = caisses.reduce((s, t) => s + t.treasury, 0);
  const reverse = caisses.reduce((s, t) => s + t.deliveredPerYear, 0);
  return (
    <section>
      <SectionHead aside={`${caisses.length} organisme${caisses.length > 1 ? "s" : ""}`}>Caisses</SectionHead>
      {caisses.length === 0 ? (
        <p style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-xs)", fontStyle: "italic", margin: "0.6rem 0 0" }}>
          Aucun organisme ne tient encore de bourse.
        </p>
      ) : (
        <table style={{ borderCollapse: "collapse", marginTop: "0.4rem", width: "100%" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--oh-line)" }}>
              <th className="oh-label" style={{ ...cell, textAlign: "left" }}>Organisme</th>
              <th className="oh-label" style={chiffre}>Capital</th>
              <th className="oh-label" style={chiffre}>Rend.</th>
              <th className="oh-label" style={chiffre}>En main</th>
              <th className="oh-label" style={chiffre}>Reversé</th>
              <th className="oh-label" style={{ ...chiffre, width: "5rem" }}>Journal</th>
            </tr>
          </thead>
          <tbody>
            {caisses.map((t) => (
              <tr key={t.body} style={{ borderBottom: "1px solid var(--oh-plate-2)" }}>
                <td style={{ ...cell, textAlign: "left" }}>
                  {t.parent && <span style={{ color: "var(--oh-text-dim)" }}>↳ </span>}
                  <b style={{ fontWeight: 700 }}>{t.body}</b>
                  {t.beneficiary && (
                    <span style={{ color: "var(--oh-text-dim)" }}> · pour {t.beneficiary}</span>
                  )}
                </td>
                <td style={chiffre}>{t.capital > 0 ? moneyOf(t.capital, usdPerSY) : "—"}</td>
                <td style={chiffre}>{t.margin > 0 ? `${(t.margin * 100).toFixed(1)} %` : "—"}</td>
                <td style={chiffre}>{moneyOf(t.treasury, usdPerSY)}</td>
                <td style={{ ...chiffre, color: t.deliveredPerYear > 0 ? "var(--oh-grant)" : "var(--oh-text-dim)" }}>
                  {t.deliveredPerYear > 0 ? moneyOf(t.deliveredPerYear, usdPerSY) : "—"}
                </td>
                <td style={{ ...chiffre, padding: "0.25rem 0 0.25rem 0.6rem" }}>
                  <Courbe points={t.log.filter((l) => Number.isFinite(l.amount)).map((l) => l.amount)} />
                </td>
              </tr>
            ))}
            <tr>
              <td className="oh-label" style={{ ...cell, textAlign: "left" }}>Total</td>
              <td style={chiffre} />
              <td style={chiffre} />
              <td style={{ ...chiffre, fontWeight: 700 }}>{moneyOf(enMain, usdPerSY)}</td>
              <td style={{ ...chiffre, fontWeight: 700 }}>{reverse > 0 ? moneyOf(reverse, usdPerSY) : "—"}</td>
              <td style={chiffre} />
            </tr>
          </tbody>
        </table>
      )}
    </section>
  );
};

const TableCampagnes = ({ campagnes, usdPerSY }) => {
  const ouvertes = campagnes.filter((d) => d.status === "open");
  if (!campagnes.length) return null;
  return (
    <section>
      <SectionHead aside={`${ouvertes.length} ouverte${ouvertes.length > 1 ? "s" : ""}`}>Campagnes</SectionHead>
      {campagnes.map((d) => {
        const part = d.target > 0 ? Math.min(1, d.collected / d.target) : 0;
        return (
          <div key={d.id} style={{ marginTop: "0.6rem" }}>
            <div style={{ alignItems: "baseline", display: "flex", gap: "0.6rem", justifyContent: "space-between" }}>
              <b style={{ fontSize: "var(--oh-t-xs)", fontWeight: 700 }}>{d.name}</b>
              <span style={{ fontSize: "var(--oh-t-xs)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                {moneyOf(d.collected, usdPerSY)} / {moneyOf(d.target, usdPerSY)}
              </span>
            </div>
            <div style={{ background: "var(--oh-plate-2)", height: "4px", marginTop: "0.25rem", overflow: "hidden" }}>
              <div style={{ background: "var(--oh-accent)", height: "100%", width: `${Math.round(part * 100)}%` }} />
            </div>
            {d.pledged > d.collected && (
              <div style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)", marginTop: "0.2rem" }}>
                {moneyOf(d.pledged, usdPerSY)} promis, {Math.round((d.collected / Math.max(1, d.pledged)) * 100)} % encaissés
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
};

const TableRassemblements = ({ rassemblements, usdPerSY }) => {
  if (!rassemblements.length) return null;
  return (
    <section>
      <SectionHead aside="compte d'exploitation">Rassemblements</SectionHead>
      {rassemblements.map((g) => {
        const tenu = g.status === "held";
        const recettes = g.patronage;
        const reste = recettes - g.cost;
        return (
          <div key={g.id} style={{ borderBottom: "1px solid var(--oh-plate-2)", padding: "0.5rem 0" }}>
            <div style={{ alignItems: "baseline", display: "flex", gap: "0.6rem", justifyContent: "space-between" }}>
              <b style={{ fontSize: "var(--oh-t-xs)", fontWeight: 700 }}>{g.name}</b>
              <span style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)", whiteSpace: "nowrap" }}>
                {tenu ? "tenu" : "prévu"}{g.date ? ` ${dayjs(g.date).locale("fr").format("D MMM")}` : ""}
              </span>
            </div>
            {g.expected > 0 && (
              <div style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)" }}>{fmtCount(g.expected)} personnes</div>
            )}
            {tenu ? (
              <div style={{ display: "grid", fontSize: "var(--oh-t-2xs)", gap: "0.1rem", marginTop: "0.25rem" }}>
                {recettes > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span>Recettes</span><b style={{ color: "var(--oh-grant)" }}>+{moneyOf(recettes, usdPerSY)}</b></div>}
                {g.cost > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span>Coût</span><b style={{ color: "var(--oh-alert)" }}>−{moneyOf(g.cost, usdPerSY)}</b></div>}
                <div style={{ borderTop: "1px solid var(--oh-plate-2)", display: "flex", justifyContent: "space-between", marginTop: "0.15rem", paddingTop: "0.15rem" }}>
                  <span>Reste</span>
                  <b style={{ color: reste >= 0 ? "var(--oh-grant)" : "var(--oh-alert)" }}>{reste >= 0 ? "+" : "−"}{moneyOf(Math.abs(reste), usdPerSY)}</b>
                </div>
              </div>
            ) : (
              g.cost > 0 && (
                <div style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)", marginTop: "0.2rem" }}>
                  {moneyOf(g.cost, usdPerSY)} budgétés · ne rapporte rien avant le jour même
                </div>
              )
            )}
          </div>
        );
      })}
    </section>
  );
};

/* --------------------------------------------------------------------- page */

export const Caisses = ({ nav = null }) => {
  const [game, setGame] = useState(null);
  const [world, setWorld] = useState(null);

  useEffect(() => {
    let vivant = true;
    Promise.all([
      readGameData().catch(() => null),
      readWorldState({ force: true }).catch(() => null),
    ]).then(([g, w]) => {
      if (!vivant) return;
      setGame(g);
      setWorld(w);
    });
    return () => { vivant = false; };
  }, []);

  const player = game?.country || "";
  const usdPerSY = Number(player ? world?.economies?.[player]?.usdPerSY : 0) || 0;
  const caisses = useMemo(
    () => normalizeTreasuries(world?.treasuries).filter((t) => t.status === "active"),
    [world?.treasuries],
  );
  const campagnes = useMemo(() => normalizeDrives(world?.drives), [world?.drives]);
  const rassemblements = useMemo(() => normalizeGatherings(world?.gatherings), [world?.gatherings]);
  const date = game?.gameDate ? dayjs(game.gameDate).locale("fr") : null;

  return (
    <div
      data-surface="ledger"
      style={{
        background: "var(--oh-plate)",
        bottom: 0,
        color: "var(--oh-text)",
        left: 0,
        overflowY: "auto",
        position: "fixed",
        right: 0,
        top: CONTENU_TOP,
        zIndex: 10002,
      }}
    >
      <Cotations caisses={caisses} usdPerSY={usdPerSY} heure={date && date.isValid() ? date.format("D MMM") : ""} />

      <div style={{ margin: "0 auto", maxWidth: "74rem", padding: "0 1.5rem 3rem" }}>
        {/* Le bandeau du cahier : son nom, et sous quelle unité on le lit. */}
        <header style={{ borderBottom: "3px solid var(--oh-text-strong)", paddingBottom: "0.5rem" }}>
          <div style={{ alignItems: "end", display: "flex", flexWrap: "wrap", gap: "1rem", justifyContent: "space-between" }}>
            <div>
              <div className="oh-label" style={{ color: "var(--oh-text-dim)" }}>Saint-Siège · cahier</div>
              <h1
                style={{
                  color: "var(--oh-text-strong)",
                  fontFamily: "var(--oh-font-serif)",
                  fontSize: "clamp(1.8rem, 4vw, 2.8rem)",
                  fontWeight: 700,
                  letterSpacing: "-0.025em",
                  lineHeight: 1,
                  margin: "0.1rem 0 0",
                }}
              >
                Les Comptes
              </h1>
            </div>
            <div style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)", lineHeight: 1.5, textAlign: "right" }}>
              {date && date.isValid() && (
                <div className="oh-label" style={{ color: "var(--oh-text-strong)" }}>
                  Tour {game?.round || 1} · {date.format("D MMMM YYYY")}
                </div>
              )}
              <div>
                Unité : {usdPerSY > 0 ? "dollars" : "années-subsistance (AS)"}
              </div>
            </div>
          </div>
        </header>

        {nav && nav()}

        <div className="oh-comptes-grid">
          <Analyse caisses={caisses} campagnes={campagnes} rassemblements={rassemblements} usdPerSY={usdPerSY} />
          <div style={{ display: "flex", flexDirection: "column", gap: "1.4rem" }}>
            <TableCaisses caisses={caisses} usdPerSY={usdPerSY} />
            <TableCampagnes campagnes={campagnes} usdPerSY={usdPerSY} />
            <TableRassemblements rassemblements={rassemblements} usdPerSY={usdPerSY} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Caisses;

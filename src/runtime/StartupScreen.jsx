/*! Open Historia — portions (loading-screen cycling + creator credit) © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
import React, { useEffect, useState } from "react";

// Loading-screen artwork. The first is the original; the rest cycle in once the
// files exist in /public. Missing files are skipped (see the preload check), so
// the screen never flashes a broken image.
const LOADING_IMAGES = [
  "/loading_screen.jpg",
  "/loading_screen_2.jpg",
  "/loading_screen_3.jpg",
  "/loading_screen_4.jpg",
  "/loading_screen_5.png",
];
const IMAGE_ROTATE_MS = 4500;

const formatBytes = (bytes) => {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 100 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

const StartupScreen = ({
  elapsedMs = 0,
  loadedBytes = 0,
  progress = 0,
  stage = "Warming world textures",
  steps = [],
  timeBudgetMs = 30_000,
  timedOut = false,
}) => {
  const activeStep = steps.find((s) => s.status === "active");
  const doneCount = steps.filter((s) => s.status === "done").length;

  // Only cycle through artwork that actually loads, so absent files are skipped
  // rather than flashing a broken background.
  // Show all artwork immediately, starting on a RANDOM one so short (warm-cache)
  // loads still surface the new images rather than always the first. Any file that
  // fails to load is pruned so it never shows a broken background.
  const [availableImages, setAvailableImages] = useState(LOADING_IMAGES);
  const [bgIndex, setBgIndex] = useState(() => Math.floor(Math.random() * LOADING_IMAGES.length));

  useEffect(() => {
    let cancelled = false;
    const ok = [];
    let pending = LOADING_IMAGES.length;
    for (const src of LOADING_IMAGES) {
      const img = new Image();
      const settle = (good) => {
        if (cancelled) return;
        if (good) ok.push(src);
        pending -= 1;
        if (pending === 0) {
          const loaded = LOADING_IMAGES.filter((s) => ok.includes(s));
          if (loaded.length) setAvailableImages(loaded);
        }
      };
      img.onload = () => settle(true);
      img.onerror = () => settle(false);
      img.src = src;
    }
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (availableImages.length <= 1) return undefined;
    const timer = setInterval(
      () => setBgIndex((i) => (i + 1) % availableImages.length),
      IMAGE_ROTATE_MS,
    );
    return () => clearInterval(timer);
  }, [availableImages]);

  const currentBg = bgIndex % availableImages.length;

  return (
    <>
    <style>{`
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

      .ss-shell {
        position: relative;
        width: 100vw;
        height: 100vh;
        overflow: hidden;
        background: var(--oh-plate);
        font-family: var(--oh-font-body);
      }

      /* Cross-fading artwork layers (one per loaded image) */
      .ss-bg {
        position: absolute;
        inset: 0;
        background-size: cover;
        background-position: center top;
        opacity: 0;
        transition: opacity 1.4s ease-in-out;
        z-index: 0;
      }

      /* Bottom-half gradient so UI reads over artwork */
      .ss-gradient {
        position: absolute;
        inset: 0;
        background: linear-gradient(
          to bottom,
          rgba(var(--oh-plate-rgb), 0)    0%,
          rgba(var(--oh-plate-rgb), 0)    35%,
          rgba(var(--oh-plate-rgb), 0.55) 55%,
          rgba(var(--oh-plate-rgb), 0.88) 72%,
          rgba(var(--oh-plate-rgb), 0.97) 85%,
          rgba(var(--oh-plate-rgb), 1)    100%
        );
        pointer-events: none;
        z-index: 1;
      }

      /* Subtle grain overlay for cinematic texture */
      .ss-grain {
        position: absolute;
        inset: 0;
        opacity: 0.035;
        background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
        background-size: 200px 200px;
        pointer-events: none;
        z-index: 2;
      }

      /* All UI lives in this bottom-anchored container */
      .ss-hud {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        z-index: 10;
        padding: 0 5vw 2.8rem;
        display: flex;
        flex-direction: column;
        gap: 1.1rem;
        animation: hudIn 0.8s cubic-bezier(0.16,1,0.3,1) both;
        animation-delay: 0.15s;
        opacity: 0;
      }

      @keyframes hudIn {
        from { opacity: 0; transform: translateY(14px); }
        to   { opacity: 1; transform: translateY(0); }
      }

      /* Top row: logo + title left, step info right */
      .ss-top-row {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 1rem;
      }

      .ss-identity {
        display: flex;
        align-items: center;
        gap: 1rem;
      }

      .ss-logo {
        width: 3.6rem;
        height: 3.6rem;
        object-fit: contain;
        filter: none;
        animation: logoBreath 3.5s ease-in-out infinite;
        flex-shrink: 0;
      }

      @keyframes logoBreath {
        0%,100% { opacity: 1; }
        50%      { opacity: 0.85; }
      }

      .ss-title-block {}

      .ss-game-name {
        font-family: var(--oh-font-label);
        font-size: var(--oh-t-2xs);
        font-weight: 700;
        letter-spacing: var(--oh-label-track);
        text-transform: var(--oh-label-case);
        color: var(--oh-text-dim);
        margin-bottom: 0.2rem;
      }

      .ss-title {
        font-family: var(--oh-font-display);
        font-size: clamp(1.6rem, 3vw, 2.4rem);
        font-weight: 800;
        color: var(--oh-text-strong);
        letter-spacing: -0.03em;
        line-height: 1;
      }

      /* Right side: current step name + step counter */
      .ss-step-info {
        text-align: right;
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        align-items: flex-end;
      }

      .ss-step-name {
        font-size: clamp(0.78rem, 1.2vw, 0.9rem);
        font-weight: 400;
        font-style: italic;
        color: var(--oh-text);
        letter-spacing: 0.01em;
      }

      .ss-step-counter {
        font-family: var(--oh-font-label);
        font-size: var(--oh-t-2xs);
        letter-spacing: var(--oh-label-track);
        color: var(--oh-text-dim);
        text-transform: var(--oh-label-case);
      }

      /* Decorative thin gold rule */
      .ss-rule {
        width: 100%;
        height: 3px;
        background: var(--oh-text-strong);
      }

      /* PROGRESS ROW */
      .ss-progress-row {
        display: flex;
        align-items: center;
        gap: 1.2rem;
      }

      .ss-progress-track {
        flex: 1;
        height: 5px;
        background: var(--oh-plate-2);
        border: 1px solid var(--oh-line);
        border-radius: 0;
        overflow: visible;
        position: relative;
      }

      /* Soft outer glow on track */
      .ss-progress-track::before {
        content: '';
  position: absolute;
  inset: -3px;
  border-radius: 6px;
  background: transparent;
  box-shadow: none;
  pointer-events: none;
      }

      .ss-progress-fill {
        height: 100%;
        border-radius: 0;
        background: var(--oh-accent);
        transition: width 0.5s cubic-bezier(0.4,0,0.2,1);
        position: relative;
        overflow: hidden;
      }

      /* Animated shimmer sweep */
      .ss-progress-fill::after {
        content: '';
  position: absolute;
  top: 0; bottom: 0; left: -100%;
  width: 60%;
  background: linear-gradient(90deg,
                              transparent 0%,
                              transparent 50%,
                              transparent 100%
  );
  animation: sweep 2.2s ease-in-out infinite;
      }

      @keyframes sweep {
        0%   { left: -60%; }
        100% { left: 160%; }
      }

      /* Glow head at tip of fill */
      .ss-progress-head {
        position: absolute;
        top: 50%;
        transform: translate(50%, -50%);
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--oh-accent);
        box-shadow: none;
        pointer-events: none;
        transition: right 0.5s cubic-bezier(0.4,0,0.2,1);
      }

      .ss-progress-pct {
        font-family: 'Cinzel', serif;
        font-size: clamp(0.75rem, 1.1vw, 0.85rem);
        font-weight: 700;
        color: var(--oh-text-strong);
        letter-spacing: 0.1em;
        min-width: 3.2rem;
        text-align: right;
        flex-shrink: 0;
      }

      /* BOTTOM META ROW */
      .ss-meta-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
      }

      /* Step dots */
      .ss-dots {
        display: flex;
        align-items: center;
        gap: 5px;
      }

      .ss-dot {
        width: 5px;
        height: 5px;
        border-radius: 50%;
        transition: all 0.3s;
      }
      .ss-dot-done    { background: var(--oh-grant); }
      .ss-dot-active  {
        background: var(--oh-accent);
        box-shadow: none;
        animation: dotPulse 1.1s ease-in-out infinite;
        width: 7px; height: 7px;
      }
      .ss-dot-pending { background: var(--oh-plate-2); border: 1px solid var(--oh-line); }

      @keyframes dotPulse {
        0%,100% { opacity: 1; }
        50%      { opacity: 0.6; }
      }

      /* Cached bytes */
      .ss-cache {
        font-size: clamp(0.65rem, 0.9vw, 0.75rem);
        font-style: italic;
        color: var(--oh-text-dim);
        letter-spacing: 0.02em;
      }

      /* Creator credit over the artwork — small and very subtle */
      .ss-copyright {
        position: absolute;
        top: 0.85rem;
        right: 1.1rem;
        z-index: 5;
        font-family: 'Cinzel', serif;
        font-size: var(--oh-t-2xs);
        letter-spacing: 0.14em;
        color: var(--oh-text-dim);
        text-shadow: none;
        pointer-events: none;
        user-select: none;
      }
      `}</style>

      {/* data-startup-screen: the translator waits for this to disappear
          before doing ANY work, so translation can never stall the load;
          data-no-translate keeps its fast-changing progress text verbatim. */}
      <div className="ss-shell" data-startup-screen="" data-no-translate="">
      {availableImages.map((src, index) => (
        <div
        key={src}
        className="ss-bg"
        style={{ backgroundImage: `url('${src}')`, opacity: index === currentBg ? 1 : 0 }}
        />
      ))}
      <div className="ss-gradient" />
      <div className="ss-grain" />
      <div className="ss-copyright">Image © 2026 Nicholas Krol</div>

      <div className="ss-hud">

      {/* Title row */}
      <div className="ss-top-row">
      <div className="ss-identity">
      <img className="ss-logo" src="/logo.png" alt="Open Historia" />
      <div className="ss-title-block">
      <div className="ss-game-name">Open Historia</div>
      <div className="ss-title">
      {timedOut ? "Continuing…" : "Preparing the World"}
      </div>
      </div>
      </div>

      {steps.length > 0 && (
        <div className="ss-step-info">
        <div className="ss-step-name">
        {activeStep ? activeStep.label : stage}
        </div>
        {steps.length > 1 && (
          <div className="ss-step-counter">
          {doneCount} of {steps.length} complete
          </div>
        )}
        </div>
      )}
      </div>

      {/* Gold rule */}
      <div className="ss-rule" />

      {/* Progress bar row */}
      <div className="ss-progress-row">
      <div className="ss-progress-track">
      <div
      className="ss-progress-fill"
      style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
      />
      {progress > 1 && progress < 100 && (
        <div
        className="ss-progress-head"
        style={{ right: `${100 - Math.min(100, Math.max(0, progress))}%` }}
        />
      )}
      </div>
      <div className="ss-progress-pct">
      {Math.min(100, Math.max(0, progress))}%
      </div>
      </div>

      {/* Bottom meta: step dots left, cached bytes right */}
      <div className="ss-meta-row">
      <div className="ss-dots">
      {steps.map((step) => (
        <div
        key={step.id}
        className={`ss-dot ss-dot-${step.status}`}
        title={step.label}
        />
      ))}
      </div>
      <div className="ss-cache">
      {loadedBytes > 0 ? `${formatBytes(loadedBytes)} cached` : ""}
      </div>
      </div>

      </div>
      </div>
      </>
  );
};

export default StartupScreen;

/*! Open Historia — portions (standalone map-editor mode) © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import Map from "./Game/Map/World.jsx";
import UI from "./Game/GameUI/main.jsx";

// Lazy so OpenLayers is only fetched when the editor is actually opened.
const MapEditor = lazy(() => import("./Editor/MapEditor.jsx"));
import StartupScreen from "./runtime/StartupScreen.jsx";
import FirstRunKey, { hasProviderKey } from "./runtime/FirstRunKey.jsx";
import { HAS_MAP } from "./runtime/edition.js";
import Welcome from "./runtime/Welcome.jsx";
import ErrorBoundary from "./runtime/ErrorBoundary.jsx";
import AppUpdateBanner from "./runtime/AppUpdateBanner.jsx";
import {
  STARTUP_TIME_BUDGET_MS,
  createInitialStartupState,
  runStartupPreload,
} from "./runtime/preload.js";
import { ensureLibraryCatalog, useLibraryState } from "./runtime/library.js";
import { startNewGame } from "./Game/GameUI/libraryBar.jsx";

const WorldShell = {
  backgroundColor: "#000",
  position: "fixed",
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
  overflow: "hidden",
  touchAction: "none",
};

const Vignette = {
  position: "fixed",
  inset: 0,
  background: "radial-gradient(ellipse at center, transparent 70%, rgba(0,0,0,0.25) 100%)",
  pointerEvents: "none",
  zIndex: 10,
};

function GameApp() {
  const mapRef = useRef(null);
  const preloadStartedAtRef = useRef(null);
  const preloadFinishedRef = useRef(false);
  const worldIdleRef = useRef(false);
  // Read once at mount: a player who has already given a key never sees the door.
  const [needsKey, setNeedsKey] = useState(() => !hasProviderKey());
  const [entered, setEntered] = useState(false);
  const [startupState, setStartupState] = useState(createInitialStartupState);
  const [isReady, setIsReady] = useState(false);
  const [hasFirstWorldIdle, setHasFirstWorldIdle] = useState(false);
  const [isGlobeEnabled, setIsGlobeEnabled] = useState(() => {
    const saved = localStorage.getItem("Globe");
    return saved !== null ? JSON.parse(saved) : false;
  });
  const [isTerrainEnabled, setIsTerrainEnabled] = useState(() => {
    const saved = localStorage.getItem("Terrain");
    if (saved !== null) return JSON.parse(saved);
    const isMobile = typeof window !== "undefined" && (
      window.innerWidth <= 768 ||
      /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    ); // default to false for mobile, true for desktop
    return !isMobile;
  });
  // Key the map/UI on the active GAME id, not the library token. The token also
  // bumps on scenario/asset writes, so Apply & Play (which saves the scenario and
  // uploads several assets before activating the new game) would otherwise remount
  // the map ~8 times — the repeated flashing/reloading. The game id changes once,
  // when the new game activates, so the map remounts exactly once.
  const { activeGameId } = useLibraryState();

  useEffect(() => {
    localStorage.setItem("Globe", JSON.stringify(isGlobeEnabled));
  }, [isGlobeEnabled]);

  useEffect(() => {
    localStorage.setItem("Terrain", JSON.stringify(isTerrainEnabled));
  }, [isTerrainEnabled]);

  useEffect(() => {
    preloadStartedAtRef.current = performance.now();
    let isActive = true;
    let frameId = 0;

    const frame = () => {
      if (!isActive) return;
      const elapsedMs = Math.min(
        STARTUP_TIME_BUDGET_MS,
        Math.round(performance.now() - preloadStartedAtRef.current),
      );

      setStartupState((current) => {
        if (!preloadStartedAtRef.current || current.elapsedMs === elapsedMs) {
          return current;
        }

        return {
          ...current,
          elapsedMs,
        };
      });

      if (elapsedMs >= STARTUP_TIME_BUDGET_MS) {
        setIsReady(true);
        return;
      }

      if (preloadFinishedRef.current && worldIdleRef.current) {
        setIsReady(true);
        return;
      }

      frameId = requestAnimationFrame(frame);
    };

    frameId = requestAnimationFrame(frame);

    setStartupState((current) => ({
      ...current,
      stage: "Syncing games and scenarios",
    }));

    ensureLibraryCatalog()
      .catch((error) => {
        console.warn("Failed to load library catalog before startup preload:", error);
      })
      .finally(() => {
        if (!isActive) return;

        runStartupPreload({
          onProgress: (nextState) => {
            if (!isActive) return;
            setStartupState((current) => ({ ...current, ...nextState }));
          },
        }).finally(() => {
          preloadFinishedRef.current = true;
          if (!isActive) return;

          if (worldIdleRef.current) {
            setIsReady(true);
          } else {
            setStartupState((current) => ({
              ...current,
              done: true,
            }));
          }
        });
      });

    return () => {
      isActive = false;
      cancelAnimationFrame(frameId);
    };
  }, []);

  const handleFirstWorldIdle = () => {
    if (worldIdleRef.current) return;
    worldIdleRef.current = true;
    setHasFirstWorldIdle(true);

    if (preloadFinishedRef.current) {
      setIsReady(true);
    }
  };

  // The map is what says "the world has drawn". With no map nothing ever says
  // it, and the startup screen would sit at 97% for ever — so the newspaper
  // edition raises the same flag itself, once, as soon as it has mounted.
  //
  // Not through requestAnimationFrame alone. A browser does not run animation
  // frames in a window that is not being painted: launch the game and switch to
  // something else while it loads — which is what anyone does during a first
  // launch — and the callback never fires, so the screen holds at 97% until the
  // window is looked at again, and holds there for ever if the player has
  // already concluded the game does not start. Observed exactly that way in a
  // hidden pane. The frame is kept for the case where it does paint, with a
  // timer behind it that runs whether anyone is watching or not.
  useEffect(() => {
    if (HAS_MAP) return undefined;
    const frame = requestAnimationFrame(() => handleFirstWorldIdle());
    const timer = setTimeout(() => handleFirstWorldIdle(), 250);
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); };
  }, []);

  const startupOverlayState = useMemo(() => {
    if (isReady || hasFirstWorldIdle || !startupState.done) {
      return startupState;
    }

    return {
      ...startupState,
      progress: Math.max(startupState.progress, 97),
      stage: "Finalizing first world render",
    };
  }, [hasFirstWorldIdle, isReady, startupState]);

  return (
    <>
    <div style={WorldShell}>
    {HAS_MAP && (
      <Map
      key={`map-${activeGameId || "default"}`}
      mapRef={mapRef}
      projection={isGlobeEnabled ? "globe" : "mercator"}
      terrainEnabled={isTerrainEnabled}
      onInitialIdle={handleFirstWorldIdle}
      />
    )}
    <div style={Vignette} />
    </div>
    {isReady && (
      <UI
      key={`ui-${activeGameId || "default"}`}
      isGlobeEnabled={isGlobeEnabled}
      isTerrainEnabled={isTerrainEnabled}
      mapRef={mapRef}
      setIsGlobeEnabled={setIsGlobeEnabled}
      setIsTerrainEnabled={setIsTerrainEnabled}
      />
    )}
    {!isReady && <StartupScreen {...startupOverlayState} />}
    {/* Asked once, at the front door, and never again. A player with no key can
        install, wait for the map, start a pontificate and play a whole turn
        before anything tells them the world cannot think — and then they
        conclude the game is broken rather than unconfigured. */}
    {isReady && needsKey && <FirstRunKey onDone={() => setNeedsKey(false)} />}
    {/* The front door, over everything, until the player opens it. A library of
        saved games behind Games / Scenarios / Community tabs is what a returning
        author wants; somebody who has never played this kind of game needs to be
        told what it is first. */}
    {isReady && !needsKey && !entered && (
      <Welcome
      hasSave={Boolean(activeGameId)}
      onBegin={async (reprendre) => {
        // Les deux boutons menaient au même endroit — la bibliothèque — et un
        // joueur qui voulait reprendre sa partie tombait sur une liste de
        // scénarios, d'archives et de clones. « Reprendre » rouvre la partie
        // active ; « Commencer » en crée une et y entre. Rien entre les deux.
        if (!reprendre) await startNewGame().catch(() => false);
        setEntered(true);
      }}
      />
    )}
    </>
  );
}

// Standalone modes are isolated behind URL flags so the real game is untouched:
//   ?editor=1  -> the OpenLayers map editor (author custom maps)
// Flags are read once at render time, so hook order stays consistent.
function App() {
  const params =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();
  if (params.has("editor")) {
    return (
      <Suspense fallback={<div style={{ position: "fixed", inset: 0, background: "var(--oh-plate)" }} />}>
        <MapEditor />
      </Suspense>
    );
  }
  // Wrap the game view (not the editor route, which has its own Suspense fallback)
  // so a render/lifecycle throw in the map, UI or panels shows a recoverable Reload
  // screen instead of unmounting to a blank page. Wrapping <GameApp/> at this level
  // (rather than inside GameApp's return) also catches GameApp's own render throws.
  return (
    <>
      <AppUpdateBanner />
      <ErrorBoundary>
        <GameApp />
      </ErrorBoundary>
    </>
  );
}

export default App;

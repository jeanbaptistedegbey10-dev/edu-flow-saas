"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";

// --------------------------------------
// Store de progression de navigation
// --------------------------------------
//
// État global minimaliste exposé à la fois :
// - au composant `NavigationProgressBar` (via `useSyncExternalStore`) ;
// - aux composants clients qui déclenchent des Server Actions
//   (`startNavigationProgress` / `completeNavigationProgress`).
//
// Cycle de vie : idle → running (rampe lente vers 90 %) → finishing
// (100 % + fondu de sortie) → idle.

type ProgressStatus = "idle" | "running" | "finishing";

type ProgressState = {
  status: ProgressStatus;
  /** Avancement de la barre en pourcentage (0–100). */
  progress: number;
};

const IDLE_PROGRESS_STATE: ProgressState = { status: "idle", progress: 0 };

let progressState: ProgressState = IDLE_PROGRESS_STATE;
const progressListeners = new Set<() => void>();

let crawlTimer: ReturnType<typeof setInterval> | null = null;
let finishTimer: ReturnType<typeof setTimeout> | null = null;
let resetTimer: ReturnType<typeof setTimeout> | null = null;
let safetyTimer: ReturnType<typeof setTimeout> | null = null;

function emitProgressChange(): void {
  progressListeners.forEach((listener) => listener());
}

function subscribeToProgress(listener: () => void): () => void {
  progressListeners.add(listener);

  return () => {
    progressListeners.delete(listener);
  };
}

function getProgressSnapshot(): ProgressState {
  return progressState;
}

function clearProgressTimers(): void {
  if (crawlTimer) {
    clearInterval(crawlTimer);
    crawlTimer = null;
  }
  if (finishTimer) {
    clearTimeout(finishTimer);
    finishTimer = null;
  }
  if (resetTimer) {
    clearTimeout(resetTimer);
    resetTimer = null;
  }
  if (safetyTimer) {
    clearTimeout(safetyTimer);
    safetyTimer = null;
  }
}

/**
 * Démarre (ou relance) l'animation de la barre de progression globale.
 * À appeler dès le début d'un traitement long (Server Action, navigation
 * déclenchée par le code) pour un retour visuel immédiat.
 */
export function startNavigationProgress(): void {
  if (typeof window === "undefined") return;

  clearProgressTimers();

  const initialProgress =
    progressState.status === "running" ? progressState.progress : 0;

  progressState = {
    status: "running",
    progress: Math.max(initialProgress, 12),
  };
  emitProgressChange();

  // Rampe asymptotique vers 90 % : le dernier tronçon reste volontairement
  // inoccupé tant que la navigation / l'action n'est pas terminée.
  crawlTimer = setInterval(() => {
    const increment = Math.max(0.3, (90 - progressState.progress) * 0.07);

    progressState = {
      ...progressState,
      progress: Math.min(progressState.progress + increment, 90),
    };
    emitProgressChange();
  }, 180);

  // Sécurité : ne jamais laisser une barre bloquée en haut de l'écran
  // (navigation annulée, erreur imprévue, etc.).
  safetyTimer = setTimeout(() => completeNavigationProgress(), 15000);
}

/**
 * Termine l'animation : saut à 100 % puis fondu de sortie.
 * Sans effet si aucune progression n'est en cours (idempotent).
 */
export function completeNavigationProgress(): void {
  if (progressState.status !== "running") return;

  clearProgressTimers();

  progressState = { status: "finishing", progress: 100 };
  emitProgressChange();

  // Fondu de sortie une fois la barre arrivée à 100 %.
  finishTimer = setTimeout(() => {
    progressState = { status: "idle", progress: 100 };
    emitProgressChange();
  }, 400);

  // Réinitialisation de la largeur APRÈS le fondu pour éviter un repli visible.
  resetTimer = setTimeout(() => {
    progressState = { status: "idle", progress: 0 };
    emitProgressChange();
  }, 700);
}

// --------------------------------------
// Détection des navigations déclenchées par un lien
// --------------------------------------

/** Clic modifié (nouvel onglet, téléchargement…) : pas de navigation locale. */
function isPlainLeftClick(event: MouseEvent): boolean {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

/** Le clic porte-t-il sur un lien interne qui déclenche une navigation ? */
function resolvesToInternalNavigation(event: MouseEvent): boolean {
  const target = event.target;

  if (!(target instanceof Element)) return false;

  const anchor = target.closest<HTMLAnchorElement>("a[href]");

  if (!anchor) return false;
  if (anchor.target === "_blank") return false;
  if (anchor.hasAttribute("download")) return false;

  const rel = anchor.getAttribute("rel");

  if (rel && rel.split(/\s+/).includes("external")) return false;

  const rawHref = anchor.getAttribute("href") ?? "";

  if (
    rawHref.startsWith("#") ||
    rawHref.startsWith("mailto:") ||
    rawHref.startsWith("tel:") ||
    rawHref.startsWith("javascript:")
  ) {
    return false;
  }

  const url = new URL(anchor.href, window.location.href);

  if (url.origin !== window.location.origin) return false;

  // Même URL (pathname + query) : aucune navigation réelle à indiquer.
  if (
    url.pathname === window.location.pathname &&
    url.search === window.location.search
  ) {
    return false;
  }

  return true;
}

// --------------------------------------
// Barre de progression globale (montée dans le layout racine)
// --------------------------------------

export function NavigationProgressBar() {
  const { status, progress } = React.useSyncExternalStore(
    subscribeToProgress,
    getProgressSnapshot,
    () => IDLE_PROGRESS_STATE
  );
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Termine l'animation dès que l'URL (pathname + query) change : c'est le
  // signal de fin des navigations déclenchées par un lien ou par history.
  const currentUrlRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const search = searchParams.toString();
    const url = `${pathname}${search ? `?${search}` : ""}`;

    if (currentUrlRef.current !== null && currentUrlRef.current !== url) {
      completeNavigationProgress();
    }

    currentUrlRef.current = url;
  }, [pathname, searchParams]);

  // Clic sur un lien interne (Sidebar, cartes, pagination…) → départ immédiat,
  // AVANT même le rendu du nouveau segment (écoute en phase de capture).
  React.useEffect(() => {
    function handleDocumentClick(event: MouseEvent): void {
      if (!isPlainLeftClick(event)) return;
      if (!resolvesToInternalNavigation(event)) return;

      startNavigationProgress();
    }

    function handlePopState(): void {
      // Boutons précédent / suivant du navigateur.
      startNavigationProgress();
    }

    document.addEventListener("click", handleDocumentClick, true);
    window.addEventListener("popstate", handlePopState);

    return () => {
      document.removeEventListener("click", handleDocumentClick, true);
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  const isVisible = status !== "idle";

  return (
    <div
      role="progressbar"
      aria-label="Chargement de la navigation"
      aria-hidden={!isVisible}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress)}
      className={`pointer-events-none fixed inset-x-0 top-0 z-[100] h-1 transition-opacity duration-300 ${
        isVisible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div
        className="h-full w-full origin-left bg-gradient-to-r from-primary via-primary to-sky-400 shadow-[0_0_8px_rgba(79,70,229,0.55)]"
        style={{
          transform: `scaleX(${progress / 100})`,
          transition:
            status === "finishing"
              ? "transform 250ms ease-out"
              : "transform 300ms ease-in-out",
        }}
      />
    </div>
  );
}


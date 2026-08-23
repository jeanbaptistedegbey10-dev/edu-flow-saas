import * as React from "react"

const MOBILE_BREAKPOINT = 768

/** S'abonne aux changements de la media query « viewport mobile ». */
function subscribeToViewport(callback: () => void) {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  mql.addEventListener("change", callback)
  return () => mql.removeEventListener("change", callback)
}

function getIsMobile() {
  return window.innerWidth < MOBILE_BREAKPOINT
}

/** Valeur côté serveur (pas de viewport disponible pendant le SSR). */
function getServerIsMobile() {
  return false
}

export function useIsMobile() {
  // useSyncExternalStore : abonnement idiomatique à un système externe
  // (matchMedia), sans setState synchrone dans un effet.
  return React.useSyncExternalStore(
    subscribeToViewport,
    getIsMobile,
    getServerIsMobile
  )
}
"use client";

// ---------------------------------------------------------------------------
// CookieBanner — bandeau de consentement RGPD
// ---------------------------------------------------------------------------
// Affiché une seule fois, en bas de l'écran, jusqu'à ce que l'utilisateur
// accepte ou refuse. Le choix est persisté dans `localStorage` : le bandeau
// n'est plus rendu aux visites suivantes.
//
// ⚠️ Hydratation : `localStorage` n'existe pas côté serveur. On rend donc
// `null` tant que la valeur n'a pas été lue (`isReady === false`), puis on la
// lit dans un `useEffect`. Le premier rendu client est donc identique au
// rendu serveur (rien), ce qui évite toute erreur d'hydratation et tout
// clignotement. Voir `node_modules/next/dist/docs/01-app/02-guides/
// preventing-flash-before-hydration.md`.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { useEffect, useState } from "react";
import { Cookie } from "lucide-react";

/** Clé de persistance du choix de l'utilisateur. */
export const COOKIE_CONSENT_STORAGE_KEY = "eduflow-cookie-consent";

/** Valeurs possibles du choix persisté. */
export type CookieConsentChoice = "accepted" | "refused";

/** Liste blanche des valeurs acceptées depuis `localStorage`. */
function isConsentChoice(value: unknown): value is CookieConsentChoice {
  return value === "accepted" || value === "refused";
}

/**
 * Lit le choix persisté.
 * @returns Le choix, ou `null` si absent / illisible (navigation privée,
 *   `localStorage` bloqué, valeur corrompue).
 */
function readStoredConsent(): CookieConsentChoice | null {
  try {
    const raw = window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
    return isConsentChoice(raw) ? raw : null;
  } catch {
    // `localStorage` inaccessible (mode privé strict, iframe sandboxée…) :
    // on se comporte comme si aucun choix n'avait été fait.
    return null;
  }
}

/** Persiste le choix de l'utilisateur. Silencieux en cas d'échec. */
function storeConsent(choice: CookieConsentChoice): void {
  try {
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, choice);
  } catch {
    // Sans stockage, le bandeau reste affiché jusqu'au rechargement : on
    // masque tout de même l'UI pour ne pas bloquer la page.
  }
}

export default function CookieBanner() {
  /** Vrai une fois la valeur de `localStorage` lue (donc après hydratation). */
  const [isReady, setIsReady] = useState(false);
  /** Choix déjà effectué : le bandeau ne doit plus s'afficher. */
  const [consent, setConsent] = useState<CookieConsentChoice | null>(null);

  useEffect(() => {
    setConsent(readStoredConsent());
    setIsReady(true);
  }, []);

  /** Enregistre le choix puis masque le bandeau. */
  const decide = (choice: CookieConsentChoice) => {
    storeConsent(choice);
    setConsent(choice);
  };

  // Tant que le choix n'est pas lu : ne rien rendre (évite le clignotement).
  if (!isReady || consent !== null) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Consentement aux cookies"
      className="fixed inset-x-0 bottom-0 z-[100] p-4 sm:p-6 animate-in fade-in slide-in-from-bottom-4 duration-300"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-4 rounded-2xl border border-white/10 bg-ink-900/95 p-5 shadow-2xl shadow-black/40 backdrop-blur-xl sm:flex-row sm:items-center sm:gap-6 sm:p-6">
        {/* Icône + texte */}
        <div className="flex flex-1 items-start gap-4">
          <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/20 border border-brand/30 sm:flex">
            <Cookie className="h-5 w-5 text-brand-light" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">
              Votre confidentialité nous tient à cœur
            </p>
            <p className="mt-1 text-sm leading-relaxed text-gray-400">
              Nous utilisons des cookies strictement nécessaires au
              fonctionnement du site (session, préférences). Vous pouvez
              accepter ou refuser. En savoir plus dans notre{" "}
              <Link
                href="/politique-de-confidentialite"
                className="text-brand-light hover:underline"
              >
                politique de confidentialité
              </Link>
              .
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row-reverse sm:items-center">
          <button
            type="button"
            onClick={() => decide("accepted")}
            className="rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-brand-dark hover:shadow-lg hover:shadow-brand/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-light/60"
          >
            Accepter
          </button>
          <button
            type="button"
            onClick={() => decide("refused")}
            className="rounded-lg border border-white/15 px-5 py-2.5 text-sm font-medium text-gray-300 transition-colors hover:border-white/30 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-light/60"
          >
            Refuser
          </button>
        </div>
      </div>
    </div>
  );
}
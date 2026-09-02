"use client";

import * as React from "react";
import { AlertCircleIcon, ShieldCheckIcon } from "lucide-react";

/**
 * Intégration client-side de Cloudflare Turnstile (« anti-bot checkbox »).
 *
 * Aucune dépendance npm : le SDK officiel est chargé dynamiquement depuis
 * `https://challenges.cloudflare.com/turnstile/v0/api.js`. Le jeton reçu
 * (`token`) est transmis au formulaire de connexion et validé serveur
 * (src/auth.ts → `verifyTurnstileToken`) via une clé secrète.
 *
 * Si `siteKey` est vide, le widget n'est pas rendu (mode démo / clé non
 * configurée) : cela permet de faire tourner le projet sans compte Turnstile.
 */
const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js";

type TurnstileApi = {
  /** Initialise le widget dans le conteneur et renvoie son id. */
  render: (container: HTMLElement, params: TurnstileWidgetParams) => string;
  /** Réinitialise (renvoie un nouveau challenge) — jeton consommé ou expiré. */
  reset: (widgetId?: string) => void;
  /** Supprime le widget du DOM. */
  remove: (widgetId?: string) => void;
};

type TurnstileWidgetParams = {
  sitekey: string;
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback"?: () => void;
  theme?: "auto" | "light" | "dark";
  "timeout-callback"?: () => void;
};

type TurnstileWindow = Window & { turnstile?: TurnstileApi };

let scriptPromise: Promise<void> | null = null;

/** Charge le SDK Turnstile une seule fois (mémorisé). */
function loadTurnstileScript(): Promise<void> {
  if (scriptPromise) {
    return scriptPromise;
  }

  scriptPromise = new Promise<void>((resolve, reject) => {
    const win = window as unknown as TurnstileWindow;

    if (win.turnstile) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(
        new Error(
          "Impossible de charger le widget anti-robot (Cloudflare Turnstile)."
        )
      );
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}

type TurnstileWidgetProps = {
  /** Clé publique du site (NEXT_PUBLIC_TURNSTILE_SITE_KEY) — si vide, le widget est masqué. */
  siteKey: string;
  /** Jeton valide reçu du widget (déclenché par Turnstile). */
  onVerify: (token: string) => void;
  /** Jeton expiré (15 min) — à utiliser pour révoquer la session côté client. */
  onExpire?: () => void;
  /** Échec de chargement du widget. */
  onError?: () => void;
};

export function TurnstileWidget({
  siteKey,
  onVerify,
  onExpire,
  onError,
}: TurnstileWidgetProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const widgetIdRef = React.useRef<string | null>(null);
  const [failed, setFailed] = React.useState(false);

  // Refs pour toujours invoquer les callbacks les plus à jour (le widget ne
  // se re-déclenche pas si la prop change).
  const onVerifyRef = React.useRef(onVerify);
  const onExpireRef = React.useRef(onExpire);
  const onErrorRef = React.useRef(onError);

  React.useEffect(() => {
    onVerifyRef.current = onVerify;
    onExpireRef.current = onExpire;
    onErrorRef.current = onError;
  }, [onVerify, onExpire, onError]);

  React.useEffect(() => {
    // Sans clé publique : n'aucune trace côté client.
    if (!siteKey) {
      return;
    }

    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current) {
          return;
        }

        const turnstile = (window as unknown as TurnstileWindow).turnstile;

        if (!turnstile) {
          setFailed(true);
          onErrorRef.current?.();
          return;
        }

        // (Re)dessine le widget proprement.
        containerRef.current.innerHTML = "";
        const widgetId = turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: "auto",
          callback: (token) => onVerifyRef.current(token),
          "expired-callback": () => onExpireRef.current?.(),
          "error-callback": () => onErrorRef.current?.(),
        });

        widgetIdRef.current = widgetId ?? null;
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
          onErrorRef.current?.();
        }
      });

    // Nettoyage à la désactivation / re-rendu (ex : token consommé → nouveau challenge).
    return () => {
      cancelled = true;
      const turnstile = (window as unknown as TurnstileWindow).turnstile;
      if (widgetIdRef.current && turnstile) {
        try {
          turnstile.remove(widgetIdRef.current);
        } catch {
          // ignore
        }
      }
      widgetIdRef.current = null;
    };
  }, [siteKey]);

  // Masqué complètement si aucune clé publique n'est configurée.
  if (!siteKey) {
    return null;
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-start gap-2">
        <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Cochez la case « Je ne suis pas un robot » pour activer la
          connexion.
        </p>
      </div>

      <div ref={containerRef} className="min-h-[65px]" />

      {failed ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
          <span>
            La vérification anti-robot n&apos;a pas pu être chargée. Veuillez
            réessayer dans quelques instants.
          </span>
        </div>
      ) : null}
    </div>
  );
}

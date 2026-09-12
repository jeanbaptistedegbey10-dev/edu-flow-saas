"use client";

import * as React from "react";
import { CheckIcon, XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Notification temporaire (« toast ») autonome, affichée en bas à droite.
 *
 * - Se ferme automatiquement après `duration` ms ;
 * - Se ferme manuellement via le bouton ✕ ;
 * - Annonce les perturbations aux lecteurs d'écran (`role="status"`, aria-live).
 *
 * Chaque conteneur parent gère son propre état (`message: string | null`) et
 * rend `ToastNotification` de manière conditionnelle.
 */
export function ToastNotification({
  message,
  onClose,
  tone = "success",
  duration = 3200,
}: {
  /** Message affiché (null → aucun toast rendu). */
  message: string | null;
  /** Ferme le toast (état parent repassé à null). */
  onClose: () => void;
  tone?: "success" | "error";
  duration?: number;
}): React.ReactElement | null {
  React.useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(onClose, duration);
    return () => {
      window.clearTimeout(timer);
    };
  }, [message, onClose, duration]);

  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-open="true"
      className={cn(
        "fixed bottom-6 right-6 z-[70] flex max-w-sm items-center gap-2.5 rounded-lg border bg-popover p-3 text-sm text-popover-foreground ring-1 ring-foreground/10 shadow-lg duration-100 data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-bottom-3",
        tone === "success"
          ? "border-emerald-300 ring-emerald-300/30"
          : "border-destructive ring-destructive/30"
      )}
    >
      {tone === "success" ? (
        <CheckIcon data-icon="inline-start" className="text-emerald-600" />
      ) : (
        <XIcon data-icon="inline-start" className="text-destructive" />
      )}
      <p className="flex-1 text-[0.9rem] leading-snug">{message}</p>
      <button
        type="button"
        aria-label="Fermer la notification"
        className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md hover:bg-muted"
        onClick={onClose}
      >
        <XIcon className="size-3.5 text-muted-foreground" />
      </button>
    </div>
  );
}
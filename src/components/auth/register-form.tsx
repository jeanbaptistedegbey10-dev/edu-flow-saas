"use client";

import * as React from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Loader2Icon, SparklesIcon } from "lucide-react";

/**
 * Inline Google logo icon (multi-color brand mark).
 */
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="24"
      height="24"
      aria-hidden
      focusable="false"
    >
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

import { Button } from "@/components/ui/button";

/**
 * Inscription — UNIQUE voie de création de compte Organisme / Admin (Phase 1).
 *
 * La première connexion Google d'un administrateur crée automatiquement :
 *   - son organisation (plan TRIAL / ACTIVE) avec 30 jours d'essai gratuit ;
 *   - son compte administrateur (identifié par l'email Google).
 * Le jeu de données de démonstration est injecté automatiquement pour une
 * prise en main immédiate (ré-injectable / réinitialisable depuis le tableau
 * de bord — voir src/lib/actions/demo-data.ts).
 */
export function RegisterForm() {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const searchParams = useSearchParams();

  async function handleGoogleSignIn() {
    setError(null);
    setPending(true);
    try {
      // Capture le code de parrainage éventuel présent dans l'URL (?ref=CODE)
      // et le stocke dans un cookie pour le serveur (auth.ts signIn callback).
      const refCode = searchParams.get("ref");
      if (refCode && refCode.trim().length > 0) {
        document.cookie = `eduflow_ref=${encodeURIComponent(
          refCode.trim()
        )}; path=/; max-age=86400; SameSite=Lax`;
      }
      await signIn("google", { callbackUrl: "/dashboard" });
    } catch {
      setError(
        "Une erreur est survenue lors de la connexion avec Google. Veuillez réessayer."
      );
      setPending(false);
    }
  }

  return (
    <div className="grid gap-4">
      {error ? (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full"
        disabled={pending}
        onClick={handleGoogleSignIn}
      >
        {pending ? (
          <Loader2Icon data-icon="inline-start" className="animate-spin" />
        ) : (
          <GoogleIcon data-icon="inline-start" />
        )}
        {pending ? "Création de votre compte..." : "Continuer avec Google"}
      </Button>

      <div className="flex items-start gap-2 rounded-lg bg-primary/5 px-3 py-2.5 text-xs text-muted-foreground">
        <SparklesIcon className="mt-0.5 size-4 shrink-0 text-primary" />
        <p>
          La création de compte se fait exclusivement via Google. Votre organisation est
          créée avec une <strong>période d&apos;essai gratuite de 30 jours</strong> et
          un jeu de données de démonstration immédiatement utilisable.
        </p>
      </div>
    </div>
  );
}

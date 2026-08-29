"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircleIcon, Loader2Icon, LogInIcon } from "lucide-react";

/**
 * Inline Google logo icon (multi-color brand mark).
 * Replaces the invalid `ChromeIcon` import from lucide-react.
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
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}
import { signIn } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Formulaire de connexion (CredentialsProvider).
 *
 * - Validation côté client de l'email et du mot de passe.
 * - Bouton de soumission avec état de chargement.
 * - Affichage des erreurs d'authentification (identifiants invalides,
 *   erreur réseau…) dans un composant d'alerte rouge.
 * - Après succès : la redirection est **gérée par NextAuth** — le POST vers
 *   `/api/auth/callback/credentials` pose le cookie de session puis renvoie
 *   l'URL finale (`redirectTo`) dans `result.url`, que le client suit via
 *   `window.location.replace(...)` (rechargement complet du navigateur pour
 *   charger le nouveau cookie de session).
 */
export function LoginForm() {
  const searchParams = useSearchParams();

  const [isPending, setIsPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    // Validation légère avant appel réseau.
    if (!EMAIL_REGEX.test(email)) {
      setError("Veuillez saisir une adresse email valide.");
      return;
    }

    if (!password) {
      setError("Veuillez saisir votre mot de passe.");
      return;
    }

    setIsPending(true);

    try {
      // Redirection gérée par NextAuth : l'appel POST vers
      // `/api/auth/callback/credentials` pose lui-même le cookie de session
      // puis renvoie l'URL finale (redirectTo) dans `result.url`. On se
      // contente de suivre cette URL — NextAuth garde la main sur la pose du
      // cookie et la destination, ce qui évite toute boucle /login ↔ /dashboard.
      //
      // `redirect: false` permet de conserver l'affichage des erreurs sans
      // rechargement de page, tout en passant par l'endpoint de callback de
      // NextAuth (redirection « gérée » par la bibliothèque, pas par le client).
      const callbackUrl = searchParams.get("callbackUrl");
      const destination =
        callbackUrl && callbackUrl.startsWith("/")
          ? callbackUrl
          : "/dashboard";

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        redirectTo: destination,
      });

      // --- Gestion des erreurs ---
      // Si NextAuth signale une erreur (identifiants invalides, compte
      // désactivé, erreur interne…), on l'affiche dans un composant
      // d'alerte rouge sur l'écran.
      if (result?.error) {
        setError("Email ou mot de passe incorrect. Veuillez réessayer.");
        return;
      }

      // --- Redirection après succès ---
      // Le callback NextAuth a déjà posé le cookie de session et renvoyé
      // l'URL finale dans `result.url` (normalement la valeur de `redirectTo`).
      // `window.location.replace(...)` (au lieu de `router.push`) force un
      // rechargement complet du navigateur pour charger le nouveau cookie ;
      // `replace` (vs `href`) retire `/login` de l'historique : le bouton
      // retour ne repasse jamais par la page de connexion en boucle.
      if (result?.url) {
        window.location.replace(result.url);
        return;
      }

      // result inattendu (null / undefined) — aucun succès détecté.
      setError(
        "Une erreur est survenue lors de la connexion. Veuillez réessayer.",
      );
    } catch {
      setError(
        "Une erreur est survenue lors de la connexion. Veuillez réessayer.",
      );
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
        >
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
          <p>{error}</p>
        </div>
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="Ex : admin@excellence-formation.com"
          autoComplete="email"
          autoFocus
          required
          disabled={isPending}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="password">Mot de passe</Label>
        <Input
          id="password"
          name="password"
          type="password"
          placeholder="••••••••"
          autoComplete="current-password"
          required
          disabled={isPending}
        />
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={isPending}>
        {isPending ? (
          <Loader2Icon data-icon="inline-start" className="animate-spin" />
        ) : (
          <LogInIcon data-icon="inline-start" />
        )}
        {isPending ? "Connexion..." : "Se connecter"}
      </Button>

      {/* Séparation et bouton Google OAuth */}
      <div className="relative my-2">
        <div className="absolute inset-0 flex items-center">
          <Separator className="w-full" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">
            Ou continuer avec
          </span>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full"
        disabled={isPending}
        onClick={() =>
          signIn("google", {
            callbackUrl: searchParams.get("callbackUrl") ?? "/dashboard",
          })
        }
      >
        <GoogleIcon data-icon="inline-start" />
        Continuer avec Google
      </Button>
    </form>
  );
}
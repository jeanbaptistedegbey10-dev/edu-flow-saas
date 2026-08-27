"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircleIcon, Loader2Icon, LogInIcon } from "lucide-react";
import { signIn } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    </form>
  );
}
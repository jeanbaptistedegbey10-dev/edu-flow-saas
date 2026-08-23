"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2Icon, LogInIcon } from "lucide-react";
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
 *   erreur réseau…).
 * - Après succès : redirection vers `callbackUrl` (mémorisé par le proxy
 *   lors de la redirection initiale) ou vers le tableau de bord.
 */
export function LoginForm() {
  const router = useRouter();
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
      // `redirect: false` permet de gérer la redirection manuellement
      // et d'afficher les erreurs sans rechargement de page.
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(
          "Email ou mot de passe incorrect. Veuillez réessayer."
        );
        return;
      }

      // Destination mémorisée par le proxy, sinon tableau de bord.
      const callbackUrl = searchParams.get("callbackUrl");
      const destination =
        callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : "/dashboard";

      router.push(destination);
      // Force le re-rendu des Server Components avec la nouvelle session.
      router.refresh();
    } catch {
      setError(
        "Une erreur est survenue lors de la connexion. Veuillez réessayer."
      );
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
      {error ? (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
        >
          {error}
        </p>
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
"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, UserPlusIcon } from "lucide-react";

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

import { registerAction, type RegisterFormState } from "@/actions/register";
import {
  completeNavigationProgress,
  startNavigationProgress,
} from "@/components/providers/navigation-progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

const INITIAL_FORM_STATE: RegisterFormState = { status: "idle" };

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-xs font-medium text-destructive">
      {message}
    </p>
  );
}

/**
 * Formulaire d'inscription (création d'une organisation + administrateur).
 *
 * - Utilise `useActionState` pour gérer l'état de soumission et les erreurs
 *   renvoyées par le Server Action `registerAction`.
 * - Après succès, redirige vers `/login` avec un message de confirmation
 *   (affiché par la page de connexion via `searchParams`).
 */
export function RegisterForm() {
  const router = useRouter();

  // L'inscription inclut par défaut le jeu de démonstration : le message
  // d'attente s'adapte à ce choix (case décochée = création seule).
  const [includeDemoData, setIncludeDemoData] = React.useState(true);

  // Enveloppe l'action serveur pour rediriger dès que la création réussit.
  const [state, formAction, pending] = useActionState(
    async (_prevState: RegisterFormState, formData: FormData) => {
      // La Server Action (création du compte + injection de la démo) peut
      // prendre plusieurs secondes : la barre de progression globale donne
      // un retour immédiat, en complément du spinner du bouton.
      startNavigationProgress();

      try {
        const result = await registerAction(_prevState, formData);

        if (result.status === "success") {
          // Redirection vers /login avec un message de succès.
          router.push("/login?registered=1");
          router.refresh();
        }

        return result;
      } finally {
        completeNavigationProgress();
      }
    },
    INITIAL_FORM_STATE
  );

  const fieldErrors = state.fieldErrors ?? {};

  // Message d'attente dynamique affiché pendant le traitement de l'action.
  const pendingMessage = includeDemoData
    ? "Création de votre compte et injection de la démo en cours..."
    : "Création de votre compte en cours...";

  return (
    <form
      action={formAction}
      className="grid gap-4"
      noValidate
      aria-busy={pending}
      onSubmit={(event) => {
        // Garde anti double-clic : toute soumission alors qu'une action est
        // déjà en cours est annulée (complète le `disabled` du bouton).
        if (pending) {
          event.preventDefault();
        }
      }}
    >
      {state.message && state.status === "error" && !state.fieldErrors ? (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
        >
          {state.message}
        </p>
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor="organizationName">
          {"Nom de l'organisation *"}
        </Label>
        <Input
          id="organizationName"
          name="organizationName"
          placeholder="Ex : Centre de Formation Excellence"
          autoComplete="organization"
          autoFocus
          required
          disabled={pending}
          aria-invalid={Boolean(fieldErrors.organizationName)}
        />
        <FieldError message={fieldErrors.organizationName} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="firstName">Prénom *</Label>
          <Input
            id="firstName"
            name="firstName"
            placeholder="Ex : Jean"
            autoComplete="given-name"
            required
            disabled={pending}
            aria-invalid={Boolean(fieldErrors.firstName)}
          />
          <FieldError message={fieldErrors.firstName} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="lastName">Nom *</Label>
          <Input
            id="lastName"
            name="lastName"
            placeholder="Ex : Dupont"
            autoComplete="family-name"
            required
            disabled={pending}
            aria-invalid={Boolean(fieldErrors.lastName)}
          />
          <FieldError message={fieldErrors.lastName} />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="email">Email *</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="Ex : admin@excellence-formation.com"
          autoComplete="email"
          required
          disabled={pending}
          aria-invalid={Boolean(fieldErrors.email)}
        />
        <FieldError message={fieldErrors.email} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="password">Mot de passe *</Label>
        <Input
          id="password"
          name="password"
          type="password"
          placeholder="8 caractères minimum"
          autoComplete="new-password"
          required
          disabled={pending}
          aria-invalid={Boolean(fieldErrors.password)}
        />
        <FieldError message={fieldErrors.password} />
      </div>

      {/* Case à cocher OBLIGATOIRE : injecte automatiquement le jeu de
          données de démonstration dès la création du compte (cochée par
          défaut, `required` bloque la soumission si elle est décochée). */}
      <label
        htmlFor="includeDemoData"
        className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200/80 p-3 transition-colors hover:bg-muted/40 dark:border-slate-800"
      >
        <input
          id="includeDemoData"
          name="includeDemoData"
          type="checkbox"
          value="on"
          defaultChecked
          required
          disabled={pending}
          onChange={(event) => setIncludeDemoData(event.target.checked)}
          className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary"
        />
        <span className="grid gap-0.5">
          <span className="text-sm font-medium">
            Jeu de données de démonstration *
          </span>
          <span className="text-xs text-muted-foreground">
            Inclure un jeu de données de démonstration (élèves, cours, notes,
            dépenses) pour visiter la plateforme.
          </span>
        </span>
      </label>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? (
          <Loader2Icon data-icon="inline-start" className="animate-spin" />
        ) : (
          <UserPlusIcon data-icon="inline-start" />
        )}
        {pending ? "Création du compte..." : "Créer mon compte"}
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
        disabled={pending}
        onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
      >
        <GoogleIcon data-icon="inline-start" />
        Continuer avec Google
      </Button>

      {/* Message d'attente dynamique (annoncé aux lecteurs d'écran). */}
      {pending ? (
        <p
          role="status"
          aria-live="polite"
          className="flex items-center justify-center gap-2 text-sm text-muted-foreground"
        >
          <Loader2Icon className="size-4 shrink-0 animate-spin" aria-hidden />
          {pendingMessage}
        </p>
      ) : null}
    </form>
  );
}
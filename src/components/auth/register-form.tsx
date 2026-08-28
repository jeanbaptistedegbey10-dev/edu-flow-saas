"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, UserPlusIcon } from "lucide-react";

import { registerAction, type RegisterFormState } from "@/actions/register";
import {
  completeNavigationProgress,
  startNavigationProgress,
} from "@/components/providers/navigation-progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
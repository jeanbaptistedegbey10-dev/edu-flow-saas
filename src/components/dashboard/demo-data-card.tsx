"use client";

import * as React from "react";
import { useActionState } from "react";
import {
  AlertTriangleIcon,
  FlaskConicalIcon,
  Loader2Icon,
  RefreshCcwIcon,
} from "lucide-react";

import {
  injectDemoDataAction,
  resetDemoDataAction,
  type DemoDataActionState,
} from "@/lib/actions/demo-data";
import { Button } from "@/components/ui/button";

const INITIAL_STATE: DemoDataActionState = { status: "idle" };

/**
 * Carte « Données de démonstration » du tableau de bord (administrateurs).
 *
 * Deux actions en 1 clic :
 * - « Injecter la démo » : crée un jeu de données réaliste (classes, élèves,
 *   reçus) pour tester l'application immédiatement ;
 * - « Réinitialiser »   : supprime toutes les données métier de l'organisation.
 */
export function DemoDataCard({ isAdmin }: { isAdmin: boolean }) {
  const [injectState, injectFormAction, injectPending] = useActionState(
    injectDemoDataAction,
    INITIAL_STATE
  );
  const [resetState, resetFormAction, resetPending] = useActionState(
    resetDemoDataAction,
    INITIAL_STATE
  );

  const pending = injectPending || resetPending;
  const message = injectState.message ?? resetState.message;
  const success =
    injectState.status === "success" || resetState.status === "success";

  return (
    <section className="rounded-xl border border-dashed bg-background p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <FlaskConicalIcon className="size-4 text-indigo-600" />
        <h2 className="font-semibold tracking-tight">Données de démonstration</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Injectez <strong>2-3 classes, 5 élèves et 2 reçus</strong> d&apos;exemple pour
        tester l&apos;application immédiatement, ou réinitialisez votre base en 1 clic.
      </p>

      <div className="mt-4 grid gap-3">
        {message ? (
          <p
            role="status"
            className={
              success
                ? "rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
                : "rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            }
          >
            {message}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <form action={injectFormAction}>
            <Button
              type="submit"
              size="sm"
              disabled={pending}
              className="bg-indigo-600 text-white hover:bg-indigo-700"
            >
              {injectPending ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <FlaskConicalIcon className="size-4" />
              )}
              Injecter la démo
            </Button>
          </form>

          <form action={resetFormAction}>
            <Button
              type="submit"
              size="sm"
              variant="outline"
              disabled={pending || !isAdmin}
              className="text-destructive hover:text-destructive"
              title={
                isAdmin
                  ? "Supprimer toutes les données métier"
                  : "Réservé aux administrateurs"
              }
            >
              {resetPending ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <RefreshCcwIcon className="size-4" />
              )}
              Réinitialiser
            </Button>
          </form>

          {!isAdmin ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <AlertTriangleIcon className="size-3.5" />
              Réinitialisation réservée aux administrateurs
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}

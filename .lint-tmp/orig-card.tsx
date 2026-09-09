"use client";

import * as React from "react";
import { useActionState } from "react";
import {
  AlertTriangleIcon,
  FlaskConicalIcon,
  Loader2Icon,
  RefreshCcwIcon,
  ShieldAlertIcon,
} from "lucide-react";

import {
  injectDemoDataAction,
  resetDemoDataAction,
  type DemoDataActionState,
} from "@/lib/actions/demo-data";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL_STATE: DemoDataActionState = { status: "idle" };

/** Mot de confirmation exigé pour ÉCRASER des données existantes (injection). */
const OVERWRITE_CONFIRM_WORD = "CONFIRMER";
/** Mot de confirmation exigé pour SUPPRIMER définitivement les données. */
const DELETE_CONFIRM_WORD = "SUPPRIMER";

type ConfirmTarget = "inject" | "reset";

/**
 * Carte « Données de démonstration » du tableau de bord (administrateurs).
 *
 * Garde-fous déployés :
 * - Deletion guard : « Supprimer la démo » est désactivé lorsque le centre ne
 *   contient aucune donnée (`hasData === false`) ;
 * - Confirmation mot-clé : injecter (écrasement des données existantes) exige
 *   la saisie de CONFIRMER et supprimer exige SUPPRIMER — la vérification est
 *   rejouée côté serveur (src/lib/actions/demo-data.ts) ;
 * - `useActionState` centralise les états pending / message et bloque toute
 *   double soumission.
 */
export function DemoDataCard({
  isAdmin,
  hasData,
}: {
  isAdmin: boolean;
  hasData: boolean;
}) {
  const [injectState, injectFormAction, injectPending] = useActionState(
    injectDemoDataAction,
    INITIAL_STATE
  );
  const [resetState, resetFormAction, resetPending] = useActionState(
    resetDemoDataAction,
    INITIAL_STATE
  );

  const [confirmTarget, setConfirmTarget] = React.useState<ConfirmTarget | null>(
    null
  );
  const [confirmWord, setConfirmWord] = React.useState("");

  const pending = injectPending || resetPending;

  // Sélectionne le message à afficher : priorité au message actuel de l'action
  // en cours, sinon au message de la dernière action exécutée.
  const message = injectState.message ?? resetState.message;
  const success =
    injectState.status === "success" || resetState.status === "success";
  const isError =
    injectState.status === "error" || resetState.status === "error";

  // Pendant l'exécution, on masque le message précédent pour éviter l'affichage
  // d'un état obsolète (ex: succès de l'injection puis clic sur « Réinitialiser »).
  const showMessage = message && !pending;

  // Modales de confirmation mot-clé.
  const requiredWord =
    confirmTarget === "reset" ? DELETE_CONFIRM_WORD : OVERWRITE_CONFIRM_WORD;
  const confirmValid = confirmWord.trim().toUpperCase() === requiredWord;

  const closeConfirm = React.useCallback(() => {
    setConfirmTarget(null);
    setConfirmWord("");
  }, []);

  // Ferme la modale dès qu'une action se termine avec succès.
  const prevInjectPending = React.useRef(false);
  const prevResetPending = React.useRef(false);

  React.useEffect(() => {
    if (prevInjectPending.current && !injectPending) {
      if (injectState.status === "success") closeConfirm();
    }
    prevInjectPending.current = injectPending;
  }, [injectPending, injectState.status, closeConfirm]);

  React.useEffect(() => {
    if (prevResetPending.current && !resetPending) {
      if (resetState.status === "success") closeConfirm();
    }
    prevResetPending.current = resetPending;
  }, [resetPending, resetState.status, closeConfirm]);

  // Deletion guard : le bouton « Supprimer la démo » est inopérant sans données.
  const resetDisabled = !isAdmin || !hasData || pending;

  const resetTitle = !isAdmin
    ? "Réservé aux administrateurs"
    : !hasData
      ? "Aucune donnée de démonstration à supprimer"
      : "Supprimer définitivement toutes les données métier";

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
        {showMessage ? (
          <p
            role="status"
            className={
              success
                ? "rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
                : isError
                  ? "rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  : "rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700"
            }
          >
            {message}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {hasData ? (
            // Des données existent : l'injection les écrase — confirmation requise.
            <Button
              type="button"
              size="sm"
              disabled={pending}
              className="bg-indigo-600 text-white hover:bg-indigo-700"
              onClick={() => setConfirmTarget("inject")}
            >
              {injectPending ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <FlaskConicalIcon className="size-4" />
              )}
              Injecter la démo
            </Button>
          ) : (
            // Organisation vide : injection directe (double soumission bloquée).
            <form
              action={injectFormAction}
              onSubmit={(event) => {
                if (pending) {
                  event.preventDefault();
                }
              }}
            >
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
          )}

          {/* Deletion guard : « Supprimer la démo » désactivé sans données. */}
          {hasData ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={resetDisabled}
              title={resetTitle}
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirmTarget("reset")}
            >
              {resetPending ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <RefreshCcwIcon className="size-4" />
              )}
              Supprimer la démo
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled
              title={resetTitle}
              className="text-destructive hover:text-destructive disabled:opacity-50"
            >
              <RefreshCcwIcon className="size-4" />
              Supprimer la démo
            </Button>
          )}

          {!isAdmin ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <AlertTriangleIcon className="size-3.5" />
              Réinitialisation réservée aux administrateurs
            </span>
          ) : null}

          {hasData ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <ShieldAlertIcon className="size-3.5" />
              Confirmation par mot-clé requise
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <ShieldAlertIcon className="size-3.5" />
              Aucune donnée à supprimer
            </span>
          )}
        </div>
      </div>

      {/* Modale « Écraser & injecter » — mot clé : CONFIRMER */}
      <Dialog
        open={confirmTarget === "inject"}
        onOpenChange={(open) => {
          if (!open) closeConfirm();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Écraser les données existantes ?</DialogTitle>
            <DialogDescription>
              Votre organisation contient déjà des données. Injecter le jeu de
              démonstration les <strong>remplacera définitivement</strong>.
              Tapez{" "}
              <span className="font-mono font-semibold">
                {OVERWRITE_CONFIRM_WORD}
              </span>{" "}
              pour confirmer l&apos;écrasement.
            </DialogDescription>
          </DialogHeader>

          <form action={injectFormAction} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="demo-inject-confirmation">
                Mot de confirmation
              </Label>
              <Input
                id="demo-inject-confirmation"
                name="confirmation"
                value={confirmWord}
                onChange={(event) => setConfirmWord(event.target.value)}
                placeholder={OVERWRITE_CONFIRM_WORD}
                autoFocus
                className="font-mono uppercase"
              />
            </div>

            {injectState.message && injectState.status === "error" ? (
              <p
                role="alert"
                className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {injectState.message}
              </p>
            ) : null}

            <DialogFooter>
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="outline"
                  disabled={injectPending}
                >
                  Annuler
                </Button>
              </DialogClose>
              <Button
                type="submit"
                disabled={!confirmValid || injectPending}
                className="bg-indigo-600 text-white hover:bg-indigo-700"
              >
                {injectPending ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <FlaskConicalIcon className="size-4" />
                )}
                Écraser et injecter la démo
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modale « Suppression définitive » — mot clé : SUPPRIMER */}
      <Dialog
        open={confirmTarget === "reset"}
        onOpenChange={(open) => {
          if (!open) closeConfirm();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Supprimer toutes les données ?</DialogTitle>
            <DialogDescription>
              Élèves, cours, sessions, paiements, ventes, présences, dossiers
              voyage… <strong>toutes</strong> les données de l&apos;organisation
              seront définitivement supprimées (compte administrateur conservé).
              Tapez{" "}
              <span className="font-mono font-semibold">
                {DELETE_CONFIRM_WORD}
              </span>{" "}
              pour confirmer.
            </DialogDescription>
          </DialogHeader>

          <form action={resetFormAction} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="demo-delete-confirmation">
                Mot de confirmation
              </Label>
              <Input
                id="demo-delete-confirmation"
                name="confirmation"
                value={confirmWord}
                onChange={(event) => setConfirmWord(event.target.value)}
                placeholder={DELETE_CONFIRM_WORD}
                autoFocus
                className="font-mono uppercase"
              />
            </div>

            {resetState.message && resetState.status === "error" ? (
              <p
                role="alert"
                className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {resetState.message}
              </p>
            ) : null}

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={resetPending}>
                  Annuler
                </Button>
              </DialogClose>
              <Button
                type="submit"
                variant="destructive"
                disabled={!confirmValid || resetPending || !isAdmin}
              >
                {resetPending ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <RefreshCcwIcon className="size-4" />
                )}
                Supprimer définitivement
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

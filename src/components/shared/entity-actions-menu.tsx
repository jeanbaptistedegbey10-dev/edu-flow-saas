"use client";

import * as React from "react";
import { Loader2Icon, PencilIcon, Trash2Icon } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Contrat minimal du résultat renvoyé par une action serveur de suppression. */
export type DeleteActionResult = { ok: boolean; message?: string };

/**
 * Actions réutilisables (tableaux & cartes Kanban) affichées directement
 * côte à côte — aucun menu contextuel caché :
 * - « ✏️ Modifier » (variante outline) ouvre une modale d'édition pré-remplie
 *   via `onEdit` ;
 * - « 🗑️ Supprimer » (variante destructive rouge) demande une confirmation via
 *   `AlertDialog` avant d'appeler l'action serveur `onDelete`.
 *
 * Le composant est autonome : il gère l'état de confirmation, le pending et
 * l'affichage des erreurs retournées par l'action serveur.
 */
export function EntityActionsMenu({
  entityName,
  onEdit,
  onDelete,
  size = "sm",
}: {
  /** Nom lisible de l'entité (utilisé dans les libellés et la confirmation). */
  entityName: string;
  /** Ouvre la modale d'édition pré-remplie côté vue parente. */
  onEdit: () => void;
  /** Action serveur de suppression (vérification multi-tenant incluse). */
  onDelete: () => Promise<DeleteActionResult>;
  /** Taille des boutons (« xs » pour les cartes compactes, « sm » par défaut). */
  size?: "xs" | "sm";
}) {
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const handleConfirmDelete = () => {
    setErrorMessage(null);

    startTransition(async () => {
      const result = await onDelete();

      if (!result.ok) {
        setErrorMessage(
          result.message ??
            "Une erreur est survenue lors de la suppression."
        );
        return;
      }

      setConfirmOpen(false);
    });
  };

  return (
    <>
      <div
        role="group"
        aria-label={`Actions pour ${entityName}`}
        className="flex items-center justify-end gap-1.5"
      >
        <Button
          type="button"
          variant="outline"
          size={size}
          onClick={onEdit}
          title="Modifier"
        >
          <PencilIcon data-icon="inline-start" />
          Modifier
        </Button>

        <Button
          type="button"
          variant="destructive"
          size={size}
          onClick={() => {
            setErrorMessage(null);
            setConfirmOpen(true);
          }}
          title="Supprimer"
        >
          <Trash2Icon data-icon="inline-start" />
          Supprimer
        </Button>
      </div>

      {/* Confirmation de suppression */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. «&nbsp;{entityName}&nbsp;» sera
              définitivement supprimé, ainsi que les données associées.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {errorMessage ? (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {errorMessage}
            </p>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className={cn(buttonVariants({ variant: "destructive" }))}
              disabled={isPending}
              onClick={(event) => {
                // Empêche la fermeture automatique : la modale ne se ferme
                // qu'une fois la suppression confirmée par le serveur.
                event.preventDefault();
                handleConfirmDelete();
              }}
            >
              {isPending ? (
                <Loader2Icon data-icon="inline-start" className="animate-spin" />
              ) : (
                <Trash2Icon data-icon="inline-start" />
              )}
              {isPending ? "Suppression..." : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
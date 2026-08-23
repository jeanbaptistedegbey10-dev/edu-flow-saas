"use client";

import * as React from "react";
import {
  EllipsisVerticalIcon,
  Loader2Icon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/** Contrat minimal du résultat renvoyé par une action serveur de suppression. */
export type DeleteActionResult = { ok: boolean; message?: string };

/**
 * Menu d'actions réutilisable (tableaux & cartes Kanban) :
 * - « Modifier » ouvre une modale d'édition pré-remplie via `onEdit` ;
 * - « Supprimer » demande une confirmation via `AlertDialog` avant d'appeler
 *   l'action serveur `onDelete`.
 *
 * Le composant est autonome : il gère l'état de confirmation, le pending et
 * l'affichage des erreurs retournées par l'action serveur.
 */
export function EntityActionsMenu({
  entityName,
  onEdit,
  onDelete,
}: {
  /** Nom lisible de l'entité (utilisé dans les libellés et la confirmation). */
  entityName: string;
  /** Ouvre la modale d'édition pré-remplie côté vue parente. */
  onEdit: () => void;
  /** Action serveur de suppression (vérification multi-tenant incluse). */
  onDelete: () => Promise<DeleteActionResult>;
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions pour ${entityName}`}
            title="Actions"
          >
            <EllipsisVerticalIcon />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={onEdit}>
            <PencilIcon />
            Modifier
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            variant="destructive"
            onSelect={() => {
              setErrorMessage(null);
              setConfirmOpen(true);
            }}
          >
            <Trash2Icon />
            Supprimer
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Confirmation de suppression (rendu hors du menu pour éviter tout
          conflit de focus entre Radix DropdownMenu et AlertDialog). */}
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
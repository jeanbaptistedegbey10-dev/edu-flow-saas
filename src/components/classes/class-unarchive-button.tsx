"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArchiveRestoreIcon, Loader2Icon } from "lucide-react";

import { unarchiveClassAction } from "@/actions/classes";
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
import { Button } from "@/components/ui/button";
import { ToastNotification } from "@/components/ui/toast";
import { canUnarchiveClass } from "@/lib/class-status";
import { cn } from "@/lib/utils";
import type { ClassStatus } from "@prisma/client";

/**
 * Action inverse de l'archivage : « Désarchiver / Réactiver la classe ».
 *
 * Affichée sur les cartes de l'onglet « Archives » (statut ARCHIVED) et
 * RÉSERVÉE AUX RÔLES AUTORISÉS (ADMIN / SUPER_ADMIN — cf.
 * `canManageClassLifecycle`) : le composant ne rend RIEN pour les autres
 * silhouettes, exactement comme `ClassArchiveButton`, et `unarchiveClassAction`
 * refuse l'appel côté serveur.
 *
 * Effet métier : la classe repasse au statut ACTIVE, réintègre l'onglet
 * « Classes Actives » et redevient exploitable — ajout d'élèves/membres,
 * saisie ou correction des présences, des cahiers de texte et des évaluations.
 * Son historique (inscriptions, notes, certificats) est conservé tel quel :
 * le désarchivage ne modifie aucune donnée pédagogique.
 */
export function ClassUnarchiveButton({
  classId,
  className,
  status,
  canManageLifecycle = false,
  onUnarchived,
  wrapperClassName = "flex flex-col gap-1.5",
}: {
  classId: string;
  /** Nom de la classe (libellés de la confirmation). */
  className: string;
  status: ClassStatus;
  /** Actes de gestion : voir `canManageClassLifecycle` (src/lib/role.ts). */
  canManageLifecycle?: boolean;
  /** Rappelé après désarchivage réussi (rafraîchissement de la vue parente). */
  onUnarchived?: () => void;
  /** Classes utilitaires du conteneur (positionnement dans la carte). */
  wrapperClassName?: string;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);

  const closeToast = React.useCallback(() => setToast(null), []);

  // Un enseignant (ou toute autre silhouette non administrative) ne voit pas
  // l'action : le serveur la refuse de la même façon.
  if (!canManageLifecycle || !canUnarchiveClass(status)) return null;

  const handleConfirm = async () => {
    if (pending) return;
    setPending(true);

    try {
      const result = await unarchiveClassAction(classId);

      setToast(
        result.ok
          ? (result.message ??
            `Classe « ${className} » désarchivée : elle est de nouveau exploitable.`)
          : (result.message ?? "Impossible de désarchiver cette classe.")
      );

      if (result.ok) {
        setConfirmOpen(false);
        onUnarchived?.();
        router.refresh();
      }
    } catch {
      setToast("Erreur réseau : impossible de désarchiver la classe pour le moment.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={cn(wrapperClassName)}>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setConfirmOpen(true)}
        disabled={pending}
        className="w-full"
        title="Désarchiver la classe (réactivation)"
      >
        {pending ? (
          <Loader2Icon data-icon="inline-start" className="animate-spin" />
        ) : (
          <ArchiveRestoreIcon data-icon="inline-start" />
        )}
        Désarchiver la classe
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Désarchiver la classe ?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  La classe «&nbsp;{className}&nbsp;» repasse au statut
                  «&nbsp;Active&nbsp;» et quitte l&apos;onglet
                  «&nbsp;Archives&nbsp;».
                </p>
                <p>Les editions sont à nouveau autorisées :</p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>ajout d&apos;élèves / membres dans la classe ;</li>
                  <li>saisie et correction des présences ;</li>
                  <li>saisie et correction du cahier de texte ;</li>
                  <li>création d&apos;évaluations et saisie des notes.</li>
                </ul>
                <p className="text-xs text-muted-foreground">
                  Son historique (inscriptions, notes, certificats) est conservé
                  tel quel.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(event) => {
                // Empêche la fermeture automatique : la modale ne se ferme
                // qu'une fois le désarchivage confirmé par le serveur.
                event.preventDefault();
                void handleConfirm();
              }}
            >
              {pending ? (
                <Loader2Icon data-icon="inline-start" className="animate-spin" />
              ) : (
                <ArchiveRestoreIcon data-icon="inline-start" />
              )}
              {pending ? "Désarchivage..." : "Désarchiver la classe"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ToastNotification
        message={toast}
        onClose={closeToast}
        tone={
          toast?.includes("Impossible") || toast?.includes("Erreur") ? "error" : "success"
        }
      />
    </div>
  );
}

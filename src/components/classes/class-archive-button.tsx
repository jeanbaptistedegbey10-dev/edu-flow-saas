"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangleIcon,
  ArchiveIcon,
  CheckCircle2Icon,
  Loader2Icon,
} from "lucide-react";

import { archiveClassAction } from "@/actions/classes";
import {
  getClassClosureReadiness,
  type ClosureMissingRequirement,
} from "@/actions/class-closure";
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
import { canArchiveClass } from "@/lib/class-status";
import type { ClassStatus } from "@prisma/client";

/**
 * Action de fin de vie « Archiver la classe » affichée sur la carte d'une
 * classe CLÔTURÉE (COMPLETED) — l'archivage n'a de sens qu'une fois les
 * décisions de passage actées.
 *
 * Le composant ne rend RIEN pour les autres statuts (`canArchiveClass`) : la
 * règle de visibilité est donc portée par le domaine (`src/lib/class-status.ts`)
 * et non par la vue. L'appel à `archiveClassAction` revalide le statut côté
 * serveur : une classe archivée reste consultable en LECTURE SEULE dans
 * l'onglet « Archives » de la liste, mais est exclue des sélecteurs
 * opérationnels (émargement, cahier de texte, évaluations).
 *
 * GARDE-FOU DE PRÉREQUIS : un clic n'ouvre PAS la confirmation tant que les 3
 * prérequis pédagogiques ne sont pas réunis (présences émargées, cahier de
 * texte rempli, évaluations créées et intégralement notées). Sinon, une alerte
 * bloque l'action et liste explicitement ce qui manque. Le même contrôle est
 * réappliqué par `archiveClassAction` : ce garde-fou client est une aide à
 * l'utilisateur, pas la seule barrière de sécurité.
 */
export function ClassArchiveButton({
  classId,
  className,
  status,
  canManageLifecycle = false,
  onArchived,
}: {
  classId: string;
  /** Nom de la classe (libellés de la confirmation). */
  className: string;
  status: ClassStatus;
  /** Actes de gestion : voir `canManageClassLifecycle` (src/lib/role.ts). */
  canManageLifecycle?: boolean;
  /** Rappelé après archivage réussi (rafraîchissement de la vue parente). */
  onArchived?: () => void;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [checking, setChecking] = React.useState(false);
  const [blockedOpen, setBlockedOpen] = React.useState(false);
  const [missing, setMissing] = React.useState<ClosureMissingRequirement[]>([]);
  const [pending, setPending] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);

  const closeToast = React.useCallback(() => setToast(null), []);

  // Un enseignant (ou toute autre silhouette non administrative) ne voit pas
  // l'action : le serveur la refuse de la même façon.
  if (!canManageLifecycle || !canArchiveClass(status)) return null;

  /**
   * Vérifie les 3 prérequis pédagogiques AVANT d'ouvrir la confirmation : un
   * clic sur une classe incomplète affiche l'alerte « Archivage impossible »
   * (liste des éléments manquants) au lieu de tenter l'archivage.
   */
  const handleRequestArchive = async () => {
    if (checking || pending) return;
    setChecking(true);

    try {
      const readiness = await getClassClosureReadiness(classId);

      if (!readiness.ok) {
        setToast(readiness.message);
        return;
      }

      if (!readiness.canClose) {
        setMissing(readiness.missingRequirements);
        setBlockedOpen(true);
        return;
      }

      setConfirmOpen(true);
    } catch {
      setToast(
        "Impossible de vérifier les prérequis d'archivage pour le moment."
      );
    } finally {
      setChecking(false);
    }
  };

  const handleConfirm = async () => {
    if (pending) return;
    setPending(true);

    try {
      const result = await archiveClassAction(classId);

      if (result.ok) {
        setToast(
          result.message ??
            `Classe « ${className} » archivée : elle reste consultable en lecture seule dans l'onglet « Archives ».`
        );
        setConfirmOpen(false);
        onArchived?.();
        router.refresh();
        return;
      }

      // Garde-fou serveur : si l'archivage est refusé pour prérequis
      // manquants, on affiche la même alerte bloquante plutôt qu'un toast.
      if (result.missingRequirements && result.missingRequirements.length > 0) {
        setMissing(result.missingRequirements);
        setConfirmOpen(false);
        setBlockedOpen(true);
        return;
      }

      setToast(result.message ?? "Impossible d'archiver cette classe.");
    } catch {
      setToast("Erreur réseau : impossible d'archiver la classe pour le moment.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => void handleRequestArchive()}
        disabled={pending || checking}
        className="w-full"
        title="Archiver la classe (lecture seule)"
      >
        {pending || checking ? (
          <Loader2Icon data-icon="inline-start" className="animate-spin" />
        ) : (
          <ArchiveIcon data-icon="inline-start" />
        )}
        {checking ? "Vérification..." : "Archiver la classe"}
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archiver la classe ?</AlertDialogTitle>
            <AlertDialogDescription>
              La classe «&nbsp;{className}&nbsp;» passera au statut
              «&nbsp;Archivée&nbsp;». Son historique (inscriptions, notes,
              certificats) est conservé et reste consultable en lecture seule
              dans l&apos;onglet «&nbsp;Archives&nbsp;», mais elle ne sera plus
              proposée à l&apos;émargement, au cahier de texte ni à la saisie de
              notes.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(event) => {
                // Empêche la fermeture automatique : la modale ne se ferme
                // qu'une fois l'archivage confirmé par le serveur.
                event.preventDefault();
                void handleConfirm();
              }}
            >
              {pending ? (
                <Loader2Icon data-icon="inline-start" className="animate-spin" />
              ) : (
                <ArchiveIcon data-icon="inline-start" />
              )}
              {pending ? "Archivage..." : "Archiver la classe"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Garde-fou : archivage impossible — la liste des prérequis manquants
          est affichée explicitement, l'archivage reste bloqué. */}
      <AlertDialog open={blockedOpen} onOpenChange={setBlockedOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangleIcon className="size-5 text-amber-600" />
              Archivage impossible — prérequis manquants
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  La classe « {className} » ne peut pas être archivée tant que
                  les éléments suivants ne sont pas complétés :
                </p>
                <ul className="list-disc space-y-1.5 pl-5">
                  {missing.map((requirement) => (
                    <li key={requirement.key}>{requirement.label}</li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>
              <CheckCircle2Icon data-icon="inline-start" />
              J&apos;ai compris
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ToastNotification
        message={toast}
        onClose={closeToast}
        tone={toast?.includes("Impossible") || toast?.includes("Erreur") ? "error" : "success"}
      />
    </div>
  );
}

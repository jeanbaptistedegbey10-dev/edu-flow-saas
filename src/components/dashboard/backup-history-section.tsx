"use client";

import * as React from "react";
import {
  AlertTriangleIcon,
  DatabaseBackupIcon,
  HistoryIcon,
  Loader2Icon,
  RotateCcwIcon,
  SaveIcon,
  Trash2Icon,
} from "lucide-react";

import {
  createOrganizationBackupAction,
  deleteOrganizationBackupAction,
  restoreOrganizationBackupAction,
} from "@/lib/actions/organization-backup";
import { Badge } from "@/components/ui/badge";
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
import { ToastNotification } from "@/components/ui/toast";
import {
  BACKUP_REASON_LABELS,
  RESTORE_CONFIRM_WORD,
  type BackupReason,
  type OrganizationBackupDTO,
} from "@/lib/demo-data-constants";

// ---------------------------------------------------------------------------
// « Historique des sauvegardes » — restauration après suppression
// ---------------------------------------------------------------------------
// Chaque suppression (purge de démo ou réinitialisation) déclenche une
// sauvegarde automatique AVANT la purge (cf. `src/lib/organization-backup.ts`).
// Ce composant affiche l'historique et permet de restaurer un snapshot.
//
// DOUBLE CONFIRMATION : cliquer sur « Restaurer » ouvre une modale exigeant la
// saisie du mot-clé `RESTAURER` — même type de barrière que « SUPPRIMER »
// côté suppression, mais volontairement un mot DIFFÉRENT pour éviter toute
// confusion entre les deux opérations irréversibles. La vérification est
// rejouée côté serveur (une saisie côté client ne suffit jamais).
// ---------------------------------------------------------------------------

/** Formatage de date stable (locale + fuseau figés) : pas d'écart d'hydratation. */
const DATE_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

/** Formate une date ISO pour l'affichage dans l'historique. */
function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return DATE_FORMATTER.format(date);
}

/** Libellé lisible du motif de sauvegarde. */
function reasonLabel(reason: string): string {
  return BACKUP_REASON_LABELS[reason as BackupReason] ?? reason;
}

export type BackupHistoryProps = {
  /** Sauvegardes à afficher (chargées côté serveur). */
  backups: OrganizationBackupDTO[];
  /** L'utilisateur courant est administrateur (droits de restauration). */
  isAdmin: boolean;
  /** L'organisation contient-elle des données actuellement en base ? */
  hasData: boolean;
};

export function BackupHistory({
  backups,
  isAdmin,
  hasData,
}: BackupHistoryProps) {
  const [items, setItems] = React.useState<OrganizationBackupDTO[]>(backups);

  // L'historique est resynchronisé à chaque rendu serveur du tableau de bord.
  React.useEffect(() => {
    setItems(backups);
  }, [backups]);

  const [toast, setToast] = React.useState<string | null>(null);
  const [toastTone, setToastTone] = React.useState<"success" | "error">(
    "success"
  );

  // Sauvegarde en cours (création manuelle ou suppression d'un snapshot).
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [manualPending, setManualPending] = React.useState(false);

  // Modale de restauration + double confirmation.
  const [target, setTarget] = React.useState<OrganizationBackupDTO | null>(null);
  const [confirmWord, setConfirmWord] = React.useState("");
  const [restorePending, setRestorePending] = React.useState(false);

  const showToast = React.useCallback(
    (message: string, tone: "success" | "error" = "success") => {
      setToastTone(tone);
      setToast(message);
    },
    []
  );

  const closeDialog = React.useCallback(() => {
    setTarget(null);
    setConfirmWord("");
  }, []);

  const openRestore = (backup: OrganizationBackupDTO) => {
    setConfirmWord("");
    setTarget(backup);
  };

  const confirmValid = confirmWord.trim().toUpperCase() === RESTORE_CONFIRM_WORD;

  /** Restaure le snapshot sélectionné après double confirmation. */
  const handleRestore = async () => {
    if (!target || !confirmValid || restorePending) return;

    setRestorePending(true);
    try {
      // La confirmation mot-clé est transmise et REJOUÉE côté serveur.
      const formData = new FormData();
      formData.set("confirmation", confirmWord.trim().toUpperCase());

      const result = await restoreOrganizationBackupAction(target.id, formData);

      if (result.status === "success") {
        if (result.backups) setItems(result.backups);
        showToast(result.message ?? "Restauration terminée.");
        closeDialog();
        // Recharge la page : toutes les listes du tableau de bord dérivent des
        // données restaurées.
        window.setTimeout(() => window.location.reload(), 1200);
      } else {
        showToast(result.message ?? "La restauration a échoué.", "error");
      }
    } catch {
      showToast(
        "Erreur réseau : impossible de restaurer pour le moment.",
        "error"
      );
    } finally {
      setRestorePending(false);
    }
  };

  /** Crée une sauvegarde manuelle de l'état courant. */
  const handleManualBackup = async () => {
    if (manualPending) return;
    setManualPending(true);
    try {
      const result = await createOrganizationBackupAction();
      if (result.status === "success") {
        if (result.backups) setItems(result.backups);
        showToast(result.message ?? "Sauvegarde créée.");
      } else {
        showToast(result.message ?? "La sauvegarde a échoué.", "error");
      }
    } catch {
      showToast(
        "Erreur réseau : impossible de sauvegarder pour le moment.",
        "error"
      );
    } finally {
      setManualPending(false);
    }
  };

  /** Supprime une sauvegarde de l'historique (jamais une donnée métier). */
  const handleDelete = async (backupId: string) => {
    if (busyId) return;
    setBusyId(backupId);
    try {
      const result = await deleteOrganizationBackupAction(backupId);
      if (result.status === "success") {
        if (result.backups) setItems(result.backups);
        showToast(result.message ?? "Sauvegarde supprimée.");
      } else {
        showToast(result.message ?? "La suppression a échoué.", "error");
      }
    } catch {
      showToast("Erreur réseau : impossible de supprimer la sauvegarde.", "error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mt-4 grid gap-3 rounded-lg border bg-muted/30 p-4 transition-all duration-200 hover:border-primary/30 hover:shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <HistoryIcon className="size-4 text-violet-600 dark:text-violet-400" />
          <h3 className="text-sm font-semibold">Historique des sauvegardes</h3>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!isAdmin || manualPending}
          onClick={handleManualBackup}
          title={
            isAdmin
              ? "Sauvegarder maintenant l'état actuel de l'organisation"
              : "Réservé aux administrateurs"
          }
        >
          {manualPending ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <SaveIcon className="size-4" />
          )}
          Sauvegarder maintenant
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Une sauvegarde automatique est créée{" "}
        <strong>avant chaque suppression</strong> de données (purge de démo ou
        réinitialisation). Vous pouvez y revenir à tout moment depuis cette
        liste.
      </p>

      {items.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
          Aucune sauvegarde pour le moment. La prochaine suppression en créera
          automatiquement une.
        </p>
      ) : (
        <ul className="grid gap-2">
          {items.map((backup) => (
            <li
              key={backup.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <DatabaseBackupIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm font-medium">
                    {backup.backupName}
                  </span>
                  {backup.isExpired ? (
                    <Badge variant="destructive">Expirée</Badge>
                  ) : backup.isExpiringSoon ? (
                    <Badge
                      variant="outline"
                      className="border-amber-300 text-amber-700 dark:border-amber-500/40 dark:text-amber-400"
                    >
                      Expire bientôt
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Créée le {formatDate(backup.createdAt)} · Expire le{" "}
                  {formatDate(backup.expiresAt)} (
                  {backup.isExpired
                    ? "expirée"
                    : `${backup.daysUntilExpiry} jour(s)`}
                  ) · {backup.rowCount} enregistrement(s) · {backup.sizeLabel} ·{" "}
                  {reasonLabel(backup.reason)}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={!isAdmin || backup.isExpired || busyId !== null}
                  onClick={() => openRestore(backup)}
                  title={
                    !isAdmin
                      ? "Réservé aux administrateurs"
                      : backup.isExpired
                        ? "Cette sauvegarde a expiré"
                        : hasData
                          ? "Restaurer : les données actuelles seront remplacées"
                          : "Restaurer cet état"
                  }
                >
                  <RotateCcwIcon className="size-4" />
                  Restaurer
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={!isAdmin || busyId !== null}
                  onClick={() => handleDelete(backup.id)}
                  aria-label={`Supprimer la sauvegarde ${backup.backupName}`}
                  className="text-destructive hover:text-destructive"
                >
                  {busyId === backup.id ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <Trash2Icon className="size-4" />
                  )}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* ----------------------------------------------------------------
          Modale de restauration — mot-clé : RESTAURER.
          Rappel : l'état actuel est automatiquement sauvegardé avant
          écrasement (motif « avant restauration »), l'opération est donc
          réversible.
      ---------------------------------------------------------------- */}
      <Dialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open && !restorePending) closeDialog();
        }}
      >
        <DialogContent
          className="sm:max-w-md"
          showCloseButton={!restorePending}
          onEscapeKeyDown={(event) => {
            if (restorePending) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (restorePending) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>Restaurer cette sauvegarde ?</DialogTitle>
            <DialogDescription>
              L&apos;organisation sera replacée dans l&apos;état exact de la
              sauvegarde du{" "}
              <strong>{target ? formatDate(target.createdAt) : ""}</strong> (
              {target?.rowCount ?? 0} enregistrement(s)).
              {hasData ? (
                <>
                  {" "}
                  <strong>
                    Les données actuelles seront remplacées.
                  </strong>{" "}
                  Une sauvegarde de sécurité de l&apos;état actuel est créée
                  automatiquement avant l&apos;écrasement.
                </>
              ) : (
                " Aucune donnée ne sera perdue."
              )}{" "}
              Tapez{" "}
              <span className="font-mono font-semibold">
                {RESTORE_CONFIRM_WORD}
              </span>{" "}
              pour confirmer.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="backup-restore-confirmation">
              Mot de confirmation
            </Label>
            <Input
              id="backup-restore-confirmation"
              name="confirmation"
              value={confirmWord}
              onChange={(event) => setConfirmWord(event.target.value)}
              placeholder={RESTORE_CONFIRM_WORD}
              autoFocus
              className="font-mono uppercase"
            />
          </div>

          <p className="flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
            <span>
              La restauration remplace les élèves, cours, présences, paiements
              et ventes par ceux de la sauvegarde.
            </span>
          </p>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={restorePending}>
                Annuler
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={handleRestore}
              disabled={!confirmValid || restorePending}
            >
              {restorePending ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <RotateCcwIcon className="size-4" />
              )}
              Restaurer maintenant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ToastNotification
        message={toast}
        tone={toastTone}
        duration={5000}
        onClose={() => setToast(null)}
      />
    </div>
  );
}

"use client";

import * as React from "react";
import {
  ClipboardCheckIcon,
  FilePenIcon,
  LayersIcon,
  Loader2Icon,
  NotebookPenIcon,
  Trash2Icon,
} from "lucide-react";

import {
  deleteEvaluationAction,
  getEvaluationsForClass,
  type EvaluationDTO,
} from "@/actions/evaluations";
import type { TeacherClassDTO } from "@/actions/attendance";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CreateEvaluationDialog } from "@/components/evaluations/create-evaluation-dialog";
import { GradeSheet } from "@/components/evaluations/grade-sheet";

// Formatage déterministe (locale + fuseau fixes) pour éviter tout écart
// d'hydratation entre le rendu serveur et le rendu client.
const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function EvaluationsView({
  classes,
}: {
  /** Classes accessibles à l'utilisateur connecté (enseignant : ses classes). */
  classes: TeacherClassDTO[];
}) {
  const [selectedClassId, setSelectedClassId] = React.useState<string>(
    classes[0]?.id ?? ""
  );
  const [evaluations, setEvaluations] = React.useState<EvaluationDTO[]>([]);
  const [loading, setLoading] = React.useState(false);
  // Incrémenté pour forcer le rechargement de la liste après une création.
  const [reloadKey, setReloadKey] = React.useState(0);
  // Session dont la grille de notes est ouverte (vue plein écran).
  const [activeEvaluationId, setActiveEvaluationId] =
    React.useState<string | null>(null);
  // Session en attente de confirmation de suppression.
  const [pendingDelete, setPendingDelete] =
    React.useState<EvaluationDTO | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const hasClasses = classes.length > 0;
  const selectedClass = classes.find((klass) => klass.id === selectedClassId);

  // Charge les sessions d'évaluation de la classe sélectionnée.
  React.useEffect(() => {
    if (!selectedClassId) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);

      try {
        const data = await getEvaluationsForClass(selectedClassId);
        if (!cancelled) setEvaluations(data);
      } catch {
        if (!cancelled) setEvaluations([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [selectedClassId, reloadKey]);

  /** Supprime la session en attente après confirmation. */
  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;

    setDeleting(true);

    try {
      const result = await deleteEvaluationAction(pendingDelete.id);

      if (result.ok) {
        setPendingDelete(null);
        setReloadKey((key) => key + 1);
      }
    } catch {
      // Silencieux : la liste est rechargée au retour.
    } finally {
      setDeleting(false);
    }
  };

  if (!hasClasses) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Évaluations & Examens
          </h2>
          <p className="text-sm text-muted-foreground">
            Aucune classe ne vous est actuellement assignée.
          </p>
        </div>

        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <LayersIcon className="size-6 text-muted-foreground" />
          </div>
          <p className="font-medium">Aucune classe assignée</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Contactez l’administration de votre centre pour qu’une
            classe vous soit attribuée.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
      {/* En-tête de page */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Évaluations & Examens
          </h2>
          <p className="text-sm text-muted-foreground">
            Créez vos sessions d’examen internes et saisissez les notes
            par étudiant et par module.
          </p>
        </div>

        <CreateEvaluationDialog
          classes={classes}
          defaultClassId={selectedClassId}
          onCreated={() => setReloadKey((key) => key + 1)}
        />
      </div>

      {activeEvaluationId ? (
        /* Grille de saisie des notes de la session active */
        <GradeSheet
          evaluationId={activeEvaluationId}
          onBack={() => {
            setActiveEvaluationId(null);
            setReloadKey((key) => key + 1);
          }}
        />
      ) : (
        <>
          {/* Barre de sélection de classe */}
          <div className="grid gap-3 rounded-xl border border-slate-200/80 bg-card p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4 dark:border-slate-800">
            <div className="grid gap-2 lg:col-span-3">
              <Label htmlFor="evaluation-class-select">Classe / Cohorte</Label>
              <Select
                value={selectedClassId}
                onValueChange={setSelectedClassId}
              >
                <SelectTrigger id="evaluation-class-select" className="w-full">
                  <SelectValue placeholder="Sélectionner une classe" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((klass) => (
                    <SelectItem key={klass.id} value={klass.id}>
                      {klass.name} · {klass.schedule} ({klass.courseCode})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedClass ? (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ClipboardCheckIcon className="size-3.5 shrink-0" />
                  Cours : {selectedClass.courseTitle} ·{" "}
                  {selectedClass.studentCount} étudiant
                  {selectedClass.studentCount > 1 ? "s" : ""}
                </p>
              ) : null}
            </div>
          </div>

          {/* Liste des sessions d'évaluation */}
          <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-card shadow-sm dark:border-slate-800">
            <div className="border-b px-4 py-3">
              <h3 className="text-sm font-semibold">
                Sessions d’évaluation
              </h3>
              <p className="text-xs text-muted-foreground">
                {loading
                  ? "Chargement..."
                  : `${evaluations.length} session${evaluations.length > 1 ? "s" : ""} pour cette classe`}
              </p>
            </div>

            {!loading && evaluations.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                  <NotebookPenIcon className="size-6 text-muted-foreground" />
                </div>
                <p className="font-medium">Aucune session d’évaluation</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Créez votre première session d’examen interne avec le
                  bouton « Nouvelle session d’évaluation ».
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Examen</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Modules évalués</TableHead>
                    <TableHead>Notes saisies</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <span className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                          <Loader2Icon className="size-4 animate-spin" />
                          Chargement des sessions...
                        </span>
                      </TableCell>
                    </TableRow>
                  ) : (
                    evaluations.map((evaluation) => (
                      <TableRow key={evaluation.id}>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium">
                              {evaluation.title}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {evaluation.className} · {evaluation.courseTitle}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {dateFormatter.format(evaluation.date)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {evaluation.modules.map((module) => (
                              <span
                                key={module.id}
                                className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium"
                                title={`Barème /${module.maxScore} · seuil ${module.passingScore}`}
                              >
                                {module.name}
                              </span>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">
                          {evaluation.gradeCount}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setActiveEvaluationId(evaluation.id)
                              }
                            >
                              <FilePenIcon data-icon="inline-start" />
                              Saisir les notes
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Supprimer ${evaluation.title}`}
                              onClick={() => setPendingDelete(evaluation)}
                            >
                              <Trash2Icon className="size-4 text-muted-foreground" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </div>
        </>
      )}

      {/* Confirmation de suppression */}
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette session ?</AlertDialogTitle>
            <AlertDialogDescription>
              La session « {pendingDelete?.title} » et toutes les notes déjà
              saisies seront définitivement supprimées. Cette action est
              irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                handleConfirmDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? (
                <Loader2Icon data-icon="inline-start" className="animate-spin" />
              ) : (
                <Trash2Icon data-icon="inline-start" />
              )}
              {deleting ? "Suppression..." : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
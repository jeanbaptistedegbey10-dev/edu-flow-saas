"use client";

import * as React from "react";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  Loader2Icon,
  SaveIcon,
  TriangleAlertIcon,
} from "lucide-react";

import {
  getGradeSheet,
  saveGradesAction,
  type GradeSheetDTO,
} from "@/actions/evaluations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

// Formatage déterministe (locale + fuseau fixes) pour éviter tout écart
// d'hydratation entre le rendu serveur et le rendu client.
const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const numberFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 1,
});

/** Notes en cours de saisie : scores[studentId][moduleId] = valeur texte. */
type ScoreDrafts = Record<string, Record<string, string>>;

export function GradeSheet({
  evaluationId,
  onBack,
}: {
  evaluationId: string;
  /** Retour à la liste des sessions d'évaluation. */
  onBack: () => void;
}) {
  const [sheet, setSheet] = React.useState<GradeSheetDTO | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState(false);
  const [drafts, setDrafts] = React.useState<ScoreDrafts>({});
  const [saving, setSaving] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  // Charge la grille complète (session + modules + étudiants + notes).
  React.useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setLoadError(false);
      setFeedback(null);

      try {
        const data = await getGradeSheet(evaluationId);

        if (cancelled) return;

        setSheet(data);
        setDrafts(
          Object.fromEntries(
            data.students.map((student) => [
              student.studentId,
              Object.fromEntries(
                data.evaluation.modules.map((moduleItem) => [
                  moduleItem.id,
                  student.grades[moduleItem.id] !== undefined
                    ? String(student.grades[moduleItem.id])
                    : "",
                ])
              ),
            ])
          )
        );
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [evaluationId]);

  /** Met à jour la valeur d'une cellule dans l'état local. */
  const handleScoreChange = (
    studentId: string,
    moduleId: string,
    value: string
  ) => {
    setDrafts((previous) => ({
      ...previous,
      [studentId]: { ...(previous[studentId] ?? {}), [moduleId]: value },
    }));
  };

  /**
   * Statistiques live : moyenne /100 par étudiant et nombre de notes sous le
   * seuil de validation (alerte visuelle automatique).
   */
  const statsByStudent = React.useMemo(() => {
    if (!sheet) {
      return new Map<string, { average: number | null; failing: number }>();
    }

    return new Map(
      sheet.students.map((student) => {
        const draftsRow = drafts[student.studentId] ?? {};

        let totalScore = 0;
        let totalMax = 0;
        let failing = 0;

        for (const moduleItem of sheet.evaluation.modules) {
          const raw = (draftsRow[moduleItem.id] ?? "").trim();
          if (raw === "") continue;

          const value = Number(raw.replace(",", "."));
          if (!Number.isFinite(value)) continue;

          totalScore += value;
          totalMax += moduleItem.maxScore;

          if (value < moduleItem.passingScore) {
            failing += 1;
          }
        }

        return [
          student.studentId,
          {
            average:
              totalMax > 0
                ? Math.round((totalScore / totalMax) * 1000) / 10
                : null,
            failing,
          },
        ];
      })
    );
  }, [sheet, drafts]);

  /** Nombre total de cellules sous le seuil (bandeau d'alerte global). */
  const totalFailing = React.useMemo(() => {
    let count = 0;

    for (const stat of statsByStudent.values()) {
      count += stat.failing;
    }

    return count;
  }, [statsByStudent]);

  /** Soumet la grille au serveur. */
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!sheet) return;

    setSaving(true);
    setFeedback(null);

    try {
      const formData = new FormData();
      formData.set("evaluationId", sheet.evaluation.id);

      for (const student of sheet.students) {
        const draftsRow = drafts[student.studentId] ?? {};

        for (const moduleItem of sheet.evaluation.modules) {
          formData.set(
            `score_${moduleItem.id}_${student.studentId}`,
            (draftsRow[moduleItem.id] ?? "").trim()
          );
        }
      }

      const result = await saveGradesAction(formData);

      if (result.ok) {
        setFeedback({
          kind: "success",
          message: result.message ?? "Notes enregistrées.",
        });
      } else {
        setFeedback({ kind: "error", message: result.message });
      }
    } catch {
      setFeedback({
        kind: "error",
        message:
          "Une erreur est survenue lors de l'enregistrement des notes.",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200/80 bg-card px-6 py-16 text-sm text-muted-foreground dark:border-slate-800">
        <Loader2Icon className="size-5 animate-spin" />
        Chargement de la grille de notes...
      </div>
    );
  }

  if (loadError || !sheet) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
        <TriangleAlertIcon className="size-6 text-muted-foreground" />
        <p className="font-medium">Impossible de charger la grille</p>
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeftIcon data-icon="inline-start" />
          Retour aux évaluations
        </Button>
      </div>
    );
  }

  const modules = sheet.evaluation.modules;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* En-tête de la session */}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200/80 bg-card p-4 shadow-sm dark:border-slate-800">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">
            {sheet.evaluation.title}
          </h3>
          <p className="text-sm text-muted-foreground">
            {sheet.evaluation.className} · {sheet.evaluation.courseTitle} ·{" "}
            {dateFormatter.format(sheet.evaluation.date)}
          </p>
        </div>

        <Button type="button" variant="outline" onClick={onBack}>
          <ArrowLeftIcon data-icon="inline-start" />
          Retour
        </Button>
      </div>

      {/* Alerte globale : notes sous le seuil */}
      {totalFailing > 0 ? (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
        >
          <AlertTriangleIcon className="size-4 shrink-0" />
          {totalFailing} note{totalFailing > 1 ? "s" : ""} sous le seuil de
          validation (mise en évidence en rouge).
        </p>
      ) : null}

      {/* Grille de saisie */}
      <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-card shadow-sm dark:border-slate-800">
        {sheet.students.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
            <p className="font-medium">Aucun étudiant dans cette classe</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Aucun étudiant n’est actuellement affecté à cette cohorte.
              Affectez des étudiants depuis la page « Étudiants ».
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="sticky left-0 z-10 bg-card min-w-[180px]">
                    Étudiant
                  </TableHead>
                  {modules.map((moduleItem) => (
                    <TableHead key={moduleItem.id} className="min-w-[110px]">
                      <span className="block font-medium">
                        {moduleItem.name}
                      </span>
                      <span className="block text-xs font-normal text-muted-foreground">
                        /{numberFormatter.format(moduleItem.maxScore)} · seuil{" "}
                        {numberFormatter.format(moduleItem.passingScore)}
                      </span>
                    </TableHead>
                  ))}
                  <TableHead className="min-w-[90px]">Moyenne /100</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sheet.students.map((student) => {
                  const draftsRow = drafts[student.studentId] ?? {};
                  const stats = statsByStudent.get(student.studentId);

                  return (
                    <TableRow key={student.studentId}>
                      <TableCell className="sticky left-0 z-10 bg-card">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium whitespace-nowrap">
                            {student.firstName} {student.lastName}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {student.studentCode}
                          </span>
                        </div>
                      </TableCell>

                      {modules.map((moduleItem) => {
                        const raw = (draftsRow[moduleItem.id] ?? "").trim();
                        const parsed = Number(raw.replace(",", "."));
                        const isBelowThreshold =
                          raw !== "" &&
                          Number.isFinite(parsed) &&
                          parsed < moduleItem.passingScore;

                        return (
                          <TableCell key={moduleItem.id}>
                            <Input
                              name={`score_${moduleItem.id}_${student.studentId}`}
                              type="number"
                              inputMode="decimal"
                              min="0"
                              max={moduleItem.maxScore}
                              step="any"
                              value={draftsRow[moduleItem.id] ?? ""}
                              onChange={(event) =>
                                handleScoreChange(
                                  student.studentId,
                                  moduleItem.id,
                                  event.target.value
                                )
                              }
                              aria-label={`Note de ${student.firstName} ${student.lastName} — ${moduleItem.name}`}
                              aria-invalid={isBelowThreshold}
                              className={cn(
                                "w-24 tabular-nums",
                                isBelowThreshold &&
                                  "border-red-500 text-red-600 focus-visible:ring-red-500/40 dark:text-red-400"
                              )}
                            />
                            {isBelowThreshold ? (
                              <span className="mt-1 flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                                <AlertTriangleIcon className="size-3 shrink-0" />
                                Sous le seuil
                              </span>
                            ) : null}
                          </TableCell>
                        );
                      })}

                      <TableCell className="tabular-nums font-semibold">
                        {stats?.average !== null &&
                        stats?.average !== undefined
                          ? numberFormatter.format(stats.average)
                          : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pied : retour + enregistrement */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4">
          {feedback ? (
            <p
              role="alert"
              className={cn(
                "rounded-md px-3 py-2 text-sm",
                feedback.kind === "success"
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                  : "bg-destructive/10 text-destructive"
              )}
            >
              {feedback.message}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Laissez une cellule vide pour retirer une note. Les notes sous le
              seuil sont signalées automatiquement.
            </p>
          )}

          <Button
            type="submit"
            disabled={saving || sheet.students.length === 0}
          >
            {saving ? (
              <Loader2Icon data-icon="inline-start" className="animate-spin" />
            ) : (
              <SaveIcon data-icon="inline-start" />
            )}
            {saving ? "Enregistrement..." : "Enregistrer les notes"}
          </Button>
        </div>
      </div>
    </form>
  );
}
"use client";

import * as React from "react";
import Link from "next/link";
import {
  CalendarCheckIcon,
  CheckCircle2Icon,
  ClipboardListIcon,
  ClockIcon,
  LayersIcon,
  Loader2Icon,
  SaveIcon,
  UserRoundXIcon,
  UsersRoundIcon,
} from "lucide-react";

import {
  getClassAttendanceForDate,
  getClassRoster,
  saveAttendanceAction,
  type AttendanceRecordDTO,
  type EnrolledStudentDTO,
  type TeacherClassDTO,
} from "@/actions/attendance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  ATTENDANCE_QUICK_STATUSES,
  getAttendanceStatusLabel,
} from "@/lib/attendance-status";
import type { AttendanceStatus } from "@prisma/client";
import { cn } from "@/lib/utils";

/** Date du jour au format « YYYY-MM-DD » (UTC) — valeur par défaut du sélecteur. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

type AttendanceEntry = {
  status: AttendanceStatus;
  notes: string;
};

const STATUS_BUTTON_CLASSES: Record<AttendanceStatus, string> = {
  PRESENT:
    "data-[active=true]:bg-emerald-600 data-[active=true]:text-white data-[active=true]:border-emerald-600",
  ABSENT:
    "data-[active=true]:bg-red-600 data-[active=true]:text-white data-[active=true]:border-red-600",
  LATE: "data-[active=true]:bg-amber-500 data-[active=true]:text-white data-[active=true]:border-amber-500",
  EXCUSED:
    "data-[active=true]:bg-sky-600 data-[active=true]:text-white data-[active=true]:border-sky-600",
};

export function AttendanceView({ classes }: { classes: TeacherClassDTO[] }) {
  const [selectedClassId, setSelectedClassId] = React.useState<string>(
    classes[0]?.id ?? ""
  );
  const [selectedDate, setSelectedDate] = React.useState<string>(todayIso());

  const [students, setStudents] = React.useState<EnrolledStudentDTO[]>([]);
  const [entries, setEntries] = React.useState<
    Record<string, AttendanceEntry>
  >({});
  const [loadingRoster, setLoadingRoster] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  const hasClasses = classes.length > 0;
  const selectedClass = classes.find((klass) => klass.id === selectedClassId);

  // Charge la liste d'émargement à chaque changement de classe.
  // NB : aucune classe sélectionnée ⇒ rendu court-circuité plus bas (garde
  // `!hasClasses`), aucune réinitialisation synchrone nécessaire ici.
  React.useEffect(() => {
    if (!selectedClassId) return;

    let cancelled = false;

    const loadRoster = async () => {
      setLoadingRoster(true);
      try {
        const roster = await getClassRoster(selectedClassId);
        if (cancelled) return;
        setStudents(roster);

        // Initialise chaque étudiant à « Présent » par défaut.
        setEntries(
          Object.fromEntries(
            roster.map((student) => [
              student.studentId,
              { status: "PRESENT" as AttendanceStatus, notes: "" },
            ])
          )
        );
      } catch {
        if (!cancelled) {
          setStudents([]);
          setEntries({});
        }
      } finally {
        if (!cancelled) setLoadingRoster(false);
      }
    };

    loadRoster();

    return () => {
      cancelled = true;
    };
  }, [selectedClassId]);

  // Recharge les présences déjà enregistrées à chaque changement de date.
  React.useEffect(() => {
    if (!selectedClassId || !selectedDate || students.length === 0) return;

    let cancelled = false;

    getClassAttendanceForDate(selectedClassId, selectedDate)
      .then((records: AttendanceRecordDTO[]) => {
        if (cancelled) return;

        setEntries((previous) => {
          const next = { ...previous };

          for (const record of records) {
            next[record.studentId] = {
              status: record.status,
              notes: record.notes ?? "",
            };
          }

          return next;
        });
      })
      .catch(() => {
        // Silencieux : aucune présence enregistrée pour cette date.
      });

    return () => {
      cancelled = true;
    };
  }, [selectedClassId, selectedDate, students.length]);

  /** Met à jour le statut d'un étudiant dans l'état local. */
  const handleStatusChange = (studentId: string, status: AttendanceStatus) => {
    setEntries((previous) => ({
      ...previous,
      [studentId]: { ...(previous[studentId] ?? { notes: "" }), status },
    }));
  };

  /** Met à jour la remarque d'un étudiant dans l'état local. */
  const handleNotesChange = (studentId: string, notes: string) => {
    setEntries((previous) => ({
      ...previous,
      [studentId]: {
        ...(previous[studentId] ?? { status: "PRESENT" as AttendanceStatus }),
        notes,
      },
    }));
  };

  /** Marque tous les étudiants comme présents (raccourci pratique). */
  const handleMarkAllPresent = () => {
    setEntries((previous) =>
      Object.fromEntries(
        Object.entries(previous).map(([studentId, entry]) => [
          studentId,
          { ...entry, status: "PRESENT" as AttendanceStatus },
        ])
      )
    );
  };

  /** Soumet la feuille de présence au serveur. */
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);

    try {
      const formData = new FormData();
      formData.set("classId", selectedClassId);
      formData.set("date", selectedDate);

      for (const [studentId, entry] of Object.entries(entries)) {
        formData.set(`status_${studentId}`, entry.status);
        formData.set(`notes_${studentId}`, entry.notes);
      }

      const result = await saveAttendanceAction(formData);

      if (result.ok) {
        setFeedback({
          kind: "success",
          message: `Présences enregistrées (${result.savedCount} étudiant${
            result.savedCount > 1 ? "s" : ""
          }).`,
        });
      } else {
        setFeedback({ kind: "error", message: result.message });
      }
    } catch {
      setFeedback({
        kind: "error",
        message:
          "Une erreur est survenue lors de l'enregistrement des présences.",
      });
    } finally {
      setSaving(false);
    }
  };

  // Statistiques rapides de la feuille courante.
  const counts = React.useMemo(() => {
    const values = Object.values(entries);

    return {
      present: values.filter((entry) => entry.status === "PRESENT").length,
      absent: values.filter((entry) => entry.status === "ABSENT").length,
      excused: values.filter((entry) => entry.status === "EXCUSED").length,
    };
  }, [entries]);

  if (!hasClasses) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Présences & Cahier de texte
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
            Contactez l’administration de votre centre pour qu’une classe vous
            soit attribuée.
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
            Présences & Cahier de texte
          </h2>
          <p className="text-sm text-muted-foreground">
            Sélectionnez une classe et une date pour émarger vos étudiants.
          </p>
        </div>

        {selectedClass ? (
          <Button variant="outline" asChild>
            <Link href={`/dashboard/courses/${selectedClass.courseId}`}>
              <ClipboardListIcon data-icon="inline-start" />
              Cahier de texte du cours
            </Link>
          </Button>
        ) : null}
      </div>

      {/* Barre de sélection : classe + date */}
      <div className="grid gap-3 rounded-xl border border-slate-200/80 bg-card p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4 dark:border-slate-800">
        <div className="grid gap-2 lg:col-span-2">
          <Label htmlFor="class-select">Classe / Cohorte</Label>
          <Select
            value={selectedClassId}
            onValueChange={(value) => {
              setSelectedClassId(value);
              setFeedback(null);
            }}
          >
            <SelectTrigger id="class-select" className="w-full">
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
              <ClockIcon className="size-3.5 shrink-0" />
              Créneau : {selectedClass.schedule} · Cours :{" "}
              {selectedClass.courseTitle}
            </p>
          ) : null}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="attendance-date">Date du cours</Label>
          <Input
            id="attendance-date"
            type="date"
            value={selectedDate}
            max={todayIso()}
            onChange={(event) => {
              setSelectedDate(event.target.value);
              setFeedback(null);
            }}
          />
        </div>

        <div className="flex items-end">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleMarkAllPresent}
            disabled={loadingRoster || students.length === 0}
          >
            <CheckCircle2Icon data-icon="inline-start" />
            Tout présent
          </Button>
        </div>
      </div>

      {/* Feuille d'émargement */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input type="hidden" name="classId" value={selectedClassId} />
        <input type="hidden" name="date" value={selectedDate} />

        <div className="rounded-xl border border-slate-200/80 bg-card text-card-foreground shadow-sm dark:border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <UsersRoundIcon className="size-4" />
              <span>
                {students.length} étudiant{students.length > 1 ? "s" : ""} dans
                cette cohorte
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                {counts.present} présent{counts.present > 1 ? "s" : ""}
              </span>
              <span className="rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-700 dark:bg-red-500/10 dark:text-red-400">
                {counts.absent} absent{counts.absent > 1 ? "s" : ""}
              </span>
              <span className="rounded-full bg-sky-50 px-2 py-0.5 font-medium text-sky-700 dark:bg-sky-500/10 dark:text-sky-400">
                {counts.excused} excusé{counts.excused > 1 ? "s" : ""}
              </span>
            </div>
          </div>

          {loadingRoster ? (
            <div className="flex items-center justify-center gap-2 px-6 py-16 text-sm text-muted-foreground">
              <Loader2Icon className="size-5 animate-spin" />
              Chargement de la liste d’émargement...
            </div>
          ) : students.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                <UserRoundXIcon className="size-6 text-muted-foreground" />
              </div>
              <p className="font-medium">Aucun étudiant dans cette classe</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Aucun étudiant n’est actuellement affecté à cette cohorte.
                Affectez des étudiants depuis la page « Étudiants ».
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Étudiant</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Remarque</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((student) => {
                    const entry = entries[student.studentId];

                    return (
                      <TableRow key={student.studentId}>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium">
                              {student.firstName} {student.lastName}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {student.studentCode}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div
                            role="radiogroup"
                            aria-label={`Présence de ${student.firstName} ${student.lastName}`}
                            className="flex flex-wrap items-center gap-1"
                          >
                            {ATTENDANCE_QUICK_STATUSES.map((status) => {
                              const isActive = entry?.status === status;

                              return (
                                <button
                                  key={status}
                                  type="button"
                                  role="radio"
                                  aria-checked={isActive}
                                  data-active={isActive}
                                  onClick={() =>
                                    handleStatusChange(student.studentId, status)
                                  }
                                  className={cn(
                                    "rounded-md border border-input px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted",
                                    STATUS_BUTTON_CLASSES[status]
                                  )}
                                >
                                  {getAttendanceStatusLabel(status)}
                                </button>
                              );
                            })}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Input
                            name={`notes_${student.studentId}`}
                            value={entry?.notes ?? ""}
                            onChange={(event) =>
                              handleNotesChange(
                                student.studentId,
                                event.target.value
                              )
                            }
                            placeholder="Remarque facultative..."
                            aria-label={`Remarque pour ${student.firstName} ${student.lastName}`}
                            className="max-w-xs"
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

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
                    Les statuts déjà enregistrés pour cette date sont
                    automatiquement chargés et mis à jour.
                  </p>
                )}

                <Button type="submit" disabled={saving || loadingRoster}>
                  {saving ? (
                    <Loader2Icon data-icon="inline-start" className="animate-spin" />
                  ) : (
                    <SaveIcon data-icon="inline-start" />
                  )}
                  {saving ? "Enregistrement..." : "Enregistrer les présences"}
                </Button>
              </div>
            </>
          )}
        </div>
      </form>

      {/* Rappel cahier de texte */}
      <div className="flex items-start gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        <CalendarCheckIcon className="mt-0.5 size-4 shrink-0" />
        <p>
          Le cahier de texte (chapitres traités, contenus et devoirs) se saisit
          depuis la fiche détaillée du cours porteur de la classe, accessible
          via le bouton « Cahier de texte du cours ».
        </p>
      </div>

    </div>
  );
}

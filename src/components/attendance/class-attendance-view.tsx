"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BookOpenIcon,
  CalendarCheckIcon,
  CheckCircle2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardListIcon,
  ClockIcon,
  EyeIcon,
  Loader2Icon,
  PrinterIcon,
  SaveIcon,
  UsersRoundIcon,
  MapPinIcon,
  GraduationCapIcon,
} from "lucide-react";

import type { AttendanceStatus } from "@prisma/client";

import {
  getAttendancePageData,
  saveClassSessionWithAttendance,
  type AttendancePageDataDTO,
  type ClassSessionHistoryEntryDTO,
  type ClassSessionWithAttendanceDTO,
  type EnrolledStudentDTO,
  type SaveClassSessionPayload,
  type TeacherClassDTO,
  type ClassScheduleDTO,
} from "@/actions/attendance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  ATTENDANCE_QUICK_STATUSES,
  getAttendanceStatusLabel,
} from "@/lib/attendance-status";
import { cn } from "@/lib/utils";

import { buildAttendanceSheetDocument } from "@/lib/attendance-sheet";
import { printHtmlDocument } from "@/lib/receipt";

/** Date du jour au format « YYYY-MM-DD » (UTC). */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Convertit une chaîne « YYYY-MM-DD » en Date UTC minuit. */
function parseDateIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Formate une date ISO en « Lun 11 Sep » (français, court). */
function formatShortDate(iso: string): string {
  const date = parseDateIso(iso);
  return date.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** Formate une date ISO en « 11/09/2026 ». */
function formatDateFr(iso: string): string {
  const date = parseDateIso(iso);
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Ajoute des jours à une date ISO. */
function addDaysIso(iso: string, days: number): string {
  const date = parseDateIso(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Compare deux dates ISO (journées UTC). */
function compareDateIso(a: string, b: string): number {
  return parseDateIso(a).getTime() - parseDateIso(b).getTime();
}

/** Retourne le jour de la semaine (0=Dimanche, 1=Lundi, ...) d'une date ISO. */
function getDayOfWeek(iso: string): number {
  return parseDateIso(iso).getUTCDay();
}

/** Jours de la semaine en français. */
const WEEK_DAY_LABELS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

/** Formate les créneaux d'une classe en texte lisible. */
function formatScheduleBadge(schedules: ClassScheduleDTO[]): string {
  if (schedules.length === 0) return "Aucun créneau configuré";
  const grouped = new Map<string, ClassScheduleDTO[]>();
  for (const s of schedules) {
    const key = `${s.startTime}–${s.endTime}|${s.room ?? ""}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(s);
  }
  const parts: string[] = [];
  for (const [key, items] of grouped) {
    const [times, room] = key.split("|");
    const days = items.map((s) => WEEK_DAY_LABELS[s.dayOfWeek]?.slice(0, 3) ?? "").join(", ");
    parts.push(`${days} (${times})${room ? ` — ${room}` : ""}`);
  }
  return parts.join(" | ");
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

export function ClassAttendanceView({
  classes,
}: {
  classes: TeacherClassDTO[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Présélection de la classe depuis `/dashboard/attendance?classId=...`
  // (bouton « Marquer les présences » des cartes de classes).
  const [selectedClassId, setSelectedClassId] = React.useState<string>(() => {
    const fromQuery = searchParams.get("classId");
    return fromQuery && classes.some((klass) => klass.id === fromQuery)
      ? fromQuery
      : (classes[0]?.id ?? "");
  });
  const [selectedDate, setSelectedDate] = React.useState<string>(todayIso());
  const [students, setStudents] = React.useState<EnrolledStudentDTO[]>([]);
  const [entries, setEntries] = React.useState<Record<string, AttendanceEntry>>({});
  const [session, setSession] = React.useState<ClassSessionWithAttendanceDTO | null>(null);
  const [history, setHistory] = React.useState<ClassSessionHistoryEntryDTO[]>([]);
  const [loadingRoster, setLoadingRoster] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  // Cahier de texte en lecture seule : `CourseLog` exact ([courseId, date])
  // saisi dans la fiche cours (« Mes cours »). Aucune saisie manuelle ici.
  const [courseLog, setCourseLog] = React.useState<{
    chapterTitle: string;
    content: string;
    homework: string | null;
  } | null>(null);
  const [feedback, setFeedback] = React.useState<{ kind: "success" | "error"; message: string } | null>(null);

  const hasClasses = classes.length > 0;
  const selectedClass = classes.find((klass) => klass.id === selectedClassId);

  const dateRibbon = React.useMemo(() => {
    const dates: string[] = [];
    for (let i = -3; i <= 3; i++) dates.push(addDaysIso(selectedDate, i));
    return dates;
  }, [selectedDate]);

  /**
   * Charge toutes les données de la page de présences en une seule requête
   * (roster + séance du jour + historique + cahier `CourseLog` exact).
   * Le cahier est strictement en lecture seule : il affiche `chapterTitle`
   * + `content`/`homework` issus de la fiche cours, sans saisie manuelle.
   */
  const loadPageData = React.useCallback(
    async (classId: string, date: string) => {
      if (!classId) return;
      setLoadingRoster(true);
      setFeedback(null);
      try {
        const data: AttendancePageDataDTO = await getAttendancePageData(classId, date);
        setStudents(data.roster);
        setHistory(data.history);
        setSession(data.session);
        // Bind direct du `CourseLog` ([courseId, date]) dans le bloc cahier
        // affiché à gauche de la feuille de présence. `null` ⇒ blocs vides.
        const readonlyLog = data.courseLog ?? data.courseLogFallback ?? null;
        setCourseLog(readonlyLog);
        if (data.session) {
          // Séance existante : recharge uniquement les présences déjà
          // enregistrées. Le texte du chapitre reste celui du `CourseLog`
          // parent (lecture seule) — jamais réécrit ici.
          const newEntries: Record<string, AttendanceEntry> = {};
          for (const att of data.session.attendances) {
            newEntries[att.studentId] = { status: att.status, notes: att.notes ?? "" };
          }
          setEntries(newEntries);
        } else {
          setEntries({});
        }
      } catch (error) {
        console.error("[ClassAttendanceView] Échec chargement données :", error);
        setFeedback({ kind: "error", message: "Impossible de charger les données de présence." });
      } finally {
        setLoadingRoster(false);
      }
    },
    [classes]
  );

  // Synchronise la sélection quand l'URL change (navigation vers
  // `/dashboard/attendance?classId=...`) sans remonter le composant.
  // Le changement d'état est différé pour respecter `react-hooks/set-state-in-effect`.
  React.useEffect(() => {
    const fromQuery = searchParams.get("classId");
    if (fromQuery && classes.some((klass) => klass.id === fromQuery)) {
      const timer = window.setTimeout(() => {
        setSelectedClassId(fromQuery);
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [searchParams, classes]);

  // Recharge (roster + séance + historique) à chaque changement de classe ou de date :
  // la séance existante auto-remplit et verrouille les champs, sinon mode nouvelle séance.
  React.useEffect(() => {
    if (selectedClassId) loadPageData(selectedClassId, selectedDate);
  }, [selectedClassId, selectedDate, loadPageData]);

  const getDateStatus = (dateIso: string): "past_pending" | "past_done" | "today" | "future" => {
    const today = todayIso();
    const cmp = compareDateIso(dateIso, today);
    if (cmp === 0) return "today";
    if (cmp > 0) return "future";
    const entry = history.find((h) => h.sessionDate.toISOString().slice(0, 10) === dateIso);
    if (entry && entry.status === "VALIDATED") return "past_done";
    return "past_pending";
  };

  const markAllPresent = () => {
    const newEntries: Record<string, AttendanceEntry> = {};
    for (const student of students) {
      newEntries[student.studentId] = { status: "PRESENT", notes: "" };
    }
    setEntries(newEntries);
  };

  const handleStatusChange = (studentId: string, status: AttendanceStatus) => {
    setEntries((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], status, notes: prev[studentId]?.notes ?? "" },
    }));
  };

  const handleNotesChange = (studentId: string, notes: string) => {
    setEntries((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], status: prev[studentId]?.status ?? "PRESENT", notes },
    }));
  };

  const handleSave = async () => {
    if (!selectedClassId || saving) return;
    setSaving(true);
    setFeedback(null);
    // Sauvegarde de la feuille de présence uniquement : s'appuie sur le
    // `CourseLog` parent sans créer ni remplacer le texte du chapitre.
    const payload: SaveClassSessionPayload = {
      classId: selectedClassId,
      date: selectedDate,
      title: courseLog?.chapterTitle ?? "",
      chapter: courseLog?.chapterTitle ?? "",
      summary: [courseLog?.content, courseLog?.homework]
        .filter((part) => part && part.trim().length > 0)
        .join("\n\n"),
      attendances: students.map((student) => ({
        studentId: student.studentId,
        status: entries[student.studentId]?.status ?? "PRESENT",
        notes: entries[student.studentId]?.notes || null,
      })),
    };
    try {
      const result = await saveClassSessionWithAttendance(payload);
      if (result.ok) {
        setFeedback({ kind: "success", message: "Séance enregistrée avec succès !" });
        // 1) Synchronisation immédiate avec la séance PERSISTÉE renvoyée par
        //    le serveur (aucun état local transitoire). Le cahier reste en
        //    lecture seule (issu du `CourseLog` parent) : on ne réécrit que
        //    les présences.
        setSession(result.session);
        const persistedEntries: Record<string, AttendanceEntry> = {};
        for (const student of students) {
          const saved = result.session.attendances.find(
            (a) => a.studentId === student.studentId
          );
          persistedEntries[student.studentId] = {
            status: saved?.status ?? "PRESENT",
            notes: saved?.notes ?? "",
          };
        }
        setEntries(persistedEntries);
        // 2) Historique optimiste : upsert par id (même clé serveur), sans doublon.
        setHistory((prev) => {
          const next = prev.some((h) => h.id === result.historyEntry.id)
            ? prev.map((h) =>
                h.id === result.historyEntry.id ? result.historyEntry : h
              )
            : [result.historyEntry, ...prev];
          return [...next].sort(
            (a, b) =>
              new Date(b.sessionDate).getTime() -
              new Date(a.sessionDate).getTime()
          );
        });
        // 3) Réconciliation serveur : la Server Action a déjà fait
        //    `revalidatePath`, on réinjecte les caches serveur.
        router.refresh();
        await loadPageData(selectedClassId, selectedDate);
      } else {
        setFeedback({ kind: "error", message: result.message });
      }
    } catch {
      setFeedback({ kind: "error", message: "Une erreur est survenue." });
    } finally {
      setSaving(false);
    }
  };

  const handleHistoryClick = (date: Date) => {
    setSelectedDate(date.toISOString().slice(0, 10));
  };

  /**
   * Construit et imprime la feuille de présence de la classe sélectionnée pour
   * la date courante. Les statuts non renseignés apparaissent comme des cases
   * vides (feuille vierge imprimable en complément).
   */
  const handlePrintSheet = () => {
    if (!selectedClass) return;
    const html = buildAttendanceSheetDocument({
      className: selectedClass.name,
      courseTitle: selectedClass.courseTitle,
      courseCode: selectedClass.courseCode,
      scheduleText: formatScheduleBadge(selectedClass.schedules),
      date: selectedDate,
      rows: students.map((student) => {
        const entry = entries[student.studentId];
        return {
          studentId: student.studentId,
          studentCode: student.studentCode,
          fullName: `${student.firstName} ${student.lastName}`,
          status: entry?.status ?? null,
          notes: entry?.notes ?? "",
        };
      }),
    });
    printHtmlDocument(html);
  };

  if (!hasClasses) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed p-12 text-center">
        <UsersRoundIcon className="size-12 text-muted-foreground/50" />
        <h3 className="text-lg font-semibold">Aucune classe assignée</h3>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Sélecteur de classe */}
      <div className="flex flex-wrap items-center gap-3">
        <Label className="text-sm font-medium">Classe :</Label>
        <div className="flex flex-wrap gap-2">
          {classes.map((klass) => (
            <Button
              key={klass.id}
              variant="pill"
              size="sm"
              aria-pressed={klass.id === selectedClassId}
              onClick={() => setSelectedClassId(klass.id)}
            >
              {klass.name}
            </Button>
          ))}
        </div>
        {selectedClass && (
          <div className="ml-auto flex items-center flex-wrap justify-end gap-2">
            <span className="text-xs text-muted-foreground">
              {selectedClass.courseTitle}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrintSheet}
              disabled={students.length === 0}
            >
              <PrinterIcon data-icon="inline-start" />
              Imprimer / Exporter la feuille de présence
            </Button>
            <Link
              href={`/dashboard/courses/${selectedClass.courseId}`}
              className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <BookOpenIcon className="size-3" />
              Cahier de texte
            </Link>
          </div>
        )}
      </div>

      {/* Badge récapitulatif de l'emploi du temps */}
      {selectedClass && selectedClass.schedules.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3 text-xs">
          <div className="flex items-center gap-1.5 font-medium text-primary">
            <ClockIcon className="size-3.5" />
            <span>Créneau{selectedClass.schedules.length > 1 ? "s" : ""} :</span>
          </div>
          <span className="text-muted-foreground">
            {formatScheduleBadge(selectedClass.schedules)}
          </span>
          {selectedClass.schedules.some((s) => s.room) && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <MapPinIcon className="size-3" />
              {Array.from(new Set(selectedClass.schedules.map((s) => s.room).filter(Boolean))).join(", ")}
            </span>
          )}
          <span className="flex items-center gap-1 text-muted-foreground">
            <GraduationCapIcon className="size-3" />
            {selectedClass.schedule}
          </span>
        </div>
      )}
      {/* Ruban de dates — seuls les jours correspondant à l'emploi du temps sont sélectionnables */}
      <div className="rounded-xl border bg-card p-3">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setSelectedDate(addDaysIso(selectedDate, -7))}
            aria-label="Semaine précédente"
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
          <div className="flex flex-1 items-center justify-center gap-1.5 overflow-x-auto">
            {dateRibbon.map((dateIso) => {
              const status = getDateStatus(dateIso);
              const isSelected = dateIso === selectedDate;
              const dayOfWeek = getDayOfWeek(dateIso);
              const isScheduleDay = selectedClass?.schedules.some((s) => s.dayOfWeek === dayOfWeek) ?? false;
              const hasSchedules = (selectedClass?.schedules.length ?? 0) > 0;
              const isDisabled = hasSchedules && !isScheduleDay;
              return (
                <Button
                  key={dateIso}
                  variant="pill"
                  size="sm"
                  onClick={() => !isDisabled && setSelectedDate(dateIso)}
                  disabled={isDisabled}
                  aria-pressed={isSelected}
                  className={cn(
                    "flex-col gap-0.5 px-3 py-2 h-auto min-w-[70px]",
                    status === "past_done" && !isSelected && "border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-500/10",
                    status === "past_pending" && !isSelected && "border-amber-300 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-500/10",
                    status === "future" && !isSelected && "opacity-60",
                    isDisabled && "opacity-25 cursor-not-allowed"
                  )}
                >
                  <span className="text-[10px] uppercase tracking-wide">
                    {formatShortDate(dateIso).split(" ")[0]}
                  </span>
                  <span className="text-sm font-semibold">
                    {formatShortDate(dateIso).split(" ")[1]}
                  </span>
                  <span
                    className={cn(
                      "mt-0.5 size-1.5 rounded-full",
                      status === "past_done" && "bg-emerald-500",
                      status === "past_pending" && "bg-amber-500",
                      status === "today" && "bg-primary",
                      status === "future" && "bg-muted-foreground/30"
                    )}
                  />
                </Button>
              );
            })}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setSelectedDate(addDaysIso(selectedDate, 7))}
            aria-label="Semaine suivante"
          >
            <ChevronRightIcon className="size-4" />
          </Button>
          <div className="ml-2 border-l pl-3">
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                const newDate = e.target.value || todayIso();
                // Vérifie que la date sélectionnée correspond à l'emploi du temps
                if (selectedClass && selectedClass.schedules.length > 0) {
                  const dayOfWeek = getDayOfWeek(newDate);
                  const isValid = selectedClass.schedules.some((s) => s.dayOfWeek === dayOfWeek);
                  if (!isValid) return; // Ignore la sélection si hors créneau
                }
                setSelectedDate(newDate);
              }}
              className="w-auto"
              aria-label="Choisir une date"
            />
          </div>
        </div>
      </div>

      {/* Formulaire de la séance : cahier strictement en lecture seule */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Bloc Cahier de Texte (lecture seule — saisi dans « Mes cours ») */}
        <div className="rounded-xl border bg-card p-4 lg:col-span-1">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardListIcon className="size-4 text-primary" />
              <h3 className="text-sm font-semibold">Cahier de texte</h3>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200/60 bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <BookOpenIcon className="size-3" />
              Lecture seule
            </span>
          </div>
          <div className="flex flex-col gap-3">
            <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              Saisie exclusive dans la fiche du cours (« Mes cours »). Aucune
              modification possible depuis cet écran.
            </p>
            <div>
              <Label htmlFor="session-title" className="text-xs text-muted-foreground">
                Titre de la séance / Chapitre
              </Label>
              <Input
                id="session-title"
                value={courseLog?.chapterTitle ?? ""}
                readOnly
                disabled
                placeholder="Aucun contenu saisi dans la fiche cours pour cette date."
                className="mt-1 bg-muted/60"
                aria-label="Titre de la séance en lecture seule"
              />
            </div>
            <div>
              <Label htmlFor="session-chapter" className="text-xs text-muted-foreground">
                Chapitre
              </Label>
              <Input
                id="session-chapter"
                value={courseLog?.chapterTitle ?? ""}
                readOnly
                disabled
                placeholder="Aucun chapitre saisi dans la fiche cours."
                className="mt-1 bg-muted/60"
                aria-label="Chapitre en lecture seule"
              />
            </div>
            <div>
              <Label htmlFor="session-summary" className="text-xs text-muted-foreground">
                Résumé / Contenu
              </Label>
              <Textarea
                id="session-summary"
                value={[courseLog?.content, courseLog?.homework].filter((part) => part && part.trim().length > 0).join("\n\n")}
                readOnly
                disabled
                placeholder="Aucun résumé saisi dans la fiche cours pour cette date."
                className="mt-1 min-h-[120px] bg-muted/60"
                aria-label="Résumé du cours en lecture seule"
              />
            </div>
            {courseLog?.homework ? (
              <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-400">
                <span className="font-semibold">Devoirs : </span>
                {courseLog.homework}
              </div>
            ) : null}
          </div>
        </div>

        {/* Bloc Feuille de Présence */}
        <div className="rounded-xl border bg-card p-4 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UsersRoundIcon className="size-4 text-primary" />
              <h3 className="text-sm font-semibold">Feuille de présence</h3>
              <span className="text-xs text-muted-foreground">
                ({students.length} élèves)
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={markAllPresent}
              disabled={loadingRoster || students.length === 0}
            >
              <CheckCircle2Icon data-icon="inline-start" className="size-3.5" />
              Tout marquer présent
            </Button>
          </div>
          {loadingRoster ? (
            <div className="flex items-center justify-center py-8">
              <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : students.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Aucun élève inscrit dans cette classe.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">Élève</TableHead>
                    <TableHead className="w-[280px]">Statut</TableHead>
                    <TableHead>Remarque</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((student) => {
                    const entry = entries[student.studentId];
                    return (
                      <TableRow key={student.studentId}>
                        <TableCell className="font-medium">
                          {student.firstName} {student.lastName}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {ATTENDANCE_QUICK_STATUSES.map((status) => (
                              <Button
                                key={status}
                                variant="outline"
                                size="xs"
                                data-active={entry?.status === status}
                                onClick={() => handleStatusChange(student.studentId, status)}
                                className={cn(
                                  "min-w-[60px] transition-colors",
                                  STATUS_BUTTON_CLASSES[status]
                                )}
                              >
                                {getAttendanceStatusLabel(status)}
                              </Button>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Input
                            value={entry?.notes ?? ""}
                            onChange={(e) => handleNotesChange(student.studentId, e.target.value)}
                            placeholder="Remarque facultative..."
                            className="max-w-xs"
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {/* Bouton de sauvegarde : feuille de présence uniquement */}
      <div className="flex items-center justify-between rounded-xl border bg-card p-4">
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
            Cahier de texte en lecture seule — seule la feuille de présence est
            enregistrée ici.
          </p>
        )}
        <Button
          onClick={handleSave}
          disabled={saving || loadingRoster || students.length === 0}
          className={cn(
            "transition-all",
            students.length > 0
              ? "bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white"
              : "bg-muted opacity-60 cursor-not-allowed"
          )}
        >
          {saving ? (
            <Loader2Icon data-icon="inline-start" className="animate-spin" />
          ) : (
            <SaveIcon data-icon="inline-start" />
          )}
          {saving ? "Enregistrement..." : "Enregistrer les présences"}
        </Button>
      </div>

      {/* Tableau récapitulatif / Historique */}
      <div className="rounded-xl border bg-card p-4">
        <div className="mb-4 flex items-center gap-2">
          <CalendarCheckIcon className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">Historique des séances</h3>
        </div>
        {history.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Aucune séance enregistrée pour cette classe.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Titre / Sujet</TableHead>
                <TableHead>Présences</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="w-[80px]">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-medium">
                    {formatDateFr(entry.sessionDate.toISOString().slice(0, 10))}
                  </TableCell>
                  <TableCell>{entry.subjectName}</TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "font-medium",
                        entry.totalCount > 0 && entry.presentCount === entry.totalCount
                          ? "text-emerald-600"
                          : entry.presentCount > 0
                          ? "text-amber-600"
                          : "text-muted-foreground"
                      )}
                    >
                      {entry.presentCount}/{entry.totalCount}
                    </span>
                  </TableCell>
                  <TableCell>
                    {entry.status === "VALIDATED" ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/60 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400">
                        <CheckCircle2Icon className="size-3" />
                        Validée
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200/60 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
                        <ClockIcon className="size-3" />
                        En attente
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleHistoryClick(entry.sessionDate)}
                      aria-label="Voir cette séance"
                    >
                      <EyeIcon className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

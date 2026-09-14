"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ClockIcon,
  Loader2Icon,
  PrinterIcon,
  SaveIcon,
  UserCheckIcon,
  UserXIcon,
  UsersRoundIcon,
} from "lucide-react";

import type { AttendanceStatus } from "@prisma/client";

import {
  getClassRoster,
  getClassSessionWithAttendance,
  saveSessionAttendance,
  type ClassSessionWithAttendanceDTO,
  type EnrolledStudentDTO,
  type SaveSessionAttendancePayload,
  type TeacherClassDTO,
} from "@/actions/attendance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ATTENDANCE_QUICK_STATUSES,
  getAttendanceStatusLabel,
} from "@/lib/attendance-status";
import { cn } from "@/lib/utils";

import { buildAttendanceSheetDocument } from "@/lib/attendance-sheet";
import { printHtmlDocument } from "@/lib/receipt";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

type AttendanceEntry = {
  status: AttendanceStatus;
  notes: string;
  arrivalTime: string;
};

type FeedbackState = {
  kind: "success" | "error";
  message: string;
} | null;

function getStatusIcon(status: AttendanceStatus) {
  switch (status) {
    case "PRESENT": return CheckCircle2Icon;
    case "LATE": return ClockIcon;
    case "ABSENT": return UserXIcon;
    case "EXCUSED": return AlertTriangleIcon;
    default: return CheckCircle2Icon;
  }
}

function getStatusColor(status: AttendanceStatus): string {
  switch (status) {
    case "PRESENT": return "bg-emerald-600 text-white border-emerald-600";
    case "ABSENT": return "bg-red-600 text-white border-red-600";
    case "LATE": return "bg-amber-500 text-white border-amber-500";
    case "EXCUSED": return "bg-sky-600 text-white border-sky-600";
    default: return "bg-slate-200 text-slate-700 border-slate-300";
  }
}

export function AttendanceSheetView({ classes }: { classes: TeacherClassDTO[] }) {
  const router = useRouter();
  const [selectedClassId, setSelectedClassId] = React.useState<string>(classes[0]?.id ?? "");
  const [selectedDate, setSelectedDate] = React.useState<string>(todayIso());
  const [students, setStudents] = React.useState<EnrolledStudentDTO[]>([]);
  const [entries, setEntries] = React.useState<Record<string, AttendanceEntry>>({});
  const [session, setSession] = React.useState<ClassSessionWithAttendanceDTO | null>(null);
  const [loadingRoster, setLoadingRoster] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [feedback, setFeedback] = React.useState<FeedbackState>(null);
  const [showClassPicker, setShowClassPicker] = React.useState(false);
  const hasClasses = classes.length > 0;
  const selectedClass = classes.find((klass) => klass.id === selectedClassId);

  React.useEffect(() => {
    if (!selectedClassId) return;
    let cancelled = false;
    setLoadingRoster(true);
    setFeedback(null);
    Promise.all([
      getClassRoster(selectedClassId),
      getClassSessionWithAttendance(selectedClassId, selectedDate),
    ])
      .then(([roster, existingSession]) => {
        if (cancelled) return;
        setStudents(roster);
        setSession(existingSession);
        const initialEntries: Record<string, AttendanceEntry> = {};
        for (const student of roster) {
          const existing = existingSession?.attendances.find(
            (a) => a.studentId === student.studentId
          );
          initialEntries[student.studentId] = {
            status: existing?.status ?? "PRESENT",
            notes: existing?.notes ?? "",
            arrivalTime: existing?.arrivalTime
              ? new Date(existing.arrivalTime).toISOString().slice(11, 16)
              : "",
          };
        }
        setEntries(initialEntries);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("[AttendanceSheetView] Échec chargement :", error);
        setFeedback({ kind: "error", message: "Impossible de charger les données." });
      })
      .finally(() => {
        if (!cancelled) setLoadingRoster(false);
      });
    return () => { cancelled = true; };
  }, [selectedClassId, selectedDate]);

  const handleStatusChange = (studentId: string, status: AttendanceStatus) => {
    setEntries((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        status,
        notes: prev[studentId]?.notes ?? "",
        arrivalTime: status === "LATE" ? (prev[studentId]?.arrivalTime ?? new Date().toISOString().slice(11, 16)) : "",
      },
    }));
  };

  const handleNotesChange = (studentId: string, notes: string) => {
    setEntries((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], status: prev[studentId]?.status ?? "PRESENT", notes },
    }));
  };

  const handleArrivalTimeChange = (studentId: string, arrivalTime: string) => {
    setEntries((prev) => ({ ...prev, [studentId]: { ...prev[studentId], arrivalTime } }));
  };

  const markAllPresent = () => {
    setEntries((prev) => {
      const next: Record<string, AttendanceEntry> = {};
      for (const student of students) {
        next[student.studentId] = { status: "PRESENT", notes: prev[student.studentId]?.notes ?? "", arrivalTime: "" };
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!selectedClassId || saving || !session) return;
    setSaving(true);
    setFeedback(null);
    const payload: SaveSessionAttendancePayload = {
      sessionId: session.id,
      date: selectedDate,
      attendances: students.map((student) => ({
        studentId: student.studentId,
        status: entries[student.studentId]?.status ?? "PRESENT",
        notes: entries[student.studentId]?.notes || null,
        arrivalTime: entries[student.studentId]?.status === "LATE" ? (entries[student.studentId]?.arrivalTime || null) : null,
      })),
    };
    try {
      const result = await saveSessionAttendance(payload);
      if (result.ok) {
        setFeedback({ kind: "success", message: `Feuille enregistrée (${result.savedCount} étudiant${result.savedCount > 1 ? "s" : ""}).` });
        const updatedSession = await getClassSessionWithAttendance(selectedClassId, selectedDate);
        setSession(updatedSession);
        router.refresh();
      } else {
        setFeedback({ kind: "error", message: result.message });
      }
    } catch {
      setFeedback({ kind: "error", message: "Une erreur est survenue." });
    } finally {
      setSaving(false);
    }
  };

  /**
   * Construit et imprime la feuille de présence de la classe sélectionnée pour
   * la date courante (rapport d'assiduité / feuille d'appel A4).
   */
  const handlePrintSheet = () => {
    if (!selectedClass) return;
    const html = buildAttendanceSheetDocument({
      className: selectedClass.name,
      courseTitle: selectedClass.courseTitle,
      courseCode: selectedClass.courseCode,
      scheduleText: selectedClass.schedule,
      date: selectedDate,
      rows: students.map((student) => {
        const entry = entries[student.studentId];
        return {
          studentId: student.studentId,
          studentCode: student.studentCode,
          fullName: `${student.firstName} ${student.lastName}`,
          status: entry?.status ?? null,
          notes: entry?.notes ?? "",
          arrivalTime: entry?.arrivalTime ?? "",
        };
      }),
    });
    printHtmlDocument(html);
  };

  const counts = React.useMemo(() => {
    const values = Object.values(entries);
    return {
      present: values.filter((e) => e.status === "PRESENT").length,
      late: values.filter((e) => e.status === "LATE").length,
      absent: values.filter((e) => e.status === "ABSENT").length,
      excused: values.filter((e) => e.status === "EXCUSED").length,
      total: students.length,
    };
  }, [entries, students]);

  if (!hasClasses) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed p-12 text-center">
        <UsersRoundIcon className="size-12 text-muted-foreground/50" />
        <h3 className="text-lg font-semibold">Aucune classe assignée</h3>
        <p className="text-sm text-muted-foreground">
          Vous devez avoir une classe assignée pour prendre les présences.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/attendance"
          className="inline-flex items-center justify-center rounded-md border border-input bg-background p-2 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <ArrowLeftIcon className="size-4" />
        </Link>
        <div>
          <h2 className="text-lg font-semibold">Feuille d&apos;appel</h2>
          <p className="text-xs text-muted-foreground">
            Saisie rapide des présences pour la session
          </p>
        </div>
        <div className="ml-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrintSheet}
            disabled={students.length === 0}
          >
            <PrinterIcon data-icon="inline-start" />
            Imprimer / Exporter la feuille de présence
          </Button>
        </div>
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={() => setShowClassPicker(!showClassPicker)}
          className="flex w-full items-center justify-between rounded-xl border bg-card px-4 py-3 text-left shadow-sm"
        >
          <div>
            <p className="text-xs text-muted-foreground">Classe</p>
            <p className="font-medium">{selectedClass?.name ?? "—"}</p>
          </div>
          <ChevronDownIcon className={cn("size-4 text-muted-foreground transition-transform", showClassPicker && "rotate-180")} />
        </button>
        {showClassPicker && (
          <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-xl border bg-card p-1 shadow-lg">
            {classes.map((klass) => (
              <button
                key={klass.id}
                type="button"
                onClick={() => { setSelectedClassId(klass.id); setShowClassPicker(false); }}
                className={cn(
                  "flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition-colors",
                  klass.id === selectedClassId ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted"
                )}
              >
                {klass.name}
                <span className="ml-auto text-xs text-muted-foreground">{klass.studentCount} élèves</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Label htmlFor="sheet-date" className="text-sm font-medium">Date :</Label>
        <Input id="sheet-date" type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value || todayIso())} className="w-auto" />
      </div>

      <div className="grid grid-cols-4 gap-2">
        <div className="flex flex-col items-center rounded-xl border bg-emerald-50/50 p-3 dark:bg-emerald-500/10">
          <CheckCircle2Icon className="size-5 text-emerald-600" />
          <span className="mt-1 text-lg font-bold">{counts.present}</span>
          <span className="text-[10px] text-muted-foreground">Présents</span>
        </div>
        <div className="flex flex-col items-center rounded-xl border bg-amber-50/50 p-3 dark:bg-amber-500/10">
          <ClockIcon className="size-5 text-amber-600" />
          <span className="mt-1 text-lg font-bold">{counts.late}</span>
          <span className="text-[10px] text-muted-foreground">Retards</span>
        </div>
        <div className="flex flex-col items-center rounded-xl border bg-red-50/50 p-3 dark:bg-red-500/10">
          <UserXIcon className="size-5 text-red-600" />
          <span className="mt-1 text-lg font-bold">{counts.absent}</span>
          <span className="text-[10px] text-muted-foreground">Absents</span>
        </div>
        <div className="flex flex-col items-center rounded-xl border bg-sky-50/50 p-3 dark:bg-sky-500/10">
          <AlertTriangleIcon className="size-5 text-sky-600" />
          <span className="mt-1 text-lg font-bold">{counts.excused}</span>
          <span className="text-[10px] text-muted-foreground">Excusés</span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{counts.total} étudiant{counts.total > 1 ? "s" : ""}</p>
        <Button variant="outline" size="sm" onClick={markAllPresent}>
          <UserCheckIcon data-icon="inline-start" />
          Tous présents
        </Button>
      </div>

      {feedback && (
        <div role="alert" className={cn("rounded-lg px-3 py-2 text-sm", feedback.kind === "success" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" : "bg-destructive/10 text-destructive")}>
          {feedback.message}
        </div>
      )}

      {loadingRoster ? (
        <div className="flex items-center justify-center py-12">
          <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : students.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <UsersRoundIcon className="mx-auto size-8 text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">Aucun apprenant inscrit dans cette classe.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {students.map((student) => {
            const entry = entries[student.studentId];
            const status = entry?.status ?? "PRESENT";
            const StatusIcon = getStatusIcon(status);
            return (
              <div key={student.studentId} className="rounded-xl border bg-card p-3 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {student.firstName.charAt(0)}{student.lastName.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{student.firstName} {student.lastName}</p>
                    <p className="text-xs text-muted-foreground">{student.studentCode}</p>
                  </div>
                  <StatusIcon className="size-5 shrink-0 text-muted-foreground" />
                </div>
                <div className="mt-3 grid grid-cols-4 gap-1.5">
                  {ATTENDANCE_QUICK_STATUSES.map((s) => {
                    const isActive = status === s;
                    return (
                      <button key={s} type="button" onClick={() => handleStatusChange(student.studentId, s)}
                        className={cn("flex flex-col items-center gap-0.5 rounded-lg border px-2 py-2 text-[10px] font-medium transition-all",
                          isActive ? getStatusColor(s) : "border-slate-200 bg-background text-muted-foreground hover:bg-muted dark:border-slate-700"
                        )}>
                        {getAttendanceStatusLabel(s)}
                      </button>
                    );
                  })}
                </div>
                {status === "LATE" && (
                  <div className="mt-2">
                    <Label htmlFor={`arrival-${student.studentId}`} className="text-xs text-muted-foreground">Heure d&apos;arrivée</Label>
                    <Input id={`arrival-${student.studentId}`} type="time" value={entry?.arrivalTime ?? ""} onChange={(e) => handleArrivalTimeChange(student.studentId, e.target.value)} className="mt-1" />
                  </div>
                )}
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Ajouter un motif (optionnel)</summary>
                  <Textarea value={entry?.notes ?? ""} onChange={(e) => handleNotesChange(student.studentId, e.target.value)} placeholder="Motif de l'absence, minutes de retard..." className="mt-2 min-h-[60px] text-sm" />
                </details>
              </div>
            );
          })}
        </div>
      )}

      <div className="sticky bottom-0 border-t bg-background/95 py-3 backdrop-blur supports-backdrop-filter:bg-background/80">
        <Button onClick={handleSave} disabled={saving || loadingRoster || !session || students.length === 0}
          className={cn("w-full transition-all", session && students.length > 0 ? "bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white" : "bg-muted opacity-60 cursor-not-allowed")}>
          {saving ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : <SaveIcon data-icon="inline-start" />}
          {saving ? "Enregistrement..." : "Enregistrer les présences"}
        </Button>
      </div>
    </div>
  );
}

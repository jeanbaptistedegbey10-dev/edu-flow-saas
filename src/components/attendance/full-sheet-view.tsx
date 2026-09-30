"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeftIcon,
  CalendarCheckIcon,
  FileTextIcon,
  Loader2Icon,
  PrinterIcon,
  UsersRoundIcon,
} from "lucide-react";

import {
  getFullClassExport,
  type FullClassExportDTO,
  type TeacherClassDTO,
} from "@/actions/attendance";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { printHtmlDocument } from "@/lib/receipt";
import {
  buildFullAttendanceDocument,
  buildFullCombinedDocument,
} from "@/lib/full-class-export";

function fmtDate(d: Date): string {
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Feuille récapitulative complète d'une classe : TOUTES les séances de toute
 * la durée de la classe (présences + cahier de texte réunis), avec impression
 * PDF de la feuille de présence globale et du rapport combiné.
 */
export function FullSheetView({ classes }: { classes: TeacherClassDTO[] }) {
  const [selectedClassId, setSelectedClassId] = React.useState(
    classes[0]?.id ?? ""
  );
  const [data, setData] = React.useState<FullClassExportDTO | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!selectedClassId) return;
    let cancelled = false;
    // setState uniquement dans des callbacks asynchrones
    // (règle react-hooks/set-state-in-effect).
    Promise.resolve()
      .then(() => {
        if (cancelled) return undefined;
        setLoading(true);
        setError(null);
        return getFullClassExport(selectedClassId);
      })
      .then((result) => {
        if (!cancelled && result) setData(result);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(
            err instanceof Error
              ? err.message
              : "Impossible de charger la feuille récapitulative."
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedClassId]);

  /** Totaux par apprenant sur toute la durée de la classe. */
  const studentTotals = React.useMemo(() => {
    if (!data) return [];
    return data.roster.map((student) => {
      let present = 0;
      let late = 0;
      let absent = 0;
      let excused = 0;
      for (const session of data.sessions) {
        const record = session.attendances.find(
          (a) => a.studentId === student.studentId
        );
        if (!record) continue;
        if (record.status === "PRESENT") present += 1;
        else if (record.status === "LATE") late += 1;
        else if (record.status === "ABSENT") absent += 1;
        else if (record.status === "EXCUSED") excused += 1;
      }
      const marked = present + late + absent + excused;
      const rate =
        marked > 0 ? Math.round(((present + late) / marked) * 100) : null;
      return { student, present, late, absent, excused, rate };
    });
  }, [data]);

  if (classes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed p-12 text-center">
        <UsersRoundIcon className="size-12 text-muted-foreground/50" />
        <h3 className="text-lg font-semibold">Aucune classe assignée</h3>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/attendance">
            <ArrowLeftIcon data-icon="inline-start" />
            Retour aux présences
          </Link>
        </Button>
      </div>
    );
  }

  const sessions = data?.sessions ?? [];
  const totalMarks = sessions.reduce((n, s) => n + s.attendances.length, 0);
  const firstDate = sessions[0]?.sessionDate;
  const lastDate =
    sessions.length > 0 ? sessions[sessions.length - 1].sessionDate : undefined;

  return (
    <div className="flex flex-col gap-6">
      {/* En-tête */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <FileTextIcon className="size-6 text-primary" />
            Feuille récapitulative complète
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Toute la durée de la classe : toutes les séances, présences et
            cahier de texte réunis.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/attendance">
            <ArrowLeftIcon data-icon="inline-start" />
            Retour
          </Link>
        </Button>
      </div>

      {/* Sélecteur de classe */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">Classe :</span>
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
      </div>

      {loading ? (
        <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" />
          Chargement de la feuille récapitulative…
        </p>
      ) : error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : data ? (
        <>
          {/* Impression / export — toute la durée de la classe */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => printHtmlDocument(buildFullAttendanceDocument(data))}
              disabled={sessions.length === 0}
            >
              <PrinterIcon data-icon="inline-start" />
              Imprimer la feuille de présence (historique complet)
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => printHtmlDocument(buildFullCombinedDocument(data))}
              disabled={sessions.length === 0}
            >
              <PrinterIcon data-icon="inline-start" />
              Rapport combiné (présences + cahier)
            </Button>
          </div>
          {/* Synthèse de la classe */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">Classe</p>
              <p className="mt-1 text-sm font-semibold">{data.className}</p>
              <p className="text-xs text-muted-foreground">
                {data.courseTitle} ({data.courseCode})
              </p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">Période couverte</p>
              <p className="mt-1 text-sm font-semibold">
                {firstDate && lastDate
                  ? `${fmtDate(firstDate)} → ${fmtDate(lastDate)}`
                  : "—"}
              </p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">Séances</p>
              <p className="mt-1 text-sm font-semibold">{sessions.length}</p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">Émargements</p>
              <p className="mt-1 text-sm font-semibold">{totalMarks}</p>
            </div>
          </div>

          {/* Historique complet des séances (toute la durée de la classe) */}
          <div className="rounded-xl border bg-card p-4">
            <div className="mb-4 flex items-center gap-2">
              <CalendarCheckIcon className="size-4 text-primary" />
              <h3 className="text-sm font-semibold">
                Historique des séances — cahier de texte & présences
              </h3>
            </div>
            {sessions.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Aucune séance enregistrée pour cette classe.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Titre / Sujet</TableHead>
                    <TableHead>Chapitre</TableHead>
                    <TableHead>Présents</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((session) => (
                    <TableRow key={session.id}>
                      <TableCell className="font-medium">
                        {fmtDate(session.sessionDate)}
                      </TableCell>
                      <TableCell>{session.subjectName}</TableCell>
                      <TableCell className="max-w-[280px] truncate">
                        {session.chapter}
                      </TableCell>
                      <TableCell>
                        {session.attendances.filter(
                          (a) => a.status === "PRESENT" || a.status === "LATE"
                        ).length}
                        /{session.attendances.length}
                      </TableCell>
                      <TableCell>
                        {session.status === "VALIDATED" ? "Validée" : "En attente"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Totaux par apprenant sur toute la durée de la classe */}
          <div className="rounded-xl border bg-card p-4">
            <div className="mb-4 flex items-center gap-2">
              <UsersRoundIcon className="size-4 text-primary" />
              <h3 className="text-sm font-semibold">
                Totaux par apprenant — {data.className}
              </h3>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Apprenant</TableHead>
                  <TableHead>Présents</TableHead>
                  <TableHead>Retards</TableHead>
                  <TableHead>Absences</TableHead>
                  <TableHead>Excusés</TableHead>
                  <TableHead>Taux</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {studentTotals.map((row) => (
                  <TableRow key={row.student.studentId}>
                    <TableCell className="font-medium">
                      {row.student.firstName} {row.student.lastName}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {row.student.studentCode}
                      </span>
                    </TableCell>
                    <TableCell className="text-emerald-600">{row.present}</TableCell>
                    <TableCell className="text-amber-600">{row.late}</TableCell>
                    <TableCell className="text-red-600">{row.absent}</TableCell>
                    <TableCell className="text-sky-600">{row.excused}</TableCell>
                    <TableCell>
                      {row.rate !== null ? `${row.rate} %` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      ) : null}
    </div>
  );
}

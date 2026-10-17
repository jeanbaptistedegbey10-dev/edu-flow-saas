"use client";

import * as React from "react";
import {
  AwardIcon,
  CalendarCheckIcon,
  ClockIcon,
  FileDownIcon,
  HistoryIcon,
  PrinterIcon,
} from "lucide-react";

import type {
  JourneyClassEntryDTO,
  JourneyModuleDTO,
} from "@/actions/student-journey";
import type { OrganizationProfileDTO } from "@/actions/payments";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  buildReportCardDocument,
  type ReportCardModuleRow,
} from "@/lib/report-card";
import {
  buildStudentAttendanceReportDocument,
  type StudentAttendanceReportInput,
} from "@/lib/attendance-report";
import { printHtmlDocument } from "@/lib/receipt";
import {
  MODULE_STATUS_BADGE_CLASSES,
  MODULE_STATUS_LABELS,
} from "@/lib/module-status";
import type { ClassEnrollmentStatus } from "@prisma/client";
import { cn } from "@/lib/utils";

// Formatage déterministe (locale + fuseau fixes) pour éviter tout écart d'hydratation.
const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const numberFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 1,
});

const BADGE_BASE_CLASSES =
  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";

/** Libellés + badges des décisions de fin de session. */
const DECISION_BADGES: Record<
  ClassEnrollmentStatus,
  { label: string; classes: string }
> = {
  ACTIVE: {
    label: "En cours",
    classes: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400",
  },
  PASSED: {
    label: "Passé au niveau supérieur",
    classes: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  },
  PROMOTED_MANUALLY: {
    label: "Passage manuel (validation modules incomplète)",
    classes: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  },
  FAILED: {
    label: "Redoublement",
    classes: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  },
  DROPPED: {
    label: "Abandon",
    classes: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  },
  COMPLETED: {
    label: "Clôturée (sans décision)",
    classes: "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400",
  },
};

/** Badge de statut d'un module dans le tableau du parcours. */
function JourneyModuleStatusBadge({
  module,
}: {
  module: JourneyModuleDTO;
}) {
  if (module.status === null) {
    return (
      <span className={cn(BADGE_BASE_CLASSES, "bg-muted text-muted-foreground")}>
        Non noté
      </span>
    );
  }
  return (
    <span
      className={cn(BADGE_BASE_CLASSES, MODULE_STATUS_BADGE_CLASSES[module.status])}
    >
      {MODULE_STATUS_LABELS[module.status]}
    </span>
  );
}

export function StudentJourneyTab({
  entries,
  studentName,
  studentCode,
  organization,
}: {
  entries: JourneyClassEntryDTO[];
  studentName: string;
  studentCode: string;
  organization: OrganizationProfileDTO;
}) {
  // Bulletin / rapport de présence d'une classe spécifique (aperçu + impression).
  const [preview, setPreview] = React.useState<{
    title: string;
    html: string;
  } | null>(null);

  /** Adapte la hauteur d'un aperçu iframe à son contenu. */
  const handlePreviewLoad = (
    event: React.SyntheticEvent<HTMLIFrameElement>
  ) => {
    const frame = event.currentTarget;
    const doc = frame.contentDocument;
    if (!doc?.documentElement) return;
    const contentHeight = doc.documentElement.scrollHeight;
    if (contentHeight > 0) {
      frame.style.height = `${Math.min(Math.max(contentHeight, 360), 560)}px`;
    }
  };

  /** Bulletin de la classe sélectionnée — construit depuis l'historique FIGÉ. */
  const openBulletin = (entry: JourneyClassEntryDTO) => {
    const rows: ReportCardModuleRow[] = entry.modules
      .filter((module) => module.score !== null)
      .map((module) => ({
        evaluationTitle: module.evaluationTitle,
        evaluationDate: entry.enrolledAt,
        moduleName: module.moduleName,
        score: module.score,
        maxScore: module.maxScore,
        passingScore: module.passMark,
      }));

    const html = buildReportCardDocument(
      {
        studentName,
        studentCode,
        className: entry.className,
        courseTitle: entry.courseTitle,
        rows,
        overallAverage: entry.stats.overallAverage,
        validationRate: entry.stats.validationRate,
        gradedModuleCount: entry.stats.gradedModuleCount,
        validatedModuleCount: entry.stats.validatedModuleCount,
        appreciation: entry.finalDecisionNote ?? undefined,
      },
      organization
    );
    setPreview({ title: `Bulletin — ${entry.className}`, html });
  };

  /** Rapport de présence de la classe sélectionnée (données figées par classe). */
  const openAttendanceReport = (entry: JourneyClassEntryDTO) => {
    const html = buildStudentAttendanceReportDocument({
      studentName,
      studentCode,
      className: entry.className,
      courseTitle: entry.courseTitle,
      courseCode: entry.courseCode,
      schedule: entry.schedule,
      sessions: entry.attendance.sessions,
    });
    setPreview({
      title: `Rapport de présence — ${entry.className}`,
      html,
    });
  };

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-16 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <HistoryIcon className="size-6 text-muted-foreground" />
        </div>
        <p className="font-medium">Aucun parcours enregistré</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Cet étudiant n&apos;est rattaché à aucune classe pour le moment. Le
          parcours apparaîtra dès sa première inscription (affectation à une
          cohorte).
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Historique chronologique des classes suivies par l&apos;étudiant, avec le
        détail des modules validés / non validés par niveau. Les bulletins et
        rapports de présence de chaque classe sont figés : modifier les notes de
        la classe active n&apos;altère jamais ces documents.
      </p>

      {entries.map((entry, index) => {
        const decisionBadge = DECISION_BADGES[entry.enrollmentStatus];
        const classStatusLabel =
          entry.classStatus === "ACTIVE"
            ? "Classe active"
            : entry.classStatus === "COMPLETED"
              ? "Classe clôturée"
              : "Classe archivée";

        return (
          <section
            key={entry.enrollmentId}
            className="rounded-xl border border-slate-200/80 bg-card shadow-sm dark:border-slate-800"
          >
            {/* En-tête de la classe du parcours */}
            <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-medium">
                    Niveau {index + 1}
                  </span>
                  <h3 className="text-base font-semibold">
                    {entry.className} — {entry.courseTitle} ({entry.courseCode})
                  </h3>
                  <span className={cn(BADGE_BASE_CLASSES, decisionBadge.classes)}>
                    {decisionBadge.label}
                  </span>
                  {entry.isActive ? (
                    <span
                      className={cn(
                        BADGE_BASE_CLASSES,
                        "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400"
                      )}
                    >
                      Classe actuelle
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      ({classStatusLabel})
                    </span>
                  )}
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <ClockIcon className="size-3.5" />
                    Depuis le {dateFormatter.format(new Date(entry.enrolledAt))}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <AwardIcon className="size-3.5" />
                    {entry.stats.validatedModuleCount}/
                    {entry.stats.gradedModuleCount} modules validés
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <CalendarCheckIcon className="size-3.5" />
                    {entry.attendance.present + entry.attendance.late}/
                    {entry.attendance.total} présences
                  </span>
                </p>
                {entry.finalDecisionNote && (
                  <p className="mt-1 max-w-2xl rounded-md bg-muted/50 px-2 py-1 text-xs italic text-muted-foreground">
                    Décision : {entry.finalDecisionNote}
                  </p>
                )}
              </div>

              {/* Documents figés de cette classe */}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={entry.stats.gradedModuleCount === 0}
                  onClick={() => openBulletin(entry)}
                >
                  <FileDownIcon data-icon="inline-start" />
                  Bulletin
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={entry.attendance.total === 0}
                  onClick={() => openAttendanceReport(entry)}
                >
                  <FileDownIcon data-icon="inline-start" />
                  Rapport de présence
                </Button>
              </div>
            </div>

            {/* Tableau des modules de cette classe */}
            {entry.modules.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                Aucun module évalué dans cette classe.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2 font-medium">Évaluation</th>
                      <th className="px-4 py-2 font-medium">Module</th>
                      <th className="px-4 py-2 text-right font-medium">Note</th>
                      <th className="px-4 py-2 text-right font-medium">Seuil</th>
                      <th className="px-4 py-2 font-medium">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entry.modules.map((module) => (
                      <tr
                        key={`${module.evaluationTitle}:${module.moduleName}`}
                        className="border-b last:border-b-0"
                      >
                        <td className="px-4 py-2 text-muted-foreground">
                          {module.evaluationTitle}
                        </td>
                        <td className="px-4 py-2 font-medium">
                          {module.moduleName}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {module.score === null
                            ? "—"
                            : `${numberFormatter.format(module.score)} / ${numberFormatter.format(module.maxScore)}`}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                          {numberFormatter.format(module.passMark)}
                        </td>
                        <td className="px-4 py-2">
                          <JourneyModuleStatusBadge module={module} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}

      {/* Modale : aperçu + impression du document de la classe sélectionnée */}
      <Dialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{preview?.title}</DialogTitle>
            <DialogDescription>
              Document figé généré depuis l&apos;historique de la classe —
              imprimez-le ou enregistrez-le en PDF via la fenêtre d&apos;impression.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border bg-muted/40 p-3">
            {preview && (
              <iframe
                title={preview.title}
                srcDoc={preview.html}
                onLoad={handlePreviewLoad}
                className="h-[420px] w-full rounded-md border bg-white"
              />
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPreview(null)}
            >
              Fermer
            </Button>
            <Button
              type="button"
              onClick={() => preview && printHtmlDocument(preview.html)}
            >
              <PrinterIcon data-icon="inline-start" />
              Imprimer / Enregistrer en PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


"use client";

import * as React from "react";
import {
  CalendarDaysIcon,
  CalendarX2Icon,
  ClipboardListIcon,
  Clock4Icon,
  EyeIcon,
  MailCheckIcon,
} from "lucide-react";

import type { StudentAttendanceEntryDTO } from "@/actions/attendance";
import {
  getAttendanceStatusBadgeClass,
  getAttendanceStatusLabel,
} from "@/lib/attendance-status";
import type { AttendanceStatus } from "@prisma/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Formatage déterministe (locale + fuseau fixes) pour éviter tout écart
// d'hydratation et garantir un rendu stable côté serveur.
const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const BADGE_BASE_CLASSES =
  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";

/** Modal d'affichage du justificatif pour une absence/excuse. */
function JustificationModal({
  entry,
  open,
  onOpenChange,
}: {
  entry: StudentAttendanceEntryDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!entry) return null;

  const hasJustification = entry.notes && entry.notes.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <EyeIcon className="size-4" />
            Voir justificatif
          </DialogTitle>
          <DialogDescription>
            Détails de l'émargement du {dateFormatter.format(entry.date)}.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {/* Informations de base */}
          <div className="grid gap-2 rounded-md border bg-muted/40 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Date
              </span>
              <span className="text-sm font-medium">
                {dateFormatter.format(entry.date)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Cours
              </span>
              <span className="text-sm font-medium">{entry.courseTitle}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Classe
              </span>
              <span className="text-sm font-medium">
                {entry.className ?? "—"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Statut
              </span>
              <span
                className={cn(
                  BADGE_BASE_CLASSES,
                  getAttendanceStatusBadgeClass(entry.status)
                )}
              >
                {getAttendanceStatusLabel(entry.status)}
              </span>
            </div>
          </div>

          {/* Justificatif */}
          {hasJustification ? (
            <div className="rounded-md border bg-amber-50/50 p-3 dark:bg-amber-500/10">
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                Justification / Remarque
              </p>
              <p className="mt-1 text-sm text-amber-900 dark:text-amber-300">
                {entry.notes}
              </p>
            </div>
          ) : (
            <div className="rounded-md border bg-muted/40 p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Aucune justification fournie
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Aucune remarque ou document joint pour cet émargement.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
function AttendanceStatCard({
  icon,
  label,
  value,
  hint,
  valueClasses,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  valueClasses?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <span className="[&_svg]:size-3.5">{icon}</span>
        {label}
      </p>
      <p
        className={cn(
          "mt-1.5 text-2xl font-semibold tabular-nums tracking-tight",
          valueClasses
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

/**
 * Onglet « Assiduité » de la fiche étudiant : historique complet des
 * émargements (présences / absences) avec synthèse par statut.
 *
 * Composant CLIENT : il utilise `React.useState` (modale de justificatif) et
 * des gestionnaires d'événements (`onClick`) — la directive « use client »
 * est donc requise en tête de fichier. Les données restent chargées côté
 * serveur (action `getStudentAttendanceHistory`) et transmises en props.
 */
export function StudentAttendanceTab({
  entries,
}: {
  entries: StudentAttendanceEntryDTO[];
}) {
  const counts = {
    PRESENT: 0,
    ABSENT: 0,
    LATE: 0,
    EXCUSED: 0,
  } as Record<AttendanceStatus, number>;

  for (const entry of entries) {
    counts[entry.status] += 1;
  }

  // PRÉSENT et EN RETARD comptent comme présences effectives
  // (même convention que les statistiques de la section Assiduité).
  const presentishCount = counts.PRESENT + counts.LATE;
  const attendanceRate =
    entries.length > 0
      ? Math.round((presentishCount / entries.length) * 100)
      : null;

  // État local pour la modale de justificatif
  const [selectedEntry, setSelectedEntry] = React.useState<
    StudentAttendanceEntryDTO | null
  >(null);
  const [modalOpen, setModalOpen] = React.useState(false);

  const handleViewJustification = (entry: StudentAttendanceEntryDTO) => {
    setSelectedEntry(entry);
    setModalOpen(true);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Synthèse des émargements */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AttendanceStatCard
          icon={<ClipboardListIcon />}
          label="Émargements"
          value={String(entries.length)}
          hint="sessions enregistrées"
        />
        <AttendanceStatCard
          icon={<CalendarDaysIcon />}
          label="Présences"
          value={String(presentishCount)}
          hint={`dont ${counts.LATE} en retard`}
          valueClasses="text-emerald-600 dark:text-emerald-400"
        />
        <AttendanceStatCard
          icon={<CalendarX2Icon />}
          label="Absences"
          value={String(counts.ABSENT)}
          hint={`dont ${counts.EXCUSED} excusée${counts.EXCUSED > 1 ? "s" : ""}`}
          valueClasses="text-red-600 dark:text-red-400"
        />
        <AttendanceStatCard
          icon={<Clock4Icon />}
          label="Taux de présence"
          value={attendanceRate === null ? "—" : `${attendanceRate} %`}
          hint="présences effectives / émargements"
        />
      </div>

      {/* Historique détaillé des émargements */}
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Historique des émargements</h3>
          <p className="text-xs text-muted-foreground">
            Présences et absences enregistrées par les enseignants.
          </p>
        </div>

        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-muted">
              <MailCheckIcon className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">Aucun émargement</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              Les présences saisies depuis la section « Assiduité »
              apparaîtront ici.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Date</TableHead>
                <TableHead>Cours</TableHead>
                <TableHead>Classe</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Remarque</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow
                  key={entry.id}
                  className="cursor-pointer transition-all hover:bg-muted hover:scale-[1.005] active:scale-[0.995]"
                >
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <CalendarDaysIcon className="size-3.5 shrink-0" />
                      {dateFormatter.format(entry.date)}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium">
                    {entry.courseTitle}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {entry.className ?? (
                      <span className="italic opacity-60">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        BADGE_BASE_CLASSES,
                        getAttendanceStatusBadgeClass(entry.status)
                      )}
                    >
                      {getAttendanceStatusLabel(entry.status)}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-muted-foreground">
                    {entry.notes ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {entry.status !== "PRESENT" &&
                      entry.notes != null && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewJustification(entry)}
                          className="text-muted-foreground hover:text-foreground transition-all hover:shadow-sm hover:scale-[1.01] active:scale-[0.99]"
                        >
                          <EyeIcon className="size-3.5" />
                          Voir justificatif
                        </Button>
                      )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {/* Modal de justificatif */}
      <JustificationModal
        entry={selectedEntry}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </div>
  );
}

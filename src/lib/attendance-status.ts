import type { AttendanceStatus } from "@prisma/client";

/** Libellés français des statuts de présence. */
export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: "Présent",
  ABSENT: "Absent",
  LATE: "En retard",
  EXCUSED: "Excusé",
};

/**
 * Classes Tailwind des badges de présence — style moderne : fond clair
 * translucide, texte assorti et fine bordure (variante sombre incluse).
 */
export const ATTENDANCE_STATUS_BADGE_CLASSES: Record<AttendanceStatus, string> =
  {
    PRESENT:
      "border border-emerald-200/60 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400",
    ABSENT:
      "border border-red-200/60 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400",
    LATE:
      "border border-amber-200/60 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400",
    EXCUSED:
      "border border-sky-200/60 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-400",
  };

/**
 * Statuts proposés lors de la prise de présence rapide.
 * Le statut LATE reste disponible dans le modèle de données mais n'est pas
 * exposé dans l'interface simplifiée (PRESENT / ABSENT / EXCUSED).
 */
export const ATTENDANCE_QUICK_STATUSES: readonly AttendanceStatus[] = [
  "PRESENT",
  "ABSENT",
  "EXCUSED",
];

export function getAttendanceStatusLabel(status: AttendanceStatus): string {
  return ATTENDANCE_STATUS_LABELS[status];
}

export function getAttendanceStatusBadgeClass(
  status: AttendanceStatus
): string {
  return ATTENDANCE_STATUS_BADGE_CLASSES[status];
}
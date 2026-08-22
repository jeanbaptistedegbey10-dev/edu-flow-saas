import type { StudentStatus } from "@prisma/client";

/** Libellés français des statuts étudiants. */
export const STUDENT_STATUS_LABELS: Record<StudentStatus, string> = {
  PROSPECT: "Prospect",
  ENROLLED: "Inscrit",
  IN_PROGRESS: "En cours",
  COMPLETED: "Terminé",
  SUSPENDED: "Suspendu",
  DROPPED_OUT: "Abandon",
};

/** Classes Tailwind des badges de statut. */
export const STUDENT_STATUS_BADGE_CLASSES: Record<StudentStatus, string> = {
  PROSPECT: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  ENROLLED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  IN_PROGRESS: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  COMPLETED: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  SUSPENDED: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  DROPPED_OUT: "bg-red-500/15 text-red-700 dark:text-red-400",
};

/** Filtres de statut disponibles dans la barre d'outils du tableau. */
export const STUDENT_STATUS_FILTERS = [
  { value: "ALL", label: "Tous" },
  { value: "PROSPECT", label: "Prospect" },
  { value: "ENROLLED", label: "Inscrit" },
  { value: "COMPLETED", label: "Terminé" },
] as const;

export type StudentStatusFilter = (typeof STUDENT_STATUS_FILTERS)[number]["value"];

export function getStudentStatusLabel(status: StudentStatus): string {
  return STUDENT_STATUS_LABELS[status];
}

export function getStudentStatusBadgeClass(status: StudentStatus): string {
  return STUDENT_STATUS_BADGE_CLASSES[status];
}
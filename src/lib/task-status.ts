import type { TaskStatus } from "@prisma/client";

/** Libellés français des statuts de tâche. */
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: "À faire",
  IN_PROGRESS: "En cours",
  REVIEW: "En révision",
  DONE: "Terminé",
};

/**
 * Classes Tailwind des badges de statut de tâche — style moderne : fond clair
 * translucide, texte assorti et fine bordure (variante sombre incluse).
 */
export const TASK_STATUS_BADGE_CLASSES: Record<TaskStatus, string> = {
  TODO: "border border-slate-200/60 bg-slate-50 text-slate-700 dark:border-slate-500/20 dark:bg-slate-500/10 dark:text-slate-400",
  IN_PROGRESS:
    "border border-blue-200/60 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-400",
  REVIEW:
    "border border-amber-200/60 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400",
  DONE: "border border-emerald-200/60 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400",
};

/**
 * Ordre d'affichage des colonnes du Kanban (toutes les valeurs de l'enum
 * sont représentées afin qu'aucune tâche ne soit invisible).
 */
export const TASK_STATUS_ORDER: readonly TaskStatus[] = [
  "TODO",
  "IN_PROGRESS",
  "REVIEW",
  "DONE",
];

export function getTaskStatusLabel(status: TaskStatus): string {
  return TASK_STATUS_LABELS[status];
}

export function getTaskStatusBadgeClass(status: TaskStatus): string {
  return TASK_STATUS_BADGE_CLASSES[status];
}
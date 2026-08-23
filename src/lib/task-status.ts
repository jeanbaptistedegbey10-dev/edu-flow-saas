import type { TaskStatus } from "@prisma/client";

/** Libellés français des statuts de tâche. */
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: "À faire",
  IN_PROGRESS: "En cours",
  REVIEW: "En révision",
  DONE: "Terminé",
};

/** Classes Tailwind des badges de statut de tâche. */
export const TASK_STATUS_BADGE_CLASSES: Record<TaskStatus, string> = {
  TODO: "bg-slate-500/15 text-slate-700 dark:text-slate-400",
  IN_PROGRESS: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  REVIEW: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  DONE: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
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
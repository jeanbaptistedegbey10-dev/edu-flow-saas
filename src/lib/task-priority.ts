import type { TaskPriority } from "@prisma/client";

/** Libellés français des priorités de tâche. */
export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: "Basse",
  MEDIUM: "Moyenne",
  HIGH: "Haute",
  URGENT: "Urgente",
};

/** Classes Tailwind des badges de priorité. */
export const TASK_PRIORITY_BADGE_CLASSES: Record<TaskPriority, string> = {
  LOW: "bg-slate-500/15 text-slate-700 dark:text-slate-400",
  MEDIUM: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  HIGH: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  URGENT: "bg-red-500/15 text-red-700 dark:text-red-400",
};

/**
 * Rang de tri décroissant : URGENT (3) > HIGH (2) > MEDIUM (1) > LOW (0).
 * Prisma ne sachant pas trier les enums selon un ordre métier, le
 * classement est appliqué en mémoire après la récupération.
 */
export const TASK_PRIORITY_RANK: Record<TaskPriority, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  URGENT: 3,
};

/** Priorités proposées à la création d'une tâche. */
export const TASK_PRIORITY_OPTIONS: readonly TaskPriority[] = [
  "LOW",
  "MEDIUM",
  "HIGH",
];

export function getTaskPriorityLabel(priority: TaskPriority): string {
  return TASK_PRIORITY_LABELS[priority];
}

export function getTaskPriorityBadgeClass(priority: TaskPriority): string {
  return TASK_PRIORITY_BADGE_CLASSES[priority];
}
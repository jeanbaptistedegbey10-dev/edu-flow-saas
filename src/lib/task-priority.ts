import type { TaskPriority } from "@prisma/client";

/** Libellés français des priorités de tâche. */
export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: "Basse",
  MEDIUM: "Moyenne",
  HIGH: "Haute",
  URGENT: "Urgente",
};

/**
 * Classes Tailwind des badges de priorité — style moderne : fond clair
 * translucide, texte assorti et fine bordure (variante sombre incluse).
 */
export const TASK_PRIORITY_BADGE_CLASSES: Record<TaskPriority, string> = {
  LOW: "border border-slate-200/60 bg-slate-50 text-slate-700 dark:border-slate-500/20 dark:bg-slate-500/10 dark:text-slate-400",
  MEDIUM:
    "border border-sky-200/60 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-400",
  HIGH: "border border-amber-200/60 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400",
  URGENT: "border border-red-200/60 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400",
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
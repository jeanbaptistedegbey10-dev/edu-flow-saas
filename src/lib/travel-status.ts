import type { TravelStatus } from "@prisma/client";

/** Ordre d'affichage des étapes du pipeline de voyage (colonnes Kanban). */
export const TRAVEL_STATUS_ORDER: readonly TravelStatus[] = [
  "DOSSIER_PREPARATION",
  "LANGUAGE_TEST",
  "ADMISSION_APPLIED",
  "ADMISSION_OBTAINED",
  "VISA_APPLIED",
  "VISA_APPROVED",
  "VISA_REJECTED",
  "DEPARTURE_READY",
  "COMPLETED",
];

/** Libellés français des statuts de dossier de voyage. */
export const TRAVEL_STATUS_LABELS: Record<TravelStatus, string> = {
  DOSSIER_PREPARATION: "Préparation dossier",
  LANGUAGE_TEST: "Test de langue",
  ADMISSION_APPLIED: "Candidature envoyée",
  ADMISSION_OBTAINED: "Admission obtenue",
  VISA_APPLIED: "Visa demandé",
  VISA_APPROVED: "Visa approuvé",
  VISA_REJECTED: "Visa refusé",
  DEPARTURE_READY: "Prêt au départ",
  COMPLETED: "Terminé",
};

/** Classes Tailwind des badges de statut. */
export const TRAVEL_STATUS_BADGE_CLASSES: Record<TravelStatus, string> = {
  DOSSIER_PREPARATION: "bg-slate-500/15 text-slate-700 dark:text-slate-400",
  LANGUAGE_TEST: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  ADMISSION_APPLIED: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  ADMISSION_OBTAINED: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400",
  VISA_APPLIED: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  VISA_APPROVED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  VISA_REJECTED: "bg-red-500/15 text-red-700 dark:text-red-400",
  DEPARTURE_READY: "bg-teal-500/15 text-teal-700 dark:text-teal-400",
  COMPLETED: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
};

export function getTravelStatusLabel(status: TravelStatus): string {
  return TRAVEL_STATUS_LABELS[status];
}

export function getTravelStatusBadgeClass(status: TravelStatus): string {
  return TRAVEL_STATUS_BADGE_CLASSES[status];
}
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

/**
 * Classes Tailwind des badges de statut — style moderne : fond clair
 * translucide, texte assorti et fine bordure (variante sombre incluse).
 * Appliquées aussi au Select de changement rapide de statut.
 */
export const TRAVEL_STATUS_BADGE_CLASSES: Record<TravelStatus, string> = {
  DOSSIER_PREPARATION:
    "border border-slate-200/60 bg-slate-50 text-slate-700 dark:border-slate-500/20 dark:bg-slate-500/10 dark:text-slate-400",
  LANGUAGE_TEST:
    "border border-sky-200/60 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-400",
  ADMISSION_APPLIED:
    "border border-blue-200/60 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-400",
  ADMISSION_OBTAINED:
    "border border-indigo-200/60 bg-indigo-50 text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-400",
  VISA_APPLIED:
    "border border-amber-200/60 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400",
  VISA_APPROVED:
    "border border-emerald-200/60 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400",
  VISA_REJECTED:
    "border border-red-200/60 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400",
  DEPARTURE_READY:
    "border border-teal-200/60 bg-teal-50 text-teal-700 dark:border-teal-500/20 dark:bg-teal-500/10 dark:text-teal-400",
  COMPLETED:
    "border border-violet-200/60 bg-violet-50 text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-400",
};

export function getTravelStatusLabel(status: TravelStatus): string {
  return TRAVEL_STATUS_LABELS[status];
}

export function getTravelStatusBadgeClass(status: TravelStatus): string {
  return TRAVEL_STATUS_BADGE_CLASSES[status];
}
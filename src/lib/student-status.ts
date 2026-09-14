import type { StudentStatus } from "@prisma/client";

/**
 * Libellés français des statuts étudiants — SOURCE UNIQUE de vérité.
 *
 * Nomenclature canonique du produit (4 statuts sélectionnables) :
 *   - PROSPECT    → « Prospect »
 *   - ENROLLED    → « Inscrit »
 *   - DROPPED_OUT → « Abandonné »
 *   - COMPLETED   → « Diplômé / Terminé »
 *
 * Les libellés des anciens statuts (IN_PROGRESS, SUSPENDED) sont conservés
 * uniquement pour l'affichage des fiches historiques créées avant
 * l'harmonisation — ils ne doivent plus être proposés dans les formulaires.
 */
export const STUDENT_STATUS_LABELS: Record<StudentStatus, string> = {
  PROSPECT: "Prospect",
  ENROLLED: "Inscrit",
  IN_PROGRESS: "En cours",
  COMPLETED: "Diplômé / Terminé",
  SUSPENDED: "Suspendu",
  DROPPED_OUT: "Abandonné",
};

/**
 * Les QUATRE seuls statuts sélectionnables dans les contrôles de formulaire
 * (création / édition d'étudiant) et les filtres de la vue liste.
 */
export const CANONICAL_STUDENT_STATUS_OPTIONS: ReadonlyArray<{
  value: StudentStatus;
  label: string;
}> = [
  { value: "PROSPECT", label: "Prospect" },
  { value: "ENROLLED", label: "Inscrit" },
  { value: "COMPLETED", label: "Diplômé / Terminé" },
  { value: "DROPPED_OUT", label: "Abandonné" },
];

/**
 * Classes Tailwind des badges de statut — style moderne : fond clair
 * translucide, texte assorti et fine bordure (variante sombre incluse).
 */
export const STUDENT_STATUS_BADGE_CLASSES: Record<StudentStatus, string> = {
  PROSPECT:
    "border border-sky-200/60 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-400",
  ENROLLED:
    "border border-emerald-200/60 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400",
  IN_PROGRESS:
    "border border-blue-200/60 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-400",
  COMPLETED:
    "border border-violet-200/60 bg-violet-50 text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-400",
  SUSPENDED:
    "border border-amber-200/60 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400",
  DROPPED_OUT:
    "border border-red-200/60 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400",
};

/** Badge neutre pour un statut inconnu / illisible (donnée historique). */
const UNKNOWN_STATUS_BADGE_CLASSES =
  "border border-slate-200/60 bg-slate-50 text-slate-700 dark:border-slate-500/20 dark:bg-slate-500/10 dark:text-slate-400";

/** Filtres de statut disponibles dans la barre d'outils du tableau. */
export const STUDENT_STATUS_FILTERS = [
  { value: "ALL", label: "Tous" },
  { value: "ENROLLED", label: "Inscrits" },
  { value: "PROSPECT", label: "Prospects" },
  { value: "COMPLETED", label: "Diplômés" },
  { value: "DROPPED_OUT", label: "Abandonnés" },
] as const;

export type StudentStatusFilter = (typeof STUDENT_STATUS_FILTERS)[number]["value"];

export function getStudentStatusLabel(
  status: StudentStatus | string
): string {
  // Tolérant aux valeurs hors enum (donnée historique / incohérente) :
  // retourne toujours une chaîne affichable au lieu de `undefined`.
  // Le paramètre élargi (`string`) permet à tous les consommateurs — y compris
  // les PDF dont le DTO est typé `string` — d'utiliser CETTE source unique.
  return STUDENT_STATUS_LABELS[status as StudentStatus] ?? "Inconnu";
}

export function getStudentStatusBadgeClass(status: StudentStatus): string {
  return STUDENT_STATUS_BADGE_CLASSES[status] ?? UNKNOWN_STATUS_BADGE_CLASSES;
}
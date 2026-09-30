/**
 * Cycle de vie d'une classe / cohorte.
 *
 * Séquence nominale : PLANIFIED (programmée) → IN_PROGRESS (démarrée) →
 * COMPLETED (clôturée, décisions de passage enregistrées) → ARCHIVED
 * (archivée, consultable en lecture seule).
 *
 * `ACTIVE` est conservé comme alias historique des classes créées avant
 * l'introduction du cycle de vie : il est traité comme « en cours ».
 * `ARCHIVED` retire la classe de l'exploitation courante.
 *
 * Le cycle est RÉVERSIBLE : une classe archivée peut être désarchivée
 * (`unarchiveClassAction`) pour redevenir exploitable (émargement, cahier de
 * texte, évaluations, inscriptions).
 */

import type { ClassStatus } from "@prisma/client";

/** Ordre d'affichage du cycle de vie (badges, filtres, Select). */
export const CLASS_STATUS_ORDER: readonly ClassStatus[] = [
  "PLANIFIED",
  "IN_PROGRESS",
  "COMPLETED",
  "ARCHIVED",
];

/** Libellés français des statuts de classe. */
export const CLASS_STATUS_LABELS: Record<ClassStatus, string> = {
  PLANIFIED: "Planifiée",
  IN_PROGRESS: "En cours",
  ACTIVE: "Active",
  COMPLETED: "Clôturée",
  ARCHIVED: "Archivée",
};

/** Classes de badge (Tailwind) associées à chaque statut de classe. */
export const CLASS_STATUS_BADGE_CLASSES: Record<ClassStatus, string> = {
  PLANIFIED:
    "border border-sky-200/60 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-400",
  IN_PROGRESS:
    "border border-emerald-200/60 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400",
  ACTIVE:
    "border border-emerald-200/60 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400",
  COMPLETED:
    "border border-violet-200/60 bg-violet-50 text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-400",
  ARCHIVED:
    "border border-slate-200/60 bg-slate-50 text-slate-700 dark:border-slate-500/20 dark:bg-slate-500/10 dark:text-slate-400",
};

/**
 * Statuts d'une classe considérée comme « en cours » : statut explicite
 * IN_PROGRESS ou alias historique ACTIVE (classes créées avant l'introduction
 * du cycle de vie PLANIFIED / IN_PROGRESS).
 */
export const ONGOING_CLASS_STATUSES: ClassStatus[] = ["ACTIVE", "IN_PROGRESS"];

/**
 * Statuts proposés dans les sélecteurs OPÉRATIONNELS (prise de présence,
 * cahier de texte, feuille récapitulative…).
 *
 * On ne retient que les classes encore exploitables : « En cours » (IN_PROGRESS
 * ou l'alias historique ACTIVE) et « Planifiée » (PLANIFIED). Les classes
 * clôturées (COMPLETED) et archivées (ARCHIVED) en sont EXCLUES : elles ne
 * sont plus destinations d'un émargement ni d'une saisie de cahier de texte —
 * leur historique reste consultable via les modules d'archive dédiés.
 */
export const SELECTABLE_CLASS_STATUSES: ClassStatus[] = [
  "PLANIFIED",
  "ACTIVE",
  "IN_PROGRESS",
];

/**
 * Vrai si la classe doit être proposée dans les sélecteurs opérationnels.
 * Renvoie `false` pour les classes clôturées (COMPLETED) ou archivées
 * (ARCHIVED).
 */
export function isClassSelectable(status: ClassStatus): boolean {
  return SELECTABLE_CLASS_STATUSES.includes(status);
}

/** Filtre une liste de classes pour ne garder que les classes actives. */
export function filterSelectableClasses<T extends { status: ClassStatus }>(
  classes: readonly T[]
): T[] {
  return classes.filter((klass) => isClassSelectable(klass.status));
}

/** Vrai si la classe a démarré (cours dispensés, émargement ouvert). */
export function isClassOngoing(status: ClassStatus): boolean {
  return ONGOING_CLASS_STATUSES.includes(status);
}

/** Vrai si la classe peut encore être démarrée (action « Démarrer »). */
export function canStartClass(status: ClassStatus): boolean {
  return status === "PLANIFIED";
}

/**
 * Vrai si la classe peut être clôturée : elle doit avoir démarré et ne pas
 * l'être déjà (les classes clôturées / archivées sont figées).
 */
export function canCloseClass(status: ClassStatus): boolean {
  return isClassOngoing(status);
}

/**
 * Vrai si la classe peut être archivée : l'archivage est l'étape de FIN DE VIE
 * du cycle de vie, réservée aux classes DÉJÀ clôturées (COMPLETED).
 *
 * - PLANIFIED / ACTIVE / IN_PROGRESS : refus — les décisions de passage
 *   doivent d'abord être actées via la clôture (`closeClassAction`) ;
 * - COMPLETED : action proposée (« Archiver la classe ») ;
 * - ARCHIVED : déjà archivée, la classe reste consultable en lecture seule
 *   dans l'onglet « Archives » (l'action devient sans objet).
 */
export function canArchiveClass(status: ClassStatus): boolean {
  return status === "COMPLETED";
}

/**
 * Vrai si la classe peut être DÉSARCHIVÉE / RÉACTIVÉE : action inverse de
 * l'archivage, réservée aux classes ARCHIVED (onglet « Archives »).
 *
 * Une fois désarchivée, la classe repasse en exploitation :
 * `ACTIVE` → elle réapparaît dans les sélecteurs opérationnels (émargement,
 * cahier de texte, évaluations) et accepte à nouveau l'inscription d'élèves
 * ainsi que la saisie / correction des présences, cahiers de texte et notes.
 */
export function canUnarchiveClass(status: ClassStatus): boolean {
  return status === "ARCHIVED";
}

/**
 * Statut de retour à l'exploitation après une action inverse du cycle de vie
 * (désarchivage ou annulation de clôture) :
 *
 * - ARCHIVED → ACTIVE (désarchivage) ;
 * - COMPLETED → IN_PROGRESS (annulation de clôture).
 */
export function resolveRestoredStatus(status: ClassStatus): ClassStatus {
  return status === "ARCHIVED" ? "ACTIVE" : "IN_PROGRESS";
}

export function getClassStatusLabel(status: ClassStatus): string {
  return CLASS_STATUS_LABELS[status];
}

export function getClassStatusBadgeClass(status: ClassStatus): string {
  return CLASS_STATUS_BADGE_CLASSES[status];
}

/**
 * Année académique courante, au format « 2025-2026 ».
 *
 * Convention : l'année académique démarre en septembre — avant septembre,
 * l'année affichée est donc « (N−1)-N ». Utilisée par défaut à la création
 * de chaque `ClassEnrollment` (historique multi-classes / réinscriptions).
 */
export function getCurrentAcademicYear(now: Date = new Date()): string {
  const year = now.getFullYear();
  const startYear = now.getMonth() >= 8 ? year : year - 1; // 8 = septembre
  return `${startYear}-${startYear + 1}`;
}
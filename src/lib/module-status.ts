/**
 * Statuts de validation des modules (par module, sans moyenne générale).
 *
 * Convention métier : un module est validé indépendamment des autres dès que
 * la note obtenue atteint le seuil de validation (passMark, ex : 60/100).
 * Aucune moyenne pondérée, aucune conversion sur 20.
 */

import type { ModuleStatus } from "@prisma/client";

/** Libellés français des statuts de module (affichage écran / bulletins). */
export const MODULE_STATUS_LABELS: Record<ModuleStatus | "NOT_GRADED", string> = {
  VALIDATED: "Validé",
  FAILED: "Non validé",
  RETAKE: "À reprendre",
  NOT_GRADED: "Non noté",
};

/** Classes de badge (Tailwind) associées à chaque statut de module. */
export const MODULE_STATUS_BADGE_CLASSES: Record<ModuleStatus | "NOT_GRADED", string> = {
  VALIDATED:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  FAILED: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  RETAKE:
    "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  NOT_GRADED:
    "bg-muted text-muted-foreground",
};

/**
 * Calcule le statut de validation d'un module à partir de la note obtenue et
 * du seuil (passMark). `null` pour une note non saisie — la ligne reste sans
 * statut (jamais comptée comme échec).
 */
export function computeModuleStatus(
  score: number | null | undefined,
  passMark: number
): ModuleStatus | null {
  if (score === null || score === undefined || !Number.isFinite(score)) {
    return null;
  }
  return score >= passMark ? "VALIDATED" : "FAILED";
}

/**
 * Récapitulatif de validation d'un étudiant sur un ensemble de modules :
 * compteurs + décision de passage automatique (tous les modules requis
 * évalués sont validés).
 */
export type ModuleValidationSummary = {
  /** Modules effectivement notés (score saisi). */
  graded: number;
  /** Modules notés dont le statut est VALIDATED. */
  validated: number;
  /** Modules notés dont le statut est FAILED. */
  failed: number;
  /** Modules programmés sans note saisie. */
  ungraded: number;
  /** Modules explicitement marqués RETAKE (à reprendre). */
  retakes: number;
  /**
   * Décision automatique proposée : `true` si au moins un module est noté,
   * qu'aucun module noté n'est en échec et qu'aucun module requis n'est resté
   * sans note (tous les modules évalués doivent être couverts).
   */
  eligibleForPromotion: boolean;
};

/** Agrège des couples (score, passMark) en récapitulatif de validation. */
export function summarizeModuleValidation(
  entries: Array<{ score: number | null; passMark: number; status?: ModuleStatus | null }>
): ModuleValidationSummary {
  let graded = 0;
  let validated = 0;
  let failed = 0;
  let ungraded = 0;
  let retakes = 0;

  for (const entry of entries) {
    if (entry.status === "RETAKE") {
      retakes += 1;
      continue;
    }

    const status = entry.status ?? computeModuleStatus(entry.score, entry.passMark);

    if (status === null) {
      ungraded += 1;
      continue;
    }

    graded += 1;
    if (status === "VALIDATED") {
      validated += 1;
    } else {
      failed += 1;
    }
  }

  return {
    graded,
    validated,
    failed,
    ungraded,
    retakes,
    eligibleForPromotion: graded > 0 && failed === 0 && ungraded === 0,
  };
}

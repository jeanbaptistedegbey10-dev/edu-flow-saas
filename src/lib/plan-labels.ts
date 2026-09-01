// --------------------------------------
// Plans & statuts d'abonnement — constantes partagées
// --------------------------------------
//
// Ce module est volontairement « client-safe » : il ne dépend d'aucune
// dépendance serveur (Prisma, NextAuth, node:crypto…). Il peut donc être
// importé indifféremment par :
// - des Server Components / Server Actions (via src/lib/license-check.ts) ;
// - des composants clients (ex : back-office /super-admin, page /billing).
//
// Les définitions source vivent ICI ; `src/lib/license-check.ts` les
// ré-exporte pour préserver son API publique historique.

/** Types de plans commerciaux supportés (colonne `Organization.planType`). */
export const PLAN_TYPES = [
  "TRIAL",
  "SAAS_MONTHLY",
  "SAAS_YEARLY",
  "SELF_HOSTED",
  "OFFLINE",
  "DESKTOP_LIFETIME",
] as const;

export type PlanType = (typeof PLAN_TYPES)[number];

/**
 * Types de plans éligibles à une CLÉ DE LICENCE signée. L'essai gratuit
 * (TRIAL) ne nécessite pas de clé : il est porté par `trialEndsAt`.
 */
export const LICENSE_PLAN_TYPES = [
  "SAAS_MONTHLY",
  "SAAS_YEARLY",
  "SELF_HOSTED",
  "OFFLINE",
  "DESKTOP_LIFETIME",
] as const;

export type LicensePlanType = (typeof LICENSE_PLAN_TYPES)[number];

/** Statuts possibles d'un plan (colonne `Organization.planStatus`). */
export const PLAN_STATUSES = ["ACTIVE", "EXPIRED", "CANCELLED"] as const;

export type PlanStatus = (typeof PLAN_STATUSES)[number];

/** Libellés français des types de plans (UI). */
export const PLAN_TYPE_LABELS: Record<PlanType, string> = {
  TRIAL: "Essai gratuit",
  SAAS_MONTHLY: "SaaS mensuel",
  SAAS_YEARLY: "SaaS annuel",
  SELF_HOSTED: "Licence auto-hébergée",
  OFFLINE: "Licence hors-ligne",
  DESKTOP_LIFETIME: "Desktop hors-ligne — à vie",
};

/** Libellés français des statuts de plan (UI). */
export const PLAN_STATUS_LABELS: Record<PlanStatus, string> = {
  ACTIVE: "Actif",
  EXPIRED: "Expiré",
  CANCELLED: "Annulé",
};

/** Classes Tailwind des badges de type de plan. */
export const PLAN_TYPE_BADGE_CLASSES: Record<PlanType, string> = {
  TRIAL:
    "border border-slate-200/60 bg-slate-50 text-slate-700 dark:border-slate-500/20 dark:bg-slate-500/10 dark:text-slate-400",
  SAAS_MONTHLY:
    "border border-sky-200/60 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-400",
  SAAS_YEARLY:
    "border border-indigo-200/60 bg-indigo-50 text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-400",
  SELF_HOSTED:
    "border border-emerald-200/60 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400",
  OFFLINE:
    "border border-violet-200/60 bg-violet-50 text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-400",
  DESKTOP_LIFETIME:
    "border border-fuchsia-200/60 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-500/20 dark:bg-fuchsia-500/10 dark:text-fuchsia-400",
};

/** Classes Tailwind des badges de statut de plan. */
export const PLAN_STATUS_BADGE_CLASSES: Record<PlanStatus, string> = {
  ACTIVE:
    "border border-emerald-200/60 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400",
  EXPIRED:
    "border border-amber-200/60 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400",
  CANCELLED:
    "border border-red-200/60 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400",
};

export function getPlanTypeLabel(planType: PlanType): string {
  return PLAN_TYPE_LABELS[planType];
}

export function getPlanStatusLabel(planStatus: PlanStatus): string {
  return PLAN_STATUS_LABELS[planStatus];
}

export function getPlanTypeBadgeClass(planType: PlanType): string {
  return PLAN_TYPE_BADGE_CLASSES[planType];
}

export function getPlanStatusBadgeClass(planStatus: PlanStatus): string {
  return PLAN_STATUS_BADGE_CLASSES[planStatus];
}

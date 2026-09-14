// --------------------------------------
// Contrôle d'accès aux modules selon le Plan
// --------------------------------------
import type { PlanType } from "@/lib/plan-labels";

export type { PlanType };

/** Niveaux de plans commerciaux (ordre croissant de fonctionnalités). */
export const PLAN_TIERS = {
  ESSENTIAL: "ESSENTIAL",
  PRO: "PRO",
  PREMIUM: "PREMIUM",
} as const;

export type PlanTier = (typeof PLAN_TIERS)[keyof typeof PLAN_TIERS];

/** Modules fonctionnels de la plateforme. */
export const MODULES = {
  STUDENTS: "students",
  CLASSES: "classes",
  PAYMENTS_BASIC: "payments_basic",
  ATTENDANCE: "attendance",
  CERTIFICATES: "certificates",
  CRM_PROSPECTS: "crm_prospects",
  CASH_CLOSURE: "cash_closure",
  PAYMENT_SCHEDULES: "payment_schedules",
  PREMIUM_PDF: "premium_pdf",
  TRAVEL_PROCEDURES: "travel_procedures",
  POS: "pos",
  TREASURY: "treasury",
  AUDIT_LOG: "audit_log",
  CSV_IMPORT_EXPORT: "csv_import_export",
} as const;

export type Module = (typeof MODULES)[keyof typeof MODULES];

/** Matrice d'activation des modules par niveau de plan. */
const PLAN_MODULES: Record<PlanTier, Module[]> = {
  [PLAN_TIERS.ESSENTIAL]: [
    MODULES.STUDENTS,
    MODULES.CLASSES,
    MODULES.PAYMENTS_BASIC,
    MODULES.ATTENDANCE,
    MODULES.CERTIFICATES,
    MODULES.POS,
    MODULES.CSV_IMPORT_EXPORT,
  ],
  [PLAN_TIERS.PRO]: [
    MODULES.STUDENTS,
    MODULES.CLASSES,
    MODULES.PAYMENTS_BASIC,
    MODULES.ATTENDANCE,
    MODULES.CERTIFICATES,
    MODULES.CRM_PROSPECTS,
    MODULES.CASH_CLOSURE,
    MODULES.PAYMENT_SCHEDULES,
    MODULES.PREMIUM_PDF,
    MODULES.POS,
    MODULES.TREASURY,
    MODULES.AUDIT_LOG,
    MODULES.CSV_IMPORT_EXPORT,
  ],
  [PLAN_TIERS.PREMIUM]: [
    MODULES.STUDENTS,
    MODULES.CLASSES,
    MODULES.PAYMENTS_BASIC,
    MODULES.ATTENDANCE,
    MODULES.CERTIFICATES,
    MODULES.CRM_PROSPECTS,
    MODULES.CASH_CLOSURE,
    MODULES.PAYMENT_SCHEDULES,
    MODULES.PREMIUM_PDF,
    MODULES.TRAVEL_PROCEDURES,
    MODULES.POS,
    MODULES.TREASURY,
    MODULES.AUDIT_LOG,
    MODULES.CSV_IMPORT_EXPORT,
  ],
};

/** Mapping du type de plan commercial vers le niveau de fonctionnalités. */
function planTypeToTier(planType: PlanType): PlanTier {
  switch (planType) {
    case "TRIAL":
      return PLAN_TIERS.PREMIUM;
    case "SAAS_MONTHLY":
      return PLAN_TIERS.ESSENTIAL;
    case "SAAS_HALF_YEAR":
      return PLAN_TIERS.PRO;
    case "SAAS_YEARLY":
      return PLAN_TIERS.PREMIUM;
    case "SELF_HOSTED":
      return PLAN_TIERS.PREMIUM;
    case "OFFLINE":
      return PLAN_TIERS.PRO;
    case "DESKTOP_LIFETIME":
      return PLAN_TIERS.PRO;
    default:
      return PLAN_TIERS.ESSENTIAL;
  }
}

/** Vérifie si un module est activé pour un plan donné. */
export function isModuleEnabled(module: Module, planType: PlanType): boolean {
  const tier = planTypeToTier(planType);
  return PLAN_MODULES[tier].includes(module);
}

/** Indique si le module "Procédures voyage" est actif pour le plan. */
export function isTravelModuleEnabled(planType: PlanType): boolean {
  return isModuleEnabled(MODULES.TRAVEL_PROCEDURES, planType);
}

/** Indique si le module "Journal d'audit" est actif pour le plan. */
export function isAuditLogEnabled(planType: PlanType): boolean {
  return isModuleEnabled(MODULES.AUDIT_LOG, planType);
}

/** Indique si le module "CRM Prospects" est actif pour le plan. */
export function isCrmEnabled(planType: PlanType): boolean {
  return isModuleEnabled(MODULES.CRM_PROSPECTS, planType);
}

/** Indique si le module "Clôture de caisse" est actif pour le plan. */
export function isCashClosureEnabled(planType: PlanType): boolean {
  return isModuleEnabled(MODULES.CASH_CLOSURE, planType);
}

/** Retourne le niveau de plan (tier) pour un type de plan donné. */
export function getPlanTier(planType: PlanType): PlanTier {
  return planTypeToTier(planType);
}

/** Libellés français des niveaux de plans (affichage UI). */
export const PLAN_TIER_LABELS: Record<PlanTier, string> = {
  ESSENTIAL: "Essentiel",
  PRO: "Pro",
  PREMIUM: "Premium",
};

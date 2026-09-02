// --------------------------------------
// Modèle commercial hybride — constantes de tarification
// --------------------------------------
//
// Ce module est volontairement « client-safe » : aucune dépendance serveur
// (Prisma, node:crypto…). Il définit les FORMULES COMMERCIALES de la grille
// tarifaire dynamique (`PlanPricing`, éditable dans /super-admin/pricing) :
//
//   - SAAS_CLOUD      : abonnement SaaS hébergé (cloud) ;
//   - SELF_HOSTED     : Self-Hosted Docker (installé chez le client) ;
//   - DESKTOP_OFFLINE : Desktop Offline .exe (poste de travail isolé).
//
// Modèle « Acquisition + Renouvellement » :
//   - aucune facture COMPLETED → `initialPrice` (1ʳᵉ année / licence + logiciel) ;
//   - au moins une facture COMPLETED → tarif de renouvellement selon la durée
//     souscrite (`renewalAnnualPrice` pour 12 mois, `renewalHalfYearPrice`
//     pour 6 mois) — calcul effectué côté serveur par
//     `calculateSubscriptionPrice()` (src/lib/payment.ts).

import type { LicensePlanType } from "@/lib/plan-labels";

/** Formules commerciales de la grille tarifaire dynamique. */
export const PRICING_PLAN_TYPES = [
  "SAAS_CLOUD",
  "SELF_HOSTED",
  "DESKTOP_OFFLINE",
] as const;

export type PricingPlanType = (typeof PRICING_PLAN_TYPES)[number];

/** Vérifie que la valeur est bien une formule commerciale de la grille. */
export function isPricingPlanType(value: unknown): value is PricingPlanType {
  return (
    typeof value === "string" &&
    (PRICING_PLAN_TYPES as readonly string[]).includes(value)
  );
}

/** Libellés commerciaux des formules (UI, factures). */
export const PRICING_PLAN_LABELS: Record<PricingPlanType, string> = {
  SAAS_CLOUD: "SaaS Cloud",
  SELF_HOSTED: "Self-Hosted Docker",
  DESKTOP_OFFLINE: "Desktop Offline (.exe)",
};

/** Accroches marketing affichées sous le libellé de chaque formule. */
export const PRICING_PLAN_TAGLINES: Record<PricingPlanType, string> = {
  SAAS_CLOUD: "Hébergé et sauvegardé par EduFlow, accessible partout.",
  SELF_HOSTED: "Déployé chez vous (Docker) — vos données restent sur site.",
  DESKTOP_OFFLINE: "Application Windows (.exe) fonctionnant sans Internet.",
};

/** Valeurs de prix d'une ligne de la grille tarifaire (XOF / FCFA). */
export type PlanPricingValues = {
  initialPrice: number;
  renewalAnnualPrice: number;
  renewalHalfYearPrice: number;
};

/**
 * Grille tarifaire par défaut — miroir du seed de la migration
 * `20260901000000_add_plan_pricing`. Sert de REPLI si une ligne manque
 * encore en base (le Super-Admin peut ensuite ajuster chaque montant).
 */
export const DEFAULT_PLAN_PRICING: Record<PricingPlanType, PlanPricingValues> = {
  SAAS_CLOUD: {
    initialPrice: 80_000,
    renewalAnnualPrice: 50_000,
    renewalHalfYearPrice: 30_000,
  },
  SELF_HOSTED: {
    initialPrice: 160_000,
    renewalAnnualPrice: 80_000,
    renewalHalfYearPrice: 45_000,
  },
  DESKTOP_OFFLINE: {
    initialPrice: 160_000,
    renewalAnnualPrice: 80_000,
    renewalHalfYearPrice: 45_000,
  },
};

/** Durées de facturation supportées : 12 mois (annuel) et 6 mois (semestriel). */
export const BILLING_DURATIONS = [12, 6] as const;

export type BillingDuration = (typeof BILLING_DURATIONS)[number];

/** Vérifie que la durée souscrite est facturable (12 ou 6 mois). */
export function isBillingDuration(value: unknown): value is BillingDuration {
  return value === 12 || value === 6;
}

/** Libellés de période affichés sous les prix (UI). */
export const DURATION_PERIOD_LABELS: Record<BillingDuration, string> = {
  12: "/ 12 mois",
  6: "/ 6 mois",
};

/** Prix appliqué par le calcul dynamique (statut client + durée). */
export type SubscriptionPriceKind =
  | "INITIAL"
  | "RENEWAL_ANNUAL"
  | "RENEWAL_HALF_YEAR";

/** Libellés français des prix appliqués (factures, références hors-ligne). */
export const SUBSCRIPTION_PRICE_KIND_LABELS: Record<
  SubscriptionPriceKind,
  string
> = {
  INITIAL: "Prix initial — 1ʳᵉ année (licence + logiciel)",
  RENEWAL_ANNUAL: "Renouvellement 12 mois",
  RENEWAL_HALF_YEAR: "Renouvellement 6 mois",
};

/**
 * Type de plan de LICENCE signée correspondant à une formule commerciale et
 * une durée : la grille tarifaire et le moteur de licences Ed25519 partagent
 * le même socle (`LicensePlanType`) — le cloud semestriel dispose de son
 * propre plan (`SAAS_HALF_YEAR`) pour un affichage fidèle côté client.
 */
export function getLicensePlanTypeFor(
  planType: PricingPlanType,
  durationMonths: BillingDuration
): LicensePlanType {
  if (planType === "SAAS_CLOUD") {
    return durationMonths === 12 ? "SAAS_YEARLY" : "SAAS_HALF_YEAR";
  }

  if (planType === "SELF_HOSTED") {
    return "SELF_HOSTED";
  }

  return "OFFLINE";
}

/**
 * Mapping inverse (référence affichage) : type de licence → formule
 * commerciale de la grille tarifaire à consulter.
 */
export function getPricingPlanForLicensePlan(
  planType: LicensePlanType
): PricingPlanType {
  switch (planType) {
    case "SAAS_MONTHLY":
    case "SAAS_HALF_YEAR":
    case "SAAS_YEARLY":
      return "SAAS_CLOUD";
    case "SELF_HOSTED":
      return "SELF_HOSTED";
    case "OFFLINE":
    case "DESKTOP_LIFETIME":
      return "DESKTOP_OFFLINE";
  }
}

/**
 * Mapping licence ↔ formule commerciale de la grille tarifaire.
 *
 * `LicensePlanType` (colonne `Organization.planType`) engendre plusieurs
 * variantes que la grille tarifaire regroupe en 3 formules commerciales
 * (`PricingPlanType`) : le cloud semestriel et mensuel partagent la formule
 * SAAS_CLOUD. Cette fonction déduit la formule active à partir du type de
 * licence enregistré sur l'organisation — `null` si c'est un essai ou s'il n'y
 * a pas de licence.
 */
export function getPricingPlanForLicensePlanSafe(
  planType: string
): PricingPlanType | null {
  switch (planType) {
    case "SAAS_MONTHLY":
    case "SAAS_HALF_YEAR":
    case "SAAS_YEARLY":
      return "SAAS_CLOUD";
    case "SELF_HOSTED":
      return "SELF_HOSTED";
    case "OFFLINE":
    case "DESKTOP_LIFETIME":
      return "DESKTOP_OFFLINE";
    default:
      return null; // TRIAL ou inconnue.
  }
}

/** Libellés de déploiement affichés dans la grille et sur les cartes. */
export const PRICING_DEPLOYMENT_LABELS: Record<PricingPlanType, string> = {
  SAAS_CLOUD: "Cloud (hébergé)",
  SELF_HOSTED: "Self-Hosted (Docker)",
  DESKTOP_OFFLINE: "Desktop Offline (.exe)",
};

/** Formate un montant XOF pour l'affichage (ex : « 80 000 FCFA »). */
export function formatXOF(amount: number): string {
  return (
    new Intl.NumberFormat("fr-FR", {
      style: "decimal",
      maximumFractionDigits: 0,
    }).format(amount) + " FCFA"
  );
}

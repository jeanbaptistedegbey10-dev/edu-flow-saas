import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import {
  PLAN_STATUSES,
  PLAN_TYPES,
  PLAN_STATUS_LABELS,
  PLAN_TYPE_LABELS,
  type PlanStatus,
  type PlanType,
} from "@/lib/plan-labels";
import { getValidatedSessionContext } from "@/lib/session";

// --------------------------------------
// Licence & abonnement (SaaS + Licences)
// --------------------------------------
//
// Centre de décision unique pour la commercialisation multi-versions :
// - TRIAL        : essai gratuit de 30 jours (`trialEndsAt`) ;
// - SAAS_*       : abonnement cloud, validité portée par `licenseEndsAt` ;
// - SELF_HOSTED  : licence sur site (clé unique `licenseKey`) ;
// - OFFLINE      : licence hors-ligne ;
// - DESKTOP_LIFETIME : desktop hors-ligne à vie (clé signée perpétuelle).
//
// Règle d'accès (Phase 1) :
//   la lecture des données reste toujours possible, mais dès que la période
//   d'essai / de licence est dépassée OU que `planStatus` n'est plus « ACTIVE »,
//   les fonctionnalités de création / modification sont bloquées et
//   l'utilisateur est redirigé vers la page /billing.
//
// Ce module est utilisé :
// - par les Server Actions d'écriture (`assertCanMutate`) ;
// - par le layout du tableau de bord (bannière d'essai) ;
// - par la page /billing (état détaillé de l'abonnement).

// Les types & constantes de plans vivent dans `@/lib/plan-labels.ts`
// (module « client-safe », sans dépendance serveur) ; ils sont ré-exportés
// ici pour préserver l'API publique historique de ce module.
export {
  PLAN_STATUSES,
  PLAN_TYPES,
  PLAN_STATUS_LABELS,
  PLAN_TYPE_LABELS,
};
export type { PlanStatus, PlanType };

/** Raisons possibles de restriction d'accès en écriture. */
export type LicenseRestrictionReason =
  | "TRIAL_EXPIRED"
  | "LICENSE_EXPIRED"
  | "PLAN_INACTIVE";

/** État complet de la licence / de l'abonnement d'une organisation. */
export type LicenseState = {
  planType: PlanType;
  planStatus: PlanStatus;
  trialEndsAt: Date | null;
  licenseEndsAt: Date | null;
  hasLicenseKey: boolean;
  /**
   * Jours restants de la période d'essai (0 minimum). `null` lorsque le plan
   * n'est pas un essai ou lorsqu'aucune date de fin n'est définie.
   */
  trialDaysLeft: number | null;
  /** Date de fin d'accès effective (essai ou licence) ; null = illimité. */
  accessEndsAt: Date | null;
  /** `true` si l'organisation peut créer / modifier des données. */
  canWrite: boolean;
  /** Raison du blocage en écriture ; `null` si l'accès est complet. */
  restrictionReason: LicenseRestrictionReason | null;
  /**
   * `true` si la bannière d'avertissement doit être affichée sur le tableau
   * de bord (essai actif se terminant dans moins de 7 jours).
   */
  showTrialWarning: boolean;
};

/** Durée standard de la période d'essai gratuite (jours). */
export const TRIAL_DURATION_DAYS = 30;

/** Nombre de millisecondes dans une journée. */
export const DAY_MS = 86_400_000;

/** Fenêtre d'affichage de la bannière « essai bientôt terminé » (jours). */
const TRIAL_WARNING_WINDOW_DAYS = 7;

// Les libellés PLAN_TYPE_LABELS / PLAN_STATUS_LABELS sont importés puis
// ré-exportés depuis `@/lib/plan-labels.ts` (voir imports en tête de fichier).

/** Messages explicatifs affichés sur la page /billing et les bannières. */
export const RESTRICTION_REASON_MESSAGES: Record<
  LicenseRestrictionReason,
  string
> = {
  TRIAL_EXPIRED:
    "Votre période d'essai gratuit de 30 jours est terminée. Les fonctions de création et de modification sont désactivées.",
  LICENSE_EXPIRED:
    "Votre licence a expiré. Les fonctions de création et de modification sont désactivées.",
  PLAN_INACTIVE:
    "Votre abonnement n'est plus actif. Les fonctions de création et de modification sont désactivées.",
};

function normalizePlanType(value: string | null | undefined): PlanType {
  const normalized =
    typeof value === "string" ? (value.trim().toUpperCase() as PlanType) : null;
  return normalized && PLAN_TYPES.includes(normalized) ? normalized : "TRIAL";
}

function normalizePlanStatus(value: string | null | undefined): PlanStatus {
  const normalized =
    typeof value === "string"
      ? (value.trim().toUpperCase() as PlanStatus)
      : null;
  return normalized && PLAN_STATUSES.includes(normalized)
    ? normalized
    : "ACTIVE";
}

/** État restrictif de repli (organisation introuvable / base injoignable). */
function restrictedFallbackState(
  restrictionReason: LicenseRestrictionReason
): LicenseState {
  return {
    planType: "TRIAL",
    planStatus: "EXPIRED",
    trialEndsAt: null,
    licenseEndsAt: null,
    hasLicenseKey: false,
    trialDaysLeft: null,
    accessEndsAt: null,
    canWrite: false,
    restrictionReason,
    showTrialWarning: false,
  };
}
/**
 * Calcule l'état de licence / d'abonnement d'une organisation à partir de la
 * base de données (source de vérité). Ne lève jamais d'exception : en cas de
 * panne, un état restrictif est retourné afin de ne jamais exposer d'écritures
 * non autorisées.
 *
 * Convention de compatibilité : une organisation de type TRIAL sans
 * `trialEndsAt` (créée avant l'introduction du champ) conserve l'accès —
 * seules les nouvelles organisations reçoivent une date d'essai à l'onboarding.
 */
export async function getLicenseState(
  organizationId: string,
  now: Date = new Date()
): Promise<LicenseState> {
  try {
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        planType: true,
        planStatus: true,
        trialEndsAt: true,
        licenseEndsAt: true,
        licenseKey: true,
      },
    });

    if (!organization) {
      return restrictedFallbackState("PLAN_INACTIVE");
    }

    const planType = normalizePlanType(organization.planType);
    const planStatus = normalizePlanStatus(organization.planStatus);
    const trialEndsAt = organization.trialEndsAt;
    const licenseEndsAt = organization.licenseEndsAt;

    // 1. Statut du plan : EXPIRED / CANCELLED bloquent immédiatement.
    let restrictionReason: LicenseRestrictionReason | null =
      planStatus === "ACTIVE" ? null : "PLAN_INACTIVE";

    // 2. Date de fin : l'essai expire sur `trialEndsAt`, les autres plans
    //    sur `licenseEndsAt` (null = licence perpétuelle).
    if (restrictionReason === null) {
      if (planType === "TRIAL") {
        if (trialEndsAt && now.getTime() > trialEndsAt.getTime()) {
          restrictionReason = "TRIAL_EXPIRED";
        }
      } else if (licenseEndsAt && now.getTime() > licenseEndsAt.getTime()) {
        restrictionReason = "LICENSE_EXPIRED";
      }
    }

    const trialDaysLeft =
      planType === "TRIAL" && trialEndsAt
        ? Math.max(
            0,
            Math.ceil((trialEndsAt.getTime() - now.getTime()) / DAY_MS)
          )
        : null;

    const showTrialWarning =
      planType === "TRIAL" &&
      planStatus === "ACTIVE" &&
      restrictionReason === null &&
      trialDaysLeft !== null &&
      trialDaysLeft <= TRIAL_WARNING_WINDOW_DAYS;

    return {
      planType,
      planStatus,
      trialEndsAt,
      licenseEndsAt,
      hasLicenseKey: Boolean(organization.licenseKey),
      trialDaysLeft,
      accessEndsAt: planType === "TRIAL" ? trialEndsAt : licenseEndsAt,
      canWrite: restrictionReason === null,
      restrictionReason,
      showTrialWarning,
    };
  } catch (error) {
    console.error("[license-check] Échec de lecture de la licence :", error);
    return restrictedFallbackState("PLAN_INACTIVE");
  }
}

/**
 * État de licence de l'organisation de l'utilisateur connecté, sans effet de
 * bord de redirection. Retourne `null` si la session est invalide — l'appelant
 * (layout, page) décide alors de la suite.
 */
export async function getLicenseStateForCurrentUser(): Promise<LicenseState | null> {
  const context = await getValidatedSessionContext();

  if (!context) {
    return null;
  }

  return getLicenseState(context.organizationId);
}

/**
 * Garde d'écriture pour les Server Actions (création / modification /
 * suppression). Remplit trois rôles :
 * 1. Vérifie que la session est valide (user existant, organisation rattachée) ;
 * 2. Vérifie la licence / l'abonnement de l'organisation ;
 * 3. Redirige vers /billing si l'essai ou la licence est expiré(e).
 *
 * À appeler EN PREMIÈRE instruction des actions mutatrices, AVANT tout
 * `try/catch`, afin que la redirection Next.js ne soit pas interceptée.
 */
export async function assertCanMutate(): Promise<void> {
  const context = await getValidatedSessionContext();

  if (!context) {
    redirect("/login");
  }

  const state = await getLicenseState(context.organizationId);

  if (!state.canWrite) {
    redirect(
      `/dashboard/billing?reason=${state.restrictionReason ?? "PLAN_INACTIVE"}`
    );
  }
}

/**
 * Variante de `assertCanMutate` retournant l'état de licence lorsque l'accès
 * en écriture est autorisé. Utilisée par les actions qui ont besoin du
 * contexte d'abonnement après la garde.
 */
export async function requireActiveLicense(): Promise<LicenseState> {
  const context = await getValidatedSessionContext();

  if (!context) {
    redirect("/login");
  }

  const state = await getLicenseState(context.organizationId);

  if (!state.canWrite) {
    redirect(
      `/dashboard/billing?reason=${state.restrictionReason ?? "PLAN_INACTIVE"}`
    );
  }

  return state;
}

/** Date de fin d'essai d'une nouvelle organisation : J+30. */
export function computeTrialEndDate(from: Date = new Date()): Date {
  return new Date(from.getTime() + TRIAL_DURATION_DAYS * DAY_MS);
}

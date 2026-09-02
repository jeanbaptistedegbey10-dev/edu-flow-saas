"use server";

import { revalidatePath } from "next/cache";

import { verifyLicenseKey } from "@/lib/crypto-license";
import {
  initiateSubscriptionPayment,
  type KkiapayWidgetPayment,
} from "@/lib/payment";
import { isBillingDuration, isPricingPlanType } from "@/lib/plan-pricing";
import { prisma } from "@/lib/prisma";
import {
  getCurrentOrganizationId,
  getValidatedSessionContext,
} from "@/lib/session";

// --------------------------------------
// Activation d'une clé de licence (côté client / organisation)
// --------------------------------------
//
// Server Action consommée par `/dashboard/billing` : un administrateur
// d'école y colle la clé de licence reçue du back-office Super-Admin.
// La clé est vérifiée HORS-LIGNE (signature Ed25519 via la clé publique,
// sans appel réseau ni service tiers), puis rattachée à l'organisation.

export type ActivateLicenseFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  planType?: string;
};

/** Messages d'erreur utilisateur par raison d'invalidité. */
const VERIFICATION_ERROR_MESSAGES: Record<string, string> = {
  MALFORMED: "Format de clé méconnaissable. Vérifiez la saisie (ex : EDU-XXXXX-…).",
  CHECKSUM_INVALID:
    "Erreur de frappe détectée : la clé saisie est incomplète ou erronée.",
  INVALID_PAYLOAD:
    "Contenu de la clé illisible ou corrompu. Demandez une nouvelle clé.",
  INVALID_SIGNATURE:
    "Signature invalide : cette clé n'a pas été émise par EduFlow.",
  EXPIRED: "Cette clé de licence a expiré. Contactez le support.",
};

/**
 * Vérifie et active une clé de licence pour l'organisation de
 * l'administrateur connecté (compatible `useActionState`).
 *
 * Contrôles appliqués :
 *   1. session valide ;
 *   2. signature Ed25519 + expiration (vérification hors-ligne) ;
 *   3. la clé doit cibler l'organisation de l'admin connecté
 *      (une clé émise pour une autre organisation est refusée) ;
 *   4. la clé ne doit pas déjà être consommée par une autre organisation
 *      (anti-clonage / anti-partage).
 */
export async function activateLicenseWithKeyAction(
  _prevState: ActivateLicenseFormState,
  formData: FormData
): Promise<ActivateLicenseFormState> {
  const session = await getValidatedSessionContext();

  if (!session) {
    return {
      status: "error",
      message: "Session expirée. Veuillez vous reconnecter.",
    };
  }

  // Redirige vers /login si le contexte n'est plus résoluble.
  const organizationId = await getCurrentOrganizationId();

  const licenseKey = String(formData.get("licenseKey") ?? "").trim();

  if (!licenseKey) {
    return {
      status: "error",
      message: "Veuillez saisir une clé de licence.",
    };
  }

  // 2. Vérification cryptographique HORS-LIGNE (signature + expiration).
  const verification = verifyLicenseKey(licenseKey);

  if (!verification.valid) {
    return {
      status: "error",
      message:
        VERIFICATION_ERROR_MESSAGES[verification.reason] ??
        "Clé de licence invalide.",
    };
  }

  const { payload, expiresAt } = verification;

  // 3. La clé doit être émise pour l'organisation de l'administrateur.
  if (payload.organizationId !== organizationId) {
    return {
      status: "error",
      message:
        "Cette clé de licence n'est pas destinée à votre organisation.",
    };
  }

  // 4. Anti-clonage : une clé déjà enregistrée par une autre organisation
  //    est refusée (chaque clé est unique et liée à son organisation).
  const conflicting = await prisma.organization.findFirst({
    where: { licenseKey, id: { not: organizationId } },
    select: { name: true },
  });

  if (conflicting) {
    return {
      status: "error",
      message: `Clé déjà utilisée par « ${conflicting.name} ».`,
    };
  }

  // Activation : le plan signé dans la clé fait foi (source de vérité).
  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      planType: payload.planType,
      planStatus: "ACTIVE",
      licenseKey,
      licenseEndsAt: expiresAt,
      trialEndsAt: null,
    },
  });

  revalidatePath("/dashboard/billing");
  revalidatePath("/dashboard");

  return {
    status: "success",
    message: `Licence activée : plan ${payload.planType}, valable jusqu'au ${expiresAt.toLocaleDateString("fr-FR")}.`,
    planType: payload.planType,
  };
}

// --------------------------------------
// Abonnement SaaS via passerelle Mobile Money / Carte (Phase 3)
// --------------------------------------

/**
 * Démarre le paiement d'un abonnement (mensuel ou annuel) pour l'organisation
 * de l'utilisateur connecté. Protégée par session ; le `organizationId` est
 * TOUJOURS résolu côté serveur (jamais reçu du client) pour éviter qu'un
 * utilisateur ne paie ou n'active l'abonnement d'une autre organisation.
 *
 * Le montant N'EST JAMAIS fourni par le client : il est recalculé côté
 * serveur par `calculateSubscriptionPrice` (prix initial si aucune facture
 * COMPLETED, tarif de renouvellement 12 / 6 mois sinon).
 *
 * @param planType       Formule commerciale (SAAS_CLOUD | SELF_HOSTED | DESKTOP_OFFLINE).
 * @param durationMonths Durée souscrite : 12 mois (annuel) ou 6 mois (semestriel).
 * @returns URL de paiement (page agrégateur ou widget interne) à ouvrir.
 */
export type InitiateSubscriptionActionResult =
  | { status: "success"; checkoutUrl: string; provider: string }
  | { status: "kkiapay_widget"; widget: KkiapayWidgetPayment }
  | { status: "error"; message: string };

export async function initiateSubscriptionPaymentAction(
  planType: string,
  durationMonths: number
): Promise<InitiateSubscriptionActionResult> {
  const session = await getValidatedSessionContext();

  if (!session) {
    return {
      status: "error",
      message: "Session expirée. Veuillez vous reconnecter.",
    };
  }

  if (!isPricingPlanType(planType)) {
    return { status: "error", message: "Formule commerciale inconnue." };
  }

  if (!isBillingDuration(durationMonths)) {
    return {
      status: "error",
      message: "Durée d'abonnement invalide (12 ou 6 mois attendus).",
    };
  }

  // Redirige vers /login si le contexte n'est plus résoluble.
  const organizationId = await getCurrentOrganizationId();

  // L'utilisateur ne paie que pour SA propre organisation (résolue serveur).
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true, email: true, phone: true },
  });

  if (!organization) {
    return {
      status: "error",
      message: "Aucune organisation associée à votre compte.",
    };
  }

  const result = await initiateSubscriptionPayment({
    organizationId: organization.id,
    organizationName: organization.name,
    planType,
    durationMonths,
    customerEmail: organization.email ?? null,
    customerPhone: organization.phone ?? null,
  });

  if (result.status === "error") {
    return { status: "error", message: result.message };
  }

  revalidatePath("/dashboard/billing");

  if (result.status === "kkiapay_widget") {
    // Kkiapay : pas d'URL serveur — le widget est ouvert côté navigateur
    // avec les paramètres préparés (clé publique, montant, metadata…).
    return { status: "kkiapay_widget", widget: result.widget };
  }

  return {
    status: "success",
    checkoutUrl: result.checkoutUrl,
    provider: result.provider,
  };
}

// --------------------------------------
// Historique des paiements / factures (Phase 3)
// --------------------------------------

/** Ligne d'historique d'abonnement affichée sur /dashboard/billing. */
export type RecentInvoice = {
  id: string;
  planType: string;
  amount: number;
  currency: string;
  paymentProvider: string | null;
  paymentMethod: string | null;
  transactionReference: string | null;
  status: string;
  description: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  paidAt: Date | null;
  createdAt: Date;
};

/**
 * Retourne les factures d'abonnement récentes de l'organisation de
 * l'administrateur connecté (triées de la plus récente à la plus ancienne).
 * Retourne `null` si la session est invalide.
 */
export async function getRecentInvoices(
  limit = 10
): Promise<RecentInvoice[] | null> {
  const context = await getValidatedSessionContext();

  if (!context) {
    return null;
  }

    // Nettoyage de l'historique : on n'affiche QUE les paiements effectivement
  // traités par la passerelle — succès (COMPLETED) ou échecs notifiés
  // (FAILED). Les statuts transitoires (PENDING) ou les tententes abandonnées
  // ne sont PAS persistés (aucune ligne PENDING n'est créée lors du clic
  // « Payer » — seul le webhook signé crée une facture, voir
  // `src/lib/payment.ts#activateSubscriptionAfterPayment`).
  const invoices = await prisma.invoice.findMany({
    where: {
      organizationId: context.organizationId,
      status: { in: ["COMPLETED", "FAILED"] },
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 50),
  });

  return invoices;
}

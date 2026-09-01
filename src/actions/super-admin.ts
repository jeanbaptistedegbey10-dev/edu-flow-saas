"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  addMonths,
  computePerpetualExpiry,
  generateLicenseKey,
  verifyLicenseKey,
  type LicensePayload,
} from "@/lib/crypto-license";
import { prisma } from "@/lib/prisma";
import {
  LICENSE_PLAN_TYPES,
  PLAN_STATUSES,
  PLAN_TYPES,
  type LicensePlanType,
  type PlanStatus,
} from "@/lib/plan-labels";
import {
  PRICING_PLAN_LABELS,
  PRICING_PLAN_TYPES,
  isPricingPlanType,
  type PricingPlanType,
} from "@/lib/plan-pricing";
import { getPlanPricingGrid } from "@/lib/payment";
import { getSuperAdminContext } from "@/lib/super-admin";

// --------------------------------------
// Back-office Super-Admin — Server Actions
// --------------------------------------
//
// Toutes les actions ci-dessous re-vérifient le rôle SUPER_ADMIN en base
// (voir `getSuperAdminContext`) : un administrateur d'école classique qui
// tenterait d'invoquer ces actions directement (POST forgé) se voit
// systématiquement refusé.

// --------------------------------------
// Types publics (DTO sérialisables)
// --------------------------------------

export type SuperAdminOrganizationRow = {
  id: string;
  name: string;
  slug: string;
  email: string | null;
  planType: "TRIAL" | "SAAS_MONTHLY" | "SAAS_HALF_YEAR" | "SAAS_YEARLY" | "SELF_HOSTED" | "OFFLINE" | "DESKTOP_LIFETIME";
  planStatus: "ACTIVE" | "EXPIRED" | "CANCELLED";
  trialEndsAt: Date | null;
  licenseEndsAt: Date | null;
  hasLicenseKey: boolean;
  createdAt: Date;
  /** Email de l'administrateur principal de l'école (rôle ADMIN). */
  adminEmail: string | null;
  studentCount: number;
  userCount: number;
};

export type SuperAdminStats = {
  total: number;
  active: number;
  trial: number;
  /** Organisations dont l'essai ou la licence expire dans ≤ 7 jours. */
  expiringSoon: number;
};

export type GenerateLicenseFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  /** Clé de licence générée (affichée + copiable en cas de succès). */
  licenseKey?: string;
  organizationName?: string;
};

export type SuperAdminActionResult = {
  success: boolean;
  message: string;
};

/** Organisation cible du générateur de licences (liste légère pour le sélecteur. */
export type LicenseTargetOrganization = {
  id: string;
  name: string;
  slug: string;
  planType: string;
  /**
   * `true` si l'organisation possède au moins une facture COMPLETED : le
   * générateur affiche alors le tarif de RENOUVELLEMENT comme tarif
   * théorique (référence de facturation hors-ligne), sinon le prix initial.
   */
  hasCompletedInvoice: boolean;
};

/**
 * Liste légère des organisations (id, nom, slug, plan) pour le sélecteur du
 * générateur de licences. Réservé au rôle SUPER_ADMIN.
 */
export async function listLicenseTargetOrganizations(): Promise<LicenseTargetOrganization[]> {
  const admin = await getSuperAdminContext();

  if (!admin) {
    redirect("/dashboard");
  }

  const [organizations, completedInvoices] = await Promise.all([
    prisma.organization.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true, planType: true },
    }),
    // Organisations déjà clientes (au moins une facture réglée) : le tarif
    // théorique affiché par le générateur bascule alors en renouvellement.
    prisma.invoice.findMany({
      where: { status: "COMPLETED" },
      select: { organizationId: true },
      distinct: ["organizationId"],
    }),
  ]);

  const completedIds = new Set(
    completedInvoices.map((invoice) => invoice.organizationId)
  );

  return organizations.map((organization) => ({
    ...organization,
    hasCompletedInvoice: completedIds.has(organization.id),
  }));
}

// --------------------------------------
// Lecture : liste des organisations
// --------------------------------------

/**
 * Liste complète des organisations de la plateforme (vue Super-Admin) :
 * nom, email de l'admin, plan, statut, fin d'essai/licence, date de
 * création et compteurs. Réservée au rôle SUPER_ADMIN.
 */
export async function listOrganizationsForSuperAdmin(): Promise<{
  organizations: SuperAdminOrganizationRow[];
  stats: SuperAdminStats;
}> {
  const admin = await getSuperAdminContext();

  if (!admin) {
    redirect("/dashboard");
  }

  const organizations = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      users: {
        where: { role: "ADMIN" },
        select: { email: true },
        orderBy: { createdAt: "asc" },
        take: 1,
      },
      _count: { select: { students: true, users: true } },
    },
  });

  const now = Date.now();
  const weekAhead = now + 7 * 86_400_000;

  // Les colonnes planType / planStatus sont des String en base : on les
  // normalise contre les constantes partagées (repli TRIAL / ACTIVE).
  const allowedPlanTypes = PLAN_TYPES as readonly string[];
  const allowedPlanStatuses = PLAN_STATUSES as readonly string[];

  let active = 0;
  let trial = 0;
  let expiringSoon = 0;

  const rows: SuperAdminOrganizationRow[] = organizations.map((org) => {
    const planType = allowedPlanTypes.includes(org.planType)
      ? (org.planType as SuperAdminOrganizationRow["planType"])
      : "TRIAL";
    const planStatus = allowedPlanStatuses.includes(org.planStatus)
      ? (org.planStatus as SuperAdminOrganizationRow["planStatus"])
      : "ACTIVE";
    const relevantEnd =
      planType === "TRIAL" ? org.trialEndsAt : org.licenseEndsAt;
    const endsAt = relevantEnd ? relevantEnd.getTime() : null;

    if (planStatus === "ACTIVE") active += 1;
    if (planType === "TRIAL") trial += 1;
    if (planStatus === "ACTIVE" && endsAt !== null && endsAt <= weekAhead) {
      expiringSoon += 1;
    }

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      email: org.email,
      planType,
      planStatus,
      trialEndsAt: org.trialEndsAt,
      licenseEndsAt: org.licenseEndsAt,
      hasLicenseKey: Boolean(org.licenseKey),
      createdAt: org.createdAt,
      adminEmail: org.users[0]?.email ?? null,
      studentCount: org._count.students,
      userCount: org._count.users,
    };
  });

  return {
    organizations: rows,
    stats: {
      total: rows.length,
      active,
      trial,
      expiringSoon,
    },
  };
}

// --------------------------------------
// Action « Générer une Licence »
// --------------------------------------

/**
 * Génère et signe une clé de licence pour l'organisation choisie, puis met
 * à jour celle-ci (plan, statut actif, clé, date de fin). Compatible
 * `useActionState`.
 */
export async function generateLicenseAction(
  _prevState: GenerateLicenseFormState,
  formData: FormData
): Promise<GenerateLicenseFormState> {
  const admin = await getSuperAdminContext();

  if (!admin) {
    return {
      status: "error",
      message: "Accès refusé : rôle SUPER_ADMIN requis.",
    };
  }

  const organizationId = String(formData.get("organizationId") ?? "").trim();
  const planType = String(formData.get("planType") ?? "").trim() as LicensePlanType;
  const durationMonths = Number(formData.get("durationMonths"));
  const maxStudentsRaw = String(formData.get("maxStudents") ?? "").trim();
  const maxUsersRaw = String(formData.get("maxUsers") ?? "").trim();

  if (!organizationId) {
    return { status: "error", message: "Veuillez sélectionner une organisation." };
  }

  if (!(LICENSE_PLAN_TYPES as readonly string[]).includes(planType)) {
    return {
      status: "error",
      message: "Type de plan invalide (SaaS mensuel, annuel, self-hosted ou offline).",
    };
  }

  if (!Number.isInteger(durationMonths) || durationMonths < 0 || durationMonths > 120) {
    return {
      status: "error",
      message:
        "Durée invalide : entrez un nombre de mois entre 1 et 120 (0 = sans échéance / perpétuelle).",
    };
  }

  let maxStudents: number | undefined;
  let maxUsers: number | undefined;

  if (maxStudentsRaw) {
    const parsed = Number(maxStudentsRaw);

    if (!Number.isInteger(parsed) || parsed < 1) {
      return {
        status: "error",
        message: "Plafond étudiants invalide (entier positif).",
      };
    }

    maxStudents = parsed;
  }

  if (maxUsersRaw) {
    const parsed = Number(maxUsersRaw);

    if (!Number.isInteger(parsed) || parsed < 1) {
      return {
        status: "error",
        message: "Plafond utilisateurs invalide (entier positif).",
      };
    }

    maxUsers = parsed;
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true },
  });

  if (!organization) {
    return { status: "error", message: "Organisation introuvable." };
  }

  const now = new Date();
  const expiresAt =
    durationMonths === 0 ? computePerpetualExpiry(now) : addMonths(now, durationMonths);

  const payload: LicensePayload = {
    organizationId,
    planType,
    expiresAt: expiresAt.toISOString(),
    ...(maxStudents !== undefined ? { maxStudents } : {}),
    ...(maxUsers !== undefined ? { maxUsers } : {}),
  };

  let licenseKey: string;

  try {
    // Signature Ed25519 via LICENSE_PRIVATE_KEY (env serveur).
    licenseKey = generateLicenseKey(payload);
  } catch (error) {
    console.error(
      "[super-admin] Échec de génération de licence :",
      error instanceof Error ? error.message : error
    );
    return {
      status: "error",
      message:
        "Échec de signature : vérifiez LICENSE_PRIVATE_KEY côté serveur.",
    };
  }

  // Auto-contrôle : la clé émise doit repasser la vérification hors-ligne.
  const selfCheck = verifyLicenseKey(licenseKey);

  if (!selfCheck.valid) {
    console.error(
      `[super-admin] Auto-contrôle échoué (${selfCheck.reason}) pour ${organizationId}.`
    );
    return {
      status: "error",
      message:
        "La clé générée ne passe pas la vérification interne. Contactez le support technique.",
    };
  }

  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      planType,
      planStatus: "ACTIVE",
      licenseKey,
      licenseEndsAt: expiresAt,
      trialEndsAt: null,
    },
  });

  revalidatePath("/super-admin");
  revalidatePath("/dashboard/billing");

  return {
    status: "success",
    message: `Licence ${planType} activée pour « ${organization.name} » — expire le ${expiresAt.toLocaleDateString("fr-FR")}. Transmettez la clé ci-dessous à l'administrateur de l'école.`,
    licenseKey,
    organizationName: organization.name,
  };
}

// --------------------------------------
// Générateur de licences (page /super-admin/licenses)
// --------------------------------------

/**
 * Normalise une référence client saisie librement (mode « manuel » du
 * générateur) en un identifiant stable qui sera embarqué dans la clé signée :
 * minuscules, sans accents, espaces → tirets, caractères sûrs uniquement.
 */
function buildManualClientId(raw: string): string {
  const slug = raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return slug.length > 0 ? `client-${slug}` : "client-manuel";
}

/**
 * Générateur de licence autonome (page `/super-admin/licenses`) :
 * - cible = organisation existante (la clé est alors attribuée en base,
 *   plan ACTIVE, `licenseEndsAt` posée) OU référence client manuelle
 *   (clé signée à remettre hors-ligne, sans écriture en base) ;
 * - expiration = durée en mois (0 = perpétuelle) OU date explicite ;
 * - réutilise `generateLicenseKey()` de `crypto-license.ts` (Ed25519).
 * Compatible `useActionState`.
 */
export async function generateStandaloneLicenseAction(
  _prevState: GenerateLicenseFormState,
  formData: FormData
): Promise<GenerateLicenseFormState> {
  const admin = await getSuperAdminContext();

  if (!admin) {
    return {
      status: "error",
      message: "Accès refusé : rôle SUPER_ADMIN requis.",
    };
  }

  const organizationId = String(formData.get("organizationId") ?? "").trim();
  const clientRef = String(formData.get("clientRef") ?? "").trim();
  const planType = String(formData.get("planType") ?? "").trim() as LicensePlanType;
  let expiryMode = String(formData.get("expiryMode") ?? "duration").trim();

  // Le plan « Desktop hors-ligne — à vie » est TOUJOURS perpétuel, quel que
  // soit le mode d'expiration renvoyé par le formulaire.
  if (planType === "DESKTOP_LIFETIME") {
    expiryMode = "perpetual";
  }
  const durationMonths = Number(formData.get("durationMonths"));
  const expiresAtRaw = String(formData.get("expiresAt") ?? "").trim();
  const maxStudentsRaw = String(formData.get("maxStudents") ?? "").trim();
  const maxUsersRaw = String(formData.get("maxUsers") ?? "").trim();

  if (!organizationId && !clientRef) {
    return {
      status: "error",
      message:
        "Veuillez sélectionner une organisation ou saisir le nom / ID d'un client.",
    };
  }

  if (!(LICENSE_PLAN_TYPES as readonly string[]).includes(planType)) {
    return {
      status: "error",
      message: "Type de plan invalide.",
    };
  }

  let maxStudents: number | undefined;
  let maxUsers: number | undefined;

  if (maxStudentsRaw) {
    const parsed = Number(maxStudentsRaw);

    if (!Number.isInteger(parsed) || parsed < 1) {
      return {
        status: "error",
        message: "Plafond étudiants invalide (entier positif).",
      };
    }

    maxStudents = parsed;
  }

  if (maxUsersRaw) {
    const parsed = Number(maxUsersRaw);

    if (!Number.isInteger(parsed) || parsed < 1) {
      return {
        status: "error",
        message: "Plafond utilisateurs invalide (entier positif).",
      };
    }

    maxUsers = parsed;
  }

  // -------------------------------
  // Calcul de la date d'expiration
  // -------------------------------
  const now = new Date();
  let expiresAt: Date;

  if (expiryMode === "perpetual") {
    expiresAt = computePerpetualExpiry(now);
  } else if (expiryMode === "date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresAtRaw)) {
      return {
        status: "error",
        message: "Date d'expiration invalide (format AAAA-MM-JJ).",
      };
    }

    // Fin de journée (UTC) pour ne pas déclencher une expiration anticipée.
    const parsed = new Date(`${expiresAtRaw}T23:59:59.999Z`);

    if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= now.getTime()) {
      return {
        status: "error",
        message: "La date d'expiration doit être dans le futur.",
      };
    }

    expiresAt = parsed;
  } else {
    // Mode « durée en mois » (défaut).
    if (
      !Number.isInteger(durationMonths) ||
      durationMonths < 0 ||
      durationMonths > 120
    ) {
      return {
        status: "error",
        message:
          "Durée invalide : entrez un nombre de mois entre 1 et 120 (0 = sans échéance / perpétuelle).",
      };
    }

    expiresAt =
      durationMonths === 0
        ? computePerpetualExpiry(now)
        : addMonths(now, durationMonths);
  }

  // -------------------------------
  // Cible : organisation existante ou client manuel
  // -------------------------------
  let organization: { id: string; name: string } | null = null;

  if (organizationId) {
    organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true },
    });

    if (!organization) {
      return { status: "error", message: "Organisation introuvable." };
    }
  }

  const payloadOrganizationId = organization?.id ?? buildManualClientId(clientRef);

  const payload: LicensePayload = {
    organizationId: payloadOrganizationId,
    planType,
    expiresAt: expiresAt.toISOString(),
    ...(maxStudents !== undefined ? { maxStudents } : {}),
    ...(maxUsers !== undefined ? { maxUsers } : {}),
  };

  let licenseKey: string;

  try {
    // Signature Ed25519 via LICENSE_PRIVATE_KEY (env serveur).
    licenseKey = generateLicenseKey(payload);
  } catch (error) {
    console.error(
      "[super-admin] Échec de génération de licence :",
      error instanceof Error ? error.message : error
    );
    return {
      status: "error",
      message:
        "Échec de signature : vérifiez LICENSE_PRIVATE_KEY côté serveur.",
    };
  }

  // Auto-contrôle : la clé émise doit repasser la vérification hors-ligne.
  const selfCheck = verifyLicenseKey(licenseKey);

  if (!selfCheck.valid) {
    console.error(
      `[super-admin] Auto-contrôle échoué (${selfCheck.reason}) pour ${payloadOrganizationId}.`
    );
    return {
      status: "error",
      message:
        "La clé générée ne passe pas la vérification interne. Contactez le support technique.",
    };
  }

  // Organisation existante → la clé est attribuée et le plan activé.
  if (organization) {
    await prisma.organization.update({
      where: { id: organization.id },
      data: {
        planType,
        planStatus: "ACTIVE",
        licenseKey,
        licenseEndsAt: expiresAt,
        trialEndsAt: null,
      },
    });

    revalidatePath("/super-admin");
    revalidatePath("/dashboard/billing");
  }

  const displayName = organization?.name ?? clientRef.trim();

  return {
    status: "success",
    message: `Licence ${planType} générée pour « ${displayName} » — expire le ${expiresAt.toLocaleDateString("fr-FR")}.${organization ? " Le plan de l'organisation a été activé." : " Transmettez la clé ci-dessous au client (hors-ligne / desktop)."}`,
    licenseKey,
    organizationName: displayName,
  };
}
// --------------------------------------
// Action « Prolonger l'Essai » (+15 / +30 jours)
// --------------------------------------

/**
 * Ajoute 15 ou 30 jours à la période d'essai d'une organisation
 * (cumulés à la fin d'essai existante si elle est encore future).
 * Réservé aux organisations en essai : pour les organisations sous licence,
 * utiliser « Générer une licence » afin d'éviter toute régression de plan.
 */
export async function extendTrialAction(
  organizationId: string,
  days: number
): Promise<SuperAdminActionResult> {
  const admin = await getSuperAdminContext();

  if (!admin) {
    return { success: false, message: "Accès refusé : rôle SUPER_ADMIN requis." };
  }

  if (days !== 15 && days !== 30) {
    return {
      success: false,
      message: "Durée non autorisée : seuls +15 ou +30 jours sont permis.",
    };
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true, planType: true, trialEndsAt: true },
  });

  if (!organization) {
    return { success: false, message: "Organisation introuvable." };
  }

  if (organization.planType !== "TRIAL") {
    return {
      success: false,
      message: `« ${organization.name} » n'est plus en essai (plan ${organization.planType}) : générez une licence pour prolonger l'accès.`,
    };
  }

  const now = new Date();
  // Si l'essai est déjà terminé, on repart d'aujourd'hui ; sinon on cumule.
  const base =
    organization.trialEndsAt && organization.trialEndsAt > now
      ? organization.trialEndsAt
      : now;
  const newTrialEndsAt = new Date(base.getTime() + days * 86_400_000);

  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      planType: "TRIAL",
      planStatus: "ACTIVE",
      trialEndsAt: newTrialEndsAt,
    },
  });

  revalidatePath("/super-admin");
  revalidatePath("/dashboard/billing");

  return {
    success: true,
    message: `Essai de « ${organization.name} » prolongé de ${days} jours — nouveau terme le ${newTrialEndsAt.toLocaleDateString("fr-FR")}.`,
  };
}

// --------------------------------------
// Action « Bannir / Suspendre / Réactiver »
// --------------------------------------

/**
 * Force le `planStatus` d'une organisation :
 *   - CANCELLED : bannissement / suspension (accès bloqué) ;
 *   - EXPIRED   : accès en lecture seule (abonnement échu) ;
 *   - ACTIVE    : réactivation.
 */
export async function setOrganizationStatusAction(
  organizationId: string,
  status: PlanStatus
): Promise<SuperAdminActionResult> {
  const admin = await getSuperAdminContext();

  if (!admin) {
    return { success: false, message: "Accès refusé : rôle SUPER_ADMIN requis." };
  }

  if (!(PLAN_STATUSES as readonly string[]).includes(status)) {
    return { success: false, message: "Statut invalide." };
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true, planStatus: true },
  });

  if (!organization) {
    return { success: false, message: "Organisation introuvable." };
  }

  if (organization.planStatus === status) {
    return {
      success: false,
      message: `« ${organization.name} » est déjà en statut ${status}.`,
    };
  }

  await prisma.organization.update({
    where: { id: organizationId },
    data: { planStatus: status },
  });

  revalidatePath("/super-admin");
  revalidatePath("/dashboard/billing");

  const effect =
    status === "CANCELLED"
      ? "bannie/suspendue : l'accès est bloqué."
      : status === "EXPIRED"
        ? "marquée expirée : accès en lecture seule."
        : "réactivée : l'accès est restauré.";

  return {
    success: true,
    message: `« ${organization.name} » ${effect}`,
  };
}

// --------------------------------------
// Factures & Paiements SaaS (vue Super-Admin)
// --------------------------------------

/** Ligne de facture SaaS affichée dans le back-office Super-Admin. */
export type SuperAdminInvoiceRow = {
  id: string;
  organizationId: string;
  organizationName: string;
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

/** Indicateurs agrégés du tableau « Factures & Paiements SaaS ». */
export type SuperAdminInvoiceStats = {
  total: number;
  completed: number;
  pending: number;
  failed: number;
  /** Revenu cumulé des factures COMPLETED (XOF). */
  revenueXOF: number;
};

/**
 * Liste transversale des factures d'abonnement SaaS de TOUTES les
 * organisations (avec le nom de l'organisation cliente). Réservé SUPER_ADMIN.
 */
export async function listInvoicesForSuperAdmin(
  limit = 200
): Promise<{ invoices: SuperAdminInvoiceRow[]; stats: SuperAdminInvoiceStats }> {
  const admin = await getSuperAdminContext();

  if (!admin) {
    redirect("/dashboard");
  }

  const invoices = await prisma.invoice.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 500),
    include: { organization: { select: { name: true } } },
  });

  const stats: SuperAdminInvoiceStats = {
    total: invoices.length,
    completed: 0,
    pending: 0,
    failed: 0,
    revenueXOF: 0,
  };

  const rows: SuperAdminInvoiceRow[] = invoices.map((invoice) => {
    if (invoice.status === "COMPLETED") {
      stats.completed += 1;
      stats.revenueXOF += invoice.amount;
    } else if (invoice.status === "PENDING") {
      stats.pending += 1;
    } else if (invoice.status === "FAILED") {
      stats.failed += 1;
    }

    return {
      id: invoice.id,
      organizationId: invoice.organizationId,
      organizationName: invoice.organization.name,
      planType: invoice.planType,
      amount: invoice.amount,
      currency: invoice.currency,
      paymentProvider: invoice.paymentProvider,
      paymentMethod: invoice.paymentMethod,
      transactionReference: invoice.transactionReference,
      status: invoice.status,
      description: invoice.description,
      periodStart: invoice.periodStart,
      periodEnd: invoice.periodEnd,
      paidAt: invoice.paidAt,
      createdAt: invoice.createdAt,
    };
  });

  return { invoices: rows, stats };
}

// --------------------------------------
// Tarifs & Offres — grille tarifaire dynamique (modèle hybride)
// --------------------------------------

/** Ligne de la grille tarifaire affichée / éditée dans /super-admin/pricing. */
export type SuperAdminPlanPricingRow = {
  planType: PricingPlanType;
  label: string;
  initialPrice: number;
  renewalAnnualPrice: number;
  renewalHalfYearPrice: number;
  currency: string;
  /** Date de dernière modification (ISO). */
  updatedAt: string;
};

/**
 * Retourne la grille tarifaire complète (3 formules commerciales) pour la
 * page « 💰 Tarifs & Offres ». Les lignes absentes de la base retombent sur
 * la grille par défaut (`DEFAULT_PLAN_PRICING` via `getPlanPricingGrid`).
 * Réservé au rôle SUPER_ADMIN.
 */
export async function listPlanPricingForSuperAdmin(): Promise<
  SuperAdminPlanPricingRow[]
> {
  const admin = await getSuperAdminContext();

  if (!admin) {
    redirect("/dashboard");
  }

  const grid = await getPlanPricingGrid();

  return PRICING_PLAN_TYPES.map((planType) => ({
    planType,
    label: PRICING_PLAN_LABELS[planType],
    initialPrice: grid[planType].initialPrice,
    renewalAnnualPrice: grid[planType].renewalAnnualPrice,
    renewalHalfYearPrice: grid[planType].renewalHalfYearPrice,
    currency: grid[planType].currency,
    updatedAt: (grid[planType].updatedAt ?? new Date()).toISOString(),
  }));
}

/** État du formulaire d'édition de la grille tarifaire (`useActionState`). */
export type UpdatePlanPricingFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  /** Formule concernée par le dernier enregistrement. */
  planType?: string;
};

/**
 * Sauvegarde les ajustements de prix d'une formule commerciale dans la table
 * `PlanPricing` (upsert). Réservé au rôle SUPER_ADMIN.
 *
 * Le modèle commercial hybride impose trois montants par formule :
 *   - `initialPrice`          : 1ʳᵉ année / licence + logiciel (acquisition) ;
 *   - `renewalAnnualPrice`    : renouvellement 12 mois ;
 *   - `renewalHalfYearPrice`  : renouvellement 6 mois.
 *
 * Ces montants sont ensuite appliqués automatiquement par
 * `calculateSubscriptionPrice()` selon l'historique de facturation du client.
 */
export async function updatePlanPricingAction(
  _prevState: UpdatePlanPricingFormState,
  formData: FormData
): Promise<UpdatePlanPricingFormState> {
  const admin = await getSuperAdminContext();

  if (!admin) {
    return {
      status: "error",
      message: "Accès refusé : rôle Super-Admin requis.",
    };
  }

  const planTypeRaw = String(formData.get("planType") ?? "").trim();

  if (!isPricingPlanType(planTypeRaw)) {
    return {
      status: "error",
      message: "Formule commerciale inconnue.",
    };
  }

  // Les montants sont des entiers en FCFA (pas de centimes en zone UEMOA).
  const parseAmount = (field: string): number | null => {
    const raw = String(formData.get(field) ?? "")
      .trim()
      .replaceAll(" ", "");
    return /^\d+$/.test(raw) ? Number(raw) : null;
  };

  const initialPrice = parseAmount("initialPrice");
  const renewalAnnualPrice = parseAmount("renewalAnnualPrice");
  const renewalHalfYearPrice = parseAmount("renewalHalfYearPrice");

  if (
    initialPrice === null ||
    renewalAnnualPrice === null ||
    renewalHalfYearPrice === null ||
    initialPrice <= 0 ||
    renewalAnnualPrice <= 0 ||
    renewalHalfYearPrice <= 0
  ) {
    return {
      status: "error",
      planType: planTypeRaw,
      message:
        "Montants invalides : saisissez des entiers positifs (FCFA), sans devise ni séparateur.",
    };
  }

  const MAX_PRICE = 100_000_000;

  if (
    initialPrice > MAX_PRICE ||
    renewalAnnualPrice > MAX_PRICE ||
    renewalHalfYearPrice > MAX_PRICE
  ) {
    return {
      status: "error",
      planType: planTypeRaw,
      message: `Montants trop élevés (maximum ${MAX_PRICE.toLocaleString("fr-FR")} FCFA).`,
    };
  }

  await prisma.planPricing.upsert({
    where: { planType: planTypeRaw },
    create: { planType: planTypeRaw, initialPrice, renewalAnnualPrice, renewalHalfYearPrice },
    update: { initialPrice, renewalAnnualPrice, renewalHalfYearPrice },
  });

  revalidatePath("/super-admin/pricing");
  // La page de facturation cliente affiche la grille dynamique : à invalider.
  revalidatePath("/dashboard/billing");

  return {
    status: "success",
    planType: planTypeRaw,
    message: `Grille « ${PRICING_PLAN_LABELS[planTypeRaw]} » enregistrée : initial ${initialPrice.toLocaleString("fr-FR")} · renouvellement 12 mois ${renewalAnnualPrice.toLocaleString("fr-FR")} · 6 mois ${renewalHalfYearPrice.toLocaleString("fr-FR")} FCFA.`,
  };
}

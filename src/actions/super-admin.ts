"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  addMonths,
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
  planType: "TRIAL" | "SAAS_MONTHLY" | "SAAS_YEARLY" | "SELF_HOSTED" | "OFFLINE";
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

  if (!Number.isInteger(durationMonths) || durationMonths < 1 || durationMonths > 120) {
    return {
      status: "error",
      message: "Durée invalide : entrez un nombre de mois entre 1 et 120.",
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
  const expiresAt = addMonths(now, durationMonths);

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



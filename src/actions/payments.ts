"use server";

import { Prisma, type PaymentMethod, type PaymentStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { sendPaymentConfirmationEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import {
  getCurrentOrganizationId,
  getCurrentSessionActor,
  isNextRedirectError,
} from "@/lib/session";
import { assertCanMutate } from "@/lib/license-check";
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from "@/lib/audit-constants";
import { logAuditEvent } from "@/lib/actions/audit";

// --------------------------------------
// Types publics (contrat avec les composants clients)
// --------------------------------------

export type PaymentDTO = {
  id: string;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  status: PaymentStatus;
  /**
   * Écriture suspendue (hors trésorerie active) : valorisé lorsque le statut
   * de l'étudiant repasse à PROSPECT — conservé pour l'historique mais exclu
   * des totaux de trésorerie.
   */
  isVoided: boolean;
  /**
   * Règlement saisi « hors système » / à date antérieure : met à jour le
   * solde débiteur de l'étudiant mais n'alimente PAS la session de caisse
   * physique du jour (ni les totaux d'encaissement de la caisse).
   */
  isOutOfSystem: boolean;
  reference: string | null;
  description: string | null;
  paidAt: Date;
  createdAt: Date;
  student: {
    id: string;
    studentCode: string;
    firstName: string;
    lastName: string;
  };
};

export type FinancialStatsDTO = {
  /** Somme des paiements au statut COMPLETED (total encaissé). */
  totalCollected: number;
  /** Somme des paiements au statut PENDING (montant en attente). */
  pendingAmount: number;
  /** Somme des dépenses (Expense) du mois en cours. */
  monthlyExpenses: number;
  /** Nombre total de transactions enregistrées. */
  transactionCount: number;
};

export type StudentOptionDTO = {
  id: string;
  studentCode: string;
  firstName: string;
  lastName: string;
};

export type OrganizationProfileDTO = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  /** Ville de l'organisation (affichée sur l'en-tête des reçus). */
  city: string | null;
  /** Site web officiel (en-tête et pied de page légal des reçus). */
  website: string | null;
  /** URL du logo (affiché à gauche de l'en-tête des reçus). */
  logoUrl: string | null;
  /** Numéro RCCM (mention légale en pied de reçu). */
  rccm: string | null;
  /** Numéro IFU / NIF (mention légale en pied de reçu). */
  ifu: string | null;
};

export type PaymentFormField =
  | "studentId"
  | "amount"
  | "paymentMethod"
  | "status"
  | "reference"
  | "description"
  | "paidAt";

export type PaymentFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Partial<Record<PaymentFormField, string>>;
};

/** Résultat des mutations rapides (suppression) côté client. */
export type PaymentMutationResult =
  { ok: true } | { ok: false; message: string };

// --------------------------------------
// Constantes & helpers internes
// --------------------------------------

const PAYMENT_METHODS: readonly PaymentMethod[] = [
  "CASH",
  "BANK_TRANSFER",
  "MOBILE_MONEY",
  "CREDIT_CARD",
  "CHECK",
];

const PAYMENT_STATUSES: readonly PaymentStatus[] = [
  "PENDING",
  "PARTIAL",
  "COMPLETED",
  "FAILED",
  "REFUNDED",
];

/** Plafond de sécurité pour un montant saisi (FCFA). */
const MAX_AMOUNT = 1_000_000_000;

type ParsedPaymentInput =
  | {
      ok: true;
      data: {
        studentId: string;
        amount: number;
        paymentMethod: PaymentMethod;
        status: PaymentStatus;
        reference: string | null;
        description: string | null;
        /** Règlement hors système / antérieur (case à cocher du formulaire). */
        isOutOfSystem: boolean;
        /** Date effective du règlement : saisie ou instant courant. */
        paidAt: Date;
      };
    }
  | { ok: false; fieldErrors: Partial<Record<PaymentFormField, string>> };

function parsePaymentForm(formData: FormData): ParsedPaymentInput {
  const studentId = String(formData.get("studentId") ?? "").trim();
  const rawAmount = String(formData.get("amount") ?? "").trim();
  const paymentMethod = String(formData.get("paymentMethod") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  const reference = String(formData.get("reference") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  // Case « Paiement hors système / Antérieur » : présente dans FormData
  // uniquement lorsqu'elle est cochée.
  const isOutOfSystem = formData.get("isOutOfSystem") === "on";
  // Date effective du règlement (« YYYY-MM-DD ») — optionnelle ; une date
  // passée est admise pour un règlement hors système / antérieur.
  const rawPaidAt = String(formData.get("paidAt") ?? "").trim();

  const fieldErrors: Partial<Record<PaymentFormField, string>> = {};

  if (!studentId) {
    fieldErrors.studentId = "Veuillez sélectionner un étudiant.";
  }

  // Accepte la virgule décimale saisie sur clavier FR (ex : « 25000,50 »).
  const amount = Number(rawAmount.replace(",", "."));
  if (!rawAmount || Number.isNaN(amount)) {
    fieldErrors.amount = "Le montant est requis.";
  } else if (amount <= 0) {
    fieldErrors.amount = "Le montant doit être supérieur à 0.";
  } else if (amount > MAX_AMOUNT) {
    fieldErrors.amount = "Le montant dépasse la limite autorisée.";
  }

  if (!PAYMENT_METHODS.includes(paymentMethod as PaymentMethod)) {
    fieldErrors.paymentMethod =
      "Le moyen de paiement sélectionné est invalide.";
  }

  if (!PAYMENT_STATUSES.includes(status as PaymentStatus)) {
    fieldErrors.status = "Le statut sélectionné est invalide.";
  }

  if (reference.length > 100) {
    fieldErrors.reference = "La référence ne doit pas dépasser 100 caractères.";
  }

  if (description.length > 255) {
    fieldErrors.description =
      "La description ne doit pas dépasser 255 caractères.";
  }

  // Date effective : midi UTC canonique (même règle que les dossiers de
  // voyage) pour éviter tout décalage de jour lié aux fuseaux horaires.
  let paidAt = new Date();
  if (rawPaidAt) {
    const parsedPaidAt = /^\d{4}-\d{2}-\d{2}$/.test(rawPaidAt)
      ? new Date(`${rawPaidAt}T12:00:00.000Z`)
      : new Date(NaN);
    if (Number.isNaN(parsedPaidAt.getTime())) {
      fieldErrors.paidAt = "La date du règlement est invalide.";
    } else {
      paidAt = parsedPaidAt;
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    data: {
      studentId,
      amount,
      paymentMethod: paymentMethod as PaymentMethod,
      status: status as PaymentStatus,
      reference: reference || null,
      description: description || null,
      isOutOfSystem,
      paidAt,
    },
  };
}

// --------------------------------------
// Server Actions
// --------------------------------------

/**
 * Récupère l'historique des règlements de l'organisation active,
 * avec la relation `student`.
 *
 * (`studentId` étant nullable au schéma, on écarte les lignes sans étudiant
 * afin de respecter le contrat `PaymentDTO`.)
 */
export async function getPayments(): Promise<PaymentDTO[]> {
  const organizationId = await getCurrentOrganizationId();

  try {
    const rows = await prisma.payment.findMany({
      where: { organizationId },
      orderBy: { paidAt: "desc" },
      select: {
        id: true,
        amount: true,
        currency: true,
        paymentMethod: true,
        status: true,
        isVoided: true,
        isOutOfSystem: true,
        reference: true,
        description: true,
        paidAt: true,
        createdAt: true,
        student: {
          select: {
            id: true,
            studentCode: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return rows.flatMap((row) =>
      row.student ? [{ ...row, student: row.student }] : [],
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[getPayments] Échec de lecture :", error);

    // Dégradation gracieuse : liste vide plutôt que crash serveur.
    return [];
  }
}

/**
 * Calcule les indicateurs financiers de l'organisation active :
 * - total encaissé (paiements COMPLETED),
 * - montant en attente (paiements PENDING),
 * - dépenses du mois en cours (Expense),
 * - nombre total de transactions.
 */
export async function getFinancialStats(): Promise<FinancialStatsDTO> {
  const organizationId = await getCurrentOrganizationId();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  try {
    const [collected, pending, expenses, transactionCount] = await Promise.all([
      // Total encaissé actif : paiements COMPLETED non suspendus (`isVoided`
      // exclut les écritures d'étudiants repassés au statut Prospect).
      prisma.payment.aggregate({
        where: { organizationId, status: "COMPLETED", isVoided: false },
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where: { organizationId, status: "PENDING", isVoided: false },
        _sum: { amount: true },
      }),
      prisma.expense.aggregate({
        where: {
          organizationId,
          expenseDate: { gte: monthStart, lt: monthEnd },
        },
        _sum: { amount: true },
      }),
      prisma.payment.count({
        where: { organizationId, isVoided: false },
      }),
    ]);

    return {
      totalCollected: collected._sum.amount ?? 0,
      pendingAmount: pending._sum.amount ?? 0,
      monthlyExpenses: expenses._sum.amount ?? 0,
      transactionCount,
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[getFinancialStats] Échec de calcul :", error);

    // Dégradation gracieuse : indicateurs à zéro plutôt que crash serveur.
    return {
      totalCollected: 0,
      pendingAmount: 0,
      monthlyExpenses: 0,
      transactionCount: 0,
    };
  }
}

/**
 * Récupère la liste légère des étudiants de l'organisation active.
 * Utilisée pour alimenter le Select « Étudiant » de la modale d'enregistrement.
 */
export async function getStudentOptions(): Promise<StudentOptionDTO[]> {
  const organizationId = await getCurrentOrganizationId();

  try {
    return await prisma.student.findMany({
      where: { organizationId },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: {
        id: true,
        studentCode: true,
        firstName: true,
        lastName: true,
      },
    });
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[getStudentOptions] Échec de lecture :", error);

    // Dégradation gracieuse : liste vide plutôt que crash serveur.
    return [];
  }
}

/**
 * Récupère le profil de l'organisation active (nom et coordonnées).
 * Alimente notamment l'en-tête des reçus de paiement imprimables.
 */
export async function getCurrentOrganizationProfile(): Promise<OrganizationProfileDTO> {
  const organizationId = await getCurrentOrganizationId();

  try {
    // `findUnique` sécurisé : l'organisation est garantie par la résolution de
    // session ; une absence ici signale une course (suppression concurrente).
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        city: true,
        website: true,
        logoUrl: true,
        rccm: true,
        ifu: true,
      },
    });

    if (!organization) {
      throw new Error(
        "Organisation introuvable : votre session pointe vers une organisation qui n'existe plus.",
      );
    }

    return organization;
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[getCurrentOrganizationProfile] Échec de lecture :", error);

    throw new Error(
      "Impossible de charger le profil de l'organisation pour le moment.",
    );
  }
}

/**
 * Enregistre un nouveau règlement lié à un étudiant existant.
 * Conçu pour être utilisé avec `useActionState` : reçoit l'état précédent et un `FormData`,
 * retourne un état sérialisable (succès, erreurs de champs, message).
 */
export async function createPaymentAction(
  _prevState: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  await assertCanMutate();
  const parsed = parsePaymentForm(formData);

  if (!parsed.ok) {
    return {
      status: "error",
      message: "Veuillez corriger les champs indiqués.",
      fieldErrors: parsed.fieldErrors,
    };
  }

  const organizationId = await getCurrentOrganizationId();

  try {
    // Auteur du règlement : l'ID et le NOM de l'utilisateur connecté sont
    // figés dans les métadonnées de la transaction (traçabilité).
    const actor = await getCurrentSessionActor();

    // Vérifie que l'étudiant appartient bien à l'organisation active (isolation multi-tenant).
    // Les coordonnées sont récupérées pour l'envoi du reçu par e-mail.
    const student = await prisma.student.findFirst({
      where: { id: parsed.data.studentId, organizationId },
      select: { id: true, email: true, firstName: true, lastName: true },
    });

    if (!student) {
      return {
        status: "error",
        message: "Étudiant introuvable dans votre organisation.",
        fieldErrors: { studentId: "Étudiant introuvable." },
      };
    }

    // La date effective provient du formulaire (defaut : instant courant).
    const paidAt = parsed.data.paidAt;

    const payment = await prisma.payment.create({
      data: {
        organizationId,
        studentId: parsed.data.studentId,
        createdById: actor.id,
        createdByName: actor.name,
        amount: parsed.data.amount,
        paymentMethod: parsed.data.paymentMethod,
        status: parsed.data.status,
        reference: parsed.data.reference,
        description: parsed.data.description,
        isOutOfSystem: parsed.data.isOutOfSystem,
        paidAt,
      },
    });

    revalidatePath("/dashboard/payments");

    // Journal d'audit : enregistrement de paiement (auteur = utilisateur connecté)
    await logAuditEvent({
      action: AUDIT_ACTIONS.PAYMENT_RECEIVED,
      entity: AUDIT_ENTITIES.PAYMENT,
      entityId: payment.id,
      details: {
        createdByUserId: actor.id,
        createdByUserName: actor.name,
        createdByUserRole: actor.role,
        studentId: student.id,
        studentName: `${student.firstName} ${student.lastName}`,
        amount: payment.amount,
        method: payment.paymentMethod,
        status: payment.status,
        isOutOfSystem: payment.isOutOfSystem,
      },
    });

    // Reçu de règlement envoyé en arrière-plan (après la réponse) si l'étudiant
    // a une adresse e-mail valide. L'échec d'envoi ne bloque jamais la création.
    if (student.email) {
      const recipientEmail = student.email;
      const recipientName = `${student.firstName} ${student.lastName}`;
      const amount = parsed.data.amount;
      const reference = parsed.data.reference;

      after(async () => {
        // Adresses de test (ex : etudiant@example.com) : Resend en mode Sandbox
        // les refuse systématiquement. On ignore l'envoi pour ne jamais
        // bloquer ni retarder la création du paiement.
        if (recipientEmail.trim().toLowerCase().endsWith("@example.com")) {
          console.info(
            `[payments] Adresse de test « ${recipientEmail} » : envoi du reçu ignoré.`,
          );
          return;
        }

        try {
          await sendPaymentConfirmationEmail({
            studentEmail: recipientEmail,
            studentName: recipientName,
            amount,
            reference,
            paidAt,
          });
        } catch (error) {
          console.error("[payments] Échec de l'envoi du reçu :", error);
        }
      });
    }

    return {
      status: "success",
      message: "Paiement enregistré avec succès.",
    };
  } catch (error) {
    // Contrainte unique sur `reference` : numéro de transaction déjà utilisé.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        status: "error",
        message: "Cette référence de paiement est déjà utilisée.",
        fieldErrors: { reference: "Cette référence est déjà utilisée." },
      };
    }

    console.error("[createPaymentAction] Échec de création :", error);

    return {
      status: "error",
      message: "Une erreur est survenue lors de l'enregistrement du paiement.",
    };
  }
}

/**
 * Met à jour un règlement existant de l'organisation active.
 * Conçu pour être utilisé avec `useActionState` : reçoit l'état précédent et un `FormData`
 * (incluant le champ caché `id`), retourne un état sérialisable.
 */
export async function updatePaymentAction(
  _prevState: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  await assertCanMutate();
  const paymentId = String(formData.get("id") ?? "").trim();

  if (!paymentId) {
    return {
      status: "error",
      message: "Identifiant du paiement manquant.",
    };
  }

  const parsed = parsePaymentForm(formData);

  if (!parsed.ok) {
    return {
      status: "error",
      message: "Veuillez corriger les champs indiqués.",
      fieldErrors: parsed.fieldErrors,
    };
  }

  const organizationId = await getCurrentOrganizationId();

  try {
    // Isolation multi-tenant : le règlement doit appartenir à l'organisation active.
    const existing = await prisma.payment.findFirst({
      where: { id: paymentId, organizationId },
      select: { id: true },
    });

    if (!existing) {
      return {
        status: "error",
        message: "Paiement introuvable dans votre organisation.",
      };
    }

    // Vérifie que l'étudiant ciblé appartient bien à l'organisation active.
    const student = await prisma.student.findFirst({
      where: { id: parsed.data.studentId, organizationId },
      select: { id: true },
    });

    if (!student) {
      return {
        status: "error",
        message: "Étudiant introuvable dans votre organisation.",
        fieldErrors: { studentId: "Étudiant introuvable." },
      };
    }

    await prisma.payment.update({
      where: { id: paymentId },
      data: {
        studentId: parsed.data.studentId,
        amount: parsed.data.amount,
        paymentMethod: parsed.data.paymentMethod,
        status: parsed.data.status,
        reference: parsed.data.reference,
        description: parsed.data.description,
        isOutOfSystem: parsed.data.isOutOfSystem,
        paidAt: parsed.data.paidAt,
      },
    });

    revalidatePath("/dashboard/payments");

    return {
      status: "success",
      message: "Paiement mis à jour avec succès.",
    };
  } catch (error) {
    // Contrainte unique sur `reference` : numéro de transaction déjà utilisé.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        status: "error",
        message: "Cette référence de paiement est déjà utilisée.",
        fieldErrors: { reference: "Cette référence est déjà utilisée." },
      };
    }

    console.error("[updatePaymentAction] Échec de mise à jour :", error);

    return {
      status: "error",
      message: "Une erreur est survenue lors de la mise à jour du paiement.",
    };
  }
}

/**
 * Supprime un règlement de l'organisation active.
 */
export async function deletePaymentAction(
  paymentId: string,
): Promise<PaymentMutationResult> {
  await assertCanMutate();
  if (!paymentId) {
    return { ok: false, message: "Identifiant du paiement manquant." };
  }

  try {
    const organizationId = await getCurrentOrganizationId();

    // Isolation multi-tenant : le règlement doit appartenir à l'organisation active.
    const existing = await prisma.payment.findFirst({
      where: { id: paymentId, organizationId },
      select: { id: true },
    });

    if (!existing) {
      return {
        ok: false,
        message: "Paiement introuvable dans votre organisation.",
      };
    }

    await prisma.payment.delete({ where: { id: paymentId } });

    revalidatePath("/dashboard/payments");
    revalidatePath("/dashboard");

    // Journal d'audit : suppression de paiement
    await logAuditEvent({
      action: AUDIT_ACTIONS.PAYMENT_DELETED,
      entity: AUDIT_ENTITIES.PAYMENT,
      entityId: paymentId,
    });

    return { ok: true };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[deletePaymentAction] Échec de suppression :", error);

    return {
      ok: false,
      message: "Une erreur est survenue lors de la suppression du paiement.",
    };
  }
}

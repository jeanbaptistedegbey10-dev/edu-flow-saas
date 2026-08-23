"use server";

import {
  Prisma,
  type PaymentMethod,
  type PaymentStatus,
} from "@prisma/client";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getCurrentOrganizationId } from "@/lib/session";

// --------------------------------------
// Types publics (contrat avec les composants clients)
// --------------------------------------

export type PaymentDTO = {
  id: string;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  status: PaymentStatus;
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

export type PaymentFormField =
  | "studentId"
  | "amount"
  | "paymentMethod"
  | "status"
  | "reference"
  | "description";

export type PaymentFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Partial<Record<PaymentFormField, string>>;
};

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
    },
  };
}

// --------------------------------------
// Server Actions
// --------------------------------------

/**
 * Récupère l'historique des règlements de l'organisation active,
 * avec la relation `student`.
 */
export async function getPayments(): Promise<PaymentDTO[]> {
  const organizationId = await getCurrentOrganizationId();

  return prisma.payment.findMany({
    where: { organizationId },
    orderBy: { paidAt: "desc" },
    select: {
      id: true,
      amount: true,
      currency: true,
      paymentMethod: true,
      status: true,
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

  const [collected, pending, expenses, transactionCount] = await Promise.all([
    prisma.payment.aggregate({
      where: { organizationId, status: "COMPLETED" },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: { organizationId, status: "PENDING" },
      _sum: { amount: true },
    }),
    prisma.expense.aggregate({
      where: {
        organizationId,
        expenseDate: { gte: monthStart, lt: monthEnd },
      },
      _sum: { amount: true },
    }),
    prisma.payment.count({ where: { organizationId } }),
  ]);

  return {
    totalCollected: collected._sum.amount ?? 0,
    pendingAmount: pending._sum.amount ?? 0,
    monthlyExpenses: expenses._sum.amount ?? 0,
    transactionCount,
  };
}

/**
 * Récupère la liste légère des étudiants de l'organisation active.
 * Utilisée pour alimenter le Select « Étudiant » de la modale d'enregistrement.
 */
export async function getStudentOptions(): Promise<StudentOptionDTO[]> {
  const organizationId = await getCurrentOrganizationId();

  return prisma.student.findMany({
    where: { organizationId },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    select: {
      id: true,
      studentCode: true,
      firstName: true,
      lastName: true,
    },
  });
}

/**
 * Enregistre un nouveau règlement lié à un étudiant existant.
 * Conçu pour être utilisé avec `useActionState` : reçoit l'état précédent et un `FormData`,
 * retourne un état sérialisable (succès, erreurs de champs, message).
 */
export async function createPaymentAction(
  _prevState: PaymentFormState,
  formData: FormData
): Promise<PaymentFormState> {
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
    // Vérifie que l'étudiant appartient bien à l'organisation active (isolation multi-tenant).
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

    await prisma.payment.create({
      data: {
        organizationId,
        studentId: parsed.data.studentId,
        amount: parsed.data.amount,
        paymentMethod: parsed.data.paymentMethod,
        status: parsed.data.status,
        reference: parsed.data.reference,
        description: parsed.data.description,
      },
    });

    revalidatePath("/dashboard/payments");

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
      message:
        "Une erreur est survenue lors de l'enregistrement du paiement.",
    };
  }
}
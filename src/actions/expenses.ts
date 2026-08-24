"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentOrganizationId } from "@/lib/session";

// --------------------------------------
// Types publics (contrat avec les composants clients)
// --------------------------------------

export type ExpenseDTO = {
  id: string;
  title: string;
  category: string;
  amount: number;
  currency: string;
  expenseDate: Date;
  notes: string | null;
  createdAt: Date;
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
  };
};

export type ExpenseFormField =
  | "title"
  | "category"
  | "amount"
  | "expenseDate"
  | "notes";

export type ExpenseFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Partial<Record<ExpenseFormField, string>>;
};

/** Résultat des mutations rapides (suppression) côté client. */
export type ExpenseMutationResult =
  | { ok: true }
  | { ok: false; message: string };

// --------------------------------------
// Constantes & helpers internes
// --------------------------------------

/** Catégories de dépenses proposées par défaut. */
export const EXPENSE_CATEGORIES = [
  "Loyer",
  "Salaires",
  "Électricité",
  "Internet",
  "Fournitures",
  "Marketing",
  "Transport",
  "Équipement",
  "Autre",
] as const;

/** Plafond de sécurité pour un montant saisi (FCFA). */
const MAX_AMOUNT = 1_000_000_000;

/** Format attendu pour la date saisie via `<input type="date">`. */
const DATE_INPUT_REGEX = /^\d{4}-\d{2}-\d{2}$/;

type ParsedExpenseInput =
  | {
      ok: true;
      data: {
        title: string;
        category: string;
        amount: number;
        expenseDate: Date;
        notes: string | null;
      };
    }
  | { ok: false; fieldErrors: Partial<Record<ExpenseFormField, string>> };

function parseExpenseForm(formData: FormData): ParsedExpenseInput {
  const title = String(formData.get("title") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const rawAmount = String(formData.get("amount") ?? "").trim();
  const rawExpenseDate = String(formData.get("expenseDate") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  const fieldErrors: Partial<Record<ExpenseFormField, string>> = {};

  if (!title) {
    fieldErrors.title = "L'intitulé est requis.";
  } else if (title.length > 150) {
    fieldErrors.title = "L'intitulé ne doit pas dépasser 150 caractères.";
  }

  if (!category) {
    fieldErrors.category = "La catégorie est requise.";
  } else if (category.length > 50) {
    fieldErrors.category = "La catégorie ne doit pas dépasser 50 caractères.";
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

  // `<input type="date">` renvoie « YYYY-MM-DD » ; interprété à minuit UTC
  // pour éviter tout décalage de jour lié au fuseau horaire.
  let expenseDate: Date | null = null;
  if (!rawExpenseDate) {
    fieldErrors.expenseDate = "La date est requise.";
  } else if (!DATE_INPUT_REGEX.test(rawExpenseDate)) {
    fieldErrors.expenseDate = "La date est invalide.";
  } else {
    expenseDate = new Date(`${rawExpenseDate}T00:00:00.000Z`);
  }

  if (notes.length > 500) {
    fieldErrors.notes = "Les notes ne doivent pas dépasser 500 caractères.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    data: {
      title,
      category,
      amount,
      expenseDate: expenseDate as Date,
      notes: notes || null,
    },
  };
}

// --------------------------------------
// Server Actions
// --------------------------------------

/**
 * Récupère les dépenses de l'organisation active avec la relation
 * `createdBy` (membre ayant enregistré la dépense), triées par date
 * décroissante puis date de création décroissante.
 */
export async function getExpenses(): Promise<ExpenseDTO[]> {
  const organizationId = await getCurrentOrganizationId();

  return prisma.expense.findMany({
    where: { organizationId },
    orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      category: true,
      amount: true,
      currency: true,
      expenseDate: true,
      notes: true,
      createdAt: true,
      createdBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });
}

/**
 * Crée une nouvelle dépense dans l'organisation active.
 * Conçue pour être utilisée avec `useActionState` : reçoit l'état précédent
 * et un `FormData`, retourne un état sérialisable (succès, erreurs, message).
 */
export async function createExpenseAction(
  _prevState: ExpenseFormState,
  formData: FormData
): Promise<ExpenseFormState> {
  const parsed = parseExpenseForm(formData);

  if (!parsed.ok) {
    return {
      status: "error",
      message: "Veuillez corriger les champs indiqués.",
      fieldErrors: parsed.fieldErrors,
    };
  }

  const organizationId = await getCurrentOrganizationId();

  // L'auteur de la dépense est l'utilisateur connecté.
  const session = await auth();
  const createdById = session?.user?.id;

  if (!createdById) {
    return {
      status: "error",
      message: "Session invalide : impossible d'identifier l'auteur.",
    };
  }

  try {
    await prisma.expense.create({
      data: {
        organizationId,
        createdById,
        title: parsed.data.title,
        category: parsed.data.category,
        amount: parsed.data.amount,
        expenseDate: parsed.data.expenseDate,
        notes: parsed.data.notes,
      },
    });

    revalidatePath("/dashboard/expenses");
    revalidatePath("/dashboard");

    return {
      status: "success",
      message: "Dépense enregistrée avec succès.",
    };
  } catch (error) {
    console.error("[createExpenseAction] Échec de création :", error);

    return {
      status: "error",
      message: "Une erreur est survenue lors de l'enregistrement de la dépense.",
    };
  }
}

/**
 * Met à jour une dépense existante de l'organisation active.
 * Conçue pour être utilisée avec `useActionState` : reçoit l'état précédent
 * et un `FormData` (incluant le champ caché `id`), retourne un état sérialisable.
 */
export async function updateExpenseAction(
  _prevState: ExpenseFormState,
  formData: FormData
): Promise<ExpenseFormState> {
  const expenseId = String(formData.get("id") ?? "").trim();

  if (!expenseId) {
    return {
      status: "error",
      message: "Identifiant de la dépense manquant.",
    };
  }

  const parsed = parseExpenseForm(formData);

  if (!parsed.ok) {
    return {
      status: "error",
      message: "Veuillez corriger les champs indiqués.",
      fieldErrors: parsed.fieldErrors,
    };
  }

  const organizationId = await getCurrentOrganizationId();

  try {
    // Isolation multi-tenant : la dépense doit appartenir à l'organisation active.
    const existing = await prisma.expense.findFirst({
      where: { id: expenseId, organizationId },
      select: { id: true },
    });

    if (!existing) {
      return {
        status: "error",
        message: "Dépense introuvable dans votre organisation.",
      };
    }

    await prisma.expense.update({
      where: { id: expenseId },
      data: {
        title: parsed.data.title,
        category: parsed.data.category,
        amount: parsed.data.amount,
        expenseDate: parsed.data.expenseDate,
        notes: parsed.data.notes,
      },
    });

    revalidatePath("/dashboard/expenses");
    revalidatePath("/dashboard");

    return {
      status: "success",
      message: "Dépense mise à jour avec succès.",
    };
  } catch (error) {
    console.error("[updateExpenseAction] Échec de mise à jour :", error);

    return {
      status: "error",
      message: "Une erreur est survenue lors de la mise à jour de la dépense.",
    };
  }
}

/**
 * Supprime une dépense de l'organisation active.
 */
export async function deleteExpenseAction(
  expenseId: string
): Promise<ExpenseMutationResult> {
  if (!expenseId) {
    return { ok: false, message: "Identifiant de la dépense manquant." };
  }

  try {
    const organizationId = await getCurrentOrganizationId();

    // Isolation multi-tenant : la dépense doit appartenir à l'organisation active.
    const existing = await prisma.expense.findFirst({
      where: { id: expenseId, organizationId },
      select: { id: true },
    });

    if (!existing) {
      return {
        ok: false,
        message: "Dépense introuvable dans votre organisation.",
      };
    }

    await prisma.expense.delete({ where: { id: expenseId } });

    revalidatePath("/dashboard/expenses");
    revalidatePath("/dashboard");

    return { ok: true };
  } catch (error) {
    console.error("[deleteExpenseAction] Échec de suppression :", error);

    return {
      ok: false,
      message: "Une erreur est survenue lors de la suppression de la dépense.",
    };
  }
}
"use server";

import { type TravelStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getCurrentOrganizationId } from "@/lib/session";

// --------------------------------------
// Types publics (contrat avec les composants clients)
// --------------------------------------

export type TravelProcedureDTO = {
  id: string;
  destination: string;
  targetProgram: string | null;
  status: TravelStatus;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  student: {
    id: string;
    studentCode: string;
    firstName: string;
    lastName: string;
    email: string | null;
  };
  advisor: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
};

export type StudentOptionDTO = {
  id: string;
  studentCode: string;
  firstName: string;
  lastName: string;
};

export type TravelFormField =
  | "studentId"
  | "destination"
  | "targetProgram"
  | "status"
  | "notes";

export type TravelFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Partial<Record<TravelFormField, string>>;
};

export type UpdateTravelStatusResult =
  | { ok: true }
  | { ok: false; message: string };

// --------------------------------------
// Constantes & helpers internes
// --------------------------------------

const TRAVEL_STATUSES: readonly TravelStatus[] = [
  "DOSSIER_PREPARATION",
  "LANGUAGE_TEST",
  "ADMISSION_APPLIED",
  "ADMISSION_OBTAINED",
  "VISA_APPLIED",
  "VISA_APPROVED",
  "VISA_REJECTED",
  "DEPARTURE_READY",
  "COMPLETED",
];

type ParsedTravelInput =
  | {
      ok: true;
      data: {
        studentId: string;
        destination: string;
        targetProgram: string | null;
        status: TravelStatus;
        notes: string | null;
      };
    }
  | { ok: false; fieldErrors: Partial<Record<TravelFormField, string>> };

function parseTravelForm(formData: FormData): ParsedTravelInput {
  const studentId = String(formData.get("studentId") ?? "").trim();
  const destination = String(formData.get("destination") ?? "").trim();
  const targetProgram = String(formData.get("targetProgram") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  const fieldErrors: Partial<Record<TravelFormField, string>> = {};

  if (!studentId) {
    fieldErrors.studentId = "Veuillez sélectionner un étudiant.";
  }

  if (!destination) {
    fieldErrors.destination = "La destination est requise.";
  } else if (destination.length > 100) {
    fieldErrors.destination =
      "La destination ne doit pas dépasser 100 caractères.";
  }

  if (targetProgram.length > 150) {
    fieldErrors.targetProgram =
      "Le programme visé ne doit pas dépasser 150 caractères.";
  }

  if (!TRAVEL_STATUSES.includes(status as TravelStatus)) {
    fieldErrors.status = "Le statut sélectionné est invalide.";
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
      studentId,
      destination,
      targetProgram: targetProgram || null,
      status: status as TravelStatus,
      notes: notes || null,
    },
  };
}

// --------------------------------------
// Server Actions
// --------------------------------------

/**
 * Récupère tous les dossiers de voyage de l'organisation active,
 * avec les relations `student` et `advisor`.
 */
export async function getTravelProcedures(): Promise<TravelProcedureDTO[]> {
  const organizationId = await getCurrentOrganizationId();

  return prisma.travelProcedure.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      destination: true,
      targetProgram: true,
      status: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
      student: {
        select: {
          id: true,
          studentCode: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      advisor: {
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
 * Récupère la liste légère des étudiants de l'organisation active.
 * Utilisée pour alimenter le Select « Étudiant » de la modale de création.
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
 * Crée un dossier de voyage lié à un étudiant existant.
 * Conçu pour être utilisé avec `useActionState` : reçoit l'état précédent et un `FormData`,
 * retourne un état sérialisable (succès, erreurs de champs, message).
 */
export async function createTravelProcedureAction(
  _prevState: TravelFormState,
  formData: FormData
): Promise<TravelFormState> {
  const parsed = parseTravelForm(formData);

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

    await prisma.travelProcedure.create({
      data: {
        organizationId,
        studentId: parsed.data.studentId,
        destination: parsed.data.destination,
        targetProgram: parsed.data.targetProgram,
        status: parsed.data.status,
        notes: parsed.data.notes,
      },
    });

    revalidatePath("/dashboard/travels");

    return {
      status: "success",
      message: "Dossier de voyage créé avec succès.",
    };
  } catch (error) {
    console.error("[createTravelProcedureAction] Échec de création :", error);

    return {
      status: "error",
      message:
        "Une erreur est survenue lors de la création du dossier de voyage.",
    };
  }
}

/**
 * Met à jour le statut (`TravelStatus`) d'un dossier de voyage existant.
 * Appelée depuis un gestionnaire d'événements côté client (`startTransition`).
 */
export async function updateTravelStatusAction(
  procedureId: string,
  status: TravelStatus
): Promise<UpdateTravelStatusResult> {
  if (!TRAVEL_STATUSES.includes(status)) {
    return { ok: false, message: "Le statut fourni est invalide." };
  }

  try {
    const organizationId = await getCurrentOrganizationId();

    // Vérifie que le dossier appartient bien à l'organisation active.
    const existing = await prisma.travelProcedure.findFirst({
      where: { id: procedureId, organizationId },
      select: { id: true },
    });

    if (!existing) {
      return { ok: false, message: "Dossier de voyage introuvable." };
    }

    await prisma.travelProcedure.update({
      where: { id: procedureId },
      data: { status },
    });

    revalidatePath("/dashboard/travels");

    return { ok: true };
  } catch (error) {
    console.error("[updateTravelStatusAction] Échec de mise à jour :", error);

    return {
      ok: false,
      message:
        "Une erreur est survenue lors de la mise à jour du statut du dossier.",
    };
  }
}
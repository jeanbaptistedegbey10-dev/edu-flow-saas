"use server";

import { Prisma, type StudentStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { sendWelcomeEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { getCurrentOrganizationId } from "@/lib/session";

// --------------------------------------
// Types publics (contrat avec les composants clients)
// --------------------------------------

export type StudentDTO = {
  id: string;
  studentCode: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string;
  status: StudentStatus;
  createdAt: Date;
};

export type StudentFormField = "firstName" | "lastName" | "email" | "phone" | "status";

export type StudentFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Partial<Record<StudentFormField, string>>;
};

/** Résultat des mutations rapides (suppression) côté client. */
export type StudentMutationResult =
  | { ok: true }
  | { ok: false; message: string };

// --------------------------------------
// Constantes & helpers internes
// --------------------------------------

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const STUDENT_STATUSES: readonly StudentStatus[] = [
  "PROSPECT",
  "ENROLLED",
  "IN_PROGRESS",
  "COMPLETED",
  "SUSPENDED",
  "DROPPED_OUT",
];

type ParsedStudentInput =
  | { ok: true; data: { firstName: string; lastName: string; email: string | null; phone: string; status: StudentStatus } }
  | { ok: false; fieldErrors: Partial<Record<StudentFormField, string>> };

function parseStudentForm(formData: FormData): ParsedStudentInput {
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();

  const fieldErrors: Partial<Record<StudentFormField, string>> = {};

  if (!firstName) {
    fieldErrors.firstName = "Le prénom est requis.";
  } else if (firstName.length > 100) {
    fieldErrors.firstName = "Le prénom ne doit pas dépasser 100 caractères.";
  }

  if (!lastName) {
    fieldErrors.lastName = "Le nom est requis.";
  } else if (lastName.length > 100) {
    fieldErrors.lastName = "Le nom ne doit pas dépasser 100 caractères.";
  }

  if (email && !EMAIL_REGEX.test(email)) {
    fieldErrors.email = "L'adresse email est invalide.";
  }

  if (!phone) {
    fieldErrors.phone = "Le téléphone est requis.";
  } else if (phone.replace(/\D/g, "").length < 8) {
    fieldErrors.phone = "Le numéro de téléphone semble invalide.";
  }

  if (!STUDENT_STATUSES.includes(status as StudentStatus)) {
    fieldErrors.status = "Le statut sélectionné est invalide.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    data: {
      firstName,
      lastName,
      email: email || null,
      phone,
      status: status as StudentStatus,
    },
  };
}

/** Génère un code étudiant unique au format STU-YYYY-NNN pour l'organisation donnée. */
async function generateStudentCode(organizationId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `STU-${year}-`;

  const count = await prisma.student.count({
    where: {
      organizationId,
      studentCode: { startsWith: prefix },
    },
  });

  return `${prefix}${String(count + 1).padStart(3, "0")}`;
}

// --------------------------------------
// Server Actions
// --------------------------------------

/**
 * Récupère la liste des étudiants de l'organisation active.
 */
export async function getStudents(): Promise<StudentDTO[]> {
  const organizationId = await getCurrentOrganizationId();

  const students = await prisma.student.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      studentCode: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      status: true,
      createdAt: true,
    },
  });

  return students;
}

/**
 * Crée un nouvel étudiant dans l'organisation active.
 * Conçu pour être utilisé avec `useActionState` : reçoit l'état précédent et un `FormData`,
 * retourne un état sérialisable (succès, erreurs de champs, message).
 */
export async function createStudentAction(
  _prevState: StudentFormState,
  formData: FormData
): Promise<StudentFormState> {
  const parsed = parseStudentForm(formData);

  if (!parsed.ok) {
    return {
      status: "error",
      message: "Veuillez corriger les champs indiqués.",
      fieldErrors: parsed.fieldErrors,
    };
  }

  const organizationId = await getCurrentOrganizationId();

  // Réessais en cas de collision sur le code étudiant généré (contrainte unique).
  const MAX_ATTEMPTS = 5;
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const studentCode = await generateStudentCode(organizationId);

      await prisma.student.create({
        data: {
          organizationId,
          studentCode,
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
          email: parsed.data.email,
          phone: parsed.data.phone,
          status: parsed.data.status,
        },
      });

      revalidatePath("/dashboard/students");

      // E-mail de bienvenue en arrière-plan (après la réponse) si l'étudiant
      // a une adresse e-mail valide. L'échec d'envoi ne bloque jamais la création.
      if (parsed.data.email) {
        const recipientEmail = parsed.data.email;
        const recipientName = `${parsed.data.firstName} ${parsed.data.lastName}`;

        after(async () => {
          await sendWelcomeEmail({
            studentEmail: recipientEmail,
            studentName: recipientName,
            studentCode,
          });
        });
      }

      return {
        status: "success",
        message: `Étudiant créé avec succès (${studentCode}).`,
      };
    } catch (error) {
      lastError = error;

      const isUniqueViolation =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

      if (!isUniqueViolation) break;
    }
  }

  console.error("[createStudentAction] Échec de création :", lastError);

  return {
    status: "error",
    message: "Une erreur est survenue lors de la création de l'étudiant.",
  };
}

/**
 * Met à jour un étudiant existant de l'organisation active.
 * Conçu pour être utilisé avec `useActionState` : reçoit l'état précédent et un `FormData`
 * (incluant le champ caché `id`), retourne un état sérialisable.
 */
export async function updateStudentAction(
  _prevState: StudentFormState,
  formData: FormData
): Promise<StudentFormState> {
  const studentId = String(formData.get("id") ?? "").trim();

  if (!studentId) {
    return {
      status: "error",
      message: "Identifiant de l'étudiant manquant.",
    };
  }

  const parsed = parseStudentForm(formData);

  if (!parsed.ok) {
    return {
      status: "error",
      message: "Veuillez corriger les champs indiqués.",
      fieldErrors: parsed.fieldErrors,
    };
  }

  const organizationId = await getCurrentOrganizationId();

  try {
    // Isolation multi-tenant : l'étudiant doit appartenir à l'organisation active.
    const existing = await prisma.student.findFirst({
      where: { id: studentId, organizationId },
      select: { id: true },
    });

    if (!existing) {
      return {
        status: "error",
        message: "Étudiant introuvable dans votre organisation.",
      };
    }

    await prisma.student.update({
      where: { id: studentId },
      data: {
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        email: parsed.data.email,
        phone: parsed.data.phone,
        status: parsed.data.status,
      },
    });

    revalidatePath("/dashboard/students");

    return {
      status: "success",
      message: "Étudiant mis à jour avec succès.",
    };
  } catch (error) {
    console.error("[updateStudentAction] Échec de mise à jour :", error);

    return {
      status: "error",
      message: "Une erreur est survenue lors de la mise à jour de l'étudiant.",
    };
  }
}

/**
 * Supprime un étudiant de l'organisation active.
 * Les inscriptions, paiements et dossiers de voyage liés sont supprimés en
 * cascade ; les tâches associées sont simplement détachées (`SetNull`).
 */
export async function deleteStudentAction(
  studentId: string
): Promise<StudentMutationResult> {
  if (!studentId) {
    return { ok: false, message: "Identifiant de l'étudiant manquant." };
  }

  try {
    const organizationId = await getCurrentOrganizationId();

    // Isolation multi-tenant : l'étudiant doit appartenir à l'organisation active.
    const existing = await prisma.student.findFirst({
      where: { id: studentId, organizationId },
      select: { id: true },
    });

    if (!existing) {
      return {
        ok: false,
        message: "Étudiant introuvable dans votre organisation.",
      };
    }

    await prisma.student.delete({ where: { id: studentId } });

    revalidatePath("/dashboard/students");
    revalidatePath("/dashboard/payments");
    revalidatePath("/dashboard/travels");

    return { ok: true };
  } catch (error) {
    console.error("[deleteStudentAction] Échec de suppression :", error);

    return {
      ok: false,
      message:
        "Une erreur est survenue lors de la suppression de l'étudiant.",
    };
  }
}

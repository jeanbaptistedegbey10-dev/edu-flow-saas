"use server";

import { Prisma, type StudentStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";

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

/**
 * Résout l'identifiant de l'organisation active.
 *
 * Isolation multi-tenant : toutes les requêtes sont filtrées par `organizationId`.
 * TODO: remplacer ce placeholder par la session utilisateur réelle
 * lorsque le module Auth (Supabase Auth / Auth.js) sera implémenté.
 */
async function getCurrentOrganizationId(): Promise<string> {
  const organization = await prisma.organization.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (!organization) {
    throw new Error("Aucune organisation n'a été trouvée.");
  }

  return organization.id;
}

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
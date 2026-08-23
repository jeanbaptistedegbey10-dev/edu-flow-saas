"use server";

import { Prisma, type Role } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getCurrentOrganizationId } from "@/lib/session";

// --------------------------------------
// Types publics (contrat avec les composants clients)
// --------------------------------------

export type CourseDTO = {
  id: string;
  title: string;
  code: string;
  description: string | null;
  price: number;
  durationWeeks: number;
  createdAt: Date;
  teacher: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  _count: {
    enrollments: number;
  };
};

export type TeacherDTO = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
};

export type CourseFormField =
  | "title"
  | "code"
  | "description"
  | "price"
  | "durationWeeks"
  | "teacherId";

export type CourseFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Partial<Record<CourseFormField, string>>;
};

/** Résultat des mutations rapides (suppression) côté client. */
export type CourseMutationResult =
  | { ok: true }
  | { ok: false; message: string };

// --------------------------------------
// Constantes & helpers internes
// --------------------------------------

/** Plafond de sécurité pour un prix saisi (FCFA). */
const MAX_PRICE = 1_000_000_000;

/** Durée maximale d'un cours en semaines (10 ans). */
const MAX_DURATION_WEEKS = 520;

/**
 * Format attendu pour un code de cours : lettres majuscules, chiffres et
 * tirets (ex : « GER-A1 », « DEV-FULL »), sans tiret en début/fin.
 */
const COURSE_CODE_REGEX = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

type ParsedCourseInput =
  | {
      ok: true;
      data: {
        title: string;
        code: string;
        description: string | null;
        price: number;
        durationWeeks: number;
        teacherId: string | null;
      };
    }
  | { ok: false; fieldErrors: Partial<Record<CourseFormField, string>> };

function parseCourseForm(formData: FormData): ParsedCourseInput {
  const title = String(formData.get("title") ?? "").trim();
  const rawCode = String(formData.get("code") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const rawPrice = String(formData.get("price") ?? "").trim();
  const rawDurationWeeks = String(formData.get("durationWeeks") ?? "").trim();
  const teacherId = String(formData.get("teacherId") ?? "").trim();

  const fieldErrors: Partial<Record<CourseFormField, string>> = {};

  if (!title) {
    fieldErrors.title = "L'intitulé est requis.";
  } else if (title.length > 150) {
    fieldErrors.title = "L'intitulé ne doit pas dépasser 150 caractères.";
  }

  // Normalisation : majuscules + suppression des espaces superflus.
  const code = rawCode.toUpperCase().replace(/\s+/g, "");

  if (!code) {
    fieldErrors.code = "Le code est requis.";
  } else if (code.length < 2 || code.length > 20) {
    fieldErrors.code = "Le code doit contenir entre 2 et 20 caractères.";
  } else if (!COURSE_CODE_REGEX.test(code)) {
    fieldErrors.code =
      "Format invalide : utilisez des majuscules, des chiffres et des tirets (ex : GER-A1, DEV-FULL).";
  }

  if (description.length > 500) {
    fieldErrors.description =
      "La description ne doit pas dépasser 500 caractères.";
  }

  // Accepte la virgule décimale saisie sur clavier FR (ex : « 150000,50 »).
  const price = Number(rawPrice.replace(",", "."));
  if (!rawPrice || Number.isNaN(price)) {
    fieldErrors.price = "Le prix est requis.";
  } else if (price <= 0) {
    fieldErrors.price = "Le prix doit être supérieur à 0.";
  } else if (price > MAX_PRICE) {
    fieldErrors.price = "Le prix dépasse la limite autorisée.";
  }

  const durationWeeks = Number(rawDurationWeeks);
  if (!rawDurationWeeks || Number.isNaN(durationWeeks)) {
    fieldErrors.durationWeeks = "La durée est requise.";
  } else if (!Number.isInteger(durationWeeks)) {
    fieldErrors.durationWeeks = "La durée doit être un nombre entier de semaines.";
  } else if (durationWeeks < 1 || durationWeeks > MAX_DURATION_WEEKS) {
    fieldErrors.durationWeeks = `La durée doit être comprise entre 1 et ${MAX_DURATION_WEEKS} semaines.`;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    data: {
      title,
      code,
      description: description || null,
      price,
      durationWeeks,
      teacherId: teacherId || null,
    },
  };
}

// --------------------------------------
// Server Actions
// --------------------------------------

/**
 * Récupère le catalogue des cours de l'organisation active,
 * avec la relation `teacher` et le nombre d'étudiants inscrits
 * (`_count.enrollments`).
 */
export async function getCourses(): Promise<CourseDTO[]> {
  const organizationId = await getCurrentOrganizationId();

  return prisma.course.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      code: true,
      description: true,
      price: true,
      durationWeeks: true,
      createdAt: true,
      teacher: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      _count: {
        select: { enrollments: true },
      },
    },
  });
}

/**
 * Récupère la liste des utilisateurs pouvant se voir attribuer un cours
 * (rôles TEACHER ou ADMIN) de l'organisation active.
 * Utilisée pour alimenter le Select « Enseignant » de la modale d'ajout.
 */
export async function getTeachers(): Promise<TeacherDTO[]> {
  const organizationId = await getCurrentOrganizationId();

  return prisma.user.findMany({
    where: {
      organizationId,
      role: { in: ["TEACHER", "ADMIN"] },
      isActive: true,
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
    },
  });
}

/**
 * Ajoute un nouveau cours au catalogue de l'organisation active.
 * Conçu pour être utilisé avec `useActionState` : reçoit l'état précédent et un `FormData`,
 * retourne un état sérialisable (succès, erreurs de champs, message).
 */
export async function createCourseAction(
  _prevState: CourseFormState,
  formData: FormData
): Promise<CourseFormState> {
  const parsed = parseCourseForm(formData);

  if (!parsed.ok) {
    return {
      status: "error",
      message: "Veuillez corriger les champs indiqués.",
      fieldErrors: parsed.fieldErrors,
    };
  }

  const organizationId = await getCurrentOrganizationId();

  try {
    // Unicité du code au sein de l'organisation (contrôle applicatif,
    // la contrainte n'étant pas définie au niveau du schéma Prisma).
    const existingCourse = await prisma.course.findFirst({
      where: { organizationId, code: parsed.data.code },
      select: { id: true },
    });

    if (existingCourse) {
      return {
        status: "error",
        message: "Ce code de cours est déjà utilisé.",
        fieldErrors: { code: "Ce code est déjà utilisé par un autre cours." },
      };
    }

    // Vérifie que l'enseignant appartient bien à l'organisation active
    // avec un rôle autorisé (isolation multi-tenant).
    if (parsed.data.teacherId) {
      const teacher = await prisma.user.findFirst({
        where: {
          id: parsed.data.teacherId,
          organizationId,
          role: { in: ["TEACHER", "ADMIN"] },
        },
        select: { id: true },
      });

      if (!teacher) {
        return {
          status: "error",
          message: "Enseignant introuvable dans votre organisation.",
          fieldErrors: { teacherId: "Enseignant invalide." },
        };
      }
    }

    await prisma.course.create({
      data: {
        organizationId,
        title: parsed.data.title,
        code: parsed.data.code,
        description: parsed.data.description,
        price: parsed.data.price,
        durationWeeks: parsed.data.durationWeeks,
        teacherId: parsed.data.teacherId,
      },
    });

    revalidatePath("/dashboard/courses");

    return {
      status: "success",
      message: `Cours créé avec succès (${parsed.data.code}).`,
    };
  } catch (error) {
    // Filet de sécurité : violation de contrainte unique éventuelle.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        status: "error",
        message: "Ce code de cours est déjà utilisé.",
        fieldErrors: { code: "Ce code est déjà utilisé par un autre cours." },
      };
    }

    console.error("[createCourseAction] Échec de création :", error);

    return {
      status: "error",
      message: "Une erreur est survenue lors de la création du cours.",
    };
  }
}

/**
 * Met à jour un cours existant du catalogue de l'organisation active.
 * Conçu pour être utilisé avec `useActionState` : reçoit l'état précédent et un `FormData`
 * (incluant le champ caché `id`), retourne un état sérialisable.
 */
export async function updateCourseAction(
  _prevState: CourseFormState,
  formData: FormData
): Promise<CourseFormState> {
  const courseId = String(formData.get("id") ?? "").trim();

  if (!courseId) {
    return {
      status: "error",
      message: "Identifiant du cours manquant.",
    };
  }

  const parsed = parseCourseForm(formData);

  if (!parsed.ok) {
    return {
      status: "error",
      message: "Veuillez corriger les champs indiqués.",
      fieldErrors: parsed.fieldErrors,
    };
  }

  const organizationId = await getCurrentOrganizationId();

  try {
    // Isolation multi-tenant : le cours doit appartenir à l'organisation active.
    const existing = await prisma.course.findFirst({
      where: { id: courseId, organizationId },
      select: { id: true },
    });

    if (!existing) {
      return {
        status: "error",
        message: "Cours introuvable dans votre organisation.",
      };
    }

    // Unicité du code au sein de l'organisation, en excluant le cours courant.
    const duplicate = await prisma.course.findFirst({
      where: {
        organizationId,
        code: parsed.data.code,
        id: { not: courseId },
      },
      select: { id: true },
    });

    if (duplicate) {
      return {
        status: "error",
        message: "Ce code de cours est déjà utilisé.",
        fieldErrors: { code: "Ce code est déjà utilisé par un autre cours." },
      };
    }

    // Vérifie que l'enseignant appartient bien à l'organisation active
    // avec un rôle autorisé (isolation multi-tenant).
    if (parsed.data.teacherId) {
      const teacher = await prisma.user.findFirst({
        where: {
          id: parsed.data.teacherId,
          organizationId,
          role: { in: ["TEACHER", "ADMIN"] },
        },
        select: { id: true },
      });

      if (!teacher) {
        return {
          status: "error",
          message: "Enseignant introuvable dans votre organisation.",
          fieldErrors: { teacherId: "Enseignant invalide." },
        };
      }
    }

    await prisma.course.update({
      where: { id: courseId },
      data: {
        title: parsed.data.title,
        code: parsed.data.code,
        description: parsed.data.description,
        price: parsed.data.price,
        durationWeeks: parsed.data.durationWeeks,
        teacherId: parsed.data.teacherId,
      },
    });

    revalidatePath("/dashboard/courses");

    return {
      status: "success",
      message: `Cours mis à jour avec succès (${parsed.data.code}).`,
    };
  } catch (error) {
    // Filet de sécurité : violation de contrainte unique éventuelle.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        status: "error",
        message: "Ce code de cours est déjà utilisé.",
        fieldErrors: { code: "Ce code est déjà utilisé par un autre cours." },
      };
    }

    console.error("[updateCourseAction] Échec de mise à jour :", error);

    return {
      status: "error",
      message: "Une erreur est survenue lors de la mise à jour du cours.",
    };
  }
}

/**
 * Supprime un cours de l'organisation active.
 * Les inscriptions liées sont supprimées en cascade.
 */
export async function deleteCourseAction(
  courseId: string
): Promise<CourseMutationResult> {
  if (!courseId) {
    return { ok: false, message: "Identifiant du cours manquant." };
  }

  try {
    const organizationId = await getCurrentOrganizationId();

    // Isolation multi-tenant : le cours doit appartenir à l'organisation active.
    const existing = await prisma.course.findFirst({
      where: { id: courseId, organizationId },
      select: { id: true },
    });

    if (!existing) {
      return {
        ok: false,
        message: "Cours introuvable dans votre organisation.",
      };
    }

    await prisma.course.delete({ where: { id: courseId } });

    revalidatePath("/dashboard/courses");

    return { ok: true };
  } catch (error) {
    console.error("[deleteCourseAction] Échec de suppression :", error);

    return {
      ok: false,
      message:
        "Une erreur est survenue lors de la suppression du cours.",
    };
  }
}

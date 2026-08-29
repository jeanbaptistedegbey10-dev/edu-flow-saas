"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getCurrentOrganizationId, isNextRedirectError } from "@/lib/session";
import { assertCanMutate } from "@/lib/license-check";

// --------------------------------------
// Types publics (contrat avec les composants clients)
// --------------------------------------

/** Classe / cohorte avec son cours, son enseignant et son effectif. */
export type ClassDTO = {
  id: string;
  name: string;
  /** Créneau horaire (ex : « 08h-11h »). */
  schedule: string;
  /**
   * Frais de scolarité configurés pour la classe (FCFA), ou `null` pour
   * hériter du prix du cours porteur.
   */
  tuitionFee: number | null;
  courseId: string;
  courseTitle: string;
  courseCode: string;
  teacherId: string | null;
  teacherName: string | null;
  studentCount: number;
  createdAt: Date;
};

/** Option légère pour alimenter un Select « Classe ». */
export type ClassOptionDTO = {
  id: string;
  name: string;
  schedule: string;
  courseTitle: string;
  courseCode: string;
  /**
   * Montant effectif appliqué au coût total de scolarité de l'étudiant :
   * frais de la classe si configurés, sinon prix du cours porteur.
   */
  tuitionFee: number | null;
};

export type ClassFormField =
  | "name"
  | "schedule"
  | "tuitionFee"
  | "courseId"
  | "teacherId";

export type ClassFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Partial<Record<ClassFormField, string>>;
};

/** Résultat des mutations rapides (suppression) côté client. */
export type ClassMutationResult =
  | { ok: true }
  | { ok: false; message: string };

// --------------------------------------
// Constantes & helpers internes
// --------------------------------------

const NAME_MAX_LENGTH = 100;
const SCHEDULE_MAX_LENGTH = 100;

type ParsedClassInput =
  | {
      ok: true;
      data: {
        name: string;
        schedule: string;
        tuitionFee: number | null;
        courseId: string;
        teacherId: string | null;
      };
    }
  | { ok: false; fieldErrors: Partial<Record<ClassFormField, string>> };

function parseClassForm(formData: FormData): ParsedClassInput {
  const name = String(formData.get("name") ?? "").trim();
  const schedule = String(formData.get("schedule") ?? "").trim();
  const courseId = String(formData.get("courseId") ?? "").trim();
  const teacherId = String(formData.get("teacherId") ?? "").trim();
  const rawTuitionFee = String(formData.get("tuitionFee") ?? "").trim();

  const fieldErrors: Partial<Record<ClassFormField, string>> = {};

  if (!name) {
    fieldErrors.name = "Le nom de la classe est requis.";
  } else if (name.length > NAME_MAX_LENGTH) {
    fieldErrors.name = `Le nom ne doit pas dépasser ${NAME_MAX_LENGTH} caractères.`;
  }

  if (!schedule) {
    fieldErrors.schedule = "Le créneau horaire est requis.";
  } else if (schedule.length > SCHEDULE_MAX_LENGTH) {
    fieldErrors.schedule = `Le créneau horaire ne doit pas dépasser ${SCHEDULE_MAX_LENGTH} caractères.`;
  }

  if (!courseId) {
    fieldErrors.courseId = "Veuillez sélectionner un cours.";
  }

  // Frais de scolarité de la classe : optionnel. Absent ⇒ héritage du prix
  // du cours porteur au moment de l'affectation d'un étudiant.
  let tuitionFee: number | null = null;
  if (rawTuitionFee) {
    const value = Number(rawTuitionFee.replace(",", "."));
    if (Number.isNaN(value)) {
      fieldErrors.tuitionFee = "Les frais doivent être un nombre.";
    } else if (value < 0) {
      fieldErrors.tuitionFee = "Les frais ne peuvent pas être négatifs.";
    } else if (value > 1_000_000_000) {
      fieldErrors.tuitionFee = "Les frais dépassent la limite autorisée.";
    } else {
      tuitionFee = value;
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    data: {
      name,
      schedule,
      tuitionFee,
      courseId,
      teacherId: teacherId || null,
    },
  };
}

/**
 * Vérifie que le cours et l'enseignant ciblés appartiennent bien à
 * l'organisation active (isolation multi-tenant).
 */
async function validateClassRelations(
  organizationId: string,
  courseId: string,
  teacherId: string | null
): Promise<string | null> {
  const course = await prisma.course.findFirst({
    where: { id: courseId, organizationId },
    select: { id: true },
  });

  if (!course) {
    return "Cours introuvable dans votre organisation.";
  }

  if (teacherId) {
    const teacher = await prisma.user.findFirst({
      where: { id: teacherId, organizationId },
      select: { id: true },
    });

    if (!teacher) {
      return "Enseignant introuvable dans votre organisation.";
    }
  }

  return null;
}

// --------------------------------------
// Server Actions
// --------------------------------------

/**
 * Récupère les classes / cohortes de l'organisation active avec leur cours,
 * leur enseignant éventuel et leur effectif.
 */
export async function getClasses(): Promise<ClassDTO[]> {
  const organizationId = await getCurrentOrganizationId();

  try {
    const classes = await prisma.class.findMany({
      where: { organizationId },
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        schedule: true,
        tuitionFee: true,
        courseId: true,
        createdAt: true,
        course: {
          select: { title: true, code: true },
        },
        teacherId: true,
        teacher: {
          select: { firstName: true, lastName: true },
        },
        _count: { select: { enrollments: true } },
      },
    });

    return classes.map((klass) => ({
      id: klass.id,
      name: klass.name,
      schedule: klass.schedule,
      tuitionFee: klass.tuitionFee,
      courseId: klass.courseId,
      courseTitle: klass.course.title,
      courseCode: klass.course.code,
      teacherId: klass.teacherId,
      teacherName: klass.teacher
        ? `${klass.teacher.firstName} ${klass.teacher.lastName}`
        : null,
      studentCount: klass._count.enrollments,
      createdAt: klass.createdAt,
    }));
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[getClasses] Échec de lecture :", error);

    // Dégradation gracieuse : liste vide plutôt que crash serveur.
    return [];
  }
}

/**
 * Liste légère des classes de l'organisation active, triée par cours puis nom.
 * Alimente les Select « Classe » (affectation d'étudiants, émargement...).
 */
export async function getClassOptions(): Promise<ClassOptionDTO[]> {
  const organizationId = await getCurrentOrganizationId();

  try {
    const classes = await prisma.class.findMany({
      where: { organizationId },
      orderBy: [{ course: { title: "asc" } }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        schedule: true,
        tuitionFee: true,
        course: {
          select: { title: true, code: true, price: true },
        },
      },
    });

    return classes.map((klass) => ({
      id: klass.id,
      name: klass.name,
      schedule: klass.schedule,
      courseTitle: klass.course.title,
      courseCode: klass.course.code,
      // Montant effectif : frais de classe si configurés, sinon prix du cours.
      tuitionFee: klass.tuitionFee ?? klass.course.price,
    }));
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[getClassOptions] Échec de lecture :", error);

    // Dégradation gracieuse : liste vide plutôt que crash serveur.
    return [];
  }
}

/**
 * Crée une nouvelle classe / cohorte rattachée à un cours de l'organisation
 * active. Conçue pour être utilisée avec `useActionState`.
 */
export async function createClassAction(
  _prevState: ClassFormState,
  formData: FormData
): Promise<ClassFormState> {
  await assertCanMutate();
  const parsed = parseClassForm(formData);

  if (!parsed.ok) {
    return {
      status: "error",
      message: "Veuillez corriger les champs indiqués.",
      fieldErrors: parsed.fieldErrors,
    };
  }

  const organizationId = await getCurrentOrganizationId();

  try {
    const relationError = await validateClassRelations(
      organizationId,
      parsed.data.courseId,
      parsed.data.teacherId
    );

    if (relationError) {
      return {
        status: "error",
        message: relationError,
        fieldErrors: relationError.startsWith("Cours")
          ? { courseId: relationError }
          : { teacherId: relationError },
      };
    }

    await prisma.class.create({
      data: {
        organizationId,
        name: parsed.data.name,
        schedule: parsed.data.schedule,
        tuitionFee: parsed.data.tuitionFee,
        courseId: parsed.data.courseId,
        teacherId: parsed.data.teacherId,
      },
    });

    revalidatePath("/dashboard/classes");

    return {
      status: "success",
      message: `Classe « ${parsed.data.name} » créée avec succès.`,
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[createClassAction] Échec de création :", error);

    return {
      status: "error",
      message:
        "Une erreur est survenue lors de la création de la classe.",
    };
  }
}

/**
 * Met à jour une classe existante de l'organisation active.
 * Conçue pour être utilisée avec `useActionState` (champ caché `id` inclus).
 */
export async function updateClassAction(
  _prevState: ClassFormState,
  formData: FormData
): Promise<ClassFormState> {
  await assertCanMutate();
  const classId = String(formData.get("id") ?? "").trim();

  if (!classId) {
    return {
      status: "error",
      message: "Identifiant de la classe manquant.",
    };
  }

  const parsed = parseClassForm(formData);

  if (!parsed.ok) {
    return {
      status: "error",
      message: "Veuillez corriger les champs indiqués.",
      fieldErrors: parsed.fieldErrors,
    };
  }

  const organizationId = await getCurrentOrganizationId();

  try {
    // Isolation multi-tenant : la classe doit appartenir à l'organisation active.
    const existing = await prisma.class.findFirst({
      where: { id: classId, organizationId },
      select: { id: true },
    });

    if (!existing) {
      return {
        status: "error",
        message: "Classe introuvable dans votre organisation.",
      };
    }

    const relationError = await validateClassRelations(
      organizationId,
      parsed.data.courseId,
      parsed.data.teacherId
    );

    if (relationError) {
      return {
        status: "error",
        message: relationError,
        fieldErrors: relationError.startsWith("Cours")
          ? { courseId: relationError }
          : { teacherId: relationError },
      };
    }

    await prisma.class.update({
      where: { id: classId },
      data: {
        name: parsed.data.name,
        schedule: parsed.data.schedule,
        tuitionFee: parsed.data.tuitionFee,
        courseId: parsed.data.courseId,
        teacherId: parsed.data.teacherId,
      },
    });

    revalidatePath("/dashboard/classes");
    revalidatePath("/dashboard/attendance");

    return {
      status: "success",
      message: "Classe mise à jour avec succès.",
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[updateClassAction] Échec de mise à jour :", error);

    return {
      status: "error",
      message:
        "Une erreur est survenue lors de la mise à jour de la classe.",
    };
  }
}

/**
 * Supprime une classe de l'organisation active.
 * Les affectations d'étudiants sont supprimées en cascade ; les présences
 * liées sont détachées (`SetNull`) pour conserver l'historique du cours.
 */
export async function deleteClassAction(
  classId: string
): Promise<ClassMutationResult> {
  await assertCanMutate();
  if (!classId) {
    return { ok: false, message: "Identifiant de la classe manquant." };
  }

  try {
    const organizationId = await getCurrentOrganizationId();

    // Isolation multi-tenant : la classe doit appartenir à l'organisation active.
    const existing = await prisma.class.findFirst({
      where: { id: classId, organizationId },
      select: { id: true },
    });

    if (!existing) {
      return {
        ok: false,
        message: "Classe introuvable dans votre organisation.",
      };
    }

    await prisma.class.delete({ where: { id: classId } });

    revalidatePath("/dashboard/classes");
    revalidatePath("/dashboard/students");
    revalidatePath("/dashboard/attendance");

    return { ok: true };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[deleteClassAction] Échec de suppression :", error);

    return {
      ok: false,
      message:
        "Une erreur est survenue lors de la suppression de la classe.",
    };
  }
}

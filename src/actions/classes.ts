"use server";

import { revalidatePath } from "next/cache";
import type { ClassStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getCurrentOrganizationId, getCurrentSessionUser, isNextRedirectError } from "@/lib/session";
import { assertCanMutate } from "@/lib/license-check";

// --------------------------------------
// Types publics (contrat avec les composants clients)
// --------------------------------------

/** Créneau hebdomadaire d'une classe (ClassSchedule). */
export type ClassScheduleDTO = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room: string | null;
};

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
  /** Statut pédagogique : ACTIVE (en cours), COMPLETED (clôturée), ARCHIVED. */
  status: ClassStatus;
  /** Créneaux hebdomadaires détaillés de la classe. */
  schedules: ClassScheduleDTO[];
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
  /** Créneaux hebdomadaires détaillés de la classe. */
  schedules: ClassScheduleDTO[];
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
        schedules: Array<{
          dayOfWeek: number;
          startTime: string;
          endTime: string;
          room: string | null;
        }>;
      };
    }
  | { ok: false; fieldErrors: Partial<Record<ClassFormField, string>> };

/**
 * Parse les créneaux hebdomadaires soumis via le formulaire.
 * Les créneaux sont transmis en JSON dans un champ caché `schedulesJson`.
 */
function parseSchedulesJson(raw: string): Array<{
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room: string | null;
}> {
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (item): item is { dayOfWeek: number; startTime: string; endTime: string; room: string | null } =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Record<string, unknown>).dayOfWeek === "number" &&
        typeof (item as Record<string, unknown>).startTime === "string" &&
        typeof (item as Record<string, unknown>).endTime === "string"
    );
  } catch {
    return [];
  }
}

function parseClassForm(formData: FormData): ParsedClassInput {
  const name = String(formData.get("name") ?? "").trim();
  const schedule = String(formData.get("schedule") ?? "").trim();
  const courseId = String(formData.get("courseId") ?? "").trim();
  const teacherId = String(formData.get("teacherId") ?? "").trim();
  const rawTuitionFee = String(formData.get("tuitionFee") ?? "").trim();
  const rawSchedules = String(formData.get("schedulesJson") ?? "").trim();

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

  // Parse des créneaux hebdomadaires
  const schedules = parseSchedulesJson(rawSchedules);

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
      schedules,
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
        status: true,
        course: {
          select: { title: true, code: true },
        },
        teacherId: true,
        teacher: {
          select: { firstName: true, lastName: true },
        },
        _count: { select: { enrollments: true } },
        schedules: {
          select: {
            id: true,
            dayOfWeek: true,
            startTime: true,
            endTime: true,
            room: true,
          },
          orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
        },
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
      status: klass.status,
      schedules: klass.schedules.map((s) => ({
        id: s.id,
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
        room: s.room,
      })),
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
        schedules: {
          select: {
            id: true,
            dayOfWeek: true,
            startTime: true,
            endTime: true,
            room: true,
          },
          orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
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
      schedules: klass.schedules.map((s) => ({
        id: s.id,
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
        room: s.room,
      })),
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
        schedules: {
          create: parsed.data.schedules.map((s) => ({
            dayOfWeek: s.dayOfWeek,
            startTime: s.startTime,
            endTime: s.endTime,
            room: s.room || null,
          })),
        },
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

    await prisma.$transaction(async (tx) => {
      // Supprime les anciens créneaux puis recrée les nouveaux (pattern
      // delete-and-recreate simple pour synchroniser les horaires).
      await tx.classSchedule.deleteMany({ where: { classId } });

      await tx.class.update({
        where: { id: classId },
        data: {
          name: parsed.data.name,
          schedule: parsed.data.schedule,
          tuitionFee: parsed.data.tuitionFee,
          courseId: parsed.data.courseId,
          teacherId: parsed.data.teacherId,
          schedules: {
            create: parsed.data.schedules.map((s) => ({
              dayOfWeek: s.dayOfWeek,
              startTime: s.startTime,
              endTime: s.endTime,
              room: s.room || null,
            })),
          },
        },
      });
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

// --------------------------------------
// Types pour la fiche détaillée d'une classe
// --------------------------------------

/** Étudiant inscrit à une classe (pour la fiche détaillée). */
export type ClassStudentDTO = {
  studentId: string;
  studentCode: string;
  firstName: string;
  lastName: string;
  progress: number;
};

/** Détail complet d'une classe : informations, inscrits et cours porteur. */
export type ClassDetailDTO = {
  id: string;
  name: string;
  schedule: string;
  tuitionFee: number | null;
  courseId: string;
  courseTitle: string;
  courseCode: string;
  teacherId: string | null;
  teacherName: string | null;
  /** Statut pédagogique : ACTIVE (en cours), COMPLETED (clôturée), ARCHIVED. */
  status: ClassStatus;
  students: ClassStudentDTO[];
  /** Créneaux hebdomadaires détaillés de la classe. */
  schedules: ClassScheduleDTO[];
};

// --------------------------------------
// Server Action — Fiche détaillée d'une classe
// --------------------------------------

/**
 * Récupère la fiche détaillée d'une classe (informations, liste des étudiants
 * inscrits et cours porteur) en une seule action.
 * Respecte l'isolation par rôle : un enseignant ne peut consulter que ses classes.
 */
export async function getClassDetail(
  classId: string
): Promise<ClassDetailDTO> {
  const user = await getCurrentSessionUser();

  if (user.role === "STUDENT") {
    throw new Error("Accès refusé : les étudiants n'ont pas accès au tableau de bord.");
  }

  // Vérifie que la classe appartient à l'organisation et que l'enseignant y est assigné
  const where =
    user.role === "TEACHER"
      ? { id: classId, organizationId: user.organizationId, teacherId: user.id }
      : { id: classId, organizationId: user.organizationId };

  const klass = await prisma.class.findFirst({
    where,
    select: {
      id: true,
      name: true,
      schedule: true,
      tuitionFee: true,
      courseId: true,
      status: true,
      course: {
        select: { title: true, code: true },
      },
      teacherId: true,
      teacher: {
        select: { firstName: true, lastName: true },
      },
      enrollments: {
        select: {
          student: {
            select: {
              id: true,
              studentCode: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: [{ student: { firstName: "asc" } }, { student: { lastName: "asc" } }],
      },
      schedules: {
        select: {
          id: true,
          dayOfWeek: true,
          startTime: true,
          endTime: true,
          room: true,
        },
        orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      },
    },
  });

  if (!klass) {
    throw new Error("Classe introuvable ou non autorisée.");
  }

  return {
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
    status: klass.status,
    students: klass.enrollments.map((enrollment) => ({
      studentId: enrollment.student.id,
      studentCode: enrollment.student.studentCode,
      firstName: enrollment.student.firstName,
      lastName: enrollment.student.lastName,
      progress: 0,
    })),
    schedules: klass.schedules.map((s) => ({
      id: s.id,
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      room: s.room,
    })),
  };
}

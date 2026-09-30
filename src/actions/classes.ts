"use server";

import { revalidatePath } from "next/cache";
import type { ClassStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getCurrentOrganizationId, getCurrentSessionUser, isNextRedirectError } from "@/lib/session";
import { assertCanMutate } from "@/lib/license-check";
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from "@/lib/audit-constants";
import { logAuditEvent } from "@/lib/actions/audit";
import {
  canUnarchiveClass,
  resolveRestoredStatus,
} from "@/lib/class-status";
import { canManageClassLifecycle } from "@/lib/role";
import {
  getClassClosureReadiness,
  type ClosureMissingRequirement,
} from "@/actions/class-closure";

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
  /** Statut pédagogique : PLANIFIED (programmée), IN_PROGRESS/ACTIVE (en cours), COMPLETED (clôturée), ARCHIVED. */
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
  | { ok: true; message?: string }
  | {
      ok: false;
      message: string;
      /**
       * Prérequis métier non satisfaits (archivage / désarchivage), listés
       * explicitement afin que l'interface affiche l'alerte bloquante au lieu
       * d'un message opaque. Même logique que `CloseClassResult`.
       */
      missingRequirements?: ClosureMissingRequirement[];
    };

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
        // Cycle de vie : toute nouvelle classe est « programmée » jusqu'à
        // l'action « Démarrer » (PLANIFIED → IN_PROGRESS).
        status: "PLANIFIED",
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
 * Démarre une classe programmée : PLANIFIED → IN_PROGRESS.
 *
 * Le démarrage acte le début effectif des sessions (émargement, cahier de
 * texte, évaluations). La clôture reste disponible à tout moment via
 * l'écran de décision de passage.
 */
export async function startClassAction(
  classId: string
): Promise<ClassMutationResult> {
  await assertCanMutate();

  if (!classId) {
    return { ok: false, message: "Identifiant de la classe manquant." };
  }

  const user = await getCurrentSessionUser();

  // Acte de gestion : réservé aux rôles administratifs (cohérent avec la
  // clôture) ; les enseignants consultent sans muter le cycle de vie.
  if (user.role === "TEACHER" || user.role === "STUDENT") {
    return {
      ok: false,
      message: "Accès refusé : le démarrage d'une classe est réservé aux administrateurs.",
    };
  }

  try {
    const klass = await prisma.class.findFirst({
      where: { id: classId, organizationId: user.organizationId },
      select: { id: true, name: true, status: true },
    });

    if (!klass) {
      return { ok: false, message: "Classe introuvable dans votre organisation." };
    }

    if (klass.status !== "PLANIFIED") {
      return {
        ok: false,
        message:
          klass.status === "COMPLETED" || klass.status === "ARCHIVED"
            ? "Cette classe est déjà clôturée : impossible de la redémarrer."
            : "Cette classe est déjà démarrée.",
      };
    }

    await prisma.class.update({
      where: { id: klass.id },
      data: { status: "IN_PROGRESS" },
    });

    revalidatePath("/dashboard/classes");
    revalidatePath(`/dashboard/classes/${klass.id}`);

    // Journal d'audit (hors transaction : ne doit pas annuler le démarrage).
    await logAuditEvent({
      action: AUDIT_ACTIONS.CLASS_STARTED,
      entity: AUDIT_ENTITIES.CLASS,
      entityId: klass.id,
      details: {
        className: klass.name,
        previousStatus: klass.status,
        newStatus: "IN_PROGRESS",
      },
    });

    return { ok: true };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[startClassAction] Échec du démarrage :", error);

    return {
      ok: false,
      message:
        "Une erreur est survenue lors du démarrage de la classe.",
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
// Cycle de vie — Séance du jour & Archivage
// --------------------------------------

/** Séance du jour d'une classe (synthèse pour la fiche détail). */
export type TodaySessionDTO = {
  id: string;
  sessionDate: Date;
  subjectName: string;
  chapter: string;
  summary: string | null;
  isCompleted: boolean;
  endedAt: Date | null;
  attendanceCount: number;
  presentCount: number;
  absentCount: number;
};

/** Paramètres de démarrage de la séance du jour. */
export type StartTodaySessionInput = {
  classId: string;
  subjectName?: string;
  chapter?: string;
  summary?: string;
};

/** Résultat enrichi des actions de séance. */
export type SessionMutationResult =
  | { ok: true; sessionId: string; message?: string }
  | { ok: false; message: string };

/** Borne UTC minuit de la journée courante. */
function todayUtcMidnight(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
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
  /** Statut pédagogique : PLANIFIED (programmée), IN_PROGRESS/ACTIVE (en cours), COMPLETED (clôturée), ARCHIVED. */
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

// --------------------------------------
// Server Actions — Séance du jour (Supabase via Prisma)
// --------------------------------------

/**
 * Récupère la séance du jour (`ClassSession` à la date UTC du jour) avec les
 * compteurs d'émargement. Retourne `null` si aucune séance démarrée.
 */
export async function getTodaySession(classId: string): Promise<TodaySessionDTO | null> {
  const user = await getCurrentSessionUser();

  if (user.role === "STUDENT") {
    throw new Error("Accès refusé : les étudiants n'ont pas accès au tableau de bord.");
  }

  const where =
    user.role === "TEACHER"
      ? { id: classId, organizationId: user.organizationId, teacherId: user.id }
      : { id: classId, organizationId: user.organizationId };

  const klass = await prisma.class.findFirst({ where, select: { id: true } });
  if (!klass) return null;

  const sessionDate = todayUtcMidnight();
  // Lecture résiliente : les flags de clôture peuvent être absents en base
  // si la migration n'a pas encore été appliquée.
  const sessionLegacy = await prisma.classSession.findUnique({
    where: { classId_sessionDate: { classId: klass.id, sessionDate } },
    select: {
      id: true,
      sessionDate: true,
      subjectName: true,
      chapter: true,
      summary: true,
      attendances: { select: { status: true } },
    },
  });

  if (!sessionLegacy) return null;

  let completion: { isCompleted: boolean; endedAt: Date | null } = {
    isCompleted: false,
    endedAt: null,
  };
  try {
    const flags = await (prisma.classSession as unknown as {
      findUnique: (args: unknown) => Promise<{ isCompleted?: boolean; endedAt?: Date | null } | null>;
    }).findUnique({
      where: { id: sessionLegacy.id },
      select: { isCompleted: true, endedAt: true },
    });
    completion = {
      isCompleted: flags?.isCompleted ?? false,
      endedAt: flags?.endedAt ?? null,
    };
  } catch {
    completion = { isCompleted: false, endedAt: null };
  }

  return {
    id: sessionLegacy.id,
    sessionDate: sessionLegacy.sessionDate,
    subjectName: sessionLegacy.subjectName,
    chapter: sessionLegacy.chapter,
    summary: sessionLegacy.summary,
    isCompleted: completion.isCompleted,
    endedAt: completion.endedAt,
    attendanceCount: sessionLegacy.attendances.length,
    presentCount: sessionLegacy.attendances.filter(
      (a) => a.status === "PRESENT" || a.status === "LATE"
    ).length,
    absentCount: sessionLegacy.attendances.filter(
      (a) => a.status === "ABSENT" || a.status === "EXCUSED"
    ).length,
  };
}

/**
 * Démarre la séance du jour : crée la `ClassSession` du jour (unique par
 * `[classId, sessionDate]`). Idempotent — retourne la séance existante.
 * La classe doit être en cours (IN_PROGRESS / ACTIVE).
 */
export async function startTodaySessionAction(
  input: StartTodaySessionInput
): Promise<SessionMutationResult> {
  await assertCanMutate();

  try {
    const user = await getCurrentSessionUser();

    if (user.role === "STUDENT") {
      return { ok: false, message: "Accès refusé." };
    }

    const where =
      user.role === "TEACHER"
        ? { id: input.classId, organizationId: user.organizationId, teacherId: user.id }
        : { id: input.classId, organizationId: user.organizationId };

    const klass = await prisma.class.findFirst({
      where,
      select: { id: true, name: true, status: true, course: { select: { title: true } } },
    });

    if (!klass) {
      return { ok: false, message: "Classe introuvable ou non autorisée." };
    }

    if (klass.status !== "IN_PROGRESS" && klass.status !== "ACTIVE") {
      return { ok: false, message: "Démarrez d'abord la classe avant d'ouvrir la séance du jour." };
    }

    const sessionDate = todayUtcMidnight();
    const existing = await prisma.classSession.findUnique({
      where: { classId_sessionDate: { classId: klass.id, sessionDate } },
      select: { id: true },
    });

    if (existing) {
      return { ok: true, sessionId: existing.id, message: "Séance du jour déjà démarrée." };
    }

    const now = new Date();
    const session = await prisma.classSession.create({
      data: {
        organizationId: user.organizationId,
        classId: klass.id,
        subjectName: input.subjectName?.trim() || klass.course.title.slice(0, 200),
        chapter: input.chapter?.trim() || "Séance du jour",
        summary: input.summary?.trim() || null,
        sessionDate,
        startTime: now,
        endTime: new Date(now.getTime() + 2 * 60 * 60 * 1000),
      },
      select: { id: true },
    });

    await logAuditEvent({
      action: AUDIT_ACTIONS.SESSION_STARTED,
      entity: AUDIT_ENTITIES.CLASS,
      entityId: klass.id,
      details: { className: klass.name, sessionId: session.id },
    });

    revalidatePath("/dashboard/classes");
    revalidatePath(`/dashboard/classes/${klass.id}`);
    revalidatePath("/dashboard/attendance");
    revalidatePath("/dashboard/attendance/sheet");

    return { ok: true, sessionId: session.id };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error("[startTodaySessionAction] Échec :", error);
    return { ok: false, message: "Impossible de démarrer la séance du jour." };
  }
}

/**
 * Termine la séance du jour : exige un émargement non vide puis journalise la
 * fin de séance (le schéma `ClassSession` n'a pas de statut dédié — la fin est
 * matérialisée par l'audit et la revalidation des caches).
 */
export async function endTodaySessionAction(classId: string): Promise<SessionMutationResult> {
  await assertCanMutate();

  try {
    const user = await getCurrentSessionUser();

    if (user.role === "STUDENT") {
      return { ok: false, message: "Accès refusé." };
    }

    const where =
      user.role === "TEACHER"
        ? { id: classId, organizationId: user.organizationId, teacherId: user.id }
        : { id: classId, organizationId: user.organizationId };

    const klass = await prisma.class.findFirst({ where, select: { id: true, name: true } });
    if (!klass) {
      return { ok: false, message: "Classe introuvable ou non autorisée." };
    }

    const sessionDate = todayUtcMidnight();
    const now = new Date();
    // Lecture résiliente : si la migration de clôture (`isCompleted`/`endedAt`)
    // n'a pas encore été appliquée en base, on retombe sur une lecture legacy
    // au lieu de lever une erreur non interceptée (bug « Terminer la séance »).
    const sessionLegacy = await prisma.classSession.findUnique({
      where: { classId_sessionDate: { classId: klass.id, sessionDate } },
      select: {
        id: true,
        chapter: true,
        summary: true,
        attendances: { select: { id: true } },
      },
    });

    if (!sessionLegacy) {
      return { ok: false, message: "Aucune séance démarrée aujourd'hui." };
    }

    let alreadyCompleted = false;
    try {
      const flags = await prisma.classSession.findUnique({
        where: { id: sessionLegacy.id },
        select: { isCompleted: true },
      });
      alreadyCompleted = flags?.isCompleted ?? false;
    } catch {
      alreadyCompleted = false;
    }

    if (alreadyCompleted) {
      return { ok: false, message: "La séance du jour est déjà terminée." };
    }

    if (sessionLegacy.attendances.length === 0) {
      return { ok: false, message: "Émargement vide : enregistrez au moins une présence." };
    }

    if (!sessionLegacy.chapter.trim() || !(sessionLegacy.summary ?? "").trim()) {
      return {
        ok: false,
        message:
          "Cahier de texte incomplet : renseignez le chapitre/thème et le résumé de la séance avant de terminer.",
      };
    }

    let endedSessionId = sessionLegacy.id;
    try {
      const ended = await (prisma.classSession as unknown as {
        update: (args: unknown) => Promise<{ id: string }>;
      }).update({
        where: { id: sessionLegacy.id },
        data: { isCompleted: true, endedAt: now },
        select: { id: true },
      });
      endedSessionId = ended.id;
    } catch (updateError) {
      // Compatibilité ascendante : si la migration `isCompleted`/`endedAt` n'a
      // pas encore été appliquée en base, la clôture retombe sur une mise à
      // jour d'horodatage au lieu de lever une erreur non interceptée.
      console.warn("[endTodaySessionAction] Clôture sans colonnes isCompleted/endedAt :", updateError);
      await prisma.classSession.update({
        where: { id: sessionLegacy.id },
        data: { endTime: now },
      });
    }

    await logAuditEvent({
      action: AUDIT_ACTIONS.SESSION_ENDED,
      entity: AUDIT_ENTITIES.CLASS,
      entityId: klass.id,
      details: { className: klass.name, sessionId: sessionLegacy.id, count: sessionLegacy.attendances.length },
    });

    revalidatePath("/dashboard/classes");
    revalidatePath(`/dashboard/classes/${klass.id}`);
    revalidatePath("/dashboard/attendance");
    revalidatePath("/dashboard/attendance/sheet");

    return { ok: true, sessionId: endedSessionId, message: "Séance terminée." };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error("[endTodaySessionAction] Échec :", error);
    return { ok: false, message: "Impossible de terminer la séance du jour." };
  }
}

/**
 * Résultat standardisé `{ success, error }` pour le bouton
 * « Terminer la séance » : ne lève jamais d'exception non interceptée et ne
 * laisse jamais la promesse suspendue — toute erreur métier ou technique est
 * convertie en `{ success: false, error }`.
 */
export async function endTodaySessionActionResult(
  classId: string
): Promise<{ success: true; sessionId: string } | { success: false; error: string }> {
  try {
    const result = await endTodaySessionAction(classId);
    if (result.ok) return { success: true, sessionId: result.sessionId };
    return { success: false, error: result.message };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error("[endTodaySessionActionResult] Échec :", error);
    return { success: false, error: "Impossible de terminer la séance du jour." };
  }
}

/**
 * Message d'erreur agrégé renvoyé par `archiveClassAction` lorsqu'un des
 * prérequis pédagogiques manque (défense en profondeur : la même liste est
 * affichée par l'alerte bloquante de l'interface).
 */
function buildArchiveBlockedMessage(
  missing: ClosureMissingRequirement[]
): string {
  if (missing.length === 0) {
    return "L'archivage est bloqué : des prérequis pédagogiques sont manquants.";
  }

  return `L'archivage est bloqué — ${missing.length} prérequis à satisfaire : ${missing
    .map((requirement) => requirement.label)
    .join(" ")}`;
}

/**
 * Archive une classe clôturée (COMPLETED → ARCHIVED). Réservé aux
 * administrateurs. L'historique (inscriptions, notes, certificats) est conservé :
 * la classe bascule en lecture seule et reste consultable dans l'onglet
 * « Archives » de la liste des classes, mais disparaît des sélecteurs
 * opérationnels (émargement, cahier de texte, évaluations).
 *
 * GARDE-FOU MÉTIER (défense en profondeur) : les 3 prérequis pédagogiques sont
 * recontrôlés côté serveur, quelle que soit l'entrée utilisée (carte de classe
 * en état COMPLETED ou enchaînement « Clôturer et Archiver ») :
 *  1. au moins une séance enregistrée avec présence émargée ;
 *  2. au moins une séance dont le cahier de texte est rempli (chapitre ET
 *     résumé) ;
 *  3. des évaluations créées ET intégralement notées.
 *
 * L'archivage est donc refusé tant que l'un de ces éléments manque ; les
 * prérequis non satisfaits sont retournés dans `missingRequirements` pour que
 * l'interface affiche la boîte de dialogue « Archivage impossible ».
 */
export async function archiveClassAction(classId: string): Promise<ClassMutationResult> {
  await assertCanMutate();

  try {
    const user = await getCurrentSessionUser();

    if (user.role === "STUDENT" || user.role === "TEACHER") {
      return { ok: false, message: "Seuls les administrateurs peuvent archiver une classe." };
    }

    const klass = await prisma.class.findFirst({
      where: { id: classId, organizationId: user.organizationId },
      select: { id: true, name: true, status: true },
    });

    if (!klass) {
      return { ok: false, message: "Classe introuvable dans votre organisation." };
    }

    // Idempotence : une classe déjà archivée reste consultable en lecture
    // seule, l'action est donc un no-op (et non une erreur).
    if (klass.status === "ARCHIVED") {
      return { ok: true, message: `Classe « ${klass.name} » déjà archivée.` };
    }

    if (klass.status !== "COMPLETED") {
      return { ok: false, message: "Seule une classe clôturée (COMPLETED) peut être archivée." };
    }

    // Garde-fou métier : contrôle des 3 prérequis au moment de l'archivage
    // (présences émargées, cahier de texte rempli, évaluations créées et
    // intégralement notées). Même fonction que celle interrogée par
    // l'interface avant l'ouverture de la confirmation — la règle est donc
    // strictement identique des deux côtés, et un contournement de l'interface
    // ne peut pas aboutir.
    const readiness = await getClassClosureReadiness(classId);

    if (!readiness.ok) {
      return { ok: false, message: readiness.message };
    }

    if (!readiness.canClose) {
      return {
        ok: false,
        message: buildArchiveBlockedMessage(readiness.missingRequirements),
        missingRequirements: readiness.missingRequirements,
      };
    }

    await prisma.class.update({ where: { id: klass.id }, data: { status: "ARCHIVED" } });

    await logAuditEvent({
      action: AUDIT_ACTIONS.CLASS_ARCHIVED,
      entity: AUDIT_ENTITIES.CLASS,
      entityId: klass.id,
      details: {
        className: klass.name,
        previousStatus: klass.status,
        newStatus: "ARCHIVED",
      },
    });

    revalidatePath("/dashboard/classes");
    revalidatePath(`/dashboard/classes/${klass.id}`);
    revalidatePath("/dashboard/students");
    // Une classe archivée sort des sélecteurs opérationnels (émargement,
    // cahier de texte) et de la saisie de notes : ces écrans sont rafraîchis.
    revalidatePath("/dashboard/attendance");
    revalidatePath("/dashboard/evaluations");

    return {
      ok: true,
      message: `Classe « ${klass.name} » archivée : elle reste consultable en lecture seule dans l'onglet « Archives ».`,
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error("[archiveClassAction] Échec :", error);
    return { ok: false, message: "Une erreur est survenue lors de l'archivage de la classe." };
  }
}

// ----------------------------------------------------------------------------
// Server Actions — Réouverture / Désarchivage (ADMIN / SUPER_ADMIN)
// ----------------------------------------------------------------------------

/**
 * Implémentation commune des actions inverses du cycle de vie (désarchivage
 * d'une classe ARCHIVED, annulation de clôture d'une classe COMPLETED).
 * Réservée aux administrateurs (ADMIN / SUPER_ADMIN).
 *
 * `allowCompleted` distingue les deux entrées :
 * - `false` (désarchivage) : seules les classes ARCHIVED sont concernées ;
 * - `true` (réouverture) : ARCHIVED **et** COMPLETED sont acceptées.
 *
 * Le statut de retour est décidé par le domaine (`resolveRestoredStatus`) :
 * ARCHIVED → ACTIVE, COMPLETED → IN_PROGRESS.
 *
 * COHÉRENCE DE L'EFFECTIF — le point critique de cette fonction. Lors de la
 * clôture (`closeClassAction`), chaque `ClassEnrollment` ACTIVE bascule vers un
 * statut de fin de session (PASSED / PROMOTED_MANUALLY / FAILED / DROPPED) et
 * sa décision y est figée. Réactiver la classe SANS réactiver ses inscriptions
 * laisserait donc l'organisation avec une classe « en activité » mais **zéro
 * élève actif** : les écrans filtrés sur `status: "ACTIVE"` (fiche de classe,
 * feuille d'émargement, récapitulatif de clôture, bulletins) afficheraient
 * « Aucun étudiant actif n'est inscrit dans cette classe », et le garde-fou de
 * clôture compterait 0 inscrit face aux notes existantes.
 *
 * Les deux écritures sont donc regroupées en UNE transaction : le retour à
 * l'activité de la classe et la réactivation de ses inscriptions ne peuvent pas
 * diverger (pas de classe ACTIVE à l'effectif nul), et un échec annule les deux.
 */
async function restoreClassToActivity(
  classId: string,
  options: { allowCompleted: boolean; logPrefix: string }
): Promise<ClassMutationResult> {
  await assertCanMutate();

  try {
    const user = await getCurrentSessionUser();

    // Garde de rôle : réouverture / désarchivage = acte administratif.
    if (!canManageClassLifecycle(user.role)) {
      return {
        ok: false,
        message: "Seuls les administrateurs peuvent rouvrir une classe.",
      };
    }

    const klass = await prisma.class.findFirst({
      where: { id: classId, organizationId: user.organizationId },
      select: { id: true, name: true, status: true },
    });

    if (!klass) {
      return { ok: false, message: "Classe introuvable dans votre organisation." };
    }

    // Pas d'opération à effectuer si la classe est déjà en activité.
    if (klass.status === "ACTIVE" || klass.status === "IN_PROGRESS") {
      return { ok: true, message: `Classe « ${klass.name} » déjà active.` };
    }

    // Statuts acceptables pour l'action inverse.
    const restorable =
      canUnarchiveClass(klass.status) ||
      (options.allowCompleted && klass.status === "COMPLETED");

    if (!restorable) {
      return {
        ok: false,
        message:
          "Cette classe ne peut pas être désarchivée : elle n'est pas archivée. Utilisez « Rouvrir la classe » pour annuler une clôture.",
      };
    }

    const restoredStatus: ClassStatus = resolveRestoredStatus(klass.status);

    // Transaction : statut de la classe + réactivation de l'effectif.
    // `finalDecisionNote` est vidé : la décision de fin de session qu'il portait
    // est annulée par la réouverture, la conserver induirait en erreur.
    const restoredEnrollments = await prisma.$transaction(async (tx) => {
      await tx.class.update({
        where: { id: klass.id },
        data: { status: restoredStatus },
      });

      return tx.classEnrollment.updateMany({
        where: {
          classId: klass.id,
          organizationId: user.organizationId,
          status: { not: "ACTIVE" },
        },
        data: { status: "ACTIVE", finalDecisionNote: null },
      });
    });

    await logAuditEvent({
      action:
        klass.status === "ARCHIVED"
          ? AUDIT_ACTIONS.CLASS_UNARCHIVED
          : AUDIT_ACTIONS.CLASS_REOPENED,
      entity: AUDIT_ENTITIES.CLASS,
      entityId: klass.id,
      details: {
        className: klass.name,
        previousStatus: klass.status,
        reopenedStatus: restoredStatus,
        reactivatedEnrollments: restoredEnrollments.count,
      },
    });

    revalidatePath("/dashboard/classes");
    revalidatePath(`/dashboard/classes/${klass.id}`);
    revalidatePath("/dashboard/students");
    // La classe redevient exploitable : les écrans d'émargement, de cahier de
    // texte et d'évaluations doivent ré-afficher leurs sélecteurs.
    revalidatePath("/dashboard/attendance");
    revalidatePath("/dashboard/attendance/sheet");
    revalidatePath("/dashboard/evaluations");

    return {
      ok: true,
      message:
        klass.status === "ARCHIVED"
          ? `Classe « ${klass.name} » désarchivée : elle réintègre l'onglet « Classes Actives » et accepte à nouveau l'inscription d'élèves, les présences, le cahier de texte et les évaluations.`
          : `Classe « ${klass.name} » réouverte : l'inscription et la saisie de notes sont à nouveau possibles.`,
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error(`[${options.logPrefix}] Échec :`, error);
    return {
      ok: false,
      message: "Une erreur est survenue lors de la réouverture de la classe.",
    };
  }
}

/**
 * DÉSARCHIVE / RÉACTIVATE une classe archivée (ARCHIVED → ACTIVE).
 *
 * Action inverse de `archiveClassAction`, réservée aux rôles administratifs
 * (ADMIN / SUPER_ADMIN) : le bouton « Désarchiver la classe » n'est rendu que
 * pour ces rôles, sur les classes de l'onglet « Archives ».
 *
 * Sémantique de statut : ARCHIVED → ACTIVE. Toute autre valeur est refusée
 * (une classe seulement clôturée se rouvre via `reopenClassAction`).
 *
 * Une fois désarchivée, la classe redevient pleinement exploitable : elle
 * réapparaît dans les sélecteurs opérationnels et accepte de nouveau
 * l'inscription d'élèves, la saisie ou la correction des présences, des
 * cahiers de texte et des évaluations.
 */
export async function unarchiveClassAction(
  classId: string
): Promise<ClassMutationResult> {
  return restoreClassToActivity(classId, {
    allowCompleted: false,
    logPrefix: "unarchiveClassAction",
  });
}

/**
 * Réouvre une classe clôturée ou archivée (COMPLETED / ARCHIVED → en cours).
 * Réservé aux administrateurs. Une fois réouverte, la classe accepte à nouveau
 * l'inscription de nouveaux élèves et la saisie de notes / bulletins pour des
 * étudiants tardifs.
 *
 * Sémantique de statut :
 * - ARCHIVED → ACTIVE (désarchivage — voir `unarchiveClassAction`) ;
 * - COMPLETED → IN_PROGRESS (annulation de clôture — retour en activité) ;
 * - toute autre valeur est refusée (la classe est déjà en activité ou dans un
 *   état qu'on ne peut pas repasser en activité sans passer par la clôture).
 */
export async function reopenClassAction(
  classId: string
): Promise<ClassMutationResult> {
  return restoreClassToActivity(classId, {
    allowCompleted: true,
    logPrefix: "reopenClassAction",
  });
}

"use server";

import type { AttendanceStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import {
  getCurrentOrganizationId,
  getCurrentSessionUser,
  isNextRedirectError,
} from "@/lib/session";
import { assertCanMutate } from "@/lib/license-check";

// --------------------------------------
// Types publics (contrat avec les composants clients)
// --------------------------------------

/** Cours visible par l'utilisateur connecté (enseignant : ses cours uniquement). */
export type TeacherCourseDTO = {
  id: string;
  title: string;
  code: string;
  description: string | null;
  durationWeeks: number;
  enrollmentCount: number;
};

/**
 * Classe / cohorte émargeable par l'utilisateur connecté
 * (enseignant : les classes qui lui sont assignées).
 */
export type TeacherClassDTO = {
  id: string;
  name: string;
  /** Créneau horaire de la classe (ex : « 08h-11h »). */
  schedule: string;
  courseId: string;
  courseTitle: string;
  courseCode: string;
  studentCount: number;
};

/** Étudiant inscrit à un cours (liste d'émargement). */
export type EnrolledStudentDTO = {
  studentId: string;
  studentCode: string;
  firstName: string;
  lastName: string;
  progress: number;
};

/** Présence déjà enregistrée pour un étudiant à une date donnée. */
export type AttendanceRecordDTO = {
  studentId: string;
  status: AttendanceStatus;
  notes: string | null;
};

/** Entrée du cahier de texte (CourseLog). */
export type CourseLogDTO = {
  id: string;
  date: Date;
  chapterTitle: string;
  content: string;
  homework: string | null;
  notes: string | null;
  teacherName: string;
};

/** Résultat des mutations rapides côté client. */
export type AttendanceMutationResult =
  | { ok: true; savedCount: number }
  | { ok: false; message: string };

export type CourseLogFormField =
  | "courseId"
  | "date"
  | "chapterTitle"
  | "content"
  | "homework"
  | "notes";

export type CourseLogFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Partial<Record<CourseLogFormField, string>>;
};

// --------------------------------------
// Constantes & helpers internes
// --------------------------------------

const ATTENDANCE_STATUSES: readonly AttendanceStatus[] = [
  "PRESENT",
  "ABSENT",
  "LATE",
  "EXCUSED",
];

/**
 * Vérifie que l'utilisateur connecté peut accéder au cours demandé :
 * - TEACHER : uniquement les cours qui lui sont assignés ;
 * - ADMIN / STAFF / SUPER_ADMIN : tous les cours de l'organisation ;
 * - STUDENT : accès systématiquement refusé (aucun compte étudiant prévu).
 *
 * Retourne l'utilisateur de session si l'accès est accordé.
 */
async function assertCourseAccess(courseId: string) {
  const user = await getCurrentSessionUser();

  if (user.role === "STUDENT") {
    throw new Error("Accès refusé : les étudiants n'ont pas accès au tableau de bord.");
  }

  const where =
    user.role === "TEACHER"
      ? { id: courseId, organizationId: user.organizationId, teacherId: user.id }
      : { id: courseId, organizationId: user.organizationId };

  const course = await prisma.course.findFirst({
    where,
    select: { id: true },
  });

  if (!course) {
    throw new Error("Cours introuvable ou non autorisé.");
  }

  return user;
}

/**
 * Vérifie que l'utilisateur connecté peut accéder à la classe demandée :
 * - TEACHER : uniquement les classes qui lui sont assignées ;
 * - ADMIN / STAFF / SUPER_ADMIN : toutes les classes de l'organisation ;
 * - STUDENT : accès systématiquement refusé.
 *
 * Retourne l'utilisateur de session et l'identifiant du cours porteur
 * (nécessaire pour écrire les présences, rattachées au cours).
 */
async function assertClassAccess(classId: string) {
  const user = await getCurrentSessionUser();

  if (user.role === "STUDENT") {
    throw new Error("Accès refusé : les étudiants n'ont pas accès au tableau de bord.");
  }

  const where =
    user.role === "TEACHER"
      ? { id: classId, organizationId: user.organizationId, teacherId: user.id }
      : { id: classId, organizationId: user.organizationId };

  const klass = await prisma.class.findFirst({
    where,
    select: { id: true, courseId: true },
  });

  if (!klass) {
    throw new Error("Classe introuvable ou non autorisée.");
  }

  return { user, courseId: klass.courseId };
}

/**
 * Normalise une date saisie (« YYYY-MM-DD ») en minuit UTC afin que la
 * contrainte unique [courseId, studentId, date] identifie bien une journée
 * de cours, indépendamment de l'heure.
 */
function parseAttendanceDay(raw: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return null;
  }

  const date = new Date(`${raw}T00:00:00.000Z`);

  return Number.isNaN(date.getTime()) ? null : date;
}

// --------------------------------------
// Server Actions — Présences
// --------------------------------------

/**
 * Liste des cours accessibles à l'utilisateur connecté :
 * - TEACHER : uniquement les cours qui lui sont assignés ;
 * - autres rôles staff : tous les cours de l'organisation.
 */
export async function getMyCourses(): Promise<TeacherCourseDTO[]> {
  const user = await getCurrentSessionUser();

  if (user.role === "STUDENT") {
    throw new Error("Accès refusé : les étudiants n'ont pas accès au tableau de bord.");
  }

  try {
    const courses = await prisma.course.findMany({
      where:
        user.role === "TEACHER"
          ? { organizationId: user.organizationId, teacherId: user.id }
          : { organizationId: user.organizationId },
      orderBy: [{ title: "asc" }],
      select: {
        id: true,
        title: true,
        code: true,
        description: true,
        durationWeeks: true,
        _count: { select: { enrollments: true } },
      },
    });

    return courses.map((course) => ({
      id: course.id,
      title: course.title,
      code: course.code,
      description: course.description,
      durationWeeks: course.durationWeeks,
      enrollmentCount: course._count.enrollments,
    }));
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[getMyCourses] Échec de lecture :", error);

    // Dégradation gracieuse : liste vide plutôt que crash serveur.
    return [];
  }
}

/**
 * Liste des classes / cohortes accessibles à l'utilisateur connecté :
 * - TEACHER : uniquement les classes qui lui sont assignées ;
 * - autres rôles staff : toutes les classes de l'organisation.
 */
export async function getMyClasses(): Promise<TeacherClassDTO[]> {
  const user = await getCurrentSessionUser();

  if (user.role === "STUDENT") {
    throw new Error("Accès refusé : les étudiants n'ont pas accès au tableau de bord.");
  }

  try {
    const classes = await prisma.class.findMany({
      where:
        user.role === "TEACHER"
          ? { organizationId: user.organizationId, teacherId: user.id }
          : { organizationId: user.organizationId },
      orderBy: [{ course: { title: "asc" } }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        schedule: true,
        courseId: true,
        course: {
          select: { title: true, code: true },
        },
        _count: { select: { enrollments: true } },
      },
    });

    return classes.map((klass) => ({
      id: klass.id,
      name: klass.name,
      schedule: klass.schedule,
      courseId: klass.courseId,
      courseTitle: klass.course.title,
      courseCode: klass.course.code,
      studentCount: klass._count.enrollments,
    }));
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[getMyClasses] Échec de lecture :", error);

    // Dégradation gracieuse : liste vide plutôt que crash serveur.
    return [];
  }
}

/**
 * Récupère la liste d'émargement d'une classe / cohorte : les étudiants
 * dont c'est la classe active (`currentClassId`), triés alphabétiquement.
 */
export async function getClassRoster(
  classId: string
): Promise<EnrolledStudentDTO[]> {
  const { courseId } = await assertClassAccess(classId);

  try {
    const students = await prisma.student.findMany({
      where: { currentClassId: classId },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: {
        id: true,
        studentCode: true,
        firstName: true,
        lastName: true,
        enrollments: {
          where: { courseId },
          select: { progress: true },
          take: 1,
        },
      },
    });

    return students.map((student) => ({
      studentId: student.id,
      studentCode: student.studentCode,
      firstName: student.firstName,
      lastName: student.lastName,
      progress: student.enrollments[0]?.progress ?? 0,
    }));
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[getClassRoster] Échec de lecture :", error);

    throw new Error(
      "Impossible de charger la liste des inscrits pour le moment."
    );
  }
}

/**
 * Récupère les présences déjà enregistrées pour une classe à une date donnée
 * (journée normalisée à minuit UTC), limitées aux étudiants membres actuels
 * de la cohorte.
 */
export async function getClassAttendanceForDate(
  classId: string,
  day: string
): Promise<AttendanceRecordDTO[]> {
  const { courseId } = await assertClassAccess(classId);

  const date = parseAttendanceDay(day);
  if (!date) {
    throw new Error("Format de date invalide (attendu : AAAA-MM-JJ).");
  }

  const nextDay = new Date(date.getTime() + 24 * 60 * 60 * 1000);

  try {
    const records = await prisma.attendance.findMany({
      where: {
        courseId,
        date: { gte: date, lt: nextDay },
        student: { currentClassId: classId },
      },
      select: {
        studentId: true,
        status: true,
        notes: true,
      },
    });

    return records.map((record) => ({
      studentId: record.studentId,
      status: record.status,
      notes: record.notes,
    }));
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error(
      "[getClassAttendanceForDate] Échec de lecture :",
      error
    );

    throw new Error(
      "Impossible de charger les présences enregistrées pour le moment."
    );
  }
}

/**
 * Récupère la liste d'émargement d'un cours : les étudiants inscrits
 * (via Enrollment), triés alphabétiquement.
 */
export async function getEnrolledStudents(
  courseId: string
): Promise<EnrolledStudentDTO[]> {
  await assertCourseAccess(courseId);

  try {
    const enrollments = await prisma.enrollment.findMany({
      where: { courseId },
      orderBy: [
        { student: { firstName: "asc" } },
        { student: { lastName: "asc" } },
      ],
      select: {
        progress: true,
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

    return enrollments.map((enrollment) => ({
      studentId: enrollment.student.id,
      studentCode: enrollment.student.studentCode,
      firstName: enrollment.student.firstName,
      lastName: enrollment.student.lastName,
      progress: enrollment.progress,
    }));
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[getEnrolledStudents] Échec de lecture :", error);

    throw new Error(
      "Impossible de charger la liste des inscrits pour le moment."
    );
  }
}

/**
 * Récupère les présences déjà enregistrées pour un cours à une date donnée
 * (journée normalisée à minuit UTC).
 */
export async function getAttendanceForDate(
  courseId: string,
  day: string
): Promise<AttendanceRecordDTO[]> {
  await assertCourseAccess(courseId);

  const date = parseAttendanceDay(day);
  if (!date) {
    throw new Error("Format de date invalide (attendu : AAAA-MM-JJ).");
  }

  const nextDay = new Date(date.getTime() + 24 * 60 * 60 * 1000);

  try {
    const records = await prisma.attendance.findMany({
      where: {
        courseId,
        date: { gte: date, lt: nextDay },
      },
      select: {
        studentId: true,
        status: true,
        notes: true,
      },
    });

    return records.map((record) => ({
      studentId: record.studentId,
      status: record.status,
      notes: record.notes,
    }));
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[getAttendanceForDate] Échec de lecture :", error);

    throw new Error(
      "Impossible de charger les présences enregistrées pour le moment."
    );
  }
}

/**
 * Enregistre la feuille de présence d'une classe / cohorte pour une date
 * donnée.
 *
 * Le formulaire client soumet, pour chaque étudiant membre de la cohorte :
 * - `status_<studentId>` : PRESENT | ABSENT | EXCUSED (LATE accepté) ;
 * - `notes_<studentId>`  : remarque facultative.
 *
 * Chaque ligne est écrite en `upsert` sur la clé unique
 * [courseId, studentId, date] (les présences restent rattachées au cours
 * porteur, avec traceabilité de la classe via `classId`) : ré-enregistrer
 * une journée met simplement à jour les statuts existants.
 */
export async function saveAttendanceAction(
  formData: FormData
): Promise<AttendanceMutationResult> {
  await assertCanMutate();
  try {
    const classId = String(formData.get("classId") ?? "").trim();
    const rawDay = String(formData.get("date") ?? "").trim();

    if (!classId) {
      return { ok: false, message: "Identifiant de la classe manquant." };
    }

    const date = parseAttendanceDay(rawDay);
    if (!date) {
      return {
        ok: false,
        message: "Format de date invalide (attendu : AAAA-MM-JJ).",
      };
    }

    const { user, courseId } = await assertClassAccess(classId);

    // Extraction des statuts soumis depuis le FormData.
    const entries: Array<{
      studentId: string;
      status: AttendanceStatus;
      notes: string | null;
    }> = [];

    for (const [key, value] of formData.entries()) {
      if (!key.startsWith("status_")) continue;

      const studentId = key.slice("status_".length);
      const status = String(value).trim() as AttendanceStatus;

      if (!ATTENDANCE_STATUSES.includes(status)) {
        return {
          ok: false,
          message: `Statut de présence invalide pour l'étudiant ${studentId}.`,
        };
      }

      const notes = String(formData.get(`notes_${studentId}`) ?? "").trim();

      entries.push({
        studentId,
        status,
        notes: notes || null,
      });
    }

    if (entries.length === 0) {
      return {
        ok: false,
        message: "Aucune présence à enregistrer.",
      };
    }

    // Vérifie que tous les étudiants ciblés sont bien membres actuels de la
    // cohorte (protection contre la falsification des identifiants côté client).
    const memberIds = new Set(
      (
        await prisma.student.findMany({
          where: { currentClassId: classId },
          select: { id: true },
        })
      ).map((student) => student.id)
    );

    for (const entry of entries) {
      if (!memberIds.has(entry.studentId)) {
        return {
          ok: false,
          message:
            "Un des étudiants sélectionnés n'appartient pas à cette classe.",
        };
      }
    }

    await prisma.$transaction(
      entries.map((entry) =>
        prisma.attendance.upsert({
          where: {
            courseId_studentId_date: {
              courseId,
              studentId: entry.studentId,
              date,
            },
          },
          create: {
            organizationId: user.organizationId,
            courseId,
            classId,
            studentId: entry.studentId,
            status: entry.status,
            date,
            notes: entry.notes,
          },
          update: {
            status: entry.status,
            notes: entry.notes,
          },
        })
      )
    );

    revalidatePath("/dashboard/attendance");
    revalidatePath(`/dashboard/courses/${courseId}`);

    return { ok: true, savedCount: entries.length };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[saveAttendanceAction] Échec d'enregistrement :", error);

    return {
      ok: false,
      message:
        error instanceof Error &&
        (error.message.startsWith("Accès refusé") ||
          error.message === "Classe introuvable ou non autorisée.")
          ? error.message
          : "Une erreur est survenue lors de l'enregistrement des présences.",
    };
  }
}

// --------------------------------------
// Server Action — Fiche détaillée du cours
// --------------------------------------

/** Détail complet d'un cours : informations, inscrits et cahier de texte. */
export type CourseDetailDTO = {
  course: TeacherCourseDTO & { teacherName: string | null };
  students: EnrolledStudentDTO[];
  logs: CourseLogDTO[];
};

/**
 * Récupère la fiche détaillée d'un cours (informations, liste des étudiants
 * inscrits et entrées du cahier de texte) en une seule action.
 * Respecte l'isolation par rôle : un enseignant ne peut consulter que ses cours.
 */
export async function getCourseDetail(
  courseId: string
): Promise<CourseDetailDTO> {
  await assertCourseAccess(courseId);

  try {
    // `findUnique` sécurisé : l'accès est déjà validé par `assertCourseAccess` ;
    // une absence ici signale une suppression concurrente du cours.
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        title: true,
        code: true,
        description: true,
        durationWeeks: true,
        teacher: {
          select: { firstName: true, lastName: true },
        },
        _count: { select: { enrollments: true } },
      },
    });

    if (!course) {
      throw new Error("Cours introuvable ou non autorisé.");
    }

    const [enrollments, logs] = await Promise.all([
      prisma.enrollment.findMany({
        where: { courseId },
        orderBy: [
          { student: { firstName: "asc" } },
          { student: { lastName: "asc" } },
        ],
        select: {
          progress: true,
          student: {
            select: {
              id: true,
              studentCode: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      prisma.courseLog.findMany({
        where: { courseId },
        orderBy: { date: "desc" },
        select: {
          id: true,
          date: true,
          chapterTitle: true,
          content: true,
          homework: true,
          notes: true,
          teacher: {
            select: { firstName: true, lastName: true },
          },
        },
      }),
    ]);

    return {
      course: {
        id: course.id,
        title: course.title,
        code: course.code,
        description: course.description,
        durationWeeks: course.durationWeeks,
        enrollmentCount: course._count.enrollments,
        teacherName: course.teacher
          ? `${course.teacher.firstName} ${course.teacher.lastName}`
          : null,
      },
      students: enrollments.map((enrollment) => ({
        studentId: enrollment.student.id,
        studentCode: enrollment.student.studentCode,
        firstName: enrollment.student.firstName,
        lastName: enrollment.student.lastName,
        progress: enrollment.progress,
      })),
      logs: logs.map((log) => ({
        id: log.id,
        date: log.date,
        chapterTitle: log.chapterTitle,
        content: log.content,
        homework: log.homework,
        notes: log.notes,
        teacherName: `${log.teacher.firstName} ${log.teacher.lastName}`,
      })),
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[getCourseDetail] Échec de lecture :", error);

    throw new Error(
      "Impossible de charger la fiche du cours pour le moment."
    );
  }
}

// --------------------------------------
// Server Actions — Cahier de texte
// --------------------------------------

/**
 * Récupère les entrées du cahier de texte d'un cours, de la plus récente
 * à la plus ancienne. Un enseignant ne voit que les entrées de ses cours.
 */
export async function getCourseLogs(courseId: string): Promise<CourseLogDTO[]> {
  await assertCourseAccess(courseId);

  try {
    const logs = await prisma.courseLog.findMany({
      where: { courseId },
      orderBy: { date: "desc" },
      select: {
        id: true,
        date: true,
        chapterTitle: true,
        content: true,
        homework: true,
        notes: true,
        teacher: {
          select: { firstName: true, lastName: true },
        },
      },
    });

    return logs.map((log) => ({
      id: log.id,
      date: log.date,
      chapterTitle: log.chapterTitle,
      content: log.content,
      homework: log.homework,
      notes: log.notes,
      teacherName: `${log.teacher.firstName} ${log.teacher.lastName}`,
    }));
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[getCourseLogs] Échec de lecture :", error);

    throw new Error(
      "Impossible de charger le cahier de texte pour le moment."
    );
  }
}

/**
 * Ajoute une entrée au cahier de texte d'un cours.
 * Conçu pour être utilisé avec `useActionState` : reçoit l'état précédent
 * et un `FormData`, retourne un état sérialisable.
 *
 * L'auteur de l'entrée est toujours l'enseignant connecté (`teacherId`),
 * même lorsqu'un administrateur saisit l'entrée pour son compte.
 */
export async function createCourseLogAction(
  _prevState: CourseLogFormState,
  formData: FormData
): Promise<CourseLogFormState> {
  await assertCanMutate();
  const courseId = String(formData.get("courseId") ?? "").trim();
  const rawDay = String(formData.get("date") ?? "").trim();
  const chapterTitle = String(formData.get("chapterTitle") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const homework = String(formData.get("homework") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  const fieldErrors: Partial<Record<CourseLogFormField, string>> = {};

  if (!courseId) {
    fieldErrors.courseId = "Le cours est requis.";
  }

  let date: Date | null = null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDay)) {
    fieldErrors.date = "La date du cours est requise.";
  } else {
    date = parseAttendanceDay(rawDay);
    if (!date) {
      fieldErrors.date = "La date saisie est invalide.";
    }
  }

  if (!chapterTitle) {
    fieldErrors.chapterTitle = "Le titre du chapitre est requis.";
  } else if (chapterTitle.length > 200) {
    fieldErrors.chapterTitle =
      "Le titre du chapitre ne doit pas dépasser 200 caractères.";
  }

  if (!content) {
    fieldErrors.content = "Le contenu du cours est requis.";
  } else if (content.length > 5000) {
    fieldErrors.content =
      "Le contenu ne doit pas dépasser 5000 caractères.";
  }

  if (homework.length > 2000) {
    fieldErrors.homework =
      "Les devoirs ne doivent pas dépasser 2000 caractères.";
  }

  if (notes.length > 2000) {
    fieldErrors.notes =
      "Les remarques ne doivent pas dépasser 2000 caractères.";
  }

  if (Object.keys(fieldErrors).length > 0 || !date) {
    return {
      status: "error",
      message: "Veuillez corriger les champs indiqués.",
      fieldErrors,
    };
  }

  try {
    const user = await assertCourseAccess(courseId);

    await prisma.courseLog.create({
      data: {
        organizationId: user.organizationId,
        courseId,
        teacherId: user.id,
        date,
        chapterTitle,
        content,
        homework: homework || null,
        notes: notes || null,
      },
    });

    revalidatePath(`/dashboard/courses/${courseId}`);
    revalidatePath("/dashboard/attendance");

    return {
      status: "success",
      message: "Entrée ajoutée au cahier de texte.",
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[createCourseLogAction] Échec de création :", error);

    return {
      status: "error",
      message:
        "Une erreur est survenue lors de l'ajout de l'entrée au cahier de texte.",
    };
  }
}

// --------------------------------------
// Lecture : historique d'assiduité d'un étudiant (fiche étudiant)
// --------------------------------------

/** Entrée d'assiduité d'un étudiant, telle qu'affichée dans sa fiche. */
export type StudentAttendanceEntryDTO = {
  id: string;
  date: Date;
  status: AttendanceStatus;
  notes: string | null;
  /** Intitulé du cours émargé. */
  courseTitle: string;
  /** Classe / cohorte concernée (null si l'émargement n'est pas rattaché). */
  className: string | null;
};

/**
 * Récupère l'historique complet des émargements d'un étudiant (toutes
 * classes et tous cours confondus, isolation multi-tenant), trié du plus
 * récent au plus ancien.
 */
export async function getStudentAttendanceHistory(
  studentId: string
): Promise<StudentAttendanceEntryDTO[]> {
  const organizationId = await getCurrentOrganizationId();

  try {
    // Isolation multi-tenant : l'étudiant doit appartenir à l'organisation active.
    const student = await prisma.student.findFirst({
      where: { id: studentId, organizationId },
      select: { id: true },
    });

    if (!student) {
      throw new Error("Étudiant introuvable dans votre organisation.");
    }

    const records = await prisma.attendance.findMany({
      where: { studentId, organizationId },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        date: true,
        status: true,
        notes: true,
        course: { select: { title: true } },
        class: { select: { name: true } },
      },
    });

    return records.map((record) => ({
      id: record.id,
      date: record.date,
      status: record.status,
      notes: record.notes,
      courseTitle: record.course.title,
      className: record.class?.name ?? null,
    }));
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error(
      "[getStudentAttendanceHistory] Échec de lecture :",
      error
    );

    throw new Error(
      "Impossible de charger l'assiduité de l'étudiant pour le moment."
    );
  }
}

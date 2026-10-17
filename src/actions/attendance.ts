"use server";

import type { AttendanceStatus, ClassStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import {
  getCurrentOrganizationId,
  getCurrentSessionUser,
  isNextRedirectError,
} from "@/lib/session";
import { assertCanMutate } from "@/lib/license-check";
import { SELECTABLE_CLASS_STATUSES } from "@/lib/class-status";
import { buildEnrollmentIdMapForClass } from "@/lib/enrollment-scope";

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

/** Créneau hebdomadaire d'une classe (ClassSchedule). */
export type ClassScheduleDTO = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room: string | null;
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
  /** Créneaux hebdomadaires détaillés de la classe. */
  schedules: ClassScheduleDTO[];
  /**
   * Statut pédagogique de la classe. `ARCHIVED` = classe archivée : elle ne
   * doit plus apparaître dans les sélecteurs opérationnels (évaluations) et
   * ses évaluations existantes sont en lecture seule.
   */
  status: ClassStatus;
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
 * - TEACHER : uniquement les cours pour lesquels il a une classe assignée ;
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

  // Vérifie que le cours appartient à l'organisation
  const course = await prisma.course.findFirst({
    where: { id: courseId, organizationId: user.organizationId },
    select: {
      id: true,
      teacher: { select: { firstName: true, lastName: true } },
    },
  });

  if (!course) {
    throw new Error("Cours introuvable ou non autorisé.");
  }

  // Pour un enseignant, vérifie qu'il a une classe pour ce cours
  if (user.role === "TEACHER") {
    const hasClass = await prisma.class.findFirst({
      where: { courseId, teacherId: user.id },
      select: { id: true },
    });

    if (!hasClass) {
      throw new Error("Cours introuvable ou non autorisé.");
    }
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

/** Construit un horodatage complet (date + heure) en UTC à partir d'une
 * date ISO (« YYYY-MM-DD ») et d'une heure (« HH:MM »).
 */
function buildSessionDateTime(dateIso: string, timeIso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso) || !/^\d{2}:\d{2}$/.test(timeIso)) {
    return null;
  }
  const date = new Date(`${dateIso}T${timeIso}:00.000Z`);
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
/**
 * Liste des cours accessibles à l'utilisateur connecté :
 * - TEACHER : les cours pour lesquels il a au moins une classe assignée ;
 * - autres rôles staff : tous les cours de l'organisation.
 */
export async function getMyCourses(): Promise<TeacherCourseDTO[]> {
  const user = await getCurrentSessionUser();

  if (user.role === "STUDENT") {
    throw new Error("Accès refusé : les étudiants n'ont pas accès au tableau de bord.");
  }

  try {
    // Pour un enseignant, récupérer les cours pour lesquels il a des classes
    const courseIds =
      user.role === "TEACHER"
        ? await prisma.class.findMany({
            where: { organizationId: user.organizationId, teacherId: user.id },
            select: { courseId: true },
          })
        : null;

    const teacherCourseIds = courseIds?.map((c) => c.courseId) ?? [];

    const courses = await prisma.course.findMany({
      where:
        user.role === "TEACHER"
          ? { organizationId: user.organizationId, id: { in: teacherCourseIds } }
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
 * Liste des classes / cohortes accessibles à l'utilisateur connecté ET
 * encore exploitables pour les opérations dePresence :
 * - TEACHER : uniquement les classes qui lui sont assignées ;
 * - autres rôles staff : toutes les classes de l'organisation.
 *
 * Filtre STRICT : seules les classes « En cours » (IN_PROGRESS / alias
 * historique ACTIVE) et « Planifiées » (PLANIFIED) sont retournées. Les
 * classes clôturées (COMPLETED) et archivées (ARCHIVED) sont EXCLUES — elles
 * ne doivent plus apparaître dans le sélecteur de classe du cahier de texte.
 */
export async function getMyClasses(): Promise<TeacherClassDTO[]> {
  const user = await getCurrentSessionUser();

  if (user.role === "STUDENT") {
    throw new Error("Accès refusé : les étudiants n'ont pas accès au tableau de bord.");
  }

  try {
    const classes = await prisma.class.findMany({
      where: {
        ...(user.role === "TEACHER"
          ? { teacherId: user.id }
          : {}),
        organizationId: user.organizationId,
        // Uniquement les classes actives (En cours / Planifiée).
        status: { in: SELECTABLE_CLASS_STATUSES },
      },
      orderBy: [{ course: { title: "asc" } }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        schedule: true,
        status: true,
        courseId: true,
        course: {
          select: { title: true, code: true },
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
      status: klass.status,
      courseId: klass.courseId,
      courseTitle: klass.course.title,
      courseCode: klass.course.code,
      studentCount: klass._count.enrollments,
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
    // Récupère les IDs des séances de cette classe pour cette date.
    const sessions = await prisma.classSession.findMany({
      where: {
        classId,
        sessionDate: { gte: date, lt: nextDay },
      },
      select: { id: true },
    });

    const sessionIds = sessions.map((s) => s.id);

    if (sessionIds.length === 0) {
      return [];
    }

    const records = await prisma.attendance.findMany({
      where: {
        sessionId: { in: sessionIds },
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
    // Récupère les IDs des séances pour ce cours à cette date.
    const sessions = await prisma.classSession.findMany({
      where: {
        class: { courseId },
        sessionDate: { gte: date, lt: nextDay },
      },
      select: { id: true },
    });

    const sessionIds = sessions.map((s) => s.id);

    if (sessionIds.length === 0) {
      return [];
    }

    const records = await prisma.attendance.findMany({
      where: {
        sessionId: { in: sessionIds },
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
    const subjectName = String(formData.get("subjectName") ?? "").trim();
    const chapter = String(formData.get("chapter") ?? "").trim();
    const startHour = String(formData.get("startTime") ?? "").trim();
    const endHour = String(formData.get("endTime") ?? "").trim();

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

    // Chapter est requis pour la séance
    if (!chapter) {
      return {
        ok: false,
        message: "Le chapitre de la séance est requis.",
      };
    }

    const { user } = await assertClassAccess(classId);

    // Extraction des statuts soumis depuis le FormData.
    const entries: Array<{
      studentId: string;
      status: AttendanceStatus;
      notes: string | null;
      arrivalTime?: Date;
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

      // Si le statut est LATE, récupérer l'heure d'arrivée
      const arrivalKey = `arrival_${studentId}`;
      let arrivalTime: Date | undefined;
      if (status === "LATE") {
        const arrivalRaw = String(formData.get(arrivalKey) ?? "").trim();
        if (arrivalRaw) {
          const arrivalDate = buildSessionDateTime(rawDay, arrivalRaw);
          if (arrivalDate) {
            arrivalTime = arrivalDate;
          }
        }
      }

      entries.push({
        studentId,
        status,
        notes: notes || null,
        arrivalTime,
      });
    }

    if (entries.length === 0) {
      return {
        ok: false,
        message: "Aucune présence à enregistrer.",
      };
    }

    // Vérifie que tous les étudiants ciblés sont bien rattachés à la cohorte
    // via une INSCRIPTION (ClassEnrollment) — protection contre la
    // falsification des identifiants côté client. La correspondance sert
    // ensuite au rattachement strict des présences à l'inscription
    // (classe + année académique — séparation stricte Étudiant / Inscription).
    const enrollmentIdByStudent = await buildEnrollmentIdMapForClass(prisma, {
      organizationId: user.organizationId,
      classId,
    });

    for (const entry of entries) {
      if (!enrollmentIdByStudent.has(entry.studentId)) {
        return {
          ok: false,
          message:
            "Un des étudiants sélectionnés n'appartient pas à cette classe.",
        };
      }
    }

    // Créer la ClassSession
    const startTime = buildSessionDateTime(rawDay, startHour);
    const endTime = buildSessionDateTime(rawDay, endHour);

    if (!startTime || !endTime) {
      return {
        ok: false,
        message: "Les heures de début et de fin sont invalides.",
      };
    }

    const session = await prisma.classSession.create({
      data: {
        organizationId: user.organizationId,
        classId,
        subjectName: subjectName || "Cours",
        chapter,
        sessionDate: date,
        startTime,
        endTime,
      },
    });

    await prisma.$transaction(
      entries.map((entry) =>
        prisma.attendance.upsert({
          where: {
            sessionId_studentId: {
              sessionId: session.id,
              studentId: entry.studentId,
            },
          },
          create: {
            organizationId: user.organizationId,
            sessionId: session.id,
            classId,
            studentId: entry.studentId,
            // Rattachement strict à l'inscription (classe + année).
            enrollmentId: enrollmentIdByStudent.get(entry.studentId) ?? null,
            status: entry.status,
            arrivalTime: entry.arrivalTime,
            date,
            notes: entry.notes,
          },
          update: {
            // Rattachement aussi re-synchronisé à chaque ré-saisie (lignes
            // héritées créées avant la séparation stricte).
            enrollmentId: enrollmentIdByStudent.get(entry.studentId) ?? null,
            status: entry.status,
            arrivalTime: entry.arrivalTime,
            notes: entry.notes,
          },
        })
      )
    );

    revalidatePath("/dashboard/attendance");
    revalidatePath(`/dashboard/classes/${classId}`);

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
  course: TeacherCourseDTO;
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
// Server Action — Upsert cahier de texte (CourseLog)
// --------------------------------------

/**
 * Upsert une entrée du cahier de texte d'un cours pour une date donnée.
 * Utilise la contrainte unique [courseId, date] : si une entrée existe déjà
 * pour ce cours à cette date, elle est mise à jour ; sinon elle est créée.
 *
 * L'auteur de l'entrée est toujours l'utilisateur connecté (`teacherId`).
 */
export async function upsertCourseLogAction(
  payload: {
    courseId: string;
    date: string; // ISO « YYYY-MM-DD »
    chapterTitle: string;
    content: string;
    homework: string;
    notes: string;
  }
): Promise<
  { ok: true; logId: string; log: CourseLogDTO } | { ok: false; message: string }
> {
  await assertCanMutate();

  const { courseId, date, chapterTitle, content, homework, notes } = payload;

  if (!courseId) {
    return { ok: false, message: "Le cours est requis." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, message: "Format de date invalide (attendu : AAAA-MM-JJ)." };
  }
  if (!chapterTitle.trim()) {
    return { ok: false, message: "Le titre du chapitre est requis." };
  }
  if (!content.trim()) {
    return { ok: false, message: "Le contenu du cours est requis." };
  }

  try {
    const user = await assertCourseAccess(courseId);

    const logDate = parseAttendanceDay(date);
    if (!logDate) {
      return { ok: false, message: "La date saisie est invalide." };
    }

    const log = await prisma.courseLog.upsert({
      where: {
        courseId_date: { courseId, date: logDate },
      },
      update: {
        chapterTitle: chapterTitle.trim(),
        content: content.trim(),
        homework: homework.trim() || null,
        notes: notes.trim() || null,
      },
      create: {
        organizationId: user.organizationId,
        courseId,
        teacherId: user.id,
        date: logDate,
        chapterTitle: chapterTitle.trim(),
        content: content.trim(),
        homework: homework.trim() || null,
        notes: notes.trim() || null,
      },
      include: {
        teacher: { select: { firstName: true, lastName: true } },
      },
    });

    revalidatePath(`/dashboard/courses/${courseId}`);
    revalidatePath("/dashboard/attendance");

    // Le DTO complet est renvoyé pour une mise à jour optimiste côté client :
    // `revalidatePath` seul ne suffit pas car `CourseDetailView` reçoit `detail`
    // en props (snapshot serveur) — sans `router.refresh()` le composant client
    // conserverait l'ancien historique (« Entrée existante » bloquée).
    return {
      ok: true,
      logId: log.id,
      log: {
        id: log.id,
        date: log.date,
        chapterTitle: log.chapterTitle,
        content: log.content,
        homework: log.homework,
        notes: log.notes,
        teacherName: `${log.teacher.firstName} ${log.teacher.lastName}`,
      },
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[upsertCourseLogAction] Échec de l'upsert :", error);

    return {
      ok: false,
      message:
        "Une erreur est survenue lors de l'enregistrement de l'entrée au cahier de texte.",
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
        session: {
          select: {
            class: {
              select: {
                course: { select: { title: true } },
                name: true,
              },
            },
          },
        },
      },
    });

    return records.map((record) => ({
      id: record.id,
      date: record.date,
      status: record.status,
      notes: record.notes,
      courseTitle: record.session?.class.course.title ?? null,
      className: record.session?.class.name ?? null,
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

// --------------------------------------
// Types pour la séance unifiée (Session + Cahier de texte + Présences)
// --------------------------------------

/** Payload d'entrée pour la sauvegarde unifiée d'une séance. */
export type SaveClassSessionPayload = {
  classId: string;
  date: string; // ISO « YYYY-MM-DD »
  title: string;
  chapter: string;
  summary: string;
  attendances: Array<{
    studentId: string;
    status: AttendanceStatus;
    notes: string | null;
  }>;
};

/** Séance complète avec ses présences (pour affichage / édition). */
export type ClassSessionWithAttendanceDTO = {
  id: string;
  classId: string;
  subjectName: string;
  chapter: string;
  summary: string | null;
  sessionDate: Date;
  startTime: Date;
  endTime: Date;
  status: "PENDING" | "VALIDATED";
  /**
   * Clôture explicite via « Terminer la séance » (optionnel pour
   * compatibilité ascendante si la migration n'est pas encore appliquée).
   */
  isCompleted?: boolean;
  endedAt?: Date | null;
  attendances: Array<{
    studentId: string;
    status: AttendanceStatus;
    notes: string | null;
    arrivalTime: Date | null;
  }>;
};

/** Entrée d'historique pour le tableau récapitulatif. */
export type ClassSessionHistoryEntryDTO = {
  id: string;
  sessionDate: Date;
  subjectName: string;
  chapter: string;
  summary: string | null;
  startTime: string | null;
  endTime: string | null;
  teacherName: string;
  presentCount: number;
  totalCount: number;
  status: "PENDING" | "VALIDATED";
};

/** Ligne de presence pour l export global d une classe. */
export type FullClassExportAttendanceRow = {
  studentId: string;
  studentCode: string;
  firstName: string;
  lastName: string;
  status: AttendanceStatus;
  notes: string | null;
  arrivalTime: string | null;
};

/** Seance complete pour l export global d une classe. */
export type FullClassExportSessionDTO = {
  id: string;
  sessionDate: Date;
  subjectName: string;
  chapter: string;
  summary: string | null;
  startTime: string | null;
  endTime: string | null;
  teacherName: string;
  status: "PENDING" | "VALIDATED";
  isCompleted: boolean;
  attendances: FullClassExportAttendanceRow[];
};

/** Export global d une classe : roster + toutes les seances. */
export type FullClassExportDTO = {
  classId: string;
  className: string;
  schedule: string;
  courseTitle: string;
  courseCode: string;
  roster: EnrolledStudentDTO[];
  sessions: FullClassExportSessionDTO[];
};

// --------------------------------------
// Type unifié — Données complètes de la page de présences
// --------------------------------------

/** Données complètes de la page de présences (roster + séance du jour + historique). */
export type AttendancePageDataDTO = {
  roster: EnrolledStudentDTO[];
  session: ClassSessionWithAttendanceDTO | null;
  history: ClassSessionHistoryEntryDTO[];
  /**
   * Cahier de texte en lecture seule : entrée `CourseLog` existante pour le
   * cours porteur (`courseId`) à la date exacte `selectedDate`.
   * La saisie initiale se fait exclusivement dans la fiche du cours
   * (« Mes cours ») ; cet écran ne fait que l'afficher (champs grisés).
   * `null` si aucun log n'existe (blocs strictement vides + appel à saisir
   * côté fiche cours).
   */
  courseLog: {
    chapterTitle: string;
    content: string;
    homework: string | null;
  } | null;
  /**
   * @deprecated Alias de `courseLog` conservé pour compatibilité.
   */
  courseLogFallback: {
    chapterTitle: string;
    content: string;
    homework: string | null;
  } | null;
};

// --------------------------------------
// Server Action — Export global d'une classe (toutes seances)
// --------------------------------------

/**
 * Exporte l'integralite d'une classe : roster + TOUTES les seances avec
 * leurs emargements. Alimente le menu d'export global de la page
 * Presences & Cahier de texte : feuille de presence, cahier de texte
 * complet et rapport combine (Presences + Cahier de texte).
 */
export async function getFullClassExport(
  classId: string
): Promise<FullClassExportDTO> {
  const user = await getCurrentSessionUser();

  if (user.role === "STUDENT") {
    throw new Error(
      "Acces refuse : les etudiants n'ont pas acces au tableau de bord."
    );
  }

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
      course: { select: { id: true, title: true, code: true } },
      teacher: { select: { firstName: true, lastName: true } },
    },
  });

  if (!klass) {
    throw new Error("Classe introuvable ou non autorisee.");
  }

  const classTeacherName =
    [klass.teacher?.firstName, klass.teacher?.lastName]
      .filter(Boolean)
      .join(" ") || "Enseignant";

  const [students, sessions] = await Promise.all([
    prisma.student.findMany({
      where: { currentClassId: classId },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, studentCode: true, firstName: true, lastName: true },
    }),
    prisma.classSession.findMany({
      where: { classId, organizationId: user.organizationId },
      orderBy: { sessionDate: "asc" },
      select: {
        id: true,
        sessionDate: true,
        subjectName: true,
        chapter: true,
        summary: true,
        startTime: true,
        endTime: true,
        attendances: {
          select: {
            studentId: true,
            status: true,
            notes: true,
            arrivalTime: true,
            student: { select: { studentCode: true, firstName: true, lastName: true } },
          },
          orderBy: { studentId: "asc" },
        },
      },
    }),
  ]);

  const byId = new Map(students.map((st) => [st.id, st]));

  const mapped: FullClassExportSessionDTO[] = [];
  for (const session of sessions) {
    const totalCount = session.attendances.length;
    const completion = await readSessionCompletionFlags(session.id);
    mapped.push({
      id: session.id,
      sessionDate: session.sessionDate,
      subjectName: session.subjectName,
      chapter: session.chapter,
      summary: session.summary,
      startTime: session.startTime ? session.startTime.toISOString().slice(11, 16) : null,
      endTime: session.endTime ? session.endTime.toISOString().slice(11, 16) : null,
      teacherName: classTeacherName,
      status: (totalCount > 0 ? "VALIDATED" : "PENDING") as "VALIDATED" | "PENDING",
      isCompleted: completion.isCompleted,
      attendances: session.attendances.map((a) => {
        const ref = byId.get(a.studentId);
        return {
          studentId: a.studentId,
          studentCode: ref?.studentCode ?? a.student.studentCode,
          firstName: ref?.firstName ?? a.student.firstName,
          lastName: ref?.lastName ?? a.student.lastName,
          status: a.status,
          notes: a.notes,
          arrivalTime: a.arrivalTime ? a.arrivalTime.toISOString().slice(11, 16) : null,
        };
      }),
    });
  }

  return {
    classId: klass.id,
    className: klass.name,
    schedule: klass.schedule,
    courseTitle: klass.course.title,
    courseCode: klass.course.code,
    roster: students.map((st) => ({
      studentId: st.id,
      studentCode: st.studentCode,
      firstName: st.firstName,
      lastName: st.lastName,
      progress: 0,
    })),
    sessions: mapped,
  };
}


// --------------------------------------
// Server Action — Rôle de l'utilisateur connecté
// --------------------------------------

/**
 * Retourne le rôle de l'utilisateur connecté.
 * Utilisé par les composants clients pour adapter l'interface selon les droits.
 */
export async function getCurrentUserRole(): Promise<string> {
  const user = await getCurrentSessionUser();
  return user.role;
}

// --------------------------------------
// Server Action — Chargement unifié de la page de présences
// --------------------------------------

/**
 * Récupère en une seule exécution toutes les données nécessaires à la page
 * de présences : liste d'émargement, séance du jour, historique et cahier
 * de texte (`CourseLog`) du cours porteur à la date exacte.
 *
 * Le cahier de texte est saisi exclusivement dans la fiche du cours
 * (« Mes cours »). Ici `courseLog` est strictement en lecture seule :
 * requête exacte sur `[courseId, selectedDate]`, sans valeur par défaut.
 *
 * Isolation : vérifie que l'enseignant est assigné à la classe.
 */
export async function getAttendancePageData(
  classId: string,
  date: string
): Promise<AttendancePageDataDTO> {
  const user = await getCurrentSessionUser();

  if (user.role === "STUDENT") {
    throw new Error(
      "Accès refusé : les étudiants n'ont pas accès au tableau de bord."
    );
  }

  const where =
    user.role === "TEACHER"
      ? {
          id: classId,
          organizationId: user.organizationId,
          teacherId: user.id,
        }
      : { id: classId, organizationId: user.organizationId };

  const klass = await prisma.class.findFirst({
    where,
    select: {
      id: true,
      courseId: true,
      teacher: { select: { firstName: true, lastName: true } },
    },
  });

  if (!klass) {
    throw new Error("Classe introuvable ou non autorisée.");
  }

  const classTeacherName =
    [klass.teacher?.firstName, klass.teacher?.lastName]
      .filter(Boolean)
      .join(" ") || "Enseignant";

  const sessionDate = parseAttendanceDay(date);
  if (!sessionDate) {
    throw new Error("Date invalide.");
  }

  try {
    const [roster, session, history, courseLogRow] = await Promise.all([
      // 1. Liste d'émargement
      prisma.student.findMany({
        where: { currentClassId: classId },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
        select: {
          id: true,
          studentCode: true,
          firstName: true,
          lastName: true,
          enrollments: {
            where: { courseId: klass.courseId },
            select: { progress: true },
            take: 1,
          },
        },
      }),
      // 2. Séance du jour avec présences
      prisma.classSession.findFirst({
        where: { classId, sessionDate },
        select: {
          id: true,
          classId: true,
          subjectName: true,
          chapter: true,
          summary: true,
          sessionDate: true,
          startTime: true,
          endTime: true,
          attendances: {
            select: {
              studentId: true,
              status: true,
              notes: true,
              arrivalTime: true,
            },
            orderBy: { studentId: "asc" },
          },
        },
      }),
      // 3. Historique des séances
      prisma.classSession.findMany({
        where: { classId, organizationId: user.organizationId },
        orderBy: { sessionDate: "desc" },
        take: 200,
        select: {
          id: true,
          sessionDate: true,
          subjectName: true,
          chapter: true,
          summary: true,
          startTime: true,
          endTime: true,
          attendances: {
            select: { status: true },
          },
        },
      }),
      // 4. Cahier de texte (lecture seule) : `CourseLog` exact du cours
      // porteur ([courseId, date]) saisi dans la fiche cours (« Mes cours »).
      // Bindé directement dans le bloc cahier à gauche de la feuille.
      prisma.courseLog.findUnique({
        where: { courseId_date: { courseId: klass.courseId, date: sessionDate } },
        select: { chapterTitle: true, content: true, homework: true },
      }),
    ]);

    // Mapping du roster
    const mappedRoster: EnrolledStudentDTO[] = roster.map((student) => ({
      studentId: student.id,
      studentCode: student.studentCode,
      firstName: student.firstName,
      lastName: student.lastName,
      progress: student.enrollments[0]?.progress ?? 0,
    }));

    // Mapping de la session
    const mappedSession: ClassSessionWithAttendanceDTO | null = (() => {
      if (!session) return null;
      const isPast = sessionDate < startOfUtcDay(new Date());
      const hasAttendance = session.attendances.length > 0;
      return {
        id: session.id,
        classId: session.classId,
        subjectName: session.subjectName,
        chapter: session.chapter,
        summary: session.summary,
        sessionDate: session.sessionDate,
        startTime: session.startTime,
        endTime: session.endTime,
        status: hasAttendance || !isPast ? "VALIDATED" : "PENDING",
        attendances: session.attendances.map((a) => ({
          studentId: a.studentId,
          status: a.status,
          notes: a.notes,
          arrivalTime: a.arrivalTime,
        })),
      };
    })();

    // Mapping de l'historique
    const mappedHistory: ClassSessionHistoryEntryDTO[] = history.map((s) => {
      const totalCount = s.attendances.length;
      const presentCount = s.attendances.filter(
        (a) => a.status === "PRESENT" || a.status === "LATE"
      ).length;
      const isPast = s.sessionDate < startOfUtcDay(new Date());
      const hasAttendance = totalCount > 0;
      return {
        id: s.id,
        sessionDate: s.sessionDate,
        subjectName: s.subjectName,
        chapter: s.chapter,
        summary: s.summary,
        startTime: s.startTime ? s.startTime.toISOString().slice(11, 16) : null,
        endTime: s.endTime ? s.endTime.toISOString().slice(11, 16) : null,
        teacherName: classTeacherName,
        presentCount,
        totalCount,
        status: hasAttendance || !isPast ? "VALIDATED" : "PENDING",
      };
    });

    return {
      roster: mappedRoster,
      session: mappedSession,
      history: mappedHistory,
      // Cahier de texte strictement en lecture seule : `CourseLog` exact
      // ([courseId, date]) saisi dans la fiche cours. Aucune saisie manuelle
      // ici — le composant affiche `chapterTitle` + `content`/`homework`.
      courseLog: courseLogRow
        ? {
            chapterTitle: courseLogRow.chapterTitle,
            content: courseLogRow.content,
            homework: courseLogRow.homework,
          }
        : null,
      // Alias historique conservé pour compatibilité.
      courseLogFallback: courseLogRow
        ? {
            chapterTitle: courseLogRow.chapterTitle,
            content: courseLogRow.content,
            homework: courseLogRow.homework,
          }
        : null,
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[getAttendancePageData] Échec de lecture :", error);

    throw new Error(
      "Impossible de charger les données de présence pour le moment."
    );
  }
}

// --------------------------------------
// Server Action — Récupérer une séance avec ses présences
// --------------------------------------

/**
 * Lecture résiliente des flags de clôture (`isCompleted`/`endedAt`) :
 * retourne `{ isCompleted: false, endedAt: null }` si la migration n'a pas
 * encore été appliquée en base (évite toute erreur non interceptée côté
 * « Terminer la séance »).
 */
async function readSessionCompletionFlags(
  sessionId: string
): Promise<{ isCompleted: boolean; endedAt: Date | null }> {
  try {
    const row = await (prisma.classSession as unknown as {
      findUnique: (args: unknown) => Promise<{ isCompleted?: boolean; endedAt?: Date | null } | null>;
    }).findUnique({
      where: { id: sessionId },
      select: { isCompleted: true, endedAt: true },
    });
    return { isCompleted: row?.isCompleted ?? false, endedAt: row?.endedAt ?? null };
  } catch {
    return { isCompleted: false, endedAt: null };
  }
}

/**
 * Récupère la séance d'une classe pour une date donnée avec ses présences.
 * Retourne `null` si aucune séance n'existe encore (le professeur peut alors
 * en créer une via `saveClassSessionWithAttendance`).
 *
 * Isolation : vérifie que l'enseignant est assigné à la classe.
 */
export async function getClassSessionWithAttendance(
  classId: string,
  date: string
): Promise<ClassSessionWithAttendanceDTO | null> {
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
    select: { id: true },
  });

  if (!klass) {
    throw new Error("Classe introuvable ou non autorisée.");
  }

  const sessionDate = parseAttendanceDay(date);
  if (!sessionDate) {
    throw new Error("Date invalide.");
  }

  try {
    const session = await prisma.classSession.findFirst({
      where: { classId, sessionDate },
      select: {
        id: true,
        classId: true,
        subjectName: true,
        chapter: true,
        summary: true,
        sessionDate: true,
        startTime: true,
        endTime: true,
        attendances: {
          select: {
            studentId: true,
            status: true,
            notes: true,
            arrivalTime: true,
          },
          orderBy: { studentId: "asc" },
        },
      },
    });

    if (!session) {
      return null;
    }

    const completion = await readSessionCompletionFlags(session.id);
    const isPast = sessionDate < startOfUtcDay(new Date());
    const hasAttendance = session.attendances.length > 0;

    return {
      id: session.id,
      classId: session.classId,
      subjectName: session.subjectName,
      chapter: session.chapter,
      summary: session.summary,
      sessionDate: session.sessionDate,
      startTime: session.startTime,
      endTime: session.endTime,
      status: hasAttendance || !isPast ? "VALIDATED" : "PENDING",
      isCompleted: completion.isCompleted,
      endedAt: completion.endedAt,
      attendances: session.attendances.map((a) => ({
        studentId: a.studentId,
        status: a.status,
        notes: a.notes,
        arrivalTime: a.arrivalTime,
      })),
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error(
      "[getClassSessionWithAttendance] Échec de lecture :",
      error
    );

    throw new Error(
      "Impossible de charger la séance pour le moment."
    );
  }
}

// --------------------------------------
// Server Action — Sauvegarde unifiée séance + présences
// --------------------------------------

/**
 * Enregistre la feuille de présence d'une classe pour une date donnée.
 *
 * Fusion Émargement + Cahier de texte (fiche classe, 100 % in-place) :
 * - le `title` (matière / intitulé du cours), le `chapter` (chapitre / thème
 *   du jour) et le `summary` (résumé de la séance / devoirs) sont saisis
 *   directement au-dessus de la liste d'émargement ;
 * - `chapter` et `summary` sont OBLIGATOIRES (rejet `{ ok: false }` sinon,
 *   sans lever d'exception) ;
 * - au moins un statut d'émargement doit être sélectionné (la liste
 *   `attendances` ne doit pas être vide).
 *
 * Isolation : vérifie que l'enseignant est assigné à la classe.
 */
export async function saveClassSessionWithAttendance(
  payload: SaveClassSessionPayload
): Promise<
  | {
      ok: true;
      sessionId: string;
      session: ClassSessionWithAttendanceDTO;
      historyEntry: ClassSessionHistoryEntryDTO;
    }
  | { ok: false; message: string }
> {
  await assertCanMutate();

  const { classId, date, title, chapter, summary, attendances } = payload;

  if (!classId) {
    return { ok: false, message: "La classe est requise." };
  }
  if (!date) {
    return { ok: false, message: "La date est requise." };
  }
  // Fusion Émargement + Cahier de texte : blocage serveur (en plus du blocage
  // client du bouton) tant que le chapitre/thème ET le résumé ne sont pas
  // renseignés, et tant qu'aucun statut d'émargement n'est sélectionné.
  if (!chapter.trim()) {
    return { ok: false, message: "Le chapitre / thème du jour est requis." };
  }
  if (!summary.trim()) {
    return { ok: false, message: "Le résumé de la séance / devoirs est requis." };
  }
  if (!attendances || attendances.length === 0) {
    return { ok: false, message: "Sélectionnez au moins un statut d'émargement." };
  }

  try {
    const { user, courseId } = await assertCourseAccessForClassWithCourse(classId);

    const sessionDate = parseAttendanceDay(date);
    if (!sessionDate) {
      return { ok: false, message: "Date invalide." };
    }

    // Vérifie que les étudiants appartiennent bien à la classe
    const studentIds = attendances.map((a) => a.studentId);
    const validStudents = await prisma.student.findMany({
      where: {
        id: { in: studentIds },
        organizationId: user.organizationId,
        classEnrollments: { some: { classId } },
      },
      select: { id: true },
    });
    const validStudentIds = new Set(validStudents.map((s) => s.id));

    const filteredAttendances = attendances.filter((a) =>
      validStudentIds.has(a.studentId)
    );

    if (filteredAttendances.length === 0) {
      return { ok: false, message: "Aucun étudiant valide pour cette classe." };
    }

    // Rattachement strict des présences à l'inscription (classe + année —
    // séparation stricte Étudiant / Inscription).
    const enrollmentIdByStudent = await buildEnrollmentIdMapForClass(prisma, {
      organizationId: user.organizationId,
      classId,
    });

    // Calcule les heures de début/fin par défaut (créneau de 2h)
    const startTime = new Date(sessionDate);
    startTime.setUTCHours(8, 0, 0, 0);
    const endTime = new Date(sessionDate);
    endTime.setUTCHours(10, 0, 0, 0);

    // Fusion Émargement + Cahier de texte : la saisie fiche classe fait foi.
    // Le `CourseLog` parent (requête exacte [courseId, date]) n'est utilisé
    // qu'en repli pour l'intitulé si celui-ci est vide.
    const parentCourseLog = await prisma.courseLog.findUnique({
      where: { courseId_date: { courseId, date: sessionDate } },
      select: { chapterTitle: true, content: true, homework: true },
    });

    const resolvedSubject =
      title.trim() || parentCourseLog?.chapterTitle.trim() || "Séance de cours";
    // `chapter` et `summary` ont été validés non-vides plus haut : la saisie
    // fiche classe est persistée telle quelle (100 % in-place, sans repli).
    const resolvedChapter = chapter.trim();
    const resolvedSummary: string = summary.trim();

    // Transaction : upsert ClassSession (via contrainte unique [classId, sessionDate])
    // + upsert Attendances. Garantit qu'une seule séance existe par classe et par date.
    // La saisie fiche classe (Émargement + Cahier de texte) fait foi.
    const result = await prisma.$transaction(async (tx) => {
      const session = await tx.classSession.upsert({
        where: {
          classId_sessionDate: { classId, sessionDate },
        },
        update: {
          subjectName: resolvedSubject,
          chapter: resolvedChapter,
          summary: resolvedSummary,
          startTime,
          endTime,
        },
        create: {
          organizationId: user.organizationId,
          classId,
          subjectName: resolvedSubject,
          chapter: resolvedChapter,
          summary: resolvedSummary,
          sessionDate,
          startTime,
          endTime,
        },
      });
      // Si la séance était clôturée (« Terminer la séance »), l'enregistrement
      // la rouvre (isCompleted=false, endedAt=null) — repli silencieux si la
      // migration de clôture n'est pas encore appliquée en base.
      try {
        await (tx.classSession as unknown as {
          update: (args: unknown) => Promise<unknown>;
        }).update({
          where: { id: session.id },
          data: { isCompleted: false, endedAt: null },
        });
      } catch {
        /* migration de clôture non appliquée : on conserve la séance telle quelle */
      }

      await Promise.all(
        filteredAttendances.map((entry) =>
          tx.attendance.upsert({
            where: {
              sessionId_studentId: {
                sessionId: session.id,
                studentId: entry.studentId,
              },
            },
            update: {
              status: entry.status,
              notes: entry.notes || null,
              date: sessionDate,
            },
            create: {
              organizationId: user.organizationId,
              sessionId: session.id,
              classId,
              studentId: entry.studentId,
              // Rattachement strict à l'inscription (classe + année).
              enrollmentId: enrollmentIdByStudent.get(entry.studentId) ?? null,
              status: entry.status,
              notes: entry.notes || null,
              date: sessionDate,
            },
          })
        )
      );

      // Cahier de texte du cours porteur : l édition depuis la page
      // Présences met à jour (upsert) le `CourseLog` [courseId, date].
      const existingLog = await tx.courseLog.findUnique({
        where: { courseId_date: { courseId, date: sessionDate } },
        select: { id: true, teacherId: true },
      });
      const logTeacherId = existingLog?.teacherId ?? user.id;
      await tx.courseLog.upsert({
        where: { courseId_date: { courseId, date: sessionDate } },
        create: {
          organizationId: user.organizationId,
          courseId,
          teacherId: logTeacherId,
          date: sessionDate,
          chapterTitle: resolvedChapter,
          content: resolvedSummary,
          homework: null,
        },
        update: { chapterTitle: resolvedChapter, content: resolvedSummary },
      });
      return session;
    });

    // Lecture résiliente des flags de clôture pour le DTO de retour.
    const completion = await readSessionCompletionFlags(result.id);

    revalidatePath("/dashboard/attendance");
    revalidatePath(`/dashboard/classes/${classId}`);
    revalidatePath(`/dashboard/courses/${courseId}`);

    // Le DTO complet est renvoyé pour une mise à jour immédiate côté client :
    // `getAttendancePageData` est rappelé après la sauvegarde, mais tant que la
    // réponse n'est pas arrivée l'UI doit déjà refléter la séance persistée
    // (aucun état local transitoire « rafraîchi » ne doit écraser l'affichage).
    const savedAttendances = await prisma.attendance.findMany({
      where: { sessionId: result.id },
      select: {
        studentId: true,
        status: true,
        notes: true,
        arrivalTime: true,
      },
      orderBy: { studentId: "asc" },
    });
    const totalCount = savedAttendances.length;
    const presentCount = savedAttendances.filter(
      (a) => a.status === "PRESENT" || a.status === "LATE"
    ).length;
    const freshSession: ClassSessionWithAttendanceDTO = {
      id: result.id,
      classId: result.classId,
      subjectName: result.subjectName,
      chapter: result.chapter,
      summary: result.summary,
      sessionDate: result.sessionDate,
      startTime: result.startTime,
      endTime: result.endTime,
      status: totalCount > 0 ? "VALIDATED" : "PENDING",
      isCompleted: completion.isCompleted,
      endedAt: completion.endedAt,
      attendances: savedAttendances.map((a) => ({
        studentId: a.studentId,
        status: a.status,
        notes: a.notes,
        arrivalTime: a.arrivalTime,
      })),
    };

    return {
      ok: true,
      sessionId: result.id,
      session: freshSession,
      historyEntry: {
        id: result.id,
        sessionDate: result.sessionDate,
        subjectName: result.subjectName,
        chapter: result.chapter,
        summary: result.summary,
        startTime: result.startTime ? result.startTime.toISOString().slice(11, 16) : null,
        endTime: result.endTime ? result.endTime.toISOString().slice(11, 16) : null,
        teacherName: "",
        totalCount,
        presentCount,
        status: totalCount > 0 ? "VALIDATED" : "PENDING",
      },
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error(
      "[saveClassSessionWithAttendance] Échec d'enregistrement :",
      error
    );

    return {
      ok: false,
      message: "Une erreur est survenue lors de l'enregistrement de la séance.",
    };
  }
}

// --------------------------------------
// Server Action — Sauvegarde des présences d'une session
// --------------------------------------

/**
 * Payload d'entrée pour la sauvegarde des présences d'une session existante.
 * Utilisé par la feuille d'appel mobile (/dashboard/attendance/sheet).
 */
export type SaveSessionAttendancePayload = {
  /** Identifiant de la ClassSession cible. */
  sessionId: string;
  /** Date de la séance (ISO « YYYY-MM-DD ») — pour cohérence avec la session. */
  date: string;
  /** Liste des présences à enregistrer/mettre à jour. */
  attendances: Array<{
    studentId: string;
    status: AttendanceStatus;
    notes?: string | null;
    /** Heure d'arrivée (requise si status = LATE). */
    arrivalTime?: string | null; // ISO « HH:MM » ou Date ISO
  }>;
};

/**
 * Sauvegarde ou met à jour la liste des présences pour une ClassSession donnée.
 *
 * Chaque ligne est écrite en `upsert` sur la clé unique [sessionId, studentId]
 * afin de garantir la cohérence : ré-enregistrer une session met simplement
 * à jour les statuts existants sans créer de doublon.
 *
 * Si le statut est LATE et qu'une `arrivalTime` est fournie, elle est
 * automatiquement convertie en Date et persistée.
 *
 * Revalide le chemin /dashboard/attendance pour récalculer les statistiques.
 */
export async function saveSessionAttendance(
  payload: SaveSessionAttendancePayload
): Promise<AttendanceMutationResult> {
  await assertCanMutate();
  try {
    const { sessionId, date, attendances } = payload;

    if (!sessionId) {
      return { ok: false, message: "Identifiant de la session manquant." };
    }
    if (!date) {
      return { ok: false, message: "La date est requise." };
    }
    if (!attendances || attendances.length === 0) {
      return { ok: false, message: "Aucune présence à enregistrer." };
    }

    const user = await getCurrentSessionUser();
    const sessionDate = parseAttendanceDay(date);
    if (!sessionDate) {
      return { ok: false, message: "Date invalide." };
    }

    // Vérifie que la session appartient à l'organisation et récupère le classId
    const session = await prisma.classSession.findFirst({
      where: {
        id: sessionId,
        organizationId: user.organizationId,
      },
      select: { id: true, classId: true },
    });

    if (!session) {
      return { ok: false, message: "Session introuvable ou non autorisée." };
    }

    // Vérifie que les étudiants appartiennent bien à la classe de la session
    const studentIds = attendances.map((a) => a.studentId);
    const validStudents = await prisma.student.findMany({
      where: {
        id: { in: studentIds },
        organizationId: user.organizationId,
        classEnrollments: { some: { classId: session.classId } },
      },
      select: { id: true },
    });
    const validStudentIds = new Set(validStudents.map((s) => s.id));

    const filteredAttendances = attendances.filter((a) =>
      validStudentIds.has(a.studentId)
    );

    if (filteredAttendances.length === 0) {
      return {
        ok: false,
        message: "Aucun étudiant valide pour cette session.",
      };
    }

    // Rattachement strict des présences à l'inscription (classe + année —
    // séparation stricte Étudiant / Inscription).
    const enrollmentIdByStudent = await buildEnrollmentIdMapForClass(prisma, {
      organizationId: user.organizationId,
      classId: session.classId,
    });

    // Transaction : upsert de chaque présence sur [sessionId, studentId]
    await prisma.$transaction(
      filteredAttendances.map((entry) => {
        // Calcul de l'heure d'arrivée si le statut est LATE
        let arrivalDate: Date | null = null;
        if (entry.status === "LATE" && entry.arrivalTime) {
          const parsed = buildSessionDateTime(date, entry.arrivalTime);
          if (parsed) {
            arrivalDate = parsed;
          } else {
            // Fallback : tente de parser comme Date ISO complète
            const fallback = new Date(entry.arrivalTime);
            if (!isNaN(fallback.getTime())) {
              arrivalDate = fallback;
            }
          }
        }

        return prisma.attendance.upsert({
          where: {
            sessionId_studentId: {
              sessionId,
              studentId: entry.studentId,
            },
          },
          update: {
            status: entry.status,
            notes: entry.notes || null,
            arrivalTime: entry.status === "LATE" ? arrivalDate : null,
            date: sessionDate,
          },
          create: {
            organizationId: user.organizationId,
            sessionId,
            classId: session.classId,
            studentId: entry.studentId,
            // Rattachement strict à l'inscription (classe + année).
            enrollmentId: enrollmentIdByStudent.get(entry.studentId) ?? null,
            status: entry.status,
            notes: entry.notes || null,
            arrivalTime: entry.status === "LATE" ? arrivalDate : null,
            date: sessionDate,
          },
        });
      })
    );

    revalidatePath("/dashboard/attendance");
    revalidatePath(`/dashboard/classes/${session.classId}`);

    return { ok: true, savedCount: filteredAttendances.length };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error(
      "[saveSessionAttendance] Échec d'enregistrement :",
      error
    );

    return {
      ok: false,
      message:
        error instanceof Error &&
        (error.message.startsWith("Accès refusé") ||
          error.message === "Session introuvable ou non autorisée.")
          ? error.message
          : "Une erreur est survenue lors de l'enregistrement des présences.",
    };
  }
}

// --------------------------------------
// Server Action — Historique des séances d'une classe
// --------------------------------------

/**
 * Récupère l'historique des séances d'une classe (tableau récapitulatif),
 * trié de la plus récente à la plus ancienne, avec le comptage de présences.
 */
export async function getClassSessionsHistory(
  classId: string,
  limit = 10
): Promise<ClassSessionHistoryEntryDTO[]> {
// --------------------------------------
// Helpers internes
// --------------------------------------
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
    select: {
      id: true,
      teacher: { select: { firstName: true, lastName: true } },
    },
  });

  if (!klass) {
    throw new Error("Classe introuvable ou non autorisée.");
  }

  const classTeacherName =
    [klass.teacher?.firstName, klass.teacher?.lastName]
      .filter(Boolean)
      .join(" ") || "Enseignant";

  try {
    const sessions = await prisma.classSession.findMany({
      where: { classId, organizationId: user.organizationId },
      orderBy: { sessionDate: "desc" },
      take: limit,
      select: {
        id: true,
        sessionDate: true,
        subjectName: true,
        chapter: true,
        summary: true,
        startTime: true,
        endTime: true,
        attendances: {
          select: { status: true },
        },
      },
    });

    return sessions.map((session) => {
      const totalCount = session.attendances.length;
      const presentCount = session.attendances.filter(
        (a) => a.status === "PRESENT" || a.status === "LATE"
      ).length;
      const isPast = session.sessionDate < startOfUtcDay(new Date());
      const hasAttendance = totalCount > 0;

      return {
        id: session.id,
        sessionDate: session.sessionDate,
        subjectName: session.subjectName,
        chapter: session.chapter,
        summary: session.summary,
        startTime: session.startTime ? session.startTime.toISOString().slice(11, 16) : null,
        endTime: session.endTime ? session.endTime.toISOString().slice(11, 16) : null,
        teacherName: classTeacherName,
        presentCount,
        totalCount,
        status: hasAttendance || !isPast ? "VALIDATED" : "PENDING",
      };
    });
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[getClassSessionsHistory] Échec de lecture :", error);

    throw new Error(
      "Impossible de charger l'historique des séances pour le moment."
    );
  }
}

// --------------------------------------
// Helpers internes
// --------------------------------------

/** Début de la journée UTC pour une date donnée. */
function startOfUtcDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Vérifie que l'utilisateur connecté peut accéder à la classe demandée :
 * - TEACHER : uniquement les classes qui lui sont assignées ;
 * - ADMIN / STAFF / SUPER_ADMIN : toutes les classes de l'organisation.
 */
async function assertCourseAccessForClass(classId: string) {
  const { user } = await assertCourseAccessForClassWithCourse(classId);

  return user;
}

/**
 * Variante qui retourne en plus l'identifiant du cours porteur (nécessaire
 * pour synchroniser l'entrée `CourseLog` [courseId, date] lors de la
 * sauvegarde unifiée séance + présences).
 */
async function assertCourseAccessForClassWithCourse(classId: string) {
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

// --------------------------------------
// Server Action — Statistiques de présences pour la page principale
// --------------------------------------

/** Statistiques d'affichage de la page de présences. */
export type AttendanceOverviewStatsDTO = {
  /** Taux de présence du jour (PRESENT + LATE / total, 0–100). */
  todayRate: number | null;
  /** Nombre total de présences enregistrées aujourd'hui. */
  todayTotal: number;
  /** Nombre de présents aujourd'hui. */
  todayPresent: number;
  /** Nombre d'absents aujourd'hui. */
  todayAbsent: number;
  /** Nombre de retards aujourd'hui. */
  todayLate: number;
  /** Taux de présence du mois en cours (0–100). */
  monthRate: number | null;
  /** Nombre total de présences enregistrées ce mois-ci. */
  monthTotal: number;
  /** Élèves avec un taux d'absence élevé (> 3 absences non justifiées). */
  studentsWithHighAbsence: Array<{
    studentId: string;
    studentName: string;
    absenceCount: number;
  }>;
};

/**
 * Récupère les statistiques de présences pour la page principale :
 * taux du jour, totaux, et alertes absences élevées.
 */
export async function getAttendanceOverviewStats(): Promise<AttendanceOverviewStatsDTO> {
  const user = await getCurrentSessionUser();

  if (user.role === "STUDENT") {
    throw new Error("Accès refusé : les étudiants n'ont pas accès au tableau de bord.");
  }

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setUTCHours(0, 0, 0, 0);
  const startOfMonth = new Date(now.getUTCFullYear(), now.getMonth(), 1);
  const startOfNextMonth = new Date(now.getUTCFullYear(), now.getMonth() + 1, 1);

  try {
    const [todayRows, monthRows, absenceRows] = await Promise.all([
      prisma.attendance.findMany({
        where: {
          organizationId: user.organizationId,
          date: { gte: startOfToday },
          ...(user.role === "TEACHER"
            ? { session: { class: { OR: [{ teacherId: user.id }, { course: { teacherId: user.id } }] } } }
            : {}),
        },
        select: { status: true },
      }),
      prisma.attendance.findMany({
        where: {
          organizationId: user.organizationId,
          date: { gte: startOfMonth, lt: startOfNextMonth },
          ...(user.role === "TEACHER"
            ? { session: { class: { OR: [{ teacherId: user.id }, { course: { teacherId: user.id } }] } } }
            : {}),
        },
        select: { status: true },
      }),
      prisma.attendance.groupBy({
        by: ["studentId"],
        where: {
          organizationId: user.organizationId,
          status: "ABSENT",
          ...(user.role === "TEACHER"
            ? { session: { class: { OR: [{ teacherId: user.id }, { course: { teacherId: user.id } }] } } }
            : {}),
        },
        _count: { studentId: true },
        orderBy: { _count: { studentId: "desc" } },
        take: 20,
      }),
    ]);

    // Filtre les étudiants avec plus de 3 absences (côté JS pour compatibilité Prisma)
    const highAbsenceRows = absenceRows.filter(
      (r) => (r._count as unknown as { studentId: number }).studentId > 3
    );

    const todayTotal = todayRows.length;
    const todayPresent = todayRows.filter((r) => r.status === "PRESENT" || r.status === "LATE").length;
    const todayAbsent = todayRows.filter((r) => r.status === "ABSENT").length;
    const todayLate = todayRows.filter((r) => r.status === "LATE").length;
    const todayRate = todayTotal > 0 ? Math.round((todayPresent / todayTotal) * 1000) / 10 : null;

    const monthTotal = monthRows.length;
    const monthPresent = monthRows.filter((r) => r.status === "PRESENT" || r.status === "LATE").length;
    const monthRate = monthTotal > 0 ? Math.round((monthPresent / monthTotal) * 1000) / 10 : null;

    const studentIds = highAbsenceRows.map((r) => r.studentId);
    const students = await prisma.student.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const studentMap = new Map(students.map((s) => [s.id, `${s.firstName} ${s.lastName}`]));

    const studentsWithHighAbsence = highAbsenceRows.map((r) => ({
      studentId: r.studentId,
      studentName: studentMap.get(r.studentId) ?? "Inconnu",
      absenceCount: (r._count as unknown as { studentId: number }).studentId,
    }));

    return {
      todayRate,
      todayTotal,
      todayPresent,
      todayAbsent,
      todayLate,
      monthRate,
      monthTotal,
      studentsWithHighAbsence,
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[getAttendanceOverviewStats] Échec de calcul :", error);

    return {
      todayRate: null,
      todayTotal: 0,
      todayPresent: 0,
      todayAbsent: 0,
      todayLate: 0,
      monthRate: null,
      monthTotal: 0,
      studentsWithHighAbsence: [],
    };
  }
}

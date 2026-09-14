"use server";

import type {
  ClassEnrollmentStatus,
  ClassStatus,
  ModuleStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getCurrentOrganizationId, isNextRedirectError } from "@/lib/session";
import { computeModuleStatus } from "@/lib/module-status";

// --------------------------------------
// Types publics (contrat avec les composants clients)
// --------------------------------------

/** Module suivi par l'étudiant dans une classe donnée (historique figé). */
export type JourneyModuleDTO = {
  evaluationTitle: string;
  moduleName: string;
  score: number | null;
  maxScore: number;
  passMark: number;
  status: ModuleStatus | null;
};

/** Récapitulatif académique d'une classe du parcours. */
export type JourneyStatsDTO = {
  gradedModuleCount: number;
  validatedModuleCount: number;
  failedModuleCount: number;
  ungradedModuleCount: number;
  /** Moyenne pondérée sur 100 (null si aucune note). */
  overallAverage: number | null;
  /** Taux de validation des modules notés en % (null si aucune note). */
  validationRate: number | null;
};

/** Bilan d'assiduité de l'étudiant dans une classe donnée. */
export type JourneyAttendanceDTO = {
  total: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  /** Émargements détaillés (date, statut, remarque) pour le rapport imprimable. */
  sessions: Array<{
    date: Date;
    status: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
    notes: string | null;
  }>;
};

/** Une classe du parcours de l'étudiant (active ou passée). */
export type JourneyClassEntryDTO = {
  enrollmentId: string;
  classId: string;
  className: string;
  courseTitle: string;
  courseCode: string;
  schedule: string;
  /** Décision de fin de session (ACTIVE tant que la classe n'est pas clôturée). */
  enrollmentStatus: ClassEnrollmentStatus;
  classStatus: ClassStatus;
  /** Classe actuellement suivie par l'étudiant. */
  isActive: boolean;
  enrolledAt: Date;
  finalDecisionNote: string | null;
  modules: JourneyModuleDTO[];
  stats: JourneyStatsDTO;
  attendance: JourneyAttendanceDTO;
};

/** Parcours & historique complet d'un étudiant. */
export type StudentJourneyDTO = {
  entries: JourneyClassEntryDTO[];
};

// --------------------------------------
// Server Action — Parcours & historique
// --------------------------------------

/**
 * Reconstruit le parcours académique d'un étudiant à partir de l'historique
 * d'inscriptions (`ClassEnrollment`) : pour chaque classe, les modules
 * évalués avec leur statut de validation (figé dans `Grade.status` / snapshot
 * `passMark`), les statistiques agrégées et le bilan d'assiduité.
 *
 * Les données d'une classe passée sont figées : la modification du barème ou
 * des notes de la classe active n'altère jamais les bulletins antérieurs.
 */
export async function getStudentJourney(
  studentId: string
): Promise<StudentJourneyDTO> {
  const organizationId = await getCurrentOrganizationId();

  try {
    const student = await prisma.student.findFirst({
      where: { id: studentId, organizationId },
      select: { id: true, currentClassId: true },
    });

    if (!student) {
      throw new Error("Étudiant introuvable dans votre organisation.");
    }

    // Historique complet des inscriptions aux classes (passées + active).
    const enrollments = await prisma.classEnrollment.findMany({
      where: { studentId, organizationId },
      orderBy: { enrolledAt: "asc" },
      select: {
        id: true,
        classId: true,
        status: true,
        enrolledAt: true,
        finalDecisionNote: true,
        class: {
          select: {
            id: true,
            name: true,
            schedule: true,
            status: true,
            course: { select: { title: true, code: true } },
          },
        },
      },
    });

    const classIds = enrollments.map((enrollment) => enrollment.classId);

    if (classIds.length === 0) {
      return { entries: [] };
    }

    // Évaluations de toutes ces classes, avec la note de l'étudiant.
    const evaluations = await prisma.evaluation.findMany({
      where: { classId: { in: classIds }, organizationId },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      select: {
        classId: true,
        title: true,
        passMark: true,
        modules: {
          orderBy: { createdAt: "asc" },
          select: {
            name: true,
            maxScore: true,
            passingScore: true,
            grades: {
              where: { studentId },
              select: { score: true, passMark: true, status: true },
              take: 1,
            },
          },
        },
      },
    });

    // Assiduité de l'étudiant, regroupée par classe (via la séance).
    const attendanceRecords = await prisma.attendance.findMany({
      where: {
        studentId,
        organizationId,
        session: { classId: { in: classIds } },
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      select: {
        status: true,
        notes: true,
        date: true,
        session: { select: { classId: true } },
      },
    });

    const emptyAttendance = (): JourneyAttendanceDTO => ({
      total: 0,
      present: 0,
      late: 0,
      absent: 0,
      excused: 0,
      sessions: [],
    });

    const attendanceByClass = new Map<string, JourneyAttendanceDTO>();
    for (const record of attendanceRecords) {
      const classId = record.session?.classId;
      if (!classId) continue;

      const summary = attendanceByClass.get(classId) ?? emptyAttendance();
      summary.total += 1;
      if (record.status === "PRESENT") summary.present += 1;
      else if (record.status === "LATE") summary.late += 1;
      else if (record.status === "ABSENT") summary.absent += 1;
      else if (record.status === "EXCUSED") summary.excused += 1;
      summary.sessions.push({
        date: record.date,
        status: record.status,
        notes: record.notes,
      });
      attendanceByClass.set(classId, summary);
    }

    // Évaluations indexées par classe.
    const evaluationsByClass = new Map<string, typeof evaluations>();
    for (const evaluation of evaluations) {
      const list = evaluationsByClass.get(evaluation.classId) ?? [];
      list.push(evaluation);
      evaluationsByClass.set(evaluation.classId, list);
    }

    const entries: JourneyClassEntryDTO[] = enrollments.map((enrollment) => {
      const classEvaluations = evaluationsByClass.get(enrollment.classId) ?? [];

      const modules: JourneyModuleDTO[] = classEvaluations.flatMap((evaluation) =>
        evaluation.modules.map((module) => {
          const grade = module.grades[0];
          const passMark =
            grade?.passMark ?? module.passingScore ?? evaluation.passMark;
          const score = grade ? grade.score : null;
          return {
            evaluationTitle: evaluation.title,
            moduleName: module.name,
            score,
            maxScore: module.maxScore,
            passMark,
            status: grade?.status ?? computeModuleStatus(score, passMark),
          };
        })
      );

      const graded = modules.filter((module) => module.score !== null);
      const validated = modules.filter((m) => m.status === "VALIDATED").length;
      const totalMax = graded.reduce((sum, module) => sum + module.maxScore, 0);
      const totalScore = graded.reduce(
        (sum, module) => sum + (module.score ?? 0),
        0
      );

      return {
        enrollmentId: enrollment.id,
        classId: enrollment.classId,
        className: enrollment.class.name,
        courseTitle: enrollment.class.course.title,
        courseCode: enrollment.class.course.code,
        schedule: enrollment.class.schedule,
        enrollmentStatus: enrollment.status,
        classStatus: enrollment.class.status,
        isActive: enrollment.classId === student.currentClassId,
        enrolledAt: enrollment.enrolledAt,
        finalDecisionNote: enrollment.finalDecisionNote,
        modules,
        stats: {
          gradedModuleCount: graded.length,
          validatedModuleCount: validated,
          failedModuleCount: modules.filter((m) => m.status === "FAILED").length,
          ungradedModuleCount: modules.length - graded.length,
          overallAverage:
            graded.length > 0 && totalMax > 0
              ? Math.round((totalScore / totalMax) * 1000) / 10
              : null,
          validationRate:
            graded.length > 0
              ? Math.round((validated / graded.length) * 1000) / 10
              : null,
        },
        attendance: attendanceByClass.get(enrollment.classId) ?? emptyAttendance(),
      };
    });

    return { entries };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[getStudentJourney] Échec de lecture :", error);
    throw new Error("Impossible de charger le parcours de l'étudiant.");
  }
}

"use server";

import type {
  PaymentMethod,
  PaymentStatus,
  StudentStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  getCurrentOrganizationId,
  getCurrentSessionUser,
  isNextRedirectError,
} from "@/lib/session";

// --------------------------------------
// Types publics (contrat avec les composants serveur/clients)
// --------------------------------------

export type RecentStudentDTO = {
  id: string;
  studentCode: string;
  firstName: string;
  lastName: string;
  status: StudentStatus;
  createdAt: Date;
};

export type RecentPaymentDTO = {
  id: string;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  status: PaymentStatus;
  paidAt: Date;
  student: {
    id: string;
    studentCode: string;
    firstName: string;
    lastName: string;
  };
};

export type DashboardStatsDTO = {
  /** Nombre total d'étudiants de l'organisation (tous statuts confondus). */
  totalStudents: number;
  /** Nombre d'étudiants au statut ENROLLED (« Inscrit »). */
  enrolledStudents: number;
  /** Nombre d'étudiants au statut PROSPECT. */
  prospects: number;
  /** Somme des paiements au statut COMPLETED (chiffre d'affaires encaissé). */
  totalRevenue: number;
  /** Dossiers de voyage en cours : ADMISSION_APPLIED ou VISA_APPLIED. */
  activeTravelFiles: number;
  /**
   * Nombre de formations proposées au catalogue. Le modèle `Course` ne
   * comportant pas encore de notion d'archivage, tous les cours sont
   * considérés comme actifs.
   */
  activeCourses: number;
  /** Les 5 derniers étudiants inscrits (par date de création). */
  recentStudents: RecentStudentDTO[];
  /** Les 5 derniers règlements enregistrés (par date de paiement). */
  recentPayments: RecentPaymentDTO[];
};

// --------------------------------------
// Types & Server Action — Espace enseignant
// --------------------------------------

/** Cours enseigné par l'utilisateur connecté (aperçu tableau de bord). */
export type TeacherCourseSummaryDTO = {
  id: string;
  title: string;
  code: string;
  enrollmentCount: number;
};

/** Dernière entrée de cahier de texte de l'enseignant. */
export type TeacherRecentLogDTO = {
  id: string;
  date: Date;
  chapterTitle: string;
  courseTitle: string;
};

export type TeacherDashboardStatsDTO = {
  /** Nombre de cours assignés à l'enseignant connecté. */
  myCoursesCount: number;
  /** Nombre total d'étudiants inscrits à ses cours (inscriptions cumulées). */
  myStudentsCount: number;
  /** Nombre d'entrées de cahier de texte saisies par l'enseignant. */
  courseLogsCount: number;
  /**
   * Taux de présence du mois courant sur ses cours (PRESENT + LATE / total,
   * 0–100). `null` si aucun émargement n'a été saisi ce mois-ci.
   */
  monthlyAttendanceRate: number | null;
  /** Nombre d'émargements saisis sur le mois courant dans son périmètre. */
  attendanceEntriesThisMonth: number;
  /** Nombre de sessions d'évaluation rattachées à ses classes. */
  evaluationsCount: number;
  /**
   * Moyenne générale normalisée sur 100 des notes saisies pour ses évaluations
   * (pondérée par les barèmes). `null` si aucune note n'existe.
   */
  averageScore: number | null;
  /** Ses cours avec effectif, triés par titre. */
  courses: TeacherCourseSummaryDTO[];
  /** Les 5 dernières entrées de son cahier de texte. */
  recentLogs: TeacherRecentLogDTO[];
  /**
   * Courbe d'évolution des notes par élève / classe : pour chaque étudiant,
   * la moyenne /100 obtenue à chaque évaluation de son périmètre.
   */
  gradeTrend: TeacherGradeTrendStudentDTO[];
  /** Feuille de présence récente (dernières saisies dans son périmètre). */
  attendanceSheet: TeacherAttendanceSheetRowDTO[];
};

/** Étudiant du graphique d'évolution des notes. */
export type TeacherGradeTrendStudentDTO = {
  studentId: string;
  studentName: string;
  className: string | null;
  /** Une moyenne normalisée /100 par évaluation (X du graphique). */
  points: Array<{ evaluationTitle: string; score: number }>;
};

/** Ligne de la feuille de présence récente de l'enseignant. */
export type TeacherAttendanceSheetRowDTO = {
  id: string;
  studentId: string;
  studentName: string;
  className: string | null;
  date: Date;
  status: string;
};

/**
 * Agrège les indicateurs pédagogiques de l'enseignant connecté.
 * AUCUNE donnée financière n'est exposée ici : un enseignant ne voit que
 * ses cours, ses étudiants et son cahier de texte.
 */
export async function getTeacherDashboardStats(): Promise<TeacherDashboardStatsDTO> {
  const user = await getCurrentSessionUser();

  if (user.role === "STUDENT") {
    throw new Error(
      "Accès refusé : les étudiants n'ont pas accès au tableau de bord."
    );
  }

  try {
    // Un enseignant ne voit que ses cours ; les autres rôles staff voient
    // l'ensemble du catalogue (aucune donnée financière incluse).
    const courseWhere =
      user.role === "TEACHER"
        ? { organizationId: user.organizationId, teacherId: user.id }
        : { organizationId: user.organizationId };

    const [courses, logs] = await Promise.all([
      prisma.course.findMany({
        where: courseWhere,
        orderBy: [{ title: "asc" }],
        select: {
          id: true,
          title: true,
          code: true,
          _count: { select: { enrollments: true } },
        },
      }),
      prisma.courseLog.findMany({
        where:
          user.role === "TEACHER"
            ? {
                organizationId: user.organizationId,
                teacherId: user.id,
              }
            : { organizationId: user.organizationId },
        orderBy: { date: "desc" },
        take: 5,
        select: {
          id: true,
          date: true,
          chapterTitle: true,
          course: { select: { title: true } },
        },
      }),
    ]);

    // ----- Assiduité & évaluations (strictement pédagogique) -----
    // Périmètre enseignant : ses cours (via le cours OU la classe assignée).
    // Les autres rôles staff voient l'ensemble de l'organisation.
    const isTeacherRole = user.role === "TEACHER";

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);

    const [
      monthStatusCounts,
      evaluationRows,
      attendanceSheetRows,
    ] = await Promise.all([
      prisma.attendance.groupBy({
        by: ["status"],
        where: {
          organizationId: user.organizationId,
          date: { gte: monthStart, lt: monthEnd },
          ...(isTeacherRole
            ? {
                session: {
                  class: {
                    OR: [
                      { teacherId: user.id },
                      { course: { teacherId: user.id } },
                    ],
                  },
                },
              }
            : {}),
        },
        _count: { _all: true },
      }),
      prisma.evaluation.findMany({
        where: {
          organizationId: user.organizationId,
          ...(isTeacherRole
            ? {
                class: {
                  OR: [
                    { teacherId: user.id },
                    { course: { teacherId: user.id } },
                  ],
                },
              }
            : {}),
        },
        select: {
          id: true,
          title: true,
          class: { select: { name: true } },
          modules: {
            select: {
              maxScore: true,
              grades: {
                select: {
                  score: true,
                  student: {
                    select: { id: true, firstName: true, lastName: true },
                  },
                },
              },
            },
          },
        },
      }),
      // Feuille de présence récente dans le périmètre de l'enseignant.
      prisma.attendance.findMany({
        where: {
          organizationId: user.organizationId,
          ...(isTeacherRole
            ? {
                session: {
                  class: {
                    OR: [
                      { teacherId: user.id },
                      { course: { teacherId: user.id } },
                    ],
                  },
                },
              }
            : {}),
        },
        orderBy: { date: "desc" },
        take: 8,
        select: {
          id: true,
          date: true,
          status: true,
          student: { select: { id: true, firstName: true, lastName: true } },
          session: { select: { class: { select: { name: true } } } },
        },
      }),
    ]);

    // Taux de présence mensuel : les retardataires ont assisté au cours.
    const presentishCount = monthStatusCounts
      .filter((row) => row.status === "PRESENT" || row.status === "LATE")
      .reduce((total, row) => total + row._count._all, 0);
    const attendanceEntriesThisMonth = monthStatusCounts.reduce(
      (total, row) => total + row._count._all,
      0
    );

    // Moyenne pondérée par les barèmes, normalisée sur 100.
    let weightedScoreSum = 0;
    let weightedMaxSum = 0;
    for (const evaluation of evaluationRows) {
      for (const evaluationModule of evaluation.modules) {
        if (!(evaluationModule.maxScore > 0)) continue;

        for (const grade of evaluationModule.grades) {
          weightedScoreSum += grade.score;
          weightedMaxSum += evaluationModule.maxScore;
        }
      }
    }

    // ----- Courbe d'évolution des notes par élève / classe -----
    // Pour chaque évaluation, on regroupe les notes par étudiant et on
    // normalise sur 100 (moyenne des scores / barème). Un point par évaluation.
    const studentsMap = new Map<
      string,
      { name: string; className: string | null; points: Map<string, number> }
    >();

    for (const evaluation of evaluationRows) {
      const className = evaluation.class?.name ?? null;

      // Accumule somme des scores et nombre de modules notés par étudiant.
      const acc = new Map<string, { score: number; count: number }>();
      for (const evaluationModule of evaluation.modules) {
        if (!(evaluationModule.maxScore > 0)) continue;

        for (const grade of evaluationModule.grades) {
          const entry = acc.get(grade.student.id) ?? { score: 0, count: 0 };
          entry.score += grade.score;
          entry.count += 1;
          acc.set(grade.student.id, entry);
        }
      }

      for (const [studentId, sums] of acc) {
        if (!studentsMap.has(studentId)) {
          // Retrouve le nom complet depuis les notes de cette évaluation.
          let name = "Étudiant";
          for (const evaluationModule of evaluation.modules) {
            const grade = evaluationModule.grades.find(
              (g) => g.student.id === studentId
            );
            if (grade) {
              name = `${grade.student.firstName} ${grade.student.lastName}`;
              break;
            }
          }
          studentsMap.set(studentId, {
            name,
            className,
            points: new Map(),
          });
        }

        const student = studentsMap.get(studentId)!;
        // Moyenne normalisée /100 (barèmes identiques : score moyen des modules).
        const mean =
          sums.count > 0
            ? Math.round((sums.score / sums.count / 100) * 1000) / 10
            : 0;
        student.points.set(evaluation.title, mean);
      }
    }

    const gradeTrend: TeacherGradeTrendStudentDTO[] = Array.from(
      studentsMap.entries()
    )
      .map(([studentId, student]) => ({
        studentId,
        studentName: student.name,
        className: student.className,
        points: Array.from(student.points.entries()).map(
          ([evaluationTitle, score]) => ({ evaluationTitle, score })
        ),
      }))
      .filter((entry) => entry.points.length > 0)
      .slice(0, 8);

    // Feuille de présence récente.
    const attendanceSheet: TeacherAttendanceSheetRowDTO[] =
      attendanceSheetRows.map((row) => ({
        id: row.id,
        studentId: row.student.id,
        studentName: `${row.student.firstName} ${row.student.lastName}`,
        className: row.session?.class.name ?? null,
        date: row.date,
        status: row.status,
      }));

    return {
      myCoursesCount: courses.length,
      myStudentsCount: courses.reduce(
        (total, course) => total + course._count.enrollments,
        0
      ),
      courseLogsCount: await prisma.courseLog.count({
        where:
          user.role === "TEACHER"
            ? { organizationId: user.organizationId, teacherId: user.id }
            : { organizationId: user.organizationId },
      }),
      monthlyAttendanceRate:
        attendanceEntriesThisMonth > 0
          ? Math.min(
              100,
              Math.max(
                0,
                Math.round((presentishCount / attendanceEntriesThisMonth) * 1000) /
                  10
              )
            )
          : null,
      attendanceEntriesThisMonth,
      evaluationsCount: evaluationRows.length,
      averageScore:
        weightedMaxSum > 0
          ? Math.round((weightedScoreSum / weightedMaxSum) * 1000) / 10
          : null,
      courses: courses.map((course) => ({
        id: course.id,
        title: course.title,
        code: course.code,
        enrollmentCount: course._count.enrollments,
      })),
      recentLogs: logs.map((log) => ({
        id: log.id,
        date: log.date,
        chapterTitle: log.chapterTitle,
        courseTitle: log.course.title,
      })),
      gradeTrend,
      attendanceSheet,
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error(
      "[getTeacherDashboardStats] Échec de calcul des indicateurs :",
      error
    );

    // Dégradation gracieuse : indicateurs vides plutôt que crash serveur.
    return {
      myCoursesCount: 0,
      myStudentsCount: 0,
      courseLogsCount: 0,
      monthlyAttendanceRate: null,
      attendanceEntriesThisMonth: 0,
      evaluationsCount: 0,
      averageScore: null,
      courses: [],
      recentLogs: [],
      gradeTrend: [],
      attendanceSheet: [],
    };
  }
}

// --------------------------------------
// Server Actions
// --------------------------------------

/**
 * Agrège les indicateurs clés du tableau de bord pour l'organisation active.
 *
 * Toutes les requêtes Prisma sont exécutées en parallèle (`Promise.all`)
 * afin de minimiser la latence du rendu de la page d'accueil.
 * Isolation multi-tenant : chaque requête est filtrée par `organizationId`.
 */
export async function getDashboardStats(): Promise<DashboardStatsDTO> {
  const organizationId = await getCurrentOrganizationId();

  try {
    const [
      totalStudents,
      enrolledStudents,
      prospects,
      revenueAggregate,
      activeTravelFiles,
      activeCourses,
      recentStudents,
      recentPayments,
    ] = await Promise.all([
      // Total des étudiants (tous statuts).
      prisma.student.count({ where: { organizationId } }),

      // Étudiants officiellement inscrits à une formation.
      prisma.student.count({
        where: { organizationId, status: "ENROLLED" },
      }),

      // Prospects (contacts à convertir).
      prisma.student.count({
        where: { organizationId, status: "PROSPECT" },
      }),

      // Chiffre d'affaires : somme des paiements réglés (COMPLETED) actifs —
      // les écritures suspendues (`isVoided`) sont exclues de la trésorerie.
      prisma.payment.aggregate({
        where: { organizationId, status: "COMPLETED", isVoided: false },
        _sum: { amount: true },
      }),

      // Dossiers de voyage/visa en cours de traitement.
      prisma.travelProcedure.count({
        where: {
          organizationId,
          status: { in: ["ADMISSION_APPLIED", "VISA_APPLIED"] },
        },
      }),

      // Formations actives du catalogue.
      prisma.course.count({ where: { organizationId } }),

      // Les 5 derniers étudiants inscrits.
      prisma.student.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          studentCode: true,
          firstName: true,
          lastName: true,
          status: true,
          createdAt: true,
        },
      }),

      // Les 5 derniers règlements ACTIFS enregistrés rattachés à un étudiant.
      // (`studentId` étant nullable au schéma, on écarte ici les lignes sans
      // étudiant afin de respecter le contrat `RecentPaymentDTO` ; les
      // écritures suspendues — étudiant repassé Prospect — sont écartées.)
      prisma.payment
        .findMany({
          where: { organizationId, isVoided: false },
          orderBy: { paidAt: "desc" },
          take: 5,
          select: {
            id: true,
            amount: true,
            currency: true,
            paymentMethod: true,
            status: true,
            paidAt: true,
            student: {
              select: {
                id: true,
                studentCode: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        })
        .then((rows) =>
          rows.flatMap((row) =>
            row.student ? [{ ...row, student: row.student }] : []
          )
        ),
    ]);

    return {
      totalStudents,
      enrolledStudents,
      prospects,
      totalRevenue: revenueAggregate._sum.amount ?? 0,
      activeTravelFiles,
      activeCourses,
      recentStudents,
      recentPayments,
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error(
      "[getDashboardStats] Échec de calcul des indicateurs :",
      error
    );

    // Dégradation gracieuse : tableau de bord vide plutôt que crash serveur.
    return {
      totalStudents: 0,
      enrolledStudents: 0,
      prospects: 0,
      totalRevenue: 0,
      activeTravelFiles: 0,
      activeCourses: 0,
      recentStudents: [],
      recentPayments: [],
    };
  }
}

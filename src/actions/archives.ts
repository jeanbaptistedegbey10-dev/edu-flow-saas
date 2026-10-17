"use server";

import type {
  ClassEnrollmentStatus,
  ClassStatus,
  ModuleStatus,
  PaymentMethod,
  PaymentStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  getCurrentOrganizationId,
  getCurrentSessionUser,
  isNextRedirectError,
} from "@/lib/session";

/**
 * Onglet « Archives » (etape 3/3) — lecture seule des classes cloturees.
 *
 * - annees academiques dynamiques via ClassEnrollment.academicYear ;
 * - vue synthetique par annee : effectif d'epoque + financiers scelles ;
 * - recherche unifiee + fiche d'archive detaillee en LECTURE SEULE.
 *
 * REGLE FINANCIERE « scellee » par inscription :
 * totalDue = echeancier le plus recent > frais de classe > prix du cours ;
 * paidAmount = paiements COMPLETED non suspendus ; reste = max(0, du - paye).
 */

const CLOSED_CLASS_STATUSES: ClassStatus[] = ["COMPLETED", "ARCHIVED"];

/** Roles autorises a consulter les archives (donnees financieres incluses). */
const ARCHIVES_ALLOWED_ROLES = new Set(["SUPER_ADMIN", "ADMIN", "STAFF"]);

export type ArchivedClassEnrollmentDTO = {
  enrollmentId: string;
  studentId: string;
  studentCode: string;
  firstName: string;
  lastName: string;
  enrollmentStatus: ClassEnrollmentStatus;
  finalDecisionNote: string | null;
  totalDue: number;
  paidAmount: number;
  remainingAmount: number;
};

export type ArchivedClassDTO = {
  classId: string;
  className: string;
  schedule: string;
  courseTitle: string;
  courseCode: string;
  teacherName: string | null;
  status: ClassStatus;
  academicYear: string;
  studentCount: number;
  totalDue: number;
  totalPaid: number;
  remainingAmount: number;
  enrollments: ArchivedClassEnrollmentDTO[];
};

export type ArchiveStudentHistoryEntryDTO = {
  enrollmentId: string;
  classId: string;
  className: string;
  courseTitle: string;
  academicYear: string;
  enrollmentStatus: ClassEnrollmentStatus;
  totalDue: number;
  paidAmount: number;
  remainingAmount: number;
};

export type ArchiveSearchResultDTO = {
  students: Array<{
    studentId: string;
    studentCode: string;
    firstName: string;
    lastName: string;
    enrollments: ArchiveStudentHistoryEntryDTO[];
  }>;
  classes: ArchivedClassDTO[];
};

export type ArchiveEnrollmentDetailDTO = {
  enrollmentId: string;
  academicYear: string;
  enrollmentStatus: ClassEnrollmentStatus;
  finalDecisionNote: string | null;
  enrolledAt: Date;
  student: {
    id: string;
    studentCode: string;
    firstName: string;
    lastName: string;
    phone: string;
  };
  class: {
    id: string;
    name: string;
    schedule: string;
    status: ClassStatus;
    courseTitle: string;
    courseCode: string;
    teacherName: string | null;
  };
  finance: {
    totalDue: number;
    paidAmount: number;
    remainingAmount: number;
    payments: Array<{
      id: string;
      amount: number;
      paymentMethod: PaymentMethod;
      status: PaymentStatus;
      reference: string | null;
      description: string | null;
      paidAt: Date;
    }>;
  };
  bulletin: {
    modules: Array<{
      evaluationTitle: string;
      moduleName: string;
      score: number | null;
      maxScore: number;
      passMark: number;
      status: ModuleStatus | null;
    }>;
    average: number | null;
    validationRate: number | null;
  };
  history: Array<{
    enrollmentId: string;
    className: string;
    courseTitle: string;
    academicYear: string;
    enrollmentStatus: ClassEnrollmentStatus;
  }>;
};
async function assertCanReadArchives(): Promise<string> {
  const user = await getCurrentSessionUser();
  if (!ARCHIVES_ALLOWED_ROLES.has(user.role)) {
    throw new Error("Acces refuse.");
  }
  return user.organizationId;
}

async function getOrganizationIdLenient(): Promise<string | null> {
  try {
    return await getCurrentOrganizationId();
  } catch {
    return null;
  }
}

function resolveSealedTotalDue(
  scheduleTotal: number | undefined,
  tuitionFee: number | null | undefined,
  coursePrice: number | null | undefined,
): number {
  if (scheduleTotal !== undefined) return scheduleTotal;
  if (tuitionFee !== null && tuitionFee !== undefined) return tuitionFee;
  if (coursePrice !== null && coursePrice !== undefined) return coursePrice;
  return 0;
}

export async function getArchiveYears(): Promise<string[]> {
  const organizationId = await getOrganizationIdLenient();
  if (!organizationId) return [];
  try {
    const rows = await prisma.classEnrollment.groupBy({
      by: ["academicYear"],
      where: {
        organizationId,
        class: { organizationId, status: { in: CLOSED_CLASS_STATUSES } },
      },
    });
    return rows
      .map((row) => row.academicYear)
      .filter((year) => year.trim().length > 0)
      .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error("[getArchiveYears] Echec :", error);
    return [];
  }
}
export async function getArchivedClassesOverview(academicYear: string): Promise<ArchivedClassDTO[]> {
  const year = academicYear.trim();
  if (!year) return [];
  const organizationId = await getOrganizationIdLenient();
  if (!organizationId) return [];
  try {
    const user = await getCurrentSessionUser().catch(() => null);
    if (user && !ARCHIVES_ALLOWED_ROLES.has(user.role)) return [];
    const classes = await prisma.class.findMany({
      where: {
        organizationId,
        status: { in: CLOSED_CLASS_STATUSES },
        enrollments: { some: { organizationId, academicYear: year } },
      },
      orderBy: [{ name: "asc" }],
      select: {
        id: true, name: true, schedule: true, tuitionFee: true, status: true,
        course: { select: { title: true, code: true, price: true } },
        teacher: { select: { firstName: true, lastName: true } },
        enrollments: {
          where: { organizationId, academicYear: year },
          orderBy: [{ student: { lastName: "asc" } }, { student: { firstName: "asc" } }],
          select: {
            id: true, status: true, finalDecisionNote: true, studentId: true,
            student: { select: { studentCode: true, firstName: true, lastName: true } },
          },
        },
      },
    });
    const enrollmentIds = classes.flatMap((k) => k.enrollments.map((e) => e.id));
    const scheduleMap = new Map<string, number>();
    const paidMap = new Map<string, number>();
    if (enrollmentIds.length > 0) {
      const [schedRows, paidRows] = await Promise.all([
        prisma.paymentSchedule.findMany({
          where: { organizationId, enrollmentId: { in: enrollmentIds } },
          orderBy: { createdAt: "desc" },
          select: { enrollmentId: true, totalAmount: true },
        }),
        prisma.payment.groupBy({
          by: ["enrollmentId"],
          where: { organizationId, enrollmentId: { in: enrollmentIds }, status: "COMPLETED", isVoided: false },
          _sum: { amount: true },
        }),
      ]);
      for (const r of schedRows) {
        if (r.enrollmentId && !scheduleMap.has(r.enrollmentId)) scheduleMap.set(r.enrollmentId, r.totalAmount);
      }
      for (const r of paidRows) {
        if (r.enrollmentId) paidMap.set(r.enrollmentId, r._sum.amount ?? 0);
      }
    }
    return classes.map((klass) => {
      const enrollments: ArchivedClassEnrollmentDTO[] = klass.enrollments.map((e) => {
        const totalDue = resolveSealedTotalDue(scheduleMap.get(e.id), klass.tuitionFee, klass.course.price);
        const paidAmount = paidMap.get(e.id) ?? 0;
        return {
          enrollmentId: e.id, studentId: e.studentId,
          studentCode: e.student.studentCode, firstName: e.student.firstName, lastName: e.student.lastName,
          enrollmentStatus: e.status, finalDecisionNote: e.finalDecisionNote,
          totalDue, paidAmount, remainingAmount: Math.max(0, totalDue - paidAmount),
        };
      });
      const totalDue = enrollments.reduce((s, e) => s + e.totalDue, 0);
      const totalPaid = enrollments.reduce((s, e) => s + e.paidAmount, 0);
      return {
        classId: klass.id, className: klass.name, schedule: klass.schedule,
        courseTitle: klass.course.title, courseCode: klass.course.code,
        teacherName: klass.teacher ? `${klass.teacher.firstName} ${klass.teacher.lastName}` : null,
        status: klass.status, academicYear: year,
        studentCount: enrollments.length, totalDue, totalPaid,
        remainingAmount: Math.max(0, totalDue - totalPaid), enrollments,
      };
    });
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error("[getArchivedClassesOverview] Echec :", error);
    return [];
  }
}

async function buildSealedMaps(organizationId: string, ids: string[]): Promise<{ sched: Map<string, number>; paid: Map<string, number> }> {
  const sched = new Map<string, number>();
  const paid = new Map<string, number>();
  if (ids.length === 0) return { sched, paid };
  const [schedRows, paidRows] = await Promise.all([
    prisma.paymentSchedule.findMany({
      where: { organizationId, enrollmentId: { in: ids } },
      orderBy: { createdAt: "desc" },
      select: { enrollmentId: true, totalAmount: true },
    }),
    prisma.payment.groupBy({
      by: ["enrollmentId"],
      where: { organizationId, enrollmentId: { in: ids }, status: "COMPLETED", isVoided: false },
      _sum: { amount: true },
    }),
  ]);
  for (const r of schedRows) {
    if (r.enrollmentId && !sched.has(r.enrollmentId)) sched.set(r.enrollmentId, r.totalAmount);
  }
  for (const r of paidRows) {
    if (r.enrollmentId) paid.set(r.enrollmentId, r._sum.amount ?? 0);
  }
  return { sched, paid };
}

export async function searchArchives(query: string, academicYear?: string): Promise<ArchiveSearchResultDTO> {
  const q = query.trim();
  const empty: ArchiveSearchResultDTO = { students: [], classes: [] };
  if (q.length < 2) return empty;
  const organizationId = await getOrganizationIdLenient();
  if (!organizationId) return empty;
  try {
    const user = await getCurrentSessionUser().catch(() => null);
    if (user && !ARCHIVES_ALLOWED_ROLES.has(user.role)) return empty;
    const year = academicYear?.trim() || null;
    const enrollFilter = year ? { organizationId, academicYear: year } : { organizationId };
    const matchedStudents = await prisma.student.findMany({
      where: {
        organizationId,
        OR: [
          { firstName: { contains: q, mode: "insensitive" as const } },
          { lastName: { contains: q, mode: "insensitive" as const } },
          { studentCode: { contains: q, mode: "insensitive" as const } },
        ],
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 15,
      select: {
        id: true, studentCode: true, firstName: true, lastName: true,
        classEnrollments: {
          where: { ...enrollFilter, class: { organizationId, status: { in: CLOSED_CLASS_STATUSES } } },
          orderBy: { academicYear: "desc" },
          select: {
            id: true, classId: true, academicYear: true, status: true,
            class: { select: { name: true, tuitionFee: true, course: { select: { title: true, price: true } } } },
          },
        },
      },
    });
    const ids = matchedStudents.flatMap((s) => s.classEnrollments.map((e) => e.id));
    const { sched, paid } = await buildSealedMaps(organizationId, ids);
    const students = matchedStudents
      .filter((s) => s.classEnrollments.length > 0)
      .map((s) => ({
        studentId: s.id, studentCode: s.studentCode, firstName: s.firstName, lastName: s.lastName,
        enrollments: s.classEnrollments.map((e) => {
          const totalDue = resolveSealedTotalDue(sched.get(e.id), e.class.tuitionFee, e.class.course.price);
          const paidAmount = paid.get(e.id) ?? 0;
          return {
            enrollmentId: e.id, classId: e.classId, className: e.class.name,
            courseTitle: e.class.course.title, academicYear: e.academicYear, enrollmentStatus: e.status,
            totalDue, paidAmount, remainingAmount: Math.max(0, totalDue - paidAmount),
          };
        }),
      }));
    const matchedClasses = await prisma.class.findMany({
      where: {
        organizationId, status: { in: CLOSED_CLASS_STATUSES },
        enrollments: { some: enrollFilter },
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { course: { title: { contains: q, mode: "insensitive" as const } } },
        ],
      },
      orderBy: [{ name: "asc" }],
      take: 10,
      select: { id: true },
    });
    const classes: ArchivedClassDTO[] = [];
    if (year) {
      const overview = await getArchivedClassesOverview(year);
      const wanted = new Set(matchedClasses.map((c) => c.id));
      for (const c of overview) if (wanted.has(c.classId)) classes.push(c);
    } else {
      for (const m of matchedClasses) {
        const perClass = await getArchivedClassesForClassId(organizationId, m.id);
        classes.push(...perClass);
      }
    }
    return { students, classes };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error("[searchArchives] Echec :", error);
    return { students: [], classes: [] };
  }
}
async function getArchivedClassesForClassId(organizationId: string, classId: string): Promise<ArchivedClassDTO[]> {
  const klass = await prisma.class.findFirst({
    where: { id: classId, organizationId, status: { in: CLOSED_CLASS_STATUSES } },
    select: {
      id: true, name: true, schedule: true, tuitionFee: true, status: true,
      course: { select: { title: true, code: true, price: true } },
      teacher: { select: { firstName: true, lastName: true } },
      enrollments: {
        where: { organizationId },
        orderBy: [{ academicYear: "desc" }],
        select: {
          id: true, academicYear: true, status: true, finalDecisionNote: true, studentId: true,
          student: { select: { studentCode: true, firstName: true, lastName: true } },
        },
      },
    },
  });
  if (!klass || klass.enrollments.length === 0) return [];
  const { sched, paid } = await buildSealedMaps(organizationId, klass.enrollments.map((e) => e.id));
  const byYear = new Map<string, typeof klass.enrollments>();
  for (const e of klass.enrollments) {
    const list = byYear.get(e.academicYear) ?? [];
    list.push(e);
    byYear.set(e.academicYear, list);
  }
  return [...byYear.entries()].map(([academicYear, rows]) => {
    const enrollments: ArchivedClassEnrollmentDTO[] = rows.map((e) => {
      const totalDue = resolveSealedTotalDue(sched.get(e.id), klass.tuitionFee, klass.course.price);
      const paidAmount = paid.get(e.id) ?? 0;
      return {
        enrollmentId: e.id, studentId: e.studentId,
        studentCode: e.student.studentCode, firstName: e.student.firstName, lastName: e.student.lastName,
        enrollmentStatus: e.status, finalDecisionNote: e.finalDecisionNote,
        totalDue, paidAmount, remainingAmount: Math.max(0, totalDue - paidAmount),
      };
    });
    const totalDue = enrollments.reduce((s, e) => s + e.totalDue, 0);
    const totalPaid = enrollments.reduce((s, e) => s + e.paidAmount, 0);
    return {
      classId: klass.id, className: klass.name, schedule: klass.schedule,
      courseTitle: klass.course.title, courseCode: klass.course.code,
      teacherName: klass.teacher ? `${klass.teacher.firstName} ${klass.teacher.lastName}` : null,
      status: klass.status, academicYear,
      studentCount: enrollments.length, totalDue, totalPaid,
      remainingAmount: Math.max(0, totalDue - totalPaid), enrollments,
    };
  });
}
export async function getArchiveEnrollmentDetail(enrollmentId: string): Promise<ArchiveEnrollmentDetailDTO> {
  const organizationId = await assertCanReadArchives();
  const enrollment = await prisma.classEnrollment.findFirst({
    where: { id: enrollmentId, organizationId, class: { organizationId, status: { in: CLOSED_CLASS_STATUSES } } },
    select: {
      id: true, academicYear: true, status: true, finalDecisionNote: true, enrolledAt: true,
      studentId: true, classId: true,
      student: { select: { id: true, studentCode: true, firstName: true, lastName: true, phone: true } },
      class: {
        select: {
          id: true, name: true, schedule: true, status: true, tuitionFee: true,
          course: { select: { title: true, code: true, price: true } },
          teacher: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });
  if (!enrollment) throw new Error("Archive introuvable.");
  const schedule = await prisma.paymentSchedule.findFirst({
    where: { organizationId, enrollmentId: enrollment.id },
    orderBy: { createdAt: "desc" },
    select: { totalAmount: true },
  });
  const payments = await prisma.payment.findMany({
    where: { organizationId, enrollmentId: enrollment.id },
    orderBy: { paidAt: "desc" },
    select: { id: true, amount: true, paymentMethod: true, status: true, reference: true, description: true, paidAt: true },
  });
  const grades = await prisma.grade.findMany({
    where: { enrollmentId: enrollment.id, studentId: enrollment.studentId },
    select: {
      score: true, passMark: true, status: true,
      evaluationModule: {
        select: { name: true, maxScore: true, passingScore: true, evaluation: { select: { title: true } } },
      },
    },
  });
  const history = await prisma.classEnrollment.findMany({
    where: {
      organizationId, studentId: enrollment.studentId, NOT: { id: enrollment.id },
      class: { organizationId, status: { in: CLOSED_CLASS_STATUSES } },
    },
    orderBy: { academicYear: "desc" },
    select: { id: true, academicYear: true, status: true, class: { select: { name: true, course: { select: { title: true } } } } },
  });
  const totalDue = resolveSealedTotalDue(schedule?.totalAmount, enrollment.class.tuitionFee, enrollment.class.course.price);
  const paidAmount = payments.filter((p) => p.status === "COMPLETED").reduce((s, p) => s + p.amount, 0);
  const modules = grades.map((g) => ({
    evaluationTitle: g.evaluationModule.evaluation.title,
    moduleName: g.evaluationModule.name,
    score: g.score, maxScore: g.evaluationModule.maxScore,
    passMark: g.passMark ?? g.evaluationModule.passingScore, status: g.status,
  }));
  const graded = modules.filter((m) => m.score !== null);
  const validated = modules.filter((m) => m.status === "VALIDATED").length;
  const totalMax = graded.reduce((s, m) => s + m.maxScore, 0);
  const totalScore = graded.reduce((s, m) => s + (m.score ?? 0), 0);
  return {
    enrollmentId: enrollment.id, academicYear: enrollment.academicYear,
    enrollmentStatus: enrollment.status, finalDecisionNote: enrollment.finalDecisionNote,
    enrolledAt: enrollment.enrolledAt,
    student: { id: enrollment.student.id, studentCode: enrollment.student.studentCode, firstName: enrollment.student.firstName, lastName: enrollment.student.lastName, phone: enrollment.student.phone },
    class: { id: enrollment.class.id, name: enrollment.class.name, schedule: enrollment.class.schedule, status: enrollment.class.status, courseTitle: enrollment.class.course.title, courseCode: enrollment.class.course.code, teacherName: enrollment.class.teacher ? `${enrollment.class.teacher.firstName} ${enrollment.class.teacher.lastName}` : null },
    finance: { totalDue, paidAmount, remainingAmount: Math.max(0, totalDue - paidAmount), payments },
    bulletin: {
      modules,
      average: graded.length > 0 && totalMax > 0 ? Math.round((totalScore / totalMax) * 1000) / 10 : null,
      validationRate: graded.length > 0 ? Math.round((validated / graded.length) * 1000) / 10 : null,
    },
    history: history.map((h) => ({ enrollmentId: h.id, className: h.class.name, courseTitle: h.class.course.title, academicYear: h.academicYear, enrollmentStatus: h.status })),
  };
}



import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getStudentAttendanceHistory } from "@/actions/attendance";
import StudentReportView from "@/components/reports/student-report-view";

export default async function StudentReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const student = await prisma.student.findFirst({
    where: { publicReportToken: token },
    select: {
      id: true,
      organizationId: true,
      studentCode: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      status: true,
      netAmount: true,
      isSelfFinanced: true,
      parentName: true,
      parentRelation: true,
      parentPhone1: true,
      parentPhone2: true,
      currentClass: { select: { name: true } },
      travelProcedures: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { status: true },
      },
    },
  });

  if (!student) notFound();

  const organization = await prisma.organization.findFirst({
    where: { id: student.organizationId },
    select: { name: true },
  });

  if (!organization) notFound();

  const studentId = student.id;
  const organizationId = student.organizationId;

  const [attendanceEntries, payments, academicRecord] = await Promise.all([
    getStudentAttendanceHistory(studentId),
    prisma.payment.findMany({
      where: { studentId, organizationId, status: "COMPLETED" },
      select: { amount: true },
    }),
    prisma.evaluation.findMany({
      where: { organizationId, class: { enrollments: { some: { studentId } } } },
      include: { modules: { include: { grades: { where: { studentId } } } } },
      orderBy: { date: "desc" },
    }),
  ]);

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const balance = student.netAmount != null ? Math.max(0, student.netAmount - totalPaid) : 0;

  const attendanceCounts = {
    total: attendanceEntries.length,
    present: attendanceEntries.filter((e) => e.status === "PRESENT").length,
    late: attendanceEntries.filter((e) => e.status === "LATE").length,
    absent: attendanceEntries.filter((e) => e.status === "ABSENT").length,
    excused: attendanceEntries.filter((e) => e.status === "EXCUSED").length,
  };

  const grades = academicRecord.flatMap((ev) =>
    ev.modules.flatMap((mod) =>
      mod.grades.map((g) => ({ module: mod.name, score: g.score, maxScore: mod.maxScore }))
    )
  );

  const travelStatus = student.travelProcedures[0]?.status ?? null;

  const studentData = {
    studentCode: student.studentCode,
    firstName: student.firstName,
    lastName: student.lastName,
    email: student.email,
    phone: student.phone,
    status: student.status,
    netAmount: student.netAmount,
    isSelfFinanced: student.isSelfFinanced,
    parentName: student.parentName,
    parentRelation: student.parentRelation,
    parentPhone1: student.parentPhone1,
    parentPhone2: student.parentPhone2,
    currentClassName: student.currentClass?.name ?? null,
  };

  const generatedAt = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  const parentLink = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/reports/student/${token}`;

  return (
    <StudentReportView
      student={studentData}
      attendanceSummary={attendanceCounts}
      attendanceHistory={attendanceEntries.map((e) => ({
        ...e,
        dateFormatted: new Date(e.date).toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }),
      }))}
      totalPaid={totalPaid}
      balance={balance}
      grades={grades}
      travelStatus={travelStatus ? travelStatus.replace(/_/g, " ") : null}
      organizationName={organization.name}
      generatedAt={generatedAt}
      parentLink={parentLink}
    />
  );
}
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getStudentAttendanceHistory } from "@/actions/attendance";
import { getStudentDetail } from "@/actions/students";
import StudentReportView from "@/components/reports/student-report-view";
import { generateStudentReportPDF } from "@/lib/student-report-pdf";
import { pdf } from "@react-pdf/renderer";

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
      currentCourse: { select: { title: true } },
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

  const [attendanceEntries, payments, academicRecord] = await Promise.all([
    getStudentAttendanceHistory(student.id),
    prisma.payment.findMany({
      where: { studentId: student.id, organizationId: student.organizationId, status: "COMPLETED" },
      select: { amount: true },
    }),
    prisma.evaluation.findMany({
      where: { organizationId: student.organizationId, studentId: student.id },
      include: { grades: { where: { studentId: student.id } }, module: { select: { name: true } } },
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

  const recentAttendance = attendanceEntries.slice(0, 10).map((e) => ({
    date: new Date(e.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }),
    status: e.status,
    course: e.courseTitle,
  }));

  const grades = academicRecord.flatMap((ev) =>
    ev.grades.map((g) => ({ module: ev.module.name, score: g.score, maxScore: ev.maxScore }))
  );

  const travelStatus = student.travelProcedures[0]?.status ?? null;

  const url = new URL(request?.url ?? "");
  if (url.searchParams.get("format") === "pdf") {
    const pdfBlob = await pdf(
      generateStudentReportPDF({
        student: {
          lastName: student.lastName, firstName: student.firstName, studentCode: student.studentCode,
          email: student.email, phone: student.phone, status: student.status, netAmount: student.netAmount,
        },
        attendanceSummary: attendanceCounts,
        attendanceHistory: recentAttendance,
        totalPaid,
        balance,
        grades,
        travelStatus: travelStatus ? travelStatus.replace(/_/g, " ") : null,
        organizationName: organization.name,
        generatedAt: new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }),
      })
    ).then((b) => b);

    return new Response(pdfBlob, {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="rapport-${student.studentCode}.pdf"` },
    });
  }

  return (
    <StudentReportView
      student={{
        id: student.id, studentCode: student.studentCode, firstName: student.firstName, lastName: student.lastName,
        email: student.email, phone: student.phone, status: student.status, netAmount: student.netAmount,
        isSelfFinanced: student.isSelfFinanced, parentName: student.parentName, parentRelation: student.parentRelation,
        parentPhone1: student.parentPhone1, parentPhone2: student.parentPhone2,
        currentClassName: student.currentClass?.name ?? null, currentCourseTitle: student.currentCourse?.title ?? null,
      }}
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
      generatedAt={new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}
    />
  );
}
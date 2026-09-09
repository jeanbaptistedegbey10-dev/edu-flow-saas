import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStudentAttendanceHistory } from "@/actions/attendance";
import { generateStudentReportPDF } from "@/lib/student-report-pdf";
import { pdf } from "@react-pdf/renderer";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const url = new URL(request.url);

  if (url.searchParams.get("format") !== "pdf") {
    return NextResponse.json({ error: "Format non supporté" }, { status: 400 });
  }

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
      travelProcedures: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { status: true },
      },
    },
  });

  if (!student) {
    return NextResponse.json({ error: "Étudiant introuvable" }, { status: 404 });
  }

  const organization = await prisma.organization.findFirst({
    where: { id: student.organizationId },
    select: { name: true },
  });

  if (!organization) {
    return NextResponse.json({ error: "Organisation introuvable" }, { status: 404 });
  }

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
  const generatedAt = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });

  const pdfInstance = pdf(
    generateStudentReportPDF({
      student: {
        lastName: student.lastName, firstName: student.firstName, studentCode: student.studentCode,
        email: student.email, phone: student.phone, status: student.status, netAmount: student.netAmount,
        isSelfFinanced: student.isSelfFinanced, parentName: student.parentName,
        parentRelation: student.parentRelation, parentPhone1: student.parentPhone1,
      },
      attendanceSummary: attendanceCounts,
      totalPaid,
      balance,
      grades,
      travelStatus: travelStatus ? travelStatus.replace(/_/g, " ") : null,
      organizationName: organization.name,
      generatedAt,
    })
  );

  const pdfBlob = await pdfInstance.toBlob();

  return new NextResponse(pdfBlob, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="rapport-${student.studentCode}.pdf"`,
    },
  });
}

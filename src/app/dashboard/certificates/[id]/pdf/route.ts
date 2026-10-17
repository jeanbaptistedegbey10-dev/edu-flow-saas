import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { getAcademicYear } from "@/lib/certificate-context";
import { generateCertificatePDF } from "@/lib/certificate-pdf";
import { pdf } from "@react-pdf/renderer";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(request.url);

  if (url.searchParams.get("format") !== "pdf") {
    return NextResponse.json({ error: "Format non supporté" }, { status: 400 });
  }

  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const certificate = await prisma.certificate.findFirst({
    where: { id: id },
    include: {
      student: {
        select: {
          firstName: true,
          lastName: true,
          studentCode: true,
          dateOfBirth: true,
        },
      },
      course: {
        select: {
          title: true,
        },
      },
      organization: {
        select: {
          name: true,
          address: true,
          city: true,
          phone: true,
          email: true,
          website: true,
          logoUrl: true,
          rccm: true,
          ifu: true,
          certificateTemplate: true,
          certificateTextTemplate: true,
        },
      },
    },
  });

  if (!certificate) {
    return NextResponse.json({ error: "Certificat introuvable" }, { status: 404 });
  }

  // Vérifier que l'utilisateur appartient à l'organisation du certificat
  // (`User.organizationId` — il n'existe pas de table de membres séparée).
  const sessionUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { organizationId: true },
  });

  if (!sessionUser || sessionUser.organizationId !== certificate.organizationId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const verificationUrl = `${url.origin}/verify/${certificate.verificationCode}`;

  const pdfInstance = pdf(
    generateCertificatePDF({
      studentName: `${certificate.student.firstName} ${certificate.student.lastName}`,
      studentCode: certificate.student.studentCode,
      birthDate: certificate.student.dateOfBirth,
      level: certificate.level,
      score: certificate.score,
      issueDate: certificate.issueDate,
      verificationCode: certificate.verificationCode,
      verificationUrl,
      organizationName: certificate.organization.name,
      organizationAddress: certificate.organization.address,
      organizationCity: certificate.organization.city,
      organizationPhone: certificate.organization.phone,
      organizationEmail: certificate.organization.email,
      organizationWebsite: certificate.organization.website,
      organizationLogoUrl: certificate.organization.logoUrl,
      organizationRccm: certificate.organization.rccm,
      organizationIfu: certificate.organization.ifu,
      courseTitle: certificate.course?.title ?? null,
      certificateTextTemplate: certificate.organization.certificateTextTemplate,
    })
  );

  const pdfBlob = await pdfInstance.toBlob();

  return new NextResponse(pdfBlob, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="certificat-${certificate.student.studentCode}.pdf"`,
    },
  });
}

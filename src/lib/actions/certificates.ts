"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import {
  getCurrentOrganizationId,
  getCurrentSessionUser,
  isNextRedirectError,
} from "@/lib/session";
import { assertCanMutate } from "@/lib/license-check";
import { logAuditEvent } from "@/lib/actions/audit";
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from "@/lib/audit-constants";

// --------------------------------------
// Types publics
// --------------------------------------

export type CertificateDTO = {
  id: string;
  studentId: string;
  studentName: string;
  courseId: string | null;
  courseTitle: string | null;
  level: string;
  score: number | null;
  issueDate: Date;
  verificationCode: string;
  revoked: boolean;
};

export type CertificateVerificationData = {
  valid: boolean;
  revoked?: boolean;
  certificate?: {
    studentName: string;
    level: string;
    score: number | null;
    issueDate: Date;
    courseTitle: string | null;
    organizationName: string;
  };
};

export type CertificateMutationResult =
  | { ok: true; certificate: CertificateDTO; verificationUrl: string }
  | { ok: false; message: string };

// --------------------------------------
// Helpers
// --------------------------------------

/** Génère un code de vérification court et unique (8 caractères hex). */
function generateVerificationCode(): string {
  return randomBytes(4).toString("hex").toUpperCase();
}

/** Construit l'URL publique de vérification d'un certificat. */
function buildVerificationUrl(code: string): string {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";
  return `${baseUrl}/verify/${code}`;
}

// --------------------------------------
// Server Actions — Certificats
// --------------------------------------

/**
 * Génère un certificat sécurisé pour un étudiant avec son code de vérification.
 */
export async function generateCertificate(
  studentId: string,
  courseId: string | null,
  level: string,
  score?: number
): Promise<CertificateMutationResult> {
  try {
    await assertCanMutate();
    const organizationId = await getCurrentOrganizationId();
    const user = await getCurrentSessionUser();

    // Vérifie que l'étudiant appartient à l'organisation
    const student = await prisma.student.findFirst({
      where: { id: studentId, organizationId },
      select: { id: true, firstName: true, lastName: true },
    });

    if (!student) {
      return { ok: false, message: "Étudiant introuvable." };
    }

    // Vérifie le cours si fourni
    if (courseId) {
      const course = await prisma.course.findFirst({
        where: { id: courseId, organizationId },
        select: { id: true },
      });
      if (!course) {
        return { ok: false, message: "Cours introuvable." };
      }
    }

    const trimmedLevel = level.trim();
    if (!trimmedLevel) {
      return { ok: false, message: "Le niveau est requis." };
    }

    if (trimmedLevel.length > 100) {
      return { ok: false, message: "Le niveau ne doit pas dépasser 100 caractères." };
    }

    // Validation de la note
    if (score !== undefined && (score < 0 || score > 100)) {
      return { ok: false, message: "La note doit être comprise entre 0 et 100." };
    }

    // Génère un code unique (réessaie en cas de collision)
    let verificationCode = generateVerificationCode();
    const MAX_ATTEMPTS = 5;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const existing = await prisma.certificate.findUnique({
        where: { verificationCode },
        select: { id: true },
      });
      if (!existing) break;
      verificationCode = generateVerificationCode();
    }

    const certificate = await prisma.certificate.create({
      data: {
        organizationId,
        studentId,
        courseId: courseId || null,
        level: trimmedLevel,
        score: score ?? null,
        verificationCode,
        createdById: user.id,
      },
    });

    const dto: CertificateDTO = {
      id: certificate.id,
      studentId: certificate.studentId,
      studentName: `${student.firstName} ${student.lastName}`,
      courseId: certificate.courseId,
      courseTitle: null,
      level: certificate.level,
      score: certificate.score,
      issueDate: certificate.issueDate,
      verificationCode: certificate.verificationCode,
      revoked: certificate.revoked,
    };

    revalidatePath("/dashboard/certificates");

    // Journal d'audit : émission de certificat
    await logAuditEvent({
      action: AUDIT_ACTIONS.CERTIFICATE_ISSUED,
      entity: AUDIT_ENTITIES.CERTIFICATE,
      entityId: certificate.id,
      details: { level: certificate.level, score: certificate.score ?? null },
    });

    return {
      ok: true,
      certificate: dto,
      verificationUrl: buildVerificationUrl(verificationCode),
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error("[generateCertificate] Échec :", error);
    return {
      ok: false,
      message: "Une erreur est survenue lors de la génération du certificat.",
    };
  }
}

/**
 * Récupère les données de vérification d'un certificat par son code.
 * Action publique — pas d'authentification requise.
 */
export async function getCertificateVerificationData(
  code: string
): Promise<CertificateVerificationData> {
  try {
    const certificate = await prisma.certificate.findUnique({
      where: { verificationCode: code },
      select: {
        level: true,
        score: true,
        issueDate: true,
        revoked: true,
        revokedReason: true,
        student: {
          select: {
            firstName: true,
            lastName: true,
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
          },
        },
      },
    });

    if (!certificate) {
      return { valid: false };
    }

    return {
      valid: true,
      revoked: certificate.revoked,
      certificate: {
        studentName: `${certificate.student.firstName} ${certificate.student.lastName}`,
        level: certificate.level,
        score: certificate.score,
        issueDate: certificate.issueDate,
        courseTitle: certificate.course?.title ?? null,
        organizationName: certificate.organization.name,
      },
    };
  } catch (error) {
    console.error("[getCertificateVerificationData] Échec :", error);
    return { valid: false };
  }
}

/**
 * Récupère tous les certificats de l'organisation.
 */
export async function getCertificates(): Promise<CertificateDTO[]> {
  try {
    const organizationId = await getCurrentOrganizationId();

    const certificates = await prisma.certificate.findMany({
      where: { organizationId },
      orderBy: { issueDate: "desc" },
      select: {
        id: true,
        studentId: true,
        level: true,
        score: true,
        issueDate: true,
        verificationCode: true,
        revoked: true,
        courseId: true,
        student: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        course: {
          select: {
            title: true,
          },
        },
      },
    });

    return certificates.map((cert) => ({
      id: cert.id,
      studentId: cert.studentId,
      studentName: `${cert.student.firstName} ${cert.student.lastName}`,
      courseId: cert.courseId,
      courseTitle: cert.course?.title ?? null,
      level: cert.level,
      score: cert.score,
      issueDate: cert.issueDate,
      verificationCode: cert.verificationCode,
      revoked: cert.revoked,
    }));
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error("[getCertificates] Échec :", error);
    return [];
  }
}

/**
 * Révoque un certificat (annulation / invalidation).
 */
export async function revokeCertificate(
  certificateId: string,
  reason?: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await assertCanMutate();
    const organizationId = await getCurrentOrganizationId();

    const certificate = await prisma.certificate.findFirst({
      where: { id: certificateId, organizationId },
      select: { id: true },
    });

    if (!certificate) {
      return { ok: false, message: "Certificat introuvable." };
    }

    await prisma.certificate.update({
      where: { id: certificateId },
      data: {
        revoked: true,
        revokedReason: reason?.trim() || null,
      },
    });

    revalidatePath("/dashboard/certificates");

    // Journal d'audit : révocation de certificat
    await logAuditEvent({
      action: AUDIT_ACTIONS.CERTIFICATE_REVOKED,
      entity: AUDIT_ENTITIES.CERTIFICATE,
      entityId: certificateId,
      details: { reason: reason?.trim() ?? null },
    });

    return { ok: true };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error("[revokeCertificate] Échec :", error);
    return {
      ok: false,
      message: "Une erreur est survenue lors de la révocation.",
    };
  }
}

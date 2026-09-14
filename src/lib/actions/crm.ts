"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { LEAD_STAGE_LABELS, LOST_REASON_LABELS } from "@/lib/crm-constants";
import type { LeadStage, LostReason } from "@prisma/client";
import {
  getCurrentOrganizationId,
  getCurrentSessionUser,
  isNextRedirectError,
} from "@/lib/session";
import { assertCanMutate } from "@/lib/license-check";

// --------------------------------------
// Types publics
// --------------------------------------
//
// Note : les constantes LEAD_STAGE_LABELS / LEAD_STAGE_ORDER /
// LEAD_SOURCE_LABELS / LEAD_SOURCE_OPTIONS / LOST_REASON_LABELS /
// LOST_REASON_OPTIONS vivent dans `@/lib/crm-constants` (module SANS
// « use server ») car Next.js interdit d'exporter des objets depuis un
// fichier « use server ». Les composants clients les importent depuis
// `@/lib/crm-constants`, les fonctions ci-dessous depuis ce fichier.

export type CrmMutationResult =
  | { ok: true; message?: string }
  | { ok: false; message: string };

export type LeadNoteDTO = {
  id: string;
  content: string;
  createdAt: Date;
  createdByName: string;
};

// --------------------------------------
// Server Actions — Pipeline CRM
// --------------------------------------

/**
 * Change l'étape du pipeline d'un prospect.
 * Si l'étape est ENROLLED, convertit automatiquement le statut étudiant.
 * Si l'étape est LOST, un motif de perte est requis.
 */
export async function updateLeadStage(
  studentId: string,
  stage: LeadStage,
  lostReason?: LostReason
): Promise<CrmMutationResult> {
  try {
    await assertCanMutate();
    const organizationId = await getCurrentOrganizationId();
    const user = await getCurrentSessionUser();

    const student = await prisma.student.findFirst({
      where: { id: studentId, organizationId },
      select: { id: true },
    });

    if (!student) {
      return { ok: false, message: "Prospect introuvable." };
    }

    if (stage === "LOST" && !lostReason) {
      return {
        ok: false,
        message: "Un motif de perte est requis pour marquer un prospect comme perdu.",
      };
    }

    const updateData: {
      leadStage: LeadStage;
      lostReason: LostReason | null;
      convertedAt?: Date;
      status?: "ENROLLED";
    } = {
      leadStage: stage,
      lostReason: stage === "LOST" ? lostReason ?? null : null,
    };

    if (stage === "ENROLLED") {
      updateData.status = "ENROLLED";
      updateData.convertedAt = new Date();
    }

    await prisma.student.update({
      where: { id: studentId },
      data: updateData,
    });

    const stageLabel = LEAD_STAGE_LABELS[stage];
    const noteContent =
      stage === "LOST"
        ? `Étape changée en « ${stageLabel} » — Motif : ${LOST_REASON_LABELS[lostReason!]}`
        : `Étape changée en « ${stageLabel} »`;
    await prisma.leadNote.create({
      data: {
        organizationId,
        studentId,
        content: noteContent,
        createdById: user.id,
      },
    });

    revalidatePath("/dashboard/students");
    return { ok: true, message: "Étape mise à jour." };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error("[updateLeadStage] Échec :", error);
    return {
      ok: false,
      message: "Une erreur est survenue lors de la mise à jour.",
    };
  }
}

/**
 * Ajoute une note de suivi / relance à un prospect.
 */
export async function addLeadNote(
  studentId: string,
  note: string
): Promise<CrmMutationResult> {
  try {
    await assertCanMutate();
    const organizationId = await getCurrentOrganizationId();
    const user = await getCurrentSessionUser();

    const trimmed = note.trim();
    if (!trimmed) {
      return { ok: false, message: "La note ne peut pas être vide." };
    }

    if (trimmed.length > 1000) {
      return { ok: false, message: "La note ne doit pas dépasser 1000 caractères." };
    }

    const student = await prisma.student.findFirst({
      where: { id: studentId, organizationId },
      select: { id: true },
    });

    if (!student) {
      return { ok: false, message: "Prospect introuvable." };
    }

    await prisma.leadNote.create({
      data: {
        organizationId,
        studentId,
        content: trimmed,
        createdById: user.id,
      },
    });

    revalidatePath("/dashboard/students");
    return { ok: true, message: "Note ajoutée." };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error("[addLeadNote] Échec :", error);
    return {
      ok: false,
      message: "Une erreur est survenue lors de l'ajout de la note.",
    };
  }
}

/**
 * Convertit un prospect en étudiant inscrit en lui assignant une classe.
 */
export async function convertProspectToEnrolled(
  studentId: string,
  classId: string
): Promise<CrmMutationResult> {
  try {
    await assertCanMutate();
    const organizationId = await getCurrentOrganizationId();
    const user = await getCurrentSessionUser();

    const student = await prisma.student.findFirst({
      where: { id: studentId, organizationId },
      select: { id: true, status: true },
    });

    if (!student) {
      return { ok: false, message: "Prospect introuvable." };
    }

    const targetClass = await prisma.class.findFirst({
      where: { id: classId, organizationId },
      select: { id: true },
    });

    if (!targetClass) {
      return { ok: false, message: "Classe introuvable." };
    }

    await prisma.$transaction(async (tx) => {
      await tx.student.update({
        where: { id: studentId },
        data: {
          status: "ENROLLED",
          leadStage: "ENROLLED",
          currentClassId: classId,
          convertedAt: new Date(),
        },
      });

      await tx.classEnrollment.create({
        data: {
          organizationId,
          studentId,
          classId,
        },
      });

      await tx.leadNote.create({
        data: {
          organizationId,
          studentId,
          content: "✅ Prospect converti en étudiant inscrit.",
          createdById: user.id,
        },
      });
    });

    revalidatePath("/dashboard/students");
    return { ok: true, message: "Prospect converti en inscrit avec succès." };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error("[convertProspectToEnrolled] Échec :", error);
    return {
      ok: false,
      message: "Une erreur est survenue lors de la conversion.",
    };
  }
}

/**
 * Récupère les notes de suivi d'un prospect.
 */
export async function getLeadNotes(studentId: string): Promise<LeadNoteDTO[]> {
  try {
    const organizationId = await getCurrentOrganizationId();

    const notes = await prisma.leadNote.findMany({
      where: { studentId, organizationId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        content: true,
        createdAt: true,
        createdBy: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return notes.map((note) => ({
      id: note.id,
      content: note.content,
      createdAt: note.createdAt,
      createdByName: `${note.createdBy.firstName} ${note.createdBy.lastName}`,
    }));
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error("[getLeadNotes] Échec :", error);
    return [];
  }
}

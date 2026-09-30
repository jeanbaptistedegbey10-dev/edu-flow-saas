"use server";

import type { PaymentStatus, ScheduleItemStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import {
  getCurrentOrganizationId,
  isNextRedirectError,
} from "@/lib/session";
import { assertCanMutate } from "@/lib/license-check";

// --------------------------------------
// Types publics
// --------------------------------------

export type PaymentScheduleItemDTO = {
  id: string;
  installmentNumber: number;
  amount: number;
  dueDate: Date;
  status: ScheduleItemStatus;
  paidAmount: number;
  paidAt: Date | null;
};

export type PaymentScheduleDTO = {
  id: string;
  totalAmount: number;
  installmentsCount: number;
  startDate: Date;
  status: PaymentStatus;
  student: {
    id: string;
    studentCode: string;
    firstName: string;
    lastName: string;
  };
  items: PaymentScheduleItemDTO[];
};

export type OverdueScheduleDTO = {
  scheduleId: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  studentPhone: string | null;
  studentEmail: string | null;
  totalAmount: number;
  totalPaid: number;
  overdueAmount: number;
  overdueInstallments: number;
  oldestDueDate: Date | null;
};

export type GenerateScheduleResult =
  | { ok: true; schedule: PaymentScheduleDTO }
  | { ok: false; message: string };

export type ReconcileResult =
  | { ok: true; allocatedAmount: number; remainingAmount: number }
  | { ok: false; message: string };

// --------------------------------------
// Constantes
// --------------------------------------

/** Intervalle par défaut entre deux échéances (en jours). */
const DEFAULT_INSTALLMENT_INTERVAL_DAYS = 30;

// --------------------------------------
// Helpers internes
// --------------------------------------

function mapScheduleItem(item: {
  id: string;
  installmentNumber: number;
  amount: number;
  dueDate: Date;
  status: ScheduleItemStatus;
  paidAmount: number;
  paidAt: Date | null;
}): PaymentScheduleItemDTO {
  return {
    id: item.id,
    installmentNumber: item.installmentNumber,
    amount: item.amount,
    dueDate: item.dueDate,
    status: item.status,
    paidAmount: item.paidAmount,
    paidAt: item.paidAt,
  };
}

function mapSchedule(schedule: {
  id: string;
  totalAmount: number;
  installmentsCount: number;
  startDate: Date;
  status: PaymentStatus;
  student: {
    id: string;
    studentCode: string;
    firstName: string;
    lastName: string;
  };
  items: Array<{
    id: string;
    installmentNumber: number;
    amount: number;
    dueDate: Date;
    status: ScheduleItemStatus;
    paidAmount: number;
    paidAt: Date | null;
  }>;
}): PaymentScheduleDTO {
  return {
    id: schedule.id,
    totalAmount: schedule.totalAmount,
    installmentsCount: schedule.installmentsCount,
    startDate: schedule.startDate,
    status: schedule.status,
    student: schedule.student,
    items: schedule.items.map(mapScheduleItem),
  };
}

/**
 * Rafraîchit le statut des échéances échues (OVERDUE) de l'organisation.
 *
 * SÉCURITÉ — cette fonction n'est PAS exportée volontairement. Dans un
 * fichier « use server », tout export devient un endpoint HTTP appelable
 * depuis le client ; une signature prenant `organizationId` aurait permis
 * à n'importe quel utilisateur authentifié de recalculer les échéances
 * d'un autre établissement (écriture cross-tenant). Elle dérive désormais
 * l'organisation de la session et reste un utilitaire interne au module.
 *
 * @returns le nombre d'échéances passées en OVERDUE.
 */
async function refreshOverdueStatus(): Promise<number> {
  const organizationId = await getCurrentOrganizationId();

  const now = new Date();
  const result = await prisma.paymentScheduleItem.updateMany({
    where: {
      schedule: { organizationId },
      status: { in: ["PENDING", "PARTIAL"] },
      dueDate: { lt: now },
    },
    data: { status: "OVERDUE" },
  });
  return result.count;
}

/**
 * Crée un échéancier de paiement en N tranches pour un étudiant.
 * Chaque tranche est espacée de 30 jours par défaut.
 */
export async function generatePaymentSchedule(
  studentId: string,
  totalAmount: number,
  installmentsCount: number,
  startDate: Date
): Promise<GenerateScheduleResult> {
  await assertCanMutate();

  if (!studentId) {
    return { ok: false, message: "Identifiant de l'étudiant manquant." };
  }
  if (totalAmount <= 0) {
    return { ok: false, message: "Le montant total doit être supérieur à zéro." };
  }
  if (installmentsCount < 1 || installmentsCount > 12) {
    return {
      ok: false,
      message: "Le nombre de tranches doit être compris entre 1 et 12.",
    };
  }

  const organizationId = await getCurrentOrganizationId();

  try {
    // Vérifie que l'étudiant appartient à l'organisation
    const student = await prisma.student.findFirst({
      where: { id: studentId, organizationId },
      select: { id: true },
    });

    if (!student) {
      return { ok: false, message: "Étudiant introuvable dans votre organisation." };
    }

    // Calcule le montant par tranche (dernière tranche = reste)
    const baseAmount = Math.floor(totalAmount / installmentsCount);
    const remainder = totalAmount - baseAmount * (installmentsCount - 1);

    const items = Array.from({ length: installmentsCount }, (_, i) => {
      const installmentNumber = i + 1;
      const amount = i === installmentsCount - 1 ? remainder : baseAmount;
      const dueDate = new Date(startDate);
      dueDate.setDate(dueDate.getDate() + i * DEFAULT_INSTALLMENT_INTERVAL_DAYS);
      return { installmentNumber, amount, dueDate, status: "PENDING" as ScheduleItemStatus };
    });

    const schedule = await prisma.paymentSchedule.create({
      data: {
        organizationId,
        studentId,
        totalAmount,
        installmentsCount,
        startDate,
        status: "PENDING",
        items: { create: items },
      },
      include: {
        student: {
          select: { id: true, studentCode: true, firstName: true, lastName: true },
        },
        items: { orderBy: { installmentNumber: "asc" } },
      },
    });

    revalidatePath("/dashboard/payments");
    revalidatePath(`/dashboard/students/${studentId}`);

    return { ok: true, schedule: mapSchedule(schedule) };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error("[generatePaymentSchedule] Échec :", error);
    return {
      ok: false,
      message: "Une erreur est survenue lors de la création de l'échéancier.",
    };
  }
}

/**
 * Ventile automatiquement un paiement sur la plus ancienne tranche impayée
 * de l'échéancier de l'étudiant.
 */
export async function reconcilePaymentWithSchedule(
  paymentId: string
): Promise<ReconcileResult> {
  if (!paymentId) {
    return { ok: false, message: "Identifiant du paiement manquant." };
  }

  const organizationId = await getCurrentOrganizationId();

  try {
    const payment = await prisma.payment.findFirst({
      where: { id: paymentId, organizationId },
      select: { id: true, studentId: true, amount: true },
    });

    if (!payment || !payment.studentId) {
      return {
        ok: false,
        message: "Paiement introuvable ou non rattaché à un étudiant.",
      };
    }

    // Récupère les tranches impayées (les plus anciennes en premier)
    const unpaidItems = await prisma.paymentScheduleItem.findMany({
      where: {
        schedule: { organizationId, studentId: payment.studentId },
        status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
      },
      orderBy: [{ dueDate: "asc" }, { installmentNumber: "asc" }],
    });

    if (unpaidItems.length === 0) {
      return {
        ok: false,
        message: "Aucune tranche impayée trouvée pour cet étudiant.",
      };
    }

    let remainingAmount = payment.amount;
    let allocatedAmount = 0;

    await prisma.$transaction(async (tx) => {
      for (const item of unpaidItems) {
        if (remainingAmount <= 0) break;

        const due = item.amount;
        const alreadyPaid = item.paidAmount;
        const balance = due - alreadyPaid;
        const toAllocate = Math.min(balance, remainingAmount);

        const newPaidAmount = alreadyPaid + toAllocate;
        const newStatus: ScheduleItemStatus =
          newPaidAmount >= due ? "PAID" : "PARTIAL";

        await tx.paymentScheduleItem.update({
          where: { id: item.id },
          data: {
            paidAmount: newPaidAmount,
            status: newStatus,
            paidAt: newStatus === "PAID" ? new Date() : item.paidAt,
          },
        });

        remainingAmount -= toAllocate;
        allocatedAmount += toAllocate;
      }

      // Met à jour le statut global de l'échéancier
      const scheduleId = unpaidItems[0].scheduleId;
      const allItems = await tx.paymentScheduleItem.findMany({
        where: { scheduleId },
        select: { status: true },
      });

      const allPaid = allItems.every((i) => i.status === "PAID");
      const globalStatus: PaymentStatus = allPaid ? "COMPLETED" : "PARTIAL";

      await tx.paymentSchedule.update({
        where: { id: scheduleId },
        data: { status: globalStatus },
      });
    });

    revalidatePath("/dashboard/payments");
    revalidatePath(`/dashboard/students/${payment.studentId}`);

    return { ok: true, allocatedAmount, remainingAmount };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error("[reconcilePaymentWithSchedule] Échec :", error);
    return {
      ok: false,
      message: "Une erreur est survenue lors de la ventilation du paiement.",
    };
  }
}

/**
 * Récupère la somme des échéances arrivées à terme (OVERDUE) pour l'organisation.
 * Met à jour les statuts avant la lecture.
 */
export async function getOverdueSchedules(): Promise<{
  overdueAmount: number;
  schedules: OverdueScheduleDTO[];
}> {
  const organizationId = await getCurrentOrganizationId();

  try {
    // Rafraîchit les statuts en amont (organisation dérivée de la session).
    await refreshOverdueStatus();

    // Récupère toutes les échéances en retard
    const overdueItems = await prisma.paymentScheduleItem.findMany({
      where: {
        schedule: { organizationId },
        status: "OVERDUE",
      },
      include: {
        schedule: {
          include: {
            student: {
              select: {
                id: true,
                studentCode: true,
                firstName: true,
                lastName: true,
                phone: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: { dueDate: "asc" },
    });

    // Regroupe par étudiant
    const byStudent = new Map<string, OverdueScheduleDTO>();
    let totalOverdue = 0;

    for (const item of overdueItems) {
      const student = item.schedule.student;
      const studentId = student.id;
      const existing = byStudent.get(studentId);

      if (existing) {
        existing.overdueAmount += item.amount - item.paidAmount;
        existing.overdueInstallments += 1;
        if (
          item.dueDate < (existing.oldestDueDate ?? item.dueDate)
        ) {
          existing.oldestDueDate = item.dueDate;
        }
        existing.totalPaid += item.paidAmount;
      } else {
        byStudent.set(studentId, {
          scheduleId: item.scheduleId,
          studentId,
          studentCode: student.studentCode,
          studentName: `${student.firstName} ${student.lastName}`,
          studentPhone: student.phone,
          studentEmail: student.email,
          totalAmount: item.schedule.totalAmount,
          totalPaid: item.paidAmount,
          overdueAmount: item.amount - item.paidAmount,
          overdueInstallments: 1,
          oldestDueDate: item.dueDate,
        });
      }

      totalOverdue += item.amount - item.paidAmount;
    }

    return {
      overdueAmount: totalOverdue,
      schedules: Array.from(byStudent.values()),
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error("[getOverdueSchedules] Échec :", error);
    return { overdueAmount: 0, schedules: [] };
  }
}

/**
 * Récupère les échéanciers d'un étudiant.
 */
export async function getStudentSchedules(
  studentId: string
): Promise<PaymentScheduleDTO[]> {
  const organizationId = await getCurrentOrganizationId();

  try {
    await refreshOverdueStatus();

    const schedules = await prisma.paymentSchedule.findMany({
      where: { organizationId, studentId },
      include: {
        student: {
          select: { id: true, studentCode: true, firstName: true, lastName: true },
        },
        items: { orderBy: { installmentNumber: "asc" } },
      },
      orderBy: { createdAt: "desc" },
    });

    return schedules.map(mapSchedule);
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error("[getStudentSchedules] Échec :", error);
    return [];
  }
}
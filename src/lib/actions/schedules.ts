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

/**
 * Ligne d'échéance enrichie pour le tableau de bord « Échéances ».
 * Regroupe le contexte étudiant + classe + cours + le reliquat exact dû.
 */
export type EcheanceRowDTO = {
  scheduleId: string;
  itemId: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  studentPhone: string | null;
  studentEmail: string | null;
  classId: string | null;
  className: string | null;
  courseId: string | null;
  courseTitle: string | null;
  installmentNumber: number;
  /** Montant dû de la tranche (FCFA). */
  amount: number;
  /** Montant déjà réglé sur la tranche (FCFA). */
  paidAmount: number;
  /** Reliquat exact restant dû = amount − paidAmount (FCFA). */
  remainingAmount: number;
  dueDate: Date;
  status: ScheduleItemStatus;
  /** Horodatage d'activation du décompte (null = en attente de démarrage de classe). */
  activatedAt: Date | null;
  paidAt: Date | null;
};

/** Regroupement fonctionnel d'une échéance pour l'affichage / les filtres. */
export type EcheanceBucket = "awaiting" | "upcoming" | "overdue" | "paid";

export type EcheanceFilter = {
  /** Filtre par classe (identifiant) ou « all ». */
  classId?: string;
  /** Filtre par étudiant (identifiant) ou « all ». */
  studentId?: string;
  /** Filtre par regroupement de statut ou « all ». */
  bucket?: EcheanceBucket | "all";
};

export type EcheancesDashboardDTO = {
  totals: {
    awaitingCount: number;
    upcomingCount: number;
    overdueCount: number;
    paidCount: number;
    /** Somme des reliquats des échéances en retard (FCFA). */
    overdueAmount: number;
    /** Somme des reliquats de toutes les échéances non soldées (FCFA). */
    totalRemaining: number;
  };
  rows: EcheanceRowDTO[];
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
 * RÈGLE MÉTIER — une tranche ne bascule en « en retard » que si son échéancier
 * est ACTIVÉ (`activatedAt` non nul), c'est-à-dire si l'étudiant est inscrit
 * dans une classe officiellement démarrée (ou s'il s'agit d'un échéancier
 * autonome activé d'emblée). Un échéancier en attente d'activation
 * (`activatedAt = null`) ne produit donc AUCUN retard, même si ses dates sont
 * dépassées.
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
      schedule: { organizationId, activatedAt: { not: null } },
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
 *
 * Échéancier AUTONOME (création manuelle) : activé d'emblée
 * (`activatedAt = startDate`), le décompte des retards part immédiatement.
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
        // Échéancier manuel : activé immédiatement (pas de classe rattachée).
        activatedAt: startDate,
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

// ============================================================================
// MODÈLES D'ÉCHÉANCIERS RÉUTILISABLES (Cours & Procédures voyage)
// ============================================================================
//
// Un « modèle » découpe par défaut un montant (frais de scolarité d'un cours ou
// coût d'une procédure voyage) en N tranches : nombre de tranches, montant de
// chaque tranche et intervalle/délai entre les tranches. Il est copié à
// l'identique pour chaque étudiant au moment de l'activation (démarrage de la
// classe). L'administrateur peut personnaliser le modèle (ajouter/supprimer des
// tranches, ajuster montants et délais) tant que la somme des tranches égale le
// montant total.

/** Tranche d'un modèle d'échéancier (cours ou workflow), telle que manipulée par l'UI. */
export type ScheduleTemplateItemInput = {
  /** Montant de la tranche (FCFA). */
  amount: number;
  /** Nombre de jours après le démarrage de la classe / l'ouverture du dossier. */
  offsetDays: number;
};

export type CourseScheduleTemplateDTO = {
  courseId: string;
  installmentsCount: number;
  intervalDays: number;
  /** Montant total de référence (prix du cours) pour la validation côté UI. */
  totalAmount: number;
  items: Array<ScheduleTemplateItemInput & { installmentNumber: number }>;
};

export type WorkflowScheduleTemplateDTO = {
  workflowId: string;
  installmentsCount: number;
  intervalDays: number;
  /** Coût de base de référence (baseCost du workflow). */
  totalAmount: number;
  items: Array<ScheduleTemplateItemInput & { installmentNumber: number }>;
};

/**
 * Découpe un montant en `count` tranches d'égal montant (la dernière absorbe
 * le reste de la division entière, garantissant une somme exacte). Les échéances
 * sont espacées de `intervalDays` jours, la première à J+0 (démarrage).
 */
function splitAmountEvenly(
  totalAmount: number,
  count: number,
  intervalDays: number
): ScheduleTemplateItemInput[] {
  const base = Math.floor(totalAmount / count);
  const remainder = Math.round((totalAmount - base * count) * 100) / 100;
  return Array.from({ length: count }, (_, i) => ({
    // La dernière tranche absorbe le reliquat pour une somme exacte.
    amount: i === count - 1 ? Math.round((base + remainder) * 100) / 100 : base,
    offsetDays: i * intervalDays,
  }));
}

/**
 * Calcule le nombre de tranches par défaut selon la durée d'un cours.
 *
 * Convention métier : 1 tranche par mois de formation (durée en semaines ÷ 4),
 * bornée entre 1 et 12 (cohérent avec `generatePaymentSchedule`). Un cours de
 * 3 mois génère donc 3 tranches.
 *
 * NB : volontairement NON exporté — un fichier `"use server"` n'autorise que
 * des fonctions async à l'export ; cet helper pur est donc interne au module.
 */
function defaultInstallmentsForDuration(durationWeeks: number): number {
  const months = Math.max(1, Math.round(durationWeeks / 4));
  return Math.min(Math.max(months, 1), 12);
}

// ----------------------------------------------------------------------------
// Cours — modèle d'échéancier par défaut
// ----------------------------------------------------------------------------

/**
 * Récupère le modèle d'échéancier d'un cours. S'il n'existe pas encore, renvoie
 * `null` (l'UI proposera alors de le générer selon la durée du cours).
 */
export async function getCourseScheduleTemplate(
  courseId: string
): Promise<CourseScheduleTemplateDTO | null> {
  const organizationId = await getCurrentOrganizationId();

  try {
    const row = await prisma.coursePaymentSchedule.findFirst({
      where: { organizationId, courseId },
      include: { items: { orderBy: { installmentNumber: "asc" } } },
    });

    if (!row) return null;

    const course = await prisma.course.findFirst({
      where: { id: courseId, organizationId },
      select: { price: true },
    });

    return {
      courseId,
      installmentsCount: row.installmentsCount,
      intervalDays: row.intervalDays,
      totalAmount: course?.price ?? row.items.reduce((s, i) => s + i.amount, 0),
      items: row.items.map((i) => ({
        installmentNumber: i.installmentNumber,
        amount: i.amount,
        offsetDays: i.offsetDays,
      })),
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error("[getCourseScheduleTemplate] Échec :", error);
    return null;
  }
}

/**
 * Enregistre (crée ou remplace) le modèle d'échéancier d'un cours.
 *
 * Validation métier : la somme des montants des tranches doit égaler le prix du
 * cours (tolérance 1 FCFA pour les arrondis). Les tranches sont renumérotées
 * 1..N dans l'ordre fourni.
 */
export async function saveCourseScheduleTemplate(input: {
  courseId: string;
  intervalDays: number;
  items: ScheduleTemplateItemInput[];
}): Promise<{ ok: true } | { ok: false; message: string }> {
  await assertCanMutate();

  const organizationId = await getCurrentOrganizationId();
  const { courseId } = input;

  if (!courseId) {
    return { ok: false, message: "Cours manquant." };
  }
  if (
    input.items.length < 1 ||
    input.items.length > 12 ||
    !Number.isInteger(input.intervalDays) ||
    input.intervalDays < 0
  ) {
    return {
      ok: false,
      message: "Le nombre de tranches doit être entre 1 et 12 et l'intervalle positif.",
    };
  }

  const sum =
    Math.round(input.items.reduce((s, i) => s + (Number(i.amount) || 0), 0) * 100) / 100;

  try {
    const course = await prisma.course.findFirst({
      where: { id: courseId, organizationId },
      select: { id: true, price: true },
    });

    if (!course) {
      return { ok: false, message: "Cours introuvable dans votre organisation." };
    }

    if (Math.abs(sum - course.price) > 1) {
      return {
        ok: false,
        message: `La somme des tranches (${sum.toLocaleString("fr-FR")} FCFA) doit égaler le prix du cours (${course.price.toLocaleString("fr-FR")} FCFA).`,
      };
    }

    const installmentsCount = input.items.length;

    await prisma.$transaction(async (tx) => {
      const template = await tx.coursePaymentSchedule.upsert({
        where: { courseId },
        create: {
          organizationId,
          courseId,
          installmentsCount,
          intervalDays: input.intervalDays,
        },
        update: {
          installmentsCount,
          intervalDays: input.intervalDays,
        },
        select: { id: true },
      });

      // Remplacement complet des tranches (identifiants régénérés) : garantit
      // la cohérence du modèle après ajout/suppression de tranches.
      await tx.coursePaymentScheduleItem.deleteMany({ where: { scheduleId: template.id } });
      await tx.coursePaymentScheduleItem.createMany({
        data: input.items.map((item, idx) => ({
          scheduleId: template.id,
          installmentNumber: idx + 1,
          amount: Math.max(0, Number(item.amount) || 0),
          offsetDays: Math.max(0, Math.round(Number(item.offsetDays) || 0)),
        })),
      });
    });

    revalidatePath("/dashboard/courses");
    revalidatePath(`/dashboard/courses/${courseId}`);

    return { ok: true };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error("[saveCourseScheduleTemplate] Échec :", error);
    return { ok: false, message: "Une erreur est survenue lors de l'enregistrement du modèle." };
  }
}


/**
 * Génère automatiquement le modèle d'échéancier par défaut d'un cours selon sa
 * durée (1 tranche par mois, montants égaux, intervalle 30 jours).
 *
 * Appelée à la création d'un cours. Idempotente : si un modèle existe déjà, il
 * n'est pas écrasé (l'administrateur aurait pu le personnaliser).
 */
export async function ensureDefaultCourseSchedule(courseId: string): Promise<void> {
  const organizationId = await getCurrentOrganizationId();

  try {
    const course = await prisma.course.findFirst({
      where: { id: courseId, organizationId },
      select: {
        id: true,
        price: true,
        durationWeeks: true,
        paymentSchedule: { select: { id: true } },
      },
    });

    if (!course || course.paymentSchedule) return;

    const count = defaultInstallmentsForDuration(course.durationWeeks);
    if (course.price <= 0) return;

    const items = splitAmountEvenly(course.price, count, DEFAULT_INSTALLMENT_INTERVAL_DAYS);

    await prisma.$transaction(async (tx) => {
      const template = await tx.coursePaymentSchedule.create({
        data: {
          organizationId,
          courseId,
          installmentsCount: count,
          intervalDays: DEFAULT_INSTALLMENT_INTERVAL_DAYS,
        },
        select: { id: true },
      });
      await tx.coursePaymentScheduleItem.createMany({
        data: items.map((item, idx) => ({
          scheduleId: template.id,
          installmentNumber: idx + 1,
          amount: item.amount,
          offsetDays: item.offsetDays,
        })),
      });
    });
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error("[ensureDefaultCourseSchedule] Échec :", error);
  }
}

// ----------------------------------------------------------------------------
// Workflow voyage — modèle d'échéancier par défaut
// ----------------------------------------------------------------------------

/** Récupère le modèle d'échéancier d'un workflow voyage (ou `null`). */
export async function getWorkflowScheduleTemplate(
  workflowId: string
): Promise<WorkflowScheduleTemplateDTO | null> {
  const organizationId = await getCurrentOrganizationId();

  try {
    const row = await prisma.workflowPaymentSchedule.findFirst({
      where: { organizationId, workflowId },
      include: { items: { orderBy: { installmentNumber: "asc" } } },
    });

    if (!row) return null;

    const workflow = await prisma.workflow.findFirst({
      where: { id: workflowId, organizationId },
      select: { baseCost: true },
    });

    return {
      workflowId,
      installmentsCount: row.installmentsCount,
      intervalDays: row.intervalDays,
      totalAmount: workflow?.baseCost ?? row.items.reduce((s, i) => s + i.amount, 0),
      items: row.items.map((i) => ({
        installmentNumber: i.installmentNumber,
        amount: i.amount,
        offsetDays: i.offsetDays,
      })),
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error("[getWorkflowScheduleTemplate] Échec :", error);
    return null;
  }
}


/** Enregistre (crée ou remplace) le modèle d'échéancier d'un workflow voyage. */
export async function saveWorkflowScheduleTemplate(input: {
  workflowId: string;
  intervalDays: number;
  items: ScheduleTemplateItemInput[];
}): Promise<{ ok: true } | { ok: false; message: string }> {
  await assertCanMutate();

  const organizationId = await getCurrentOrganizationId();
  const { workflowId } = input;

  if (!workflowId) {
    return { ok: false, message: "Modèle de procédure manquant." };
  }
  if (
    input.items.length < 1 ||
    input.items.length > 12 ||
    !Number.isInteger(input.intervalDays) ||
    input.intervalDays < 0
  ) {
    return {
      ok: false,
      message: "Le nombre de tranches doit être entre 1 et 12 et l'intervalle positif.",
    };
  }

  const sum =
    Math.round(input.items.reduce((s, i) => s + (Number(i.amount) || 0), 0) * 100) / 100;

  try {
    const workflow = await prisma.workflow.findFirst({
      where: { id: workflowId, organizationId },
      select: { id: true, baseCost: true },
    });

    if (!workflow) {
      return { ok: false, message: "Modèle de procédure introuvable." };
    }

    if (Math.abs(sum - workflow.baseCost) > 1) {
      return {
        ok: false,
        message: `La somme des tranches (${sum.toLocaleString("fr-FR")} FCFA) doit égaler le coût de la procédure (${workflow.baseCost.toLocaleString("fr-FR")} FCFA).`,
      };
    }

    const installmentsCount = input.items.length;

    await prisma.$transaction(async (tx) => {
      const template = await tx.workflowPaymentSchedule.upsert({
        where: { workflowId },
        create: {
          organizationId,
          workflowId,
          installmentsCount,
          intervalDays: input.intervalDays,
        },
        update: {
          installmentsCount,
          intervalDays: input.intervalDays,
        },
        select: { id: true },
      });

      await tx.workflowPaymentScheduleItem.deleteMany({ where: { scheduleId: template.id } });
      await tx.workflowPaymentScheduleItem.createMany({
        data: input.items.map((item, idx) => ({
          scheduleId: template.id,
          installmentNumber: idx + 1,
          amount: Math.max(0, Number(item.amount) || 0),
          offsetDays: Math.max(0, Math.round(Number(item.offsetDays) || 0)),
        })),
      });
    });

    revalidatePath("/dashboard/travels");

    return { ok: true };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error("[saveWorkflowScheduleTemplate] Échec :", error);
    return { ok: false, message: "Une erreur est survenue lors de l'enregistrement du modèle." };
  }
}

/**
 * Génère automatiquement le modèle d'échéancier par défaut d'un workflow voyage
 * (3 tranches égales par défaut, intervalle 30 jours). Idempotente.
 */
export async function ensureDefaultWorkflowSchedule(workflowId: string): Promise<void> {
  const organizationId = await getCurrentOrganizationId();

  try {
    const workflow = await prisma.workflow.findFirst({
      where: { id: workflowId, organizationId },
      select: { id: true, baseCost: true, paymentSchedule: { select: { id: true } } },
    });

    if (!workflow || workflow.paymentSchedule) return;

    const count = 3;
    if (workflow.baseCost <= 0) return;

    const items = splitAmountEvenly(workflow.baseCost, count, DEFAULT_INSTALLMENT_INTERVAL_DAYS);

    await prisma.$transaction(async (tx) => {
      const template = await tx.workflowPaymentSchedule.create({
        data: {
          organizationId,
          workflowId,
          installmentsCount: count,
          intervalDays: DEFAULT_INSTALLMENT_INTERVAL_DAYS,
        },
        select: { id: true },
      });
      await tx.workflowPaymentScheduleItem.createMany({
        data: items.map((item, idx) => ({
          scheduleId: template.id,
          installmentNumber: idx + 1,
          amount: item.amount,
          offsetDays: item.offsetDays,
        })),
      });
    });
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error("[ensureDefaultWorkflowSchedule] Échec :", error);
  }
}


// ============================================================================
// ACTIVATION AU DÉMARRAGE D'UNE CLASSE
// ============================================================================

/**
 * Active les échéanciers de tous les étudiants inscrits (ACTIFS) dans une
 * classe qui vient de démarrer.
 *
 * RÈGLE MÉTIER — c'est ici que le décompte des impayés démarre : pour chaque
 * étudiant inscrit dans une classe officiellement DÉMARRÉE, on copie le modèle
 * d'échéancier du cours porteur en un échéancier étudiant (PaymentSchedule)
 * ACTIVÉ (`activatedAt = now`, `classId` renseigné). Les échéances sont datées
 * à `now + offsetDays`.
 *
 * Idempotent : un étudiant déjà pourvu d'un échéancier pour cette classe n'est
 * pas recréé. Appelée depuis `startClassAction`.
 *
 * @returns le nombre d'échéanciers activés.
 */
export async function activateSchedulesForClass(classId: string): Promise<number> {
  const organizationId = await getCurrentOrganizationId();

  try {
    const klass = await prisma.class.findFirst({
      where: { id: classId, organizationId },
      select: {
        id: true,
        courseId: true,
        course: {
          select: {
            price: true,
            paymentSchedule: {
              select: {
                installmentsCount: true,
                intervalDays: true,
                items: {
                  orderBy: { installmentNumber: "asc" },
                  select: { amount: true, offsetDays: true },
                },
              },
            },
          },
        },
        enrollments: {
          where: { status: "ACTIVE" },
          select: { studentId: true },
        },
      },
    });

    if (!klass) return 0;

    const template = klass.course.paymentSchedule;
    // Pas de modèle paramétré : rien à activer (l'échéancier reste manuel).
    if (!template || template.items.length === 0) return 0;

    const now = new Date();
    const totalAmount = template.items.reduce((s, i) => s + i.amount, 0);
    let activated = 0;

    for (const enrollment of klass.enrollments) {
      // Un seul échéancier actif par étudiant et par classe.
      const already = await prisma.paymentSchedule.findFirst({
        where: { organizationId, studentId: enrollment.studentId, classId },
        select: { id: true },
      });
      if (already) continue;

      await prisma.paymentSchedule.create({
        data: {
          organizationId,
          studentId: enrollment.studentId,
          classId,
          activatedAt: now,
          totalAmount,
          installmentsCount: template.installmentsCount,
          startDate: now,
          status: "PENDING",
          items: {
            create: template.items.map((item, idx) => {
              const dueDate = new Date(now);
              dueDate.setDate(dueDate.getDate() + item.offsetDays);
              return {
                installmentNumber: idx + 1,
                amount: item.amount,
                dueDate,
                status: "PENDING" as ScheduleItemStatus,
              };
            }),
          },
        },
      });
      activated += 1;
    }

    if (activated > 0) {
      revalidatePath("/dashboard/echeances");
    }

    return activated;
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error("[activateSchedulesForClass] Échec :", error);
    return 0;
  }
}

/**
 * Active l'échéancier d'un étudiant réinscrit dans une classe DÉJÀ démarrée
 * (cas de la réinscription administrative, hors démarrage initial).
 *
 * Idempotent : sans effet si un échéancier existe déjà pour ce couple
 * étudiant/classe, ou si la classe n'est pas démarrée / n'a pas de modèle.
 *
 * @returns `true` si un échéancier a été créé.
 */
export async function activateScheduleForStudentInClass(
  studentId: string,
  classId: string
): Promise<boolean> {
  const organizationId = await getCurrentOrganizationId();

  try {
    const klass = await prisma.class.findFirst({
      where: { id: classId, organizationId },
      select: {
        id: true,
        status: true,
        course: {
          select: {
            paymentSchedule: {
              select: {
                installmentsCount: true,
                intervalDays: true,
                items: {
                  orderBy: { installmentNumber: "asc" },
                  select: { amount: true, offsetDays: true },
                },
              },
            },
          },
        },
      },
    });

    if (!klass) return false;
    // La classe doit être démarrée pour activer le décompte.
    if (klass.status !== "IN_PROGRESS" && klass.status !== "ACTIVE") return false;

    const template = klass.course.paymentSchedule;
    if (!template || template.items.length === 0) return false;

    const already = await prisma.paymentSchedule.findFirst({
      where: { organizationId, studentId, classId },
      select: { id: true },
    });
    if (already) return false;

    const now = new Date();
    const totalAmount = template.items.reduce((s, i) => s + i.amount, 0);

    await prisma.paymentSchedule.create({
      data: {
        organizationId,
        studentId,
        classId,
        activatedAt: now,
        totalAmount,
        installmentsCount: template.installmentsCount,
        startDate: now,
        status: "PENDING",
        items: {
          create: template.items.map((item, idx) => {
            const dueDate = new Date(now);
            dueDate.setDate(dueDate.getDate() + item.offsetDays);
            return {
              installmentNumber: idx + 1,
              amount: item.amount,
              dueDate,
              status: "PENDING" as ScheduleItemStatus,
            };
          }),
        },
      },
    });

    revalidatePath("/dashboard/echeances");
    return true;
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error("[activateScheduleForStudentInClass] Échec :", error);
    return false;
  }
}


// ============================================================================
// TABLEAU DE BORD « ÉCHÉANCES » + FILTRES
// ============================================================================

/**
 * Regroupe une échéance dans une catégorie d'affichage :
 * - `awaiting` : échéancier pas encore activé (classe non démarrée) ;
 * - `paid`     : tranche entièrement soldée ;
 * - `overdue`  : échéance activée, échue et non soldée (retard) ;
 * - `upcoming` : échéance activée, à venir (y compris partiellement réglée).
 */
function bucketForItem(
  status: ScheduleItemStatus,
  activatedAt: Date | null,
  dueDate: Date,
  paidAmount: number,
  amount: number
): EcheanceBucket {
  if (!activatedAt) return "awaiting";
  if (status === "PAID" || paidAmount >= amount) return "paid";
  if (status === "OVERDUE" || dueDate.getTime() < Date.now()) return "overdue";
  return "upcoming";
}

/**
 * Alimente le tableau de bord « Échéances » : toutes les tranches de tous les
 * échéanciers de l'organisation, avec contexte étudiant / classe / cours et
 * reliquat exact. Rafraîchit les statuts de retard au préalable.
 *
 * Les filtres (classe, étudiant, statut) sont appliqués côté mémoire après
 * récupération, garantissant une cohérence totale avec les regroupements. Les
 * agrégats (`totals`) sont calculés sur l'ENSEMBLE, indépendamment des filtres.
 */
export async function getEcheancesDashboard(
  filter: EcheanceFilter = {}
): Promise<EcheancesDashboardDTO> {
  const organizationId = await getCurrentOrganizationId();

  try {
    await refreshOverdueStatus();

    const items = await prisma.paymentScheduleItem.findMany({
      where: { schedule: { organizationId } },
      include: {
        schedule: {
          select: {
            id: true,
            classId: true,
            activatedAt: true,
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
            class: {
              select: {
                id: true,
                name: true,
                courseId: true,
                course: { select: { id: true, title: true } },
              },
            },
          },
        },
      },
      orderBy: [{ dueDate: "asc" }, { installmentNumber: "asc" }],
    });

    const rows: EcheanceRowDTO[] = items.map((item) => {
      const schedule = item.schedule;
      const student = schedule.student;
      return {
        scheduleId: schedule.id,
        itemId: item.id,
        studentId: student.id,
        studentCode: student.studentCode,
        studentName: `${student.firstName} ${student.lastName}`.trim(),
        studentPhone: student.phone,
        studentEmail: student.email,
        classId: schedule.classId,
        className: schedule.class?.name ?? null,
        courseId: schedule.class?.courseId ?? null,
        courseTitle: schedule.class?.course?.title ?? null,
        installmentNumber: item.installmentNumber,
        amount: item.amount,
        paidAmount: item.paidAmount,
        remainingAmount: Math.max(item.amount - item.paidAmount, 0),
        dueDate: item.dueDate,
        status: item.status,
        activatedAt: schedule.activatedAt,
        paidAt: item.paidAt,
      };
    });

    const totals = {
      awaitingCount: 0,
      upcomingCount: 0,
      overdueCount: 0,
      paidCount: 0,
      overdueAmount: 0,
      totalRemaining: 0,
    };

    const rowsWithBucket = rows.map((row) => {
      const bucket = bucketForItem(
        row.status,
        row.activatedAt,
        row.dueDate,
        row.paidAmount,
        row.amount
      );
      if (bucket === "awaiting") totals.awaitingCount += 1;
      else if (bucket === "paid") totals.paidCount += 1;
      else if (bucket === "overdue") {
        totals.overdueCount += 1;
        totals.overdueAmount += row.remainingAmount;
        totals.totalRemaining += row.remainingAmount;
      } else {
        totals.upcomingCount += 1;
        totals.totalRemaining += row.remainingAmount;
      }
      return { row, bucket };
    });

    // Application des filtres pour la liste affichée.
    const filtered = rowsWithBucket.filter(({ row, bucket }) => {
      if (filter.classId && filter.classId !== "all" && row.classId !== filter.classId) {
        return false;
      }
      if (filter.studentId && filter.studentId !== "all" && row.studentId !== filter.studentId) {
        return false;
      }
      if (filter.bucket && filter.bucket !== "all" && bucket !== filter.bucket) {
        return false;
      }
      return true;
    });

    return { totals, rows: filtered.map(({ row }) => row) };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error("[getEcheancesDashboard] Échec :", error);
    return {
      totals: {
        awaitingCount: 0,
        upcomingCount: 0,
        overdueCount: 0,
        paidCount: 0,
        overdueAmount: 0,
        totalRemaining: 0,
      },
      rows: [],
    };
  }
}

/**
 * Liste de référence des classes (pour le filtre « par classe » du dashboard).
 */
export async function getScheduleClassOptions(): Promise<
  Array<{ id: string; name: string; courseTitle: string | null }>
> {
  const organizationId = await getCurrentOrganizationId();

  try {
    const classes = await prisma.class.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        course: { select: { title: true } },
      },
    });
    return classes.map((c) => ({
      id: c.id,
      name: c.name,
      courseTitle: c.course?.title ?? null,
    }));
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error("[getScheduleClassOptions] Échec :", error);
    return [];
  }
}


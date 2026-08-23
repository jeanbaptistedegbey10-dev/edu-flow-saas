"use server";

import type {
  PaymentMethod,
  PaymentStatus,
  StudentStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getCurrentOrganizationId } from "@/lib/session";

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

    // Chiffre d'affaires : somme des paiements réglés (COMPLETED).
    prisma.payment.aggregate({
      where: { organizationId, status: "COMPLETED" },
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

    // Les 5 derniers règlements enregistrés.
    prisma.payment.findMany({
      where: { organizationId },
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
    }),
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
}
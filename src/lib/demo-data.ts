import { seedDemoDataForOrganization } from "@/lib/demo-seed";
import { prisma } from "@/lib/prisma";

// --------------------------------------
// Données de démonstration — gestion manuelle
// --------------------------------------
//
// Phase 1 (Task 4) : le nouvel administrateur peut, depuis le tableau de bord,
//   - INJECTER un jeu de données de démonstration (classes, élèves, reçus…) ;
//   - RÉINITIALISER l'organisation en supprimant ces données en 1 clic.
//
// L'injection réutilise le module `src/lib/demo-seed.ts` (le même jeu que
// celui injecté automatiquement à l'inscription) ; la réinitialisation retire
// toutes les données métier de l'organisation tout en conservant l'organisation
// elle-même et ses comptes administrateurs.

/** Résultat typé d'une injection de données de démonstration. */
export type DemoDataInjectResult =
  | {
      seeded: true;
      counts: {
        students: number;
        courses: number;
        payments: number;
        demoAccounts: number;
      };
    }
  | { seeded: false; reason: "ALREADY_SEEDED" | "ORG_NOT_FOUND" };

/**
 * Injecte le jeu de données de démonstration pour une organisation.
 * Idempotente : si des données existent déjà, retourne `ALREADY_SEEDED`
 * sans modifier la base.
 */
export async function injectDemoDataForOrganization(
  organizationId: string,
  createdById: string
): Promise<DemoDataInjectResult> {
  const summary = await seedDemoDataForOrganization(
    organizationId,
    createdById
  );

  if (!summary.seeded) {
    return {
      seeded: false,
      reason:
        summary.reason === "ORG_NOT_FOUND" ? "ORG_NOT_FOUND" : "ALREADY_SEEDED",
    };
  }

  return {
    seeded: true,
    counts: {
      students: summary.counts.students,
      courses: summary.counts.courses,
      payments: summary.counts.payments,
      demoAccounts: summary.counts.demoAccounts,
    },
  };
}

/** Détail des suppressions effectuées lors d'une réinitialisation. */
export type DemoDataResetCounts = {
  students: number;
  payments: number;
  expenses: number;
  sales: number;
  tasks: number;
  demoUsers: number;
};

/** Résultat typé d'une réinitialisation des données métier. */
export type DemoDataResetResult =
  | { ok: true; deleted: DemoDataResetCounts }
  | { ok: false; reason: "NOT_FOUND" | "UNKNOWN" | "ADMIN_REQUIRED" };
/**
 * Supprime TOUTES les données métier de l'organisation (étudiants, cours,
 * classes, paiements, dépenses, ventes, tâches, documents, procédures voyage,
 * comptes de démonstration non-administrateurs…). L'organisation et ses
 * comptes ADMIN / SUPER_ADMIN sont conservés.
 *
 * S'exécute dans une transaction unique : tout ou rien.
 */
export async function resetOrganizationData(
  organizationId: string
): Promise<DemoDataResetResult> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true },
  });

  if (!organization) {
    return { ok: false, reason: "NOT_FOUND" };
  }

  try {
    const deleted = await prisma.$transaction(async (tx) => {
      const counts = {
        students: 0,
        payments: 0,
        expenses: 0,
        sales: 0,
        tasks: 0,
        demoUsers: 0,
      };

      // 1. Tables enfants (FK vers étudiant / vente / évaluation...).
      counts.students = (
        await tx.student.deleteMany({ where: { organizationId } })
      ).count;
      counts.payments = (
        await tx.payment.deleteMany({ where: { organizationId } })
      ).count;
      counts.expenses = (
        await tx.expense.deleteMany({ where: { organizationId } })
      ).count;
      counts.sales = (
        await tx.saleItem.deleteMany({
          where: { sale: { organizationId } },
        })
      ).count;
      counts.tasks = (await tx.task.deleteMany({ where: { organizationId } }))
        .count;

      // 2. Tables parentes restantes (dépendances internes entre elles).
      await tx.classEnrollment.deleteMany({ where: { organizationId } });
      await tx.enrollment.deleteMany({
        where: { student: { organizationId } },
      });
      await tx.sale.deleteMany({ where: { organizationId } });
      await tx.grade.deleteMany({
        where: { evaluationModule: { evaluation: { organizationId } } },
      });
      await tx.evaluation.deleteMany({ where: { organizationId } });
      await tx.attendance.deleteMany({ where: { organizationId } });
      await tx.courseLog.deleteMany({ where: { organizationId } });
      await tx.payroll.deleteMany({ where: { organizationId } });
      await tx.document.deleteMany({ where: { organizationId } });
      await tx.housing.deleteMany({ where: { organizationId } });
      await tx.travelProcedure.deleteMany({ where: { organizationId } });
      await tx.workflowStage.deleteMany({ where: { organizationId } });
      await tx.workflow.deleteMany({ where: { organizationId } });
      await tx.productService.deleteMany({ where: { organizationId } });
      await tx.productCategory.deleteMany({ where: { organizationId } });
      await tx.class.deleteMany({ where: { organizationId } });
      await tx.course.deleteMany({ where: { organizationId } });

      // 3. Comptes de d�monstration (non administrateurs). Les comptes
      //    ADMIN / SUPER_ADMIN sont conservés.
      //    Les rôles utilisateurs référencent User via customRoleId (onDelete:
      //    SetNull) — les supprimer APRÈS les users évite toute contrainte FK.
      counts.demoUsers = (
        await tx.user.deleteMany({
          where: {
            organizationId,
            role: { notIn: ["ADMIN", "SUPER_ADMIN"] },
          },
        })
      ).count;

      // 4. Rôles personnalisées (créées par le seeding ou par l'utilisateur).
      //    Les ADMIN/SUPER_ADMIN sont conservés ; leurs éventuels customRole
      //    sont dissociés via onDelete: SetNull au moment de l'étape 3.
      await tx.customRole.deleteMany({ where: { organizationId } });

      return counts;
    });

    return { ok: true, deleted };
  } catch (error) {
    console.error("[demo-data] Échec de la réinitialisation :", error);
    return { ok: false, reason: "UNKNOWN" };
  }
}

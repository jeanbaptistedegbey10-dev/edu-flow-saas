import { seedDemoDataForOrganization } from "@/lib/demo-seed";
import { prisma } from "@/lib/prisma";

// --------------------------------------
// Données de démonstration — gestion manuelle
// --------------------------------------
//
// Depuis le tableau de bord, l'administrateur peut :
//   - INJECTER un jeu de données de démonstration complet (classes, élèves,
//     présences, visas, caisse POS, trésorerie, dépenses, tâches…) ;
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
        classes: number;
        courses: number;
        payments: number;
        expenses: number;
        sales: number;
        attendances: number;
        travelProcedures: number;
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
      classes: summary.counts.classes,
      courses: summary.counts.courses,
      payments: summary.counts.payments,
      expenses: summary.counts.expenses,
      sales: summary.counts.sales,
      attendances: summary.counts.attendances,
      travelProcedures: summary.counts.travelProcedures,
      demoAccounts: summary.counts.demoAccounts,
    },
  };
}

/** Détail des suppressions effectuées lors d'une réinitialisation. */
export type DemoDataResetCounts = {
  students: number;
  classes: number;
  courses: number;
  payments: number;
  expenses: number;
  sales: number;
  tasks: number;
  attendances: number;
  documents: number;
  travelProcedures: number;
  demoUsers: number;
};

/** Résultat typé d'une réinitialisation des données métier. */
export type DemoDataResetResult =
  | { ok: true; deleted: DemoDataResetCounts }
  | { ok: false; reason: "NOT_FOUND" | "UNKNOWN" | "ADMIN_REQUIRED" };
/**
 * Supprime TOUTES les données métier de l'organisation (étudiants, cours,
 * classes, paiements, ventes POS, présences, documents, dossiers voyage,
 * dépenses, tâches, catalogue POS, comptes de démonstration non-admin…).
 * L'organisation et ses comptes ADMIN / SUPER_ADMIN sont conservés.
 *
 * S'exécute dans UNE transaction unique (tout ou rien) en suivant un ordre de
 * suppression strictement adapté aux contraintes de clés étrangères :
 *
 *   Attendance → Payments → POS Sales → Visa Documents → Visa Process →
 *   Course Enrollments → Students → Classes → Expenses → Tasks →
 *   Catalogue POS → Comptes démo → Rôles.
 *
 * Chaque `deleteMany` étant exécuté séquentiellement dans l'ordre des
 * dépendances, aucune violation de contrainte (FK) ne peut survenir.
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
      const counts: DemoDataResetCounts = {
        students: 0,
        classes: 0,
        courses: 0,
        payments: 0,
        expenses: 0,
        sales: 0,
        tasks: 0,
        attendances: 0,
        documents: 0,
        travelProcedures: 0,
        demoUsers: 0,
      };

      // 1. Présences (Attendance) — enfants des étudiants / cours / classes.
      counts.attendances = (
        await tx.attendance.deleteMany({ where: { organizationId } })
      ).count;

      // 2. Notes (Grade) avant les évaluations (chaîne de cascade).
      await tx.grade.deleteMany({
        where: { evaluationModule: { evaluation: { organizationId } } },
      });

      // 3. Paiements (recettes comptabilisées).
      counts.payments = (
        await tx.payment.deleteMany({ where: { organizationId } })
      ).count;

      // 4. POS — lignes de vente (SaleItem) puis reçus de vente (Sale).
      await tx.saleItem.deleteMany({
        where: { sale: { organizationId } },
      });
      counts.sales = (
        await tx.sale.deleteMany({ where: { organizationId } })
      ).count;

      // 5. Pièces jointes / documents (visa et étudiants).
      counts.documents = (
        await tx.document.deleteMany({ where: { organizationId } })
      ).count;

      // 6. Cahier de texte, salaires, évaluations.
      await tx.courseLog.deleteMany({ where: { organizationId } });
      await tx.payroll.deleteMany({ where: { organizationId } });
      await tx.evaluation.deleteMany({ where: { organizationId } });

      // 7. Inscriptions aux cours et affectations de classe (historique).
      await tx.classEnrollment.deleteMany({ where: { organizationId } });
      await tx.enrollment.deleteMany({
        where: { student: { organizationId } },
      });

      // 8. Pipeline voyage : workflow (étapes puis modèles) et dossiers.
      await tx.workflowStage.deleteMany({ where: { organizationId } });
      await tx.workflow.deleteMany({ where: { organizationId } });
      counts.travelProcedures = (
        await tx.travelProcedure.deleteMany({ where: { organizationId } })
      ).count;

      // 9. Logements étudiants.
      await tx.housing.deleteMany({ where: { organizationId } });

      // 10. Tâches puis dépenses (créées par un User → Restrict).
      counts.tasks = (
        await tx.task.deleteMany({ where: { organizationId } })
      ).count;
      counts.expenses = (
        await tx.expense.deleteMany({ where: { organizationId } })
      ).count;

      // 11. Catalogue POS : produits (avant catégories, Restrict SaleItem).
      await tx.productService.deleteMany({ where: { organizationId } });
      await tx.productCategory.deleteMany({ where: { organizationId } });

      // 12. Étudiants → classes → cours.
      counts.students = (
        await tx.student.deleteMany({ where: { organizationId } })
      ).count;
      counts.classes = (
        await tx.class.deleteMany({ where: { organizationId } })
      ).count;
      counts.courses = (
        await tx.course.deleteMany({ where: { organizationId } })
      ).count;

      // 13. Comptes de démonstration non-administrateurs (les ADMIN /
      //     SUPER_ADMIN sont conservés) puis rôles personnalisés.
      counts.demoUsers = (
        await tx.user.deleteMany({
          where: {
            organizationId,
            role: { notIn: ["ADMIN", "SUPER_ADMIN"] },
          },
        })
      ).count;
      await tx.customRole.deleteMany({ where: { organizationId } });

      return counts;
    });

    return { ok: true, deleted };
  } catch (error) {
    console.error("[demo-data] Échec de la réinitialisation :", error);
    return { ok: false, reason: "UNKNOWN" };
  }
}
/** Résultat du contrôle de présence de données d'une organisation. */
export type OrganizationDataPresence = {
  /** `true` si l'organisation contient la moindre donnée (démo ou réelle). */
  hasData: boolean;
  /** Nombre de comptes non-administrateurs (comptes de démonstration inclus). */
  demoAccounts: number;
};

/**
 * Indique si une organisation contient des données (démonstration ou métier) :
 * comptes non-administrateurs, élèves, cours ou classes. Le jeu de
 * démonstration vivant dans les MÊMES tables que les données réelles (aucun
 * indicateur `isDemo` en base), la présence de données est le signal utilisé
 * par la carte « Données de démonstration » pour :
 *  - activer/désactiver la suppression (« Supprimer la démo » — deletion guard) ;
 *  - exiger la confirmation mot-clé avant écrasement / suppression.
 */
export async function getOrganizationDataPresence(
  organizationId: string | null | undefined
): Promise<OrganizationDataPresence> {
  if (!organizationId) {
    return { hasData: false, demoAccounts: 0 };
  }

  try {
    const [demoAccounts, students, courses, classes] = await Promise.all([
      prisma.user.count({
        where: {
          organizationId,
          role: { notIn: ["ADMIN", "SUPER_ADMIN"] },
        },
      }),
      prisma.student.count({ where: { organizationId } }),
      prisma.course.count({ where: { organizationId } }),
      prisma.class.count({ where: { organizationId } }),
    ]);

    return {
      hasData: demoAccounts > 0 || students > 0 || courses > 0 || classes > 0,
      demoAccounts,
    };
  } catch (error) {
    console.error("[demo-data] Échec du contrôle de présence :", error);
    return { hasData: false, demoAccounts: 0 };
  }
}
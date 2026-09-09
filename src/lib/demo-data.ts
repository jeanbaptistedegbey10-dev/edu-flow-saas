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
//
// ---------------------------------------------------------------
// Découpage « sans timeout » (Serverless Vercel)
// ---------------------------------------------------------------
// La réinitialisation est découpée en TROIS étapes courtes et indépendantes :
//   - resetStudentsAndSchoolingData      (Étape 1 : étudiants & scolarité) ;
//   - resetCoursesAndAssessmentsData     (Étape 2 : cours, éval. & présences) ;
//   - resetFinancialAndSettingsData      (Étape 3 : finances & paramètres).
// Chaque étape vit dans SA PROPRE transaction (< 3 s) et est idempotente :
// même sur une base volumineuse, aucune requête unique ne s'approche du budget
// d'exécution des fonctions Vercel. Les Server Actions de la carte « Données
// de démonstration » invoquent ces étapes SÉQUENTIELLEMENT (une requête HTTP
// par étape) et affichent une liste de contrôle progressant en temps réel.
// `resetOrganizationData` reste disponible en orchestration « tout en un »
// (compatibilité) — elle enchaîne simplement les trois étapes ci-dessus.

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
  // Totaux « historiques » agrégés (utilisés par le message final).
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
  travelSteps: number;
  demoUsers: number;
  // Détail par étape (retourné par chaque sous-opération).
  classEnrollments: number;
  enrollments: number;
  housings: number;
  grades: number;
  evaluations: number;
  courseLogs: number;
  payrolls: number;
  productServices: number;
  productCategories: number;
  workflows: number;
  workflowStages: number;
  customRoles: number;
};

/** Résultat typé d'une réinitialisation des données métier. */
export type DemoDataResetResult =
  | { ok: true; deleted: DemoDataResetCounts }
  | { ok: false; reason: "NOT_FOUND" | "UNKNOWN" | "ADMIN_REQUIRED" };

/** Crée un objet de comptes remis à zéro (toutes les clés présentes). */
function emptyResetCounts(): DemoDataResetCounts {
  return {
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
    travelSteps: 0,
    demoUsers: 0,
    classEnrollments: 0,
    enrollments: 0,
    housings: 0,
    grades: 0,
    evaluations: 0,
    courseLogs: 0,
    payrolls: 0,
    productServices: 0,
    productCategories: 0,
    workflows: 0,
    workflowStages: 0,
    customRoles: 0,
  };
}

/** Cumule plusieurs jeux de comptes (étapes successives) en un seul. */
export function mergeResetCounts(...steps: DemoDataResetCounts[]): DemoDataResetCounts {
  const merged = emptyResetCounts();
  const acc = merged as Record<string, number>;
  for (const step of steps) {
    for (const [key, value] of Object.entries(step)) {
      acc[key] += value;
    }
  }
  return merged;
}

/**
 * Options de transaction des étapes courtes — volontairement bornées pour
 * rester sous le budget d'exécution des Serverless (chaque étape < 3 s).
 */
const RESET_TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 };

/**
 * ÉTAPE 3 — Étudiants & scolarité (Racines / Root records).
 *
 * Supprime : notes, affectations de classes, inscriptions aux cours, logements
 * étudiants, puis les étudiants eux-mêmes et les parrainages.
 *
 * DOIT ÊTRE EXÉCUTÉ EN DERNIER : les étudiants sont référencés par de nombreuses
 * tables enfants (présences, documents, paiements, étapes voyage…) qui doivent
 * avoir été supprimées auparavant (Étapes 1 et 2).
 *
 * Transaction courte et idempotente : ré-exécutable sans effet de bord.
 */
export async function resetStudentsAndSchoolingData(
  organizationId: string
): Promise<DemoDataResetCounts> {
  return prisma.$transaction(
    async (tx) => {
      const counts = emptyResetCounts();

      // Notes (Grade) avant les évaluations — filtrées par étudiant.
      counts.grades = (
        await tx.grade.deleteMany({
          where: { student: { organizationId } },
        })
      ).count;

      // Affectations de classes (historique) puis inscriptions aux cours.
      counts.classEnrollments = (
        await tx.classEnrollment.deleteMany({ where: { organizationId } })
      ).count;
      counts.enrollments = (
        await tx.enrollment.deleteMany({
          where: { student: { organizationId } },
        })
      ).count;

      // Logements étudiants (hébergement rattaché à la scolarité).
      counts.housings = (
        await tx.housing.deleteMany({ where: { organizationId } })
      ).count;

      // Étudiants en dernier (d'autres tables référencent cet identifiant).
      counts.students = (
        await tx.student.deleteMany({ where: { organizationId } })
      ).count;

      return counts;
    },
    RESET_TX_OPTIONS
  );
}

/**
 * ÉTAPE 2 — Cours, évaluations & présences (Intermédiaires / Intermediate records).
 *
 * Supprime : présences, cahier de texte, sessions d'évaluation (modules et
 * notes restantes par cascade), puis classes et cours.
 *
 * S'exécute APRÈS les dépendances (Étape 1) et AVANT les racines (Étape 3).
 */
export async function resetCoursesAndAssessmentsData(
  organizationId: string
): Promise<DemoDataResetCounts> {
  return prisma.$transaction(
    async (tx) => {
      const counts = emptyResetCounts();

      // Présences (Attendance) — enfants des étudiants / cours / classes.
      counts.attendances = (
        await tx.attendance.deleteMany({ where: { organizationId } })
      ).count;

      // Cahier de texte.
      counts.courseLogs = (
        await tx.courseLog.deleteMany({ where: { organizationId } })
      ).count;

      // Sessions d'évaluation (cascade vers modules & notes éventuelles).
      counts.evaluations = (
        await tx.evaluation.deleteMany({ where: { organizationId } })
      ).count;

      // Affectations de classes résiduelles (sécurité) puis classes et cours.
      await tx.classEnrollment.deleteMany({ where: { organizationId } });
      counts.classes = (
        await tx.class.deleteMany({ where: { organizationId } })
      ).count;
      counts.courses = (
        await tx.course.deleteMany({ where: { organizationId } })
      ).count;

      return counts;
    },
    RESET_TX_OPTIONS
  );
}

/**
 * ÉTAPE 1 — Données financières, dépendances & paramètres (Feuilles / Leaves).
 *
 * Supprime les enregistrements enfants / dépendances AVANT les racines :
 * paiements, ventes POS, documents, salaires, dépenses, tâches, étapes voyage,
 * dossiers voyage & workflows, catalogue POS, comptes non-administrateurs puis
 * rôles personnalisés. Les tables liées à un `User` par une contrainte
 * `Restrict` (ventes, dépenses, tâches) sont purgées AVANT la suppression des
 * comptes de démonstration.
 *
 * DOIT ÊTRE EXÉCUTÉ EN PREMIER pour respecter les contraintes `Restrict`
 * (notamment `Task.createdBy` → `User`).
 */
export async function resetFinancialAndSettingsData(
  organizationId: string
): Promise<DemoDataResetCounts> {
  return prisma.$transaction(
    async (tx) => {
      const counts = emptyResetCounts();

      // 1. Paiements (recettes comptabilisées) — dépendent de Student/Enrollment.
      counts.payments = (
        await tx.payment.deleteMany({ where: { organizationId } })
      ).count;

      // 2. POS — lignes de vente (avant produits, contrainte Restrict) puis reçus.
      await tx.saleItem.deleteMany({ where: { sale: { organizationId } } });
      counts.sales = (
        await tx.sale.deleteMany({ where: { organizationId } })
      ).count;

      // 3. Pièces jointes / documents (visa et étudiants).
      counts.documents = (
        await tx.document.deleteMany({ where: { organizationId } })
      ).count;

      // 4. Salaires puis dépenses (avant suppression des comptes, Restrict).
      counts.payrolls = (
        await tx.payroll.deleteMany({ where: { organizationId } })
      ).count;
      counts.expenses = (
        await tx.expense.deleteMany({ where: { organizationId } })
      ).count;

      // 5. Tâches (créées par un User → Restrict) — DOIT AVANT User.
      counts.tasks = (
        await tx.task.deleteMany({ where: { organizationId } })
      ).count;

      // 6. Pipeline voyage : modèles de workflow, étapes de workflow puis dossiers.
      counts.workflowStages = (
        await tx.workflowStage.deleteMany({ where: { organizationId } })
      ).count;
      counts.workflows = (
        await tx.workflow.deleteMany({ where: { organizationId } })
      ).count;
      counts.travelProcedures = (
        await tx.travelProcedure.deleteMany({ where: { organizationId } })
      ).count;

      // 7. Catalogue POS : produits (avant catégories) puis catégories.
      counts.productServices = (
        await tx.productService.deleteMany({ where: { organizationId } })
      ).count;
      counts.productCategories = (
        await tx.productCategory.deleteMany({ where: { organizationId } })
      ).count;

      // 8. Comptes de démonstration non-administrateurs (les ADMIN /
      //    SUPER_ADMIN sont conservés) — APRÈS Task (Restrict).
      counts.demoUsers = (
        await tx.user.deleteMany({
          where: {
            organizationId,
            role: { notIn: ["ADMIN", "SUPER_ADMIN"] },
          },
        })
      ).count;

      // 9. Rôles personnalisés.
      counts.customRoles = (
        await tx.customRole.deleteMany({ where: { organizationId } })
      ).count;

      return counts;
    },
    RESET_TX_OPTIONS
  );
}
/**
 * Supprime TOUTES les données métier de l'organisation (étudiants, cours,
 * classes, paiements, ventes POS, présences, documents, dossiers voyage,
 * dépenses, tâches, catalogue POS, comptes de démonstration non-admin…).
 * L'organisation et ses comptes ADMIN / SUPER_ADMIN sont conservés.
 *
 * Orchestration « tout en un » décomposée en TROIS transactions courtes et
 * indépendantes (Étapes 1 à 3), chacune exécutée en moins de 3 s. C'est le
 * même découpage que les Server Actions pas-à-pas de la carte « Données de
 * démonstration » : chaque étape est idempotente, ce qui permet une reprise
 * simple en cas d'échec partiel.
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
    // Ordre « Leaves to Root » : dépendances d'abord (Task avant User via Restrict),
    // puis intermédiaires (cours/évaluations), enfin racines (étudiants/utilisateurs).
    const deleted = mergeResetCounts(
      await resetFinancialAndSettingsData(organizationId),
      await resetCoursesAndAssessmentsData(organizationId),
      await resetStudentsAndSchoolingData(organizationId)
    );

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
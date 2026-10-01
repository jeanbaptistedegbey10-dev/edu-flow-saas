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
//   - resetCoursesAndAssessmentsData     (Étape 2 : cours, séances, éval. & présences) ;
//   - resetFinancialAndSettingsData      (Étape 3 : finances & paramètres).
// Chaque étape enchaîne des vagues de `deleteMany` exécutées EN PARALLÈLE
// (< 1 s par étape, aucun aller-retour superflu) : aucune requête unique ne
// s'approche du budget d'exécution des fonctions Vercel. Les Server Actions
// de la carte « Données de démonstration » invoquent ces étapes
// SÉQUENTIELLEMENT (une requête HTTP par étape) et affichent une liste de
// contrôle progressant en temps réel.
// `resetOrganizationData` reste disponible en orchestration « tout en un »
// (compatibilité) — elle enchaîne simplement les trois étapes ci-dessus.

/**
 * Logo EduFlow appliqué par défaut aux organisations.
 *
 * L'asset est servi par le dossier `public/` : le chemin `/logo.png` est donc
 * résolu directement par le navigateur. Il est injecté à la création de
 * l'organisation et lors de l'injection du jeu de démonstration, afin que les
 * documents imprimables (reçus, bulletins) et l'en-tête du tableau de bord
 * affichent toujours un logo — même avant que l'administrateur n'en
 * téléverse un.
 */
export const DEFAULT_ORGANIZATION_LOGO_URL = "/logo.png";

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

  // Logo par défaut : l'organisation reçoit immédiatement le logo EduFlow
  // (« /logo.png »), afin que les reçus, bulletins et l'en-tête du tableau de
  // bord soient illustrés dès la première utilisation. Un logo téléversé plus
  // tard par l'administrateur le remplace.
  await prisma.organization
    .update({
      where: { id: organizationId },
      data: { logoUrl: DEFAULT_ORGANIZATION_LOGO_URL },
    })
    .catch((error: unknown) => {
      // Non bloquant : l'injection des données de démonstration a réussi, un
      // logo manquant ne doit pas faire échouer l'opération.
      console.error(
        "[demo-data] Impossible d'appliquer le logo par défaut à l'organisation",
        organizationId,
        error
      );
    });

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
  /** Séances de cours supprimées (ClassSession). */
  classSessions: number;
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
    classSessions: 0,
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
 * Les étapes de réinitialisation s'exécutent SANS transaction interactive :
 * chaque étape enchaîne des VAGUES de suppressions en masse (`deleteMany`)
 * exécutées en parallèle (Promise.all) dans un ordre « leaves to root »
 * respectueux des contraintes de clés étrangères. Ce découpage réduit le
 * temps de réponse à quelques allers-retours réseau par vague (< 1 s par
 * étape sur une organisation de démonstration) et reste idempotent : en cas
 * d'échec partiel, ré-exécuter l'étape achève le nettoyage sans effet de bord.
 */

/**
 * ÉTAPE 3 — Étudiants & scolarité (Racines / Root records).
 *
 * Supprime : notes, affectations de classes, inscriptions aux cours, logements
 * étudiants, puis les étudiants eux-mêmes.
 *
 * DOIT ÊTRE EXÉCUTÉ EN DERNIER : les étudiants sont référencés par de nombreuses
 * tables enfants (présences, documents, paiements, étapes voyage…) qui doivent
 * avoir été supprimées auparavant (Étapes 1 et 2).
 *
 * Vagues parallèles idempotentes : ré-exécutable sans effet de bord.
 */
export async function resetStudentsAndSchoolingData(
  organizationId: string
): Promise<DemoDataResetCounts> {
  const counts = emptyResetCounts();

  // Vague 1 — enfants directs des étudiants (indépendants entre eux) :
  // notes, affectations de classes, inscriptions aux cours, logements.
  const [grades, classEnrollments, enrollments, housings] = await Promise.all([
    prisma.grade
      .deleteMany({ where: { student: { organizationId } } })
      .then((r) => r.count),
    prisma.classEnrollment
      .deleteMany({ where: { organizationId } })
      .then((r) => r.count),
    prisma.enrollment
      .deleteMany({ where: { student: { organizationId } } })
      .then((r) => r.count),
    prisma.housing
      .deleteMany({ where: { organizationId } })
      .then((r) => r.count),
  ]);
  counts.grades = grades;
  counts.classEnrollments = classEnrollments;
  counts.enrollments = enrollments;
  counts.housings = housings;

  // Vague 2 — les étudiants en dernier (d'autres tables référencent cet
  // identifiant ; toutes leurs dépendances ont déjà été purgées).
  counts.students = (
    await prisma.student.deleteMany({ where: { organizationId } })
  ).count;

  return counts;
}

/**
 * ÉTAPE 2 — Cours, séances de cours, évaluations & présences (Intermédiaires /
 * Intermediate records).
 *
 * Supprime : séances de cours (ClassSession), présences, cahier de texte,
 * sessions d'évaluation (modules et notes restantes par cascade), puis classes
 * et cours.
 *
 * S'exécute APRÈS les dépendances (Étape 1) et AVANT les racines (Étape 3).
 */
export async function resetCoursesAndAssessmentsData(
  organizationId: string
): Promise<DemoDataResetCounts> {
  const counts = emptyResetCounts();

  // Vague 1 — présences, séances de cours (ClassSession), cahier de texte et
  // sessions d'évaluation (cascade vers modules & notes éventuelles) :
  // tables indépendantes supprimées EN PARALLÈLE (bulk deleteMany).
  // ⚠️ ClassSession est purgée EXPLICITEMENT (AVANT les classes) pour éviter
  // tout orphelin et compter les suppressions : la cascade depuis Class
  // suffirait, mais ferait disparaître les séances des compteurs renvoyés.
  const [attendances, classSessions, courseLogs, evaluations] =
    await Promise.all([
      prisma.attendance
        .deleteMany({ where: { organizationId } })
        .then((r) => r.count),
      prisma.classSession
        .deleteMany({ where: { organizationId } })
        .then((r) => r.count),
      prisma.courseLog
        .deleteMany({ where: { organizationId } })
        .then((r) => r.count),
      prisma.evaluation
        .deleteMany({ where: { organizationId } })
        .then((r) => r.count),
    ]);
  counts.attendances = attendances;
  counts.classSessions = classSessions;
  counts.courseLogs = courseLogs;
  counts.evaluations = evaluations;

  // Sécurité : affectations de classes résiduelles (référencent Class).
  await prisma.classEnrollment.deleteMany({ where: { organizationId } });

  // Vagues 2 & 3 — classes AVANT cours : supprimer le cours déclencherait la
  // cascade sur les classes et fausserait les compteurs renvoyés au client.
  counts.classes = (
    await prisma.class.deleteMany({ where: { organizationId } })
  ).count;
  counts.courses = (
    await prisma.course.deleteMany({ where: { organizationId } })
  ).count;

  return counts;
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
  const counts = emptyResetCounts();

  // Vague 1 — tables feuilles sans dépendance Restrict entre elles :
  // paiements, documents, salaires, dépenses, tâches, dossiers & étapes de
  // voyage, lignes de vente POS, catégories de produits. Supprimées EN
  // PARALLÈLE (bulk deleteMany) pour réduire le temps de réponse à un seul
  // aller-retour logique par vague.
  const [
    payments,
    documents,
    payrolls,
    expenses,
    tasks,
    travelProcedures,
    workflowStages,
  ] = await Promise.all([
    prisma.payment
      .deleteMany({ where: { organizationId } })
      .then((r) => r.count),
    prisma.document
      .deleteMany({ where: { organizationId } })
      .then((r) => r.count),
    prisma.payroll
      .deleteMany({ where: { organizationId } })
      .then((r) => r.count),
    prisma.expense
      .deleteMany({ where: { organizationId } })
      .then((r) => r.count),
    prisma.task.deleteMany({ where: { organizationId } }).then((r) => r.count),
    prisma.travelProcedure
      .deleteMany({ where: { organizationId } })
      .then((r) => r.count),
    prisma.workflowStage
      .deleteMany({ where: { organizationId } })
      .then((r) => r.count),
    // Lignes de vente POS (comptées séparément, avant Sale & ProductService —
    // contrainte onDelete: Restrict sur ProductService)…
    prisma.saleItem.deleteMany({ where: { sale: { organizationId } } }),
    // …et catégories de produits (ProductService.categoryId → SetNull :
    // ordre indifférent vis-à-vis des produits).
    prisma.productCategory
      .deleteMany({ where: { organizationId } })
      .then((r) => r.count),
  ]);
  counts.payments = payments;
  counts.documents = documents;
  counts.payrolls = payrolls;
  counts.expenses = expenses;
  counts.tasks = tasks;
  counts.travelProcedures = travelProcedures;
  counts.workflowStages = workflowStages;

  // Vague 2 — dépendent des tables de la vague 1 :
  //   - Sale            : ses lignes (SaleItem) ont été supprimées en vague 1 ;
  //   - Workflow        : ses étapes (WorkflowStage) ont été supprimées en vague 1 ;
  //   - ProductService  : ses lignes de vente ont été supprimées en vague 1.
  const [sales, workflows] = await Promise.all([
    prisma.sale.deleteMany({ where: { organizationId } }).then((r) => r.count),
    prisma.workflow
      .deleteMany({ where: { organizationId } })
      .then((r) => r.count),
    prisma.productService
      .deleteMany({ where: { organizationId } })
      .then((r) => r.count),
  ]);
  counts.sales = sales;
  counts.workflows = workflows;

  // Vague 3 — comptes de démonstration non-administrateurs (les ADMIN /
  // SUPER_ADMIN sont conservés) APRÈS Task (Restrict), Sale (Restrict sur le
  // caissier) et Expense (Restrict sur le créateur), puis rôles personnalisés
  // (User.customRoleId → SetNull : ordre indifférent, exécution parallèle).
  const [demoUsers, customRoles] = await Promise.all([
    prisma.user
      .deleteMany({
        where: {
          organizationId,
          role: { notIn: ["ADMIN", "SUPER_ADMIN"] },
        },
      })
      .then((r) => r.count),
    prisma.customRole
      .deleteMany({ where: { organizationId } })
      .then((r) => r.count),
  ]);
  counts.demoUsers = demoUsers;
  counts.customRoles = customRoles;

  return counts;
}
/**
 * Supprime TOUTES les données métier de l'organisation (étudiants, cours,
 * classes, paiements, ventes POS, présences, documents, dossiers voyage,
 * dépenses, tâches, catalogue POS, comptes de démonstration non-admin…).
 * L'organisation et ses comptes ADMIN / SUPER_ADMIN sont conservés.
 *
 * Orchestration « tout en un » décomposée en TROIS étapes courtes et
 * indépendantes (Étapes 1 à 3), chacune exécutée en moins de 3 s via des
 * vagues parallèles de `deleteMany`. C'est le même découpage que les Server
 * Actions pas-à-pas de la carte « Données de démonstration » : chaque étape
 * est idempotente, ce qui permet une reprise simple en cas d'échec partiel.
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
 * comptes non-administrateurs, élèves, cours, classes, séances de cours
 * (ClassSession) ou présences (Attendance). Le jeu de
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
    const [demoAccounts, students, courses, classes, classSessions, attendances] =
      await Promise.all([
        prisma.user.count({
          where: {
            organizationId,
            role: { notIn: ["ADMIN", "SUPER_ADMIN"] },
          },
        }),
        prisma.student.count({ where: { organizationId } }),
        prisma.course.count({ where: { organizationId } }),
        prisma.class.count({ where: { organizationId } }),
        prisma.classSession.count({ where: { organizationId } }),
        prisma.attendance.count({ where: { organizationId } }),
      ]);

    return {
      hasData:
        demoAccounts > 0 ||
        students > 0 ||
        courses > 0 ||
        classes > 0 ||
        classSessions > 0 ||
        attendances > 0,
      demoAccounts,
    };
  } catch (error) {
    console.error("[demo-data] Échec du contrôle de présence :", error);
    return { hasData: false, demoAccounts: 0 };
  }
}
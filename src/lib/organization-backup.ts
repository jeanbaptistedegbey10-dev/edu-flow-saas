import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  BACKUP_REASONS,
  BACKUP_RETENTION_DAYS,
  BACKUP_SCHEMA_VERSION,
  type BackupReason,
  type OrganizationBackupDTO,
} from "@/lib/demo-data-constants";
import {
  resetCoursesAndAssessmentsData,
  resetFinancialAndSettingsData,
  resetStudentsAndSchoolingData,
} from "@/lib/demo-data";

// --------------------------------------
// Sauvegardes automatiques (Auto-Backup / Restore)
// --------------------------------------
//
// La suppression n'est jamais « sans filet ». Avant chaque purge de démo /
// réinitialisation, l'intégralité des tables métier de l'organisation est
// sérialisée dans un snapshot JSON persisté en base (table
// `organization_backups`). La purge n'est engagée qu'APRÈS l'écriture
// réussie de ce snapshot ; l'historique permet ensuite de restaurer
// l'organisation à son état antérieur.
//
// ---------------------------------------------------------------
// Découpage « sans timeout » (cohérent avec `src/lib/demo-data.ts`)
// ---------------------------------------------------------------
// La lecture du snapshot est regroupée en TROIS vagues de lectures parallèles
// et la réinsertion procède table par table : aucune requête unique ne se
// rapproche du budget d'exécution des fonctions Serverless.
//
// ORDRE DE RESTAURATION : inverse du « leaves to root » de la suppression.
// Les tables parentes sont réinsérées AVANT leurs enfants (ordre de
// déclaration de `SNAPSHOT_TABLES`), ce qui respecte les contraintes de clés
// étrangères et évite les violations P2003 / P2014.
//
// Les identifiants d'origine sont conservés : la restauration restitue des
// enregistrements strictement identiques (mêmes `id`), ce qui préserve les
// relations et les liens externes (rapports parents, QR codes certificats).

/** Version du format de snapshot écrite dans le JSON. */
const SCHEMA_VERSION = BACKUP_SCHEMA_VERSION;

/**
 * Volumétrie maximale (caractères) du JSON sérialisé avant de refuser la
 * sauvegarde. Au-delà, la ligne PostgreSQL se rapproche de ses limites et
 * l'opération risquerait d'échouer en cours de purge : mieux vaut refuser
 * explicitement et laisser l'administrateur intervenir.
 */
const MAX_BACKUP_LENGTH = 50 * 1024 * 1024; // 50 Mo

/** Fenêtre « expiration imminente » affichée en avertissement (48 h). */
const EXPIRING_SOON_MS = 48 * 60 * 60 * 1000;

/** Une entrée du snapshot : une table, sa lecture et sa réinsertion. */
type SnapshotTable = {
  /** Nom de la table dans le snapshot JSON (clé de `tables`). */
  name: string;
  /** Libellé lisible utilisé dans les messages de la Server Action. */
  label: string;
  /**
   * Restitue les lignes de l'organisation sous forme d'objets JSON.
   * Les `Date` sont sérialisées en chaînes ISO par `JSON.stringify` et
   * réacceptées telles quelles par Prisma à la réinsertion.
   */
  read: (organizationId: string) => Promise<Prisma.InputJsonObject[]>;
  /**
   * Réinsère les lignes du snapshot et retourne le nombre de lignes
   * effectivement écrites. `skipDuplicates` rend l'opération idempotente
   * (lignes déjà présentes ignorées) et neutralise les conflits de clés
   * uniques (P2002 : e-mail, studentCode, verificationCode…).
   */
  insert: (rows: Prisma.InputJsonObject[]) => Promise<number>;
};

/**
 * Description des tables sauvegardées, ORDONNÉES PAR DÉPENDANCE (parent →
 * enfant). Cet ordre gouverne la RÉINSERTION (respect des clés étrangères).
 *
 * Périmètre : toutes les tables métier purgées par la réinitialisation, plus
 * celles qui en dépendent par cascade. Sont volontairement EXCLUSES :
 *   - `Organization` (jamais supprimée par la purge) ;
 *   - les comptes `ADMIN` / `SUPER_ADMIN` (conservés par la purge — les
 *     réinsérer provoquerait un conflit d'e-mail unique P2002) ;
 *   - `Invoice` / `CashRegisterSession` / `AuditLog` (jamais supprimés par la
 *     purge : les réinsérer dupliquerait des données toujours vivantes) ;
 *   - `organization_backups` (un snapshot ne s'auto-contient jamais).
 */
const SNAPSHOT_TABLES: SnapshotTable[] = [
  {
    name: "customRoles",
    label: "Rôles personnalisés",
    read: (organizationId) =>
      prisma.customRole
        .findMany({ where: { organizationId } })
        .then((rows) => rows as unknown as Prisma.InputJsonObject[]),
    insert: async (rows) => {
      const { count } = await prisma.customRole.createMany({
        data: rows as unknown as Prisma.CustomRoleCreateManyInput[],
        skipDuplicates: true,
      });
      return count;
    },
  },
  {
    // Comptes NON administrateurs uniquement (les comptes admin sont conservés
    // par la purge et ne doivent pas être réinsérés : `email` est unique
    // globalement → conflit P2002 en cas de doublon).
    name: "users",
    label: "Comptes de l'équipe",
    read: (organizationId) =>
      prisma.user
        .findMany({
          where: { organizationId, role: { notIn: ["ADMIN", "SUPER_ADMIN"] } },
        })
        .then((rows) => rows as unknown as Prisma.InputJsonObject[]),
    insert: async (rows) => {
      const { count } = await prisma.user.createMany({
        data: rows as unknown as Prisma.UserCreateManyInput[],
        skipDuplicates: true,
      });
      return count;
    },
  },
  {
    name: "productCategories",
    label: "Catégories de produits",
    read: (organizationId) =>
      prisma.productCategory
        .findMany({ where: { organizationId } })
        .then((rows) => rows as unknown as Prisma.InputJsonObject[]),
    insert: async (rows) => {
      const { count } = await prisma.productCategory.createMany({
        data: rows as unknown as Prisma.ProductCategoryCreateManyInput[],
        skipDuplicates: true,
      });
      return count;
    },
  },
  {
    name: "productServices",
    label: "Produits et services",
    read: (organizationId) =>
      prisma.productService
        .findMany({ where: { organizationId } })
        .then((rows) => rows as unknown as Prisma.InputJsonObject[]),
    insert: async (rows) => {
      const { count } = await prisma.productService.createMany({
        data: rows as unknown as Prisma.ProductServiceCreateManyInput[],
        skipDuplicates: true,
      });
      return count;
    },
  },
  {
    name: "courses",
    label: "Cours",
    read: (organizationId) =>
      prisma.course
        .findMany({ where: { organizationId } })
        .then((rows) => rows as unknown as Prisma.InputJsonObject[]),
    insert: async (rows) => {
      const { count } = await prisma.course.createMany({
        data: rows as unknown as Prisma.CourseCreateManyInput[],
        skipDuplicates: true,
      });
      return count;
    },
  },
  {
    name: "classes",
    label: "Classes",
    read: (organizationId) =>
      prisma.class
        .findMany({ where: { organizationId } })
        .then((rows) => rows as unknown as Prisma.InputJsonObject[]),
    insert: async (rows) => {
      const { count } = await prisma.class.createMany({
        data: rows as unknown as Prisma.ClassCreateManyInput[],
        skipDuplicates: true,
      });
      return count;
    },
  },
  {
    // `ClassSchedule` ne porte pas d'`organizationId` : filtré via sa classe.
    name: "classSchedules",
    label: "Créneaux de classes",
    read: (organizationId) =>
      prisma.classSchedule
        .findMany({ where: { class: { organizationId } } })
        .then((rows) => rows as unknown as Prisma.InputJsonObject[]),
    insert: async (rows) => {
      const { count } = await prisma.classSchedule.createMany({
        data: rows as unknown as Prisma.ClassScheduleCreateManyInput[],
        skipDuplicates: true,
      });
      return count;
    },
  },
  {
    // Réinséré APRÈS `classes` : `Student.currentClassId` référence `Class`.
    name: "students",
    label: "Étudiants",
    read: (organizationId) =>
      prisma.student
        .findMany({ where: { organizationId } })
        .then((rows) => rows as unknown as Prisma.InputJsonObject[]),
    insert: async (rows) => {
      const { count } = await prisma.student.createMany({
        data: rows as unknown as Prisma.StudentCreateManyInput[],
        skipDuplicates: true,
      });
      return count;
    },
  },
  {
    // Réinséré après `students` ET `classes` (FK `studentId` / `classId`).
    name: "classEnrollments",
    label: "Affectations de classes",
    read: (organizationId) =>
      prisma.classEnrollment
        .findMany({ where: { organizationId } })
        .then((rows) => rows as unknown as Prisma.InputJsonObject[]),
    insert: async (rows) => {
      const { count } = await prisma.classEnrollment.createMany({
        data: rows as unknown as Prisma.ClassEnrollmentCreateManyInput[],
        skipDuplicates: true,
      });
      return count;
    },
  },
  {
    // `Enrollment` ne porte pas d'`organizationId` : filtré via son étudiant.
    name: "enrollments",
    label: "Inscriptions aux cours",
    read: (organizationId) =>
      prisma.enrollment
        .findMany({ where: { student: { organizationId } } })
        .then((rows) => rows as unknown as Prisma.InputJsonObject[]),
    insert: async (rows) => {
      const { count } = await prisma.enrollment.createMany({
        data: rows as unknown as Prisma.EnrollmentCreateManyInput[],
        skipDuplicates: true,
      });
      return count;
    },
  },
  {
    // `WorkflowStage` référence `Workflow` : réinséré après les processus.
    name: "workflows",
    label: "Processus voyage",
    read: (organizationId) =>
      prisma.workflow
        .findMany({ where: { organizationId } })
        .then((rows) => rows as unknown as Prisma.InputJsonObject[]),
    insert: async (rows) => {
      const { count } = await prisma.workflow.createMany({
        data: rows as unknown as Prisma.WorkflowCreateManyInput[],
        skipDuplicates: true,
      });
      return count;
    },
  },
  {
    name: "workflowStages",
    label: "Étapes de processus",
    read: (organizationId) =>
      prisma.workflowStage
        .findMany({ where: { organizationId } })
        .then((rows) => rows as unknown as Prisma.InputJsonObject[]),
    insert: async (rows) => {
      const { count } = await prisma.workflowStage.createMany({
        data: rows as unknown as Prisma.WorkflowStageCreateManyInput[],
        skipDuplicates: true,
      });
      return count;
    },
  },
  {
    // Référencée par `Document`, `Payment` et `Sale` : réinsérée avant eux.
    name: "travelProcedures",
    label: "Dossiers voyage",
    read: (organizationId) =>
      prisma.travelProcedure
        .findMany({ where: { organizationId } })
        .then((rows) => rows as unknown as Prisma.InputJsonObject[]),
    insert: async (rows) => {
      const { count } = await prisma.travelProcedure.createMany({
        data: rows as unknown as Prisma.TravelProcedureCreateManyInput[],
        skipDuplicates: true,
      });
      return count;
    },
  },
  {
    // Référencée par `Attendance` : réinsérée avant les présences.
    name: "classSessions",
    label: "Séances de cours",
    read: (organizationId) =>
      prisma.classSession
        .findMany({ where: { organizationId } })
        .then((rows) => rows as unknown as Prisma.InputJsonObject[]),
    insert: async (rows) => {
      const { count } = await prisma.classSession.createMany({
        data: rows as unknown as Prisma.ClassSessionCreateManyInput[],
        skipDuplicates: true,
      });
      return count;
    },
  },
  {
    // Référence `ClassSession` + `Student` : réinsérée en fin de vague.
    name: "attendances",
    label: "Présences",
    read: (organizationId) =>
      prisma.attendance
        .findMany({ where: { organizationId } })
        .then((rows) => rows as unknown as Prisma.InputJsonObject[]),
    insert: async (rows) => {
      const { count } = await prisma.attendance.createMany({
        data: rows as unknown as Prisma.AttendanceCreateManyInput[],
        skipDuplicates: true,
      });
      return count;
    },
  },
  {
    name: "courseLogs",
    label: "Cahier de texte",
    read: (organizationId) =>
      prisma.courseLog
        .findMany({ where: { organizationId } })
        .then((rows) => rows as unknown as Prisma.InputJsonObject[]),
    insert: async (rows) => {
      const { count } = await prisma.courseLog.createMany({
        data: rows as unknown as Prisma.CourseLogCreateManyInput[],
        skipDuplicates: true,
      });
      return count;
    },
  },
  {
    // Référencée par `EvaluationModule` : réinsérée avant les modules.
    name: "evaluations",
    label: "Évaluations",
    read: (organizationId) =>
      prisma.evaluation
        .findMany({ where: { organizationId } })
        .then((rows) => rows as unknown as Prisma.InputJsonObject[]),
    insert: async (rows) => {
      const { count } = await prisma.evaluation.createMany({
        data: rows as unknown as Prisma.EvaluationCreateManyInput[],
        skipDuplicates: true,
      });
      return count;
    },
  },
  {
    // Référencée par `Grade` : réinsérée avant les notes.
    name: "evaluationModules",
    label: "Modules d'évaluation",
    read: (organizationId) =>
      prisma.evaluationModule
        .findMany({ where: { evaluation: { organizationId } } })
        .then((rows) => rows as unknown as Prisma.InputJsonObject[]),
    insert: async (rows) => {
      const { count } = await prisma.evaluationModule.createMany({
        data: rows as unknown as Prisma.EvaluationModuleCreateManyInput[],
        skipDuplicates: true,
      });
      return count;
    },
  },
  {
    // `Grade` ne porte pas d'`organizationId` : filtré via l'étudiant.
    name: "grades",
    label: "Notes",
    read: (organizationId) =>
      prisma.grade
        .findMany({ where: { student: { organizationId } } })
        .then((rows) => rows as unknown as Prisma.InputJsonObject[]),
    insert: async (rows) => {
      const { count } = await prisma.grade.createMany({
        data: rows as unknown as Prisma.GradeCreateManyInput[],
        skipDuplicates: true,
      });
      return count;
    },
  },
  {
    name: "bulletinAppreciations",
    label: "Appréciations de bulletins",
    read: (organizationId) =>
      prisma.bulletinAppreciation
        .findMany({ where: { organizationId } })
        .then((rows) => rows as unknown as Prisma.InputJsonObject[]),
    insert: async (rows) => {
      const { count } = await prisma.bulletinAppreciation.createMany({
        data: rows as unknown as Prisma.BulletinAppreciationCreateManyInput[],
        skipDuplicates: true,
      });
      return count;
    },
  },
  {
    name: "documents",
    label: "Documents",
    read: (organizationId) =>
      prisma.document
        .findMany({ where: { organizationId } })
        .then((rows) => rows as unknown as Prisma.InputJsonObject[]),
    insert: async (rows) => {
      const { count } = await prisma.document.createMany({
        data: rows as unknown as Prisma.DocumentCreateManyInput[],
        skipDuplicates: true,
      });
      return count;
    },
  },
  {
    name: "payments",
    label: "Paiements",
    read: (organizationId) =>
      prisma.payment
        .findMany({ where: { organizationId } })
        .then((rows) => rows as unknown as Prisma.InputJsonObject[]),
    insert: async (rows) => {
      const { count } = await prisma.payment.createMany({
        data: rows as unknown as Prisma.PaymentCreateManyInput[],
        skipDuplicates: true,
      });
      return count;
    },
  },
  {
    // Référencée par `PaymentScheduleItem` : réinsérée avant les tranches.
    name: "paymentSchedules",
    label: "Échéanciers de paiement",
    read: (organizationId) =>
      prisma.paymentSchedule
        .findMany({ where: { organizationId } })
        .then((rows) => rows as unknown as Prisma.InputJsonObject[]),
    insert: async (rows) => {
      const { count } = await prisma.paymentSchedule.createMany({
        data: rows as unknown as Prisma.PaymentScheduleCreateManyInput[],
        skipDuplicates: true,
      });
      return count;
    },
  },
  {
    // `PaymentScheduleItem` ne porte pas d'`organizationId`.
    name: "paymentScheduleItems",
    label: "Tranches d'échéancier",
    read: (organizationId) =>
      prisma.paymentScheduleItem
        .findMany({ where: { schedule: { organizationId } } })
        .then((rows) => rows as unknown as Prisma.InputJsonObject[]),
    insert: async (rows) => {
      const { count } = await prisma.paymentScheduleItem.createMany({
        data: rows as unknown as Prisma.PaymentScheduleItemCreateManyInput[],
        skipDuplicates: true,
      });
      return count;
    },
  },
  {
    name: "studentTransactions",
    label: "Transactions étudiantes",
    read: (organizationId) =>
      prisma.studentTransaction
        .findMany({ where: { organizationId } })
        .then((rows) => rows as unknown as Prisma.InputJsonObject[]),
    insert: async (rows) => {
      const { count } = await prisma.studentTransaction.createMany({
        data: rows as unknown as Prisma.StudentTransactionCreateManyInput[],
        skipDuplicates: true,
      });
      return count;
    },
  },
  {
    name: "housings",
    label: "Logements étudiants",
    read: (organizationId) =>
      prisma.housing
        .findMany({ where: { organizationId } })
        .then((rows) => rows as unknown as Prisma.InputJsonObject[]),
    insert: async (rows) => {
      const { count } = await prisma.housing.createMany({
        data: rows as unknown as Prisma.HousingCreateManyInput[],
        skipDuplicates: true,
      });
      return count;
    },
  },
  {
    name: "tasks",
    label: "Tâches",
    read: (organizationId) =>
      prisma.task
        .findMany({ where: { organizationId } })
        .then((rows) => rows as unknown as Prisma.InputJsonObject[]),
    insert: async (rows) => {
      const { count } = await prisma.task.createMany({
        data: rows as unknown as Prisma.TaskCreateManyInput[],
        skipDuplicates: true,
      });
      return count;
    },
  },
  {
    name: "expenses",
    label: "Dépenses",
    read: (organizationId) =>
      prisma.expense
        .findMany({ where: { organizationId } })
        .then((rows) => rows as unknown as Prisma.InputJsonObject[]),
    insert: async (rows) => {
      const { count } = await prisma.expense.createMany({
        data: rows as unknown as Prisma.ExpenseCreateManyInput[],
        skipDuplicates: true,
      });
      return count;
    },
  },
  {
    name: "payrolls",
    label: "Salaires",
    read: (organizationId) =>
      prisma.payroll
        .findMany({ where: { organizationId } })
        .then((rows) => rows as unknown as Prisma.InputJsonObject[]),
    insert: async (rows) => {
      const { count } = await prisma.payroll.createMany({
        data: rows as unknown as Prisma.PayrollCreateManyInput[],
        skipDuplicates: true,
      });
      return count;
    },
  },
  {
    // Référencée par `SaleItem` : réinsérée avant les lignes de vente.
    name: "sales",
    label: "Ventes POS",
    read: (organizationId) =>
      prisma.sale
        .findMany({ where: { organizationId } })
        .then((rows) => rows as unknown as Prisma.InputJsonObject[]),
    insert: async (rows) => {
      const { count } = await prisma.sale.createMany({
        data: rows as unknown as Prisma.SaleCreateManyInput[],
        skipDuplicates: true,
      });
      return count;
    },
  },
  {
    // Référence `Sale` ET `ProductService` (FK `Restrict`) : réinsérée en
    // toute fin — table la plus dépendante du snapshot.
    name: "saleItems",
    label: "Lignes de vente",
    read: (organizationId) =>
      prisma.saleItem
        .findMany({ where: { sale: { organizationId } } })
        .then((rows) => rows as unknown as Prisma.InputJsonObject[]),
    insert: async (rows) => {
      const { count } = await prisma.saleItem.createMany({
        data: rows as unknown as Prisma.SaleItemCreateManyInput[],
        skipDuplicates: true,
      });
      return count;
    },
  },
  {
    name: "certificates",
    label: "Certificats",
    read: (organizationId) =>
      prisma.certificate
        .findMany({ where: { organizationId } })
        .then((rows) => rows as unknown as Prisma.InputJsonObject[]),
    insert: async (rows) => {
      const { count } = await prisma.certificate.createMany({
        data: rows as unknown as Prisma.CertificateCreateManyInput[],
        skipDuplicates: true,
      });
      return count;
    },
  },
  {
    name: "leadNotes",
    label: "Notes de suivi CRM",
    read: (organizationId) =>
      prisma.leadNote
        .findMany({ where: { organizationId } })
        .then((rows) => rows as unknown as Prisma.InputJsonObject[]),
    insert: async (rows) => {
      const { count } = await prisma.leadNote.createMany({
        data: rows as unknown as Prisma.LeadNoteCreateManyInput[],
        skipDuplicates: true,
      });
      return count;
    },
  },
  {
    // `Referral` ne porte pas d'`organizationId` : filtré via le parrain.
    name: "referrals",
    label: "Parrainages",
    read: (organizationId) =>
      prisma.referral
        .findMany({ where: { referrer: { organizationId } } })
        .then((rows) => rows as unknown as Prisma.InputJsonObject[]),
    insert: async (rows) => {
      const { count } = await prisma.referral.createMany({
        data: rows as unknown as Prisma.ReferralCreateManyInput[],
        skipDuplicates: true,
      });
      return count;
    },
  },
];

/** Contenu brut d'un snapshot avant désérialisation. */
type SnapshotPayload = {
  schemaVersion: number;
  organizationId: string;
  createdAt: string;
  tables: Record<string, Prisma.InputJsonObject[]>;
};

/**
 * Découpe la liste des tables en vagues de lectures parallèles.
 *
 * Une seule requête ne doit jamais dépasser le budget d'exécution Serverless :
 * les lectures sont donc regroupées par vagues de taille bornée. La découpe
 * reste correcte si `SNAPSHOT_TABLES` gagne ou perd des tables (les vagues
 * sont calculées dynamiquement, jamais codées en dur).
 */
function buildReadBatches(
  tables: readonly SnapshotTable[]
): SnapshotTable[][] {
  const BATCH_SIZE = 8;
  const batches: SnapshotTable[][] = [];
  for (let index = 0; index < tables.length; index += BATCH_SIZE) {
    batches.push(tables.slice(index, index + BATCH_SIZE));
  }
  return batches;
}

/** Résultat typé de la création d'une sauvegarde. */
export type OrganizationBackupCreateResult =
  | {
      ok: true;
      backupId: string;
      rowCount: number;
      sizeBytes: number;
      expiresAt: Date;
    }
  | { ok: false; reason: "ORG_NOT_FOUND" | "TOO_LARGE" | "UNKNOWN" };

/** Résultat typé d'une restauration. */
export type OrganizationBackupRestoreResult =
  | { ok: true; rowCount: number; tableCount: number }
  | {
      ok: false;
      reason:
        | "BACKUP_NOT_FOUND"
        | "BACKUP_EXPIRED"
        | "INVALID_PAYLOAD"
        | "SAFETY_BACKUP_FAILED"
        | "UNKNOWN";
    };

/**
 * Nombre de jours de rétention retenu. La variable d'environnement
 * `BACKUP_RETENTION_DAYS` permet de porter la durée à 30 jours (ou tout
 * autre délai) sans modification de code.
 */
function getRetentionDays(): number {
  const raw = Number.parseInt(process.env.BACKUP_RETENTION_DAYS ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : BACKUP_RETENTION_DAYS;
}

/** Calcule la date d'expiration d'une sauvegarde créée à l'instant `from`. */
export function computeBackupExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + getRetentionDays() * 24 * 60 * 60 * 1000);
}

/** Formate un poids en octets pour l'affichage (« 1,2 Mo »). */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

/** Convertit une ligne de sauvegarde en DTO affichable côté client. */
function toBackupDTO(backup: {
  id: string;
  backupName: string;
  reason: string;
  sizeBytes: number;
  rowCount: number;
  createdAt: Date;
  expiresAt: Date;
}): OrganizationBackupDTO {
  const remainingMs = backup.expiresAt.getTime() - Date.now();
  const isExpired = remainingMs <= 0;
  const daysUntilExpiry = isExpired
    ? 0
    : Math.max(1, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));

  return {
    id: backup.id,
    backupName: backup.backupName,
    reason: backup.reason,
    sizeLabel: formatBytes(backup.sizeBytes),
    rowCount: backup.rowCount,
    // Sérialisés en ISO : le composant client les formate en local.
    createdAt: backup.createdAt.toISOString(),
    expiresAt: backup.expiresAt.toISOString(),
    isExpired,
    isExpiringSoon: !isExpired && remainingMs <= EXPIRING_SOON_MS,
    daysUntilExpiry,
  };
}

// ---------------------------------------------------------------------------
// Création d'une sauvegarde (snapshot)
// ---------------------------------------------------------------------------

/**
 * Crée une sauvegarde (snapshot JSON) de l'intégralité des données métier
 * d'une organisation.
 *
 * À appeler AVANT toute suppression : la purge ne doit être engagée qu'après
 * l'écriture réussie du snapshot (cf. `createOrganizationBackupAction`).
 *
 * Les lectures sont regroupées en vagues parallèles bornées : aucune requête
 * unique ne se rapproche du budget d'exécution Serverless.
 */
export async function createOrganizationBackup(
  organizationId: string,
  createdById: string | null,
  reason: BackupReason = BACKUP_REASONS.AUTO_PURGE
): Promise<OrganizationBackupCreateResult> {
  try {
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });

    if (!organization) {
      return { ok: false, reason: "ORG_NOT_FOUND" };
    }

    // Lecture du snapshot, vague par vague (tables parallèles par vague).
    const tables: Record<string, Prisma.InputJsonObject[]> = {};
    let rowCount = 0;

    for (const batch of buildReadBatches(SNAPSHOT_TABLES)) {
      const rowsPerTable = await Promise.all(
        batch.map((table) => table.read(organizationId))
      );

      batch.forEach((table, index) => {
        const rows = rowsPerTable[index];
        tables[table.name] = rows;
        rowCount += rows.length;
      });
    }

    const createdAt = new Date();
    const payload: SnapshotPayload = {
      schemaVersion: SCHEMA_VERSION,
      organizationId,
      createdAt: createdAt.toISOString(),
      tables,
    };

    const dataJson = JSON.stringify(payload);

    // Garde-fou volumétrique : mieux vaut un refus explicite qu'une écriture
    // qui échouerait AU MOMENT de la purge (donc après la confirmation de
    // l'administrateur, alors que l'opération est déjà engagée).
    if (dataJson.length > MAX_BACKUP_LENGTH) {
      console.error(
        "[organization-backup] Snapshot trop volumineux, sauvegarde refusée :",
        formatBytes(dataJson.length)
      );
      return { ok: false, reason: "TOO_LARGE" };
    }

    const backupName = `Sauvegarde automatique du ${createdAt.toLocaleString(
      "fr-FR",
      { dateStyle: "short", timeStyle: "short" }
    )}`;

    const backup = await prisma.organizationBackup.create({
      data: {
        organizationId,
        backupName,
        reason,
        schemaVersion: SCHEMA_VERSION,
        dataJson,
        sizeBytes: dataJson.length,
        rowCount,
        createdById,
        createdAt,
        expiresAt: computeBackupExpiry(createdAt),
      },
      select: { id: true, expiresAt: true },
    });

    return {
      ok: true,
      backupId: backup.id,
      rowCount,
      sizeBytes: dataJson.length,
      expiresAt: backup.expiresAt,
    };
  } catch (error) {
    console.error("[organization-backup] Échec de la création :", error);
    return { ok: false, reason: "UNKNOWN" };
  }
}

// ---------------------------------------------------------------------------
// Consultation & purge de l'historique
// ---------------------------------------------------------------------------

/** Liste l'historique des sauvegardes (plus récentes d'abord). */
export async function listOrganizationBackups(
  organizationId: string
): Promise<OrganizationBackupDTO[]> {
  const backups = await prisma.organizationBackup.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      backupName: true,
      reason: true,
      sizeBytes: true,
      rowCount: true,
      createdAt: true,
      expiresAt: true,
    },
  });

  return backups.map(toBackupDTO);
}

/**
 * Supprime une sauvegarde. Le filtre sur `organizationId` est INDISPENSABLE :
 * il empêche un administrateur de supprimer la sauvegarde d'un autre centre
 * en devinant un identifiant (isolation multi-tenant).
 */
export async function deleteOrganizationBackup(
  backupId: string,
  organizationId: string
): Promise<boolean> {
  const result = await prisma.organizationBackup.deleteMany({
    where: { id: backupId, organizationId },
  });
  return result.count > 0;
}

/** Purge les sauvegardes expirées (tâche d'entretien, toutes organisations). */
export async function purgeExpiredOrganizationBackups(): Promise<number> {
  const result = await prisma.organizationBackup.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}

// ---------------------------------------------------------------------------
// Restauration
// ---------------------------------------------------------------------------

/**
 * Restaure l'intégralité des données d'une sauvegarde dans l'organisation
 * active.
 *
 * Séquence (volontairement NON transactionnelle dans son ensemble, pour ne
 * pas dépasser le budget Serverless — même découpage que la suppression) :
 *   1. garde-fou : sauvegarde de l'état COURANT (motif AUTO_RESTORE) AVANT
 *      d'écraser quoi que ce soit ;
 *   2. purge des données actuelles (les trois vagues existantes) ;
 *   3. réinsertion du snapshot table par table, dans l'ordre des dépendances.
 *
 * Si la réinsertion échoue à mi-parcours, la sauvegarde AUTO_RESTORE de l'étape
 * 1 permet de revenir à l'état précédent : l'opération reste réversible.
 *
 * Isolation multi-tenant : la sauvegarde est chargée avec un filtre
 * `organizationId` — un identifiant deviné depuis un autre centre est
 * systématiquement refusé (`BACKUP_NOT_FOUND`).
 */
export async function restoreOrganizationBackup(
  backupId: string,
  organizationId: string
): Promise<OrganizationBackupRestoreResult> {
  // 1. Lecture de la sauvegarde, strictement cloisonnée à l'organisation.
  const backup = await prisma.organizationBackup.findFirst({
    where: { id: backupId, organizationId },
    select: { dataJson: true, expiresAt: true },
  });

  if (!backup) {
    return { ok: false, reason: "BACKUP_NOT_FOUND" };
  }

  if (backup.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: "BACKUP_EXPIRED" };
  }

  // 2. Désérialisation du snapshot.
  let payload: SnapshotPayload;
  try {
    payload = JSON.parse(backup.dataJson) as SnapshotPayload;
  } catch (error) {
    console.error("[organization-backup] Snapshot illisible :", error);
    return { ok: false, reason: "INVALID_PAYLOAD" };
  }

  // Le snapshot ne doit appartenir qu'à l'organisation en cours de
  // restauration : on ne réinjecte jamais les données d'un autre centre.
  if (
    !payload ||
    typeof payload !== "object" ||
    payload.organizationId !== organizationId ||
    !payload.tables ||
    typeof payload.tables !== "object"
  ) {
    console.error(
      "[organization-backup] Snapshot incohérent (organisation ou tables invalides)."
    );
    return { ok: false, reason: "INVALID_PAYLOAD" };
  }

  try {
    // 3. Garde-fou : sauvegarde de l'état courant avant écrasement. En cas
    //    d'échec de réinsertion, cette sauvegarde permet de revenir en arrière.
    const safety = await createOrganizationBackup(
      organizationId,
      null,
      BACKUP_REASONS.AUTO_RESTORE
    );

    if (!safety.ok) {
      console.error(
        "[organization-backup] Sauvegarde de sécurité refusée, restauration interrompue :",
        safety.reason
      );
      return { ok: false, reason: "SAFETY_BACKUP_FAILED" };
    }

    // 4. Purge de l'état courant (mêmes trois vagues que la réinitialisation).
    await resetFinancialAndSettingsData(organizationId);
    await resetCoursesAndAssessmentsData(organizationId);
    await resetStudentsAndSchoolingData(organizationId);

    // 5. Réinsertion, table par table, dans l'ordre des dépendances.
    let rowCount = 0;
    let tableCount = 0;

    for (const table of SNAPSHOT_TABLES) {
      const rows = payload.tables[table.name];
      if (!Array.isArray(rows) || rows.length === 0) continue;

      const inserted = await table.insert(rows);
      rowCount += inserted;
      tableCount += 1;
    }

    return { ok: true, rowCount, tableCount };
  } catch (error) {
    console.error("[organization-backup] Échec de la restauration :", error);
    return { ok: false, reason: "UNKNOWN" };
  }
}


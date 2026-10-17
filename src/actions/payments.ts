"use server";

import { Prisma, type PaymentMethod, type PaymentStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { sendPaymentConfirmationEmail } from "@/lib/email";
import { PAYMENT_AMOUNT_EPSILON } from "@/lib/payment-status";
import { prisma } from "@/lib/prisma";
import {
  getCurrentOrganizationId,
  getCurrentSessionActor,
  isNextRedirectError,
} from "@/lib/session";
import { assertCanMutate } from "@/lib/license-check";
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from "@/lib/audit-constants";
import { logAuditEvent } from "@/lib/actions/audit";
import { resolveEnrollmentIdForStudent } from "@/lib/enrollment-scope";
import { allocatePaymentToClassSchedule } from "@/lib/actions/schedules";

// --------------------------------------
// Types publics (contrat avec les composants clients)
// --------------------------------------

export type PaymentDTO = {
  id: string;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  status: PaymentStatus;
  /**
   * Écriture suspendue (hors trésorerie active) : valorisé lorsque le statut
   * de l'étudiant repasse à PROSPECT — conservé pour l'historique mais exclu
   * des totaux de trésorerie.
   */
  isVoided: boolean;
  /**
   * Règlement saisi « hors système » / à date antérieure : met à jour le
   * solde débiteur de l'étudiant mais n'alimente PAS la session de caisse
   * physique du jour (ni les totaux d'encaissement de la caisse).
   */
  isOutOfSystem: boolean;
  reference: string | null;
  description: string | null;
  paidAt: Date;
  createdAt: Date;
  /**
   * Classe créditée par ce règlement — libellé « Nom de classe — Année »
   * déduit de l'inscription (`ClassEnrollment`) rattachée. Renseigné lorsque
   * le règlement est imputé sur une classe précise ; `null` pour les
   * écritures héritées / règlements sans cohorte.
   */
  classLabel?: string | null;
  student: {
    id: string;
    studentCode: string;
    firstName: string;
    lastName: string;
  };
};

export type FinancialStatsDTO = {
  /** Somme des paiements au statut COMPLETED (total encaissé). */
  totalCollected: number;
  /** Somme des paiements au statut PENDING (montant en attente). */
  pendingAmount: number;
  /** Somme des dépenses (Expense) du mois en cours. */
  monthlyExpenses: number;
  /** Nombre total de transactions enregistrées. */
  transactionCount: number;
};

/**
 * Classe imputable pour un règlement (imputation sélective).
 *
 * RÈGLES DE FILTRAGE STRICTES appliquées à l'affichage (cf. AddPaymentDialog) :
 * - la classe ACTUELLE / active de l'étudiant est TOUJOURS proposée ;
 * - une ANCIENNE classe n'est proposée que si son reste à payer est
 *   strictement supérieur à 0 FCFA (dette / arriéré non soldé) ;
 * - toutes les anciennes classes entièrement soldées (reste = 0 FCFA) sont
 *   MASQUÉES automatiquement.
 */
export type StudentClassImputationDTO = {
  /** Inscription (classe + année) sur laquelle le règlement est imputé. */
  enrollmentId: string;
  classId: string;
  className: string;
  /** Année académique de l'inscription (ex : « 2025-2026 »). */
  academicYear: string;
  /** Classe actuelle / active de l'étudiant (`Student.currentClassId`). */
  isCurrent: boolean;
  /**
   * Total dû de CETTE classe : échéancier s'il existe, sinon frais de
   * scolarité de la classe / prix du cours. `null` si le montant dû est
   * inconnu (aucun plafond applicable).
   */
  totalDue: number | null;
  /** Montant déjà encaissé au profit de cette classe (paiements COMPLETED). */
  paidAmount: number;
  /**
   * Reste à payer de cette classe = `max(0, totalDue − encaissé)` ;
   * `null` lorsque le total dû est inconnu.
   */
  remainingAmount: number | null;
};

export type StudentOptionDTO = {
  id: string;
  studentCode: string;
  firstName: string;
  lastName: string;
  /** Coût net à payer (totalCost − réduction) ; `null` si non défini. */
  netAmount: number | null;
  /** Montant déjà encaissé (somme des paiements COMPLETED actifs). */
  paidAmount: number;
  /**
   * Montant hérité (réglé avant l'adoption du logiciel) déduit du reste à
   * payer sans écriture de caisse courante. Affiché à part dans le récap pour
   * que « Total dû − Déjà réglé − Hérité = Reste à payer » reste exact.
   */
  legacyCredit: number;
  /**
   * Reste à payer : `max(0, netAmount − encaissé − hérité hors système)`.
   * `null` lorsqu'aucun coût n'est défini pour l'étudiant (montant non plafonné).
   * Logique alignée sur `getStudentDetail` (module étudiants) pour garantir des
   * soldes cohérents entre la fiche étudiant et la modale de paiement.
   */
  remainingAmount: number | null;
  /**
   * Classes imputables pour ce règlement (déjà filtrées : classe actuelle +
   * anciennes classes non soldées). Vide pour un étudiant sans inscription.
   */
  classes: StudentClassImputationDTO[];
};

export type OrganizationProfileDTO = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  /** Ville de l'organisation (affichée sur l'en-tête des reçus). */
  city: string | null;
  /** Site web officiel (en-tête et pied de page légal des reçus). */
  website: string | null;
  /** URL du logo (affiché à gauche de l'en-tête des reçus). */
  logoUrl: string | null;
  /** Numéro RCCM (mention légale en pied de reçu). */
  rccm: string | null;
  /** Numéro IFU / NIF (mention légale en pied de reçu). */
  ifu: string | null;
  /**
   * Modèle graphique par défaut des certificats (affichage + impression A4
   * paysage). Voir `certificate-template.ts`.
   */
  certificateTemplate: string;
  /**
   * Gabarit de texte personnalisé du corps des certificats (`null` = texte
   * standard). Variables dynamiques `{{studentName}}`, `{{matricule}}`,
   * `{{courseName}}`, `{{level}}`, `{{date}}`… Voir `certificate-shared.ts`.
   */
  certificateTextTemplate: string | null;
};

export type PaymentFormField =
  | "studentId"
  | "classId"
  | "amount"
  | "paymentMethod"
  | "status"
  | "reference"
  | "description"
  | "paidAt";

export type PaymentFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Partial<Record<PaymentFormField, string>>;
};

/** Résultat des mutations rapides (suppression) côté client. */
export type PaymentMutationResult =
  { ok: true } | { ok: false; message: string };

// --------------------------------------
// Constantes & helpers internes
// --------------------------------------

const PAYMENT_METHODS: readonly PaymentMethod[] = [
  "CASH",
  "BANK_TRANSFER",
  "MOBILE_MONEY",
  "CREDIT_CARD",
  "CHECK",
];

const PAYMENT_STATUSES: readonly PaymentStatus[] = [
  "PENDING",
  "PARTIAL",
  "COMPLETED",
  "FAILED",
  "REFUNDED",
];

/** Plafond de sécurité pour un montant saisi (FCFA). */
const MAX_AMOUNT = 1_000_000_000;

/**
 * Tolérance de comparaison des montants flottants (FCFA) — voir
 * `PAYMENT_AMOUNT_EPSILON` dans `@/lib/payment-status`. Réutilisée telle quelle
 * côté serveur pour garantir l'identité de règle avec la modale de paiement.
 */
const AMOUNT_EPSILON = PAYMENT_AMOUNT_EPSILON;

/**
 * Calcule le montant encaissé et le reste à payer d'un étudiant à partir de ses
 * données de scolarité. Reproduit EXACTEMENT la logique de `getStudentDetail`
 * (module étudiants) afin que les soldes affichés dans la modale de paiement
 * restent cohérents avec la fiche étudiante.
 *
 * - `paidAmount` : somme des paiements confirmés (COMPLETED) non suspendus.
 * - Crédit hérité : déduit du reste à payer uniquement s'il n'a PAS déjà été
 *   injecté dans le journal de caisse courant (sinon double comptage).
 */
function computeStudentBalance(params: {
  netAmount: number | null;
  paidAmount: number;
  legacyPaidAmount: number;
  legacyAmountInCashJournal: boolean;
}): {
  paidAmount: number;
  legacyCredit: number;
  remainingAmount: number | null;
} {
  const { netAmount, paidAmount, legacyPaidAmount, legacyAmountInCashJournal } =
    params;

  if (netAmount === null) {
    return { paidAmount, legacyCredit: 0, remainingAmount: null };
  }

  const legacyCredit = legacyAmountInCashJournal
    ? 0
    : Math.max(legacyPaidAmount, 0);

  const remainingAmount = Math.max(
    0,
    netAmount - paidAmount - legacyCredit,
  );

  return { paidAmount, legacyCredit, remainingAmount };
}

// ----------------------------------------------------------------------------
// Imputation sélective : soldes par classe (module Paiements)
// ----------------------------------------------------------------------------

/** Une inscription (classe + année) de l'étudiant, avec sa classe porteuse. */
type StudentEnrollmentRow = {
  id: string;
  studentId: string;
  classId: string;
  academicYear: string;
  class: {
    name: string;
    /** Frais de scolarité de la classe ; `null` = hériter du prix du cours. */
    tuitionFee: number | null;
    course: { price: number };
  };
};

/**
 * Construit les classes imputables d'un étudiant à partir de ses inscriptions,
 * en appliquant les RÈGLES DE FILTRAGE STRICTES du module :
 * - la classe ACTUELLE (`Student.currentClassId`) est TOUJOURS proposée, ses
 *   soldes étant ceux du récapitulatif global de l'étudiant (cohérence totale
 *   entre le bloc « Récapitulatif de scolarité » et le sélecteur) ;
 * - une ANCIENNE classe n'est proposée que si son reste à payer est STRICTEMENT
 *   supérieur à 0 FCFA (dette / arriéré non soldé) ;
 * - toutes les anciennes classes entièrement soldées (reste = 0 FCFA) sont
 *   MASQUÉES automatiquement — ainsi que celles au solde indéterminé.
 *
 * @param enrollments inscriptions de l'étudiant triées `enrolledAt` décroissant.
 */
function buildClassImputations(
  student: {
    currentClassId: string | null;
    netAmount: number | null;
    paidAmount: number;
    legacyCredit: number;
    remainingAmount: number | null;
  },
  enrollments: StudentEnrollmentRow[],
  ctx: {
    /** Montant encaissé (COMPLETED, actif) rattaché à chaque inscription. */
    paidByEnrollment: Map<string, number>;
    /**
     * Total dû par couple (étudiant, classe) : échéancier s'il en existe un,
     * sinon frais de scolarité de la classe / prix du cours. Clé
     * `« studentId:classId »`.
     */
    totalDueByKey: Map<string, number>;
    epsilon: number;
  }
): StudentClassImputationDTO[] {
  if (enrollments.length === 0) return [];

  // Une entrée par classe (la plus récente d'abord), mais le montant encaissé
  // cumule TOUTES les inscriptions de cette classe (réinscriptions antérieures
  // sur d'autres années académiques).
  const representativeByClass = new Map<string, StudentEnrollmentRow>();
  const paidByClass = new Map<string, number>();
  for (const enrollment of enrollments) {
    const paid = ctx.paidByEnrollment.get(enrollment.id) ?? 0;
    paidByClass.set(enrollment.classId, (paidByClass.get(enrollment.classId) ?? 0) + paid);
    if (!representativeByClass.has(enrollment.classId)) {
      representativeByClass.set(enrollment.classId, enrollment);
    }
  }

  const current: StudentClassImputationDTO[] = [];
  const previous: StudentClassImputationDTO[] = [];

  for (const [classId, enrollment] of representativeByClass) {
    const isCurrent = classId === student.currentClassId;

    let totalDue: number | null;
    let paidAmount: number;
    let remainingAmount: number | null;

    if (isCurrent) {
      // Classe courante : soldes IDENTIQUES au récapitulatif global de
      // l'étudiant (évite toute divergence entre le récap affiché et le
      // plafond applicable).
      totalDue = student.netAmount;
      paidAmount = student.paidAmount;
      remainingAmount = student.remainingAmount;
    } else {
      const key = `${enrollment.studentId}:${classId}`;
      totalDue =
        ctx.totalDueByKey.get(key) ??
        enrollment.class.tuitionFee ??
        enrollment.class.course.price ??
        null;
      paidAmount = paidByClass.get(classId) ?? 0;
      remainingAmount =
        totalDue === null ? null : Math.max(0, totalDue - paidAmount);

      // FILTRAGE STRICT : ancienne classe visible uniquement si reste > 0.
      if (remainingAmount === null || remainingAmount <= ctx.epsilon) {
        continue;
      }
    }

    const dto: StudentClassImputationDTO = {
      enrollmentId: enrollment.id,
      classId,
      className: enrollment.class.name,
      academicYear: enrollment.academicYear,
      isCurrent,
      totalDue,
      paidAmount,
      remainingAmount,
    };
    if (isCurrent) current.push(dto);
    else previous.push(dto);
  }

  // Classe courante en tête, puis les anciennes dettes par inscription la plus
  // récente (`enrollments` est déjà trié `enrolledAt` décroissant).
  return [...current, ...previous];
}

type ParsedPaymentInput =
  | {
      ok: true;
      data: {
        studentId: string;
        /** Classe ciblée par l'imputation (champ « Imputer sur la classe »). */
        classId: string | null;
        amount: number;
        paymentMethod: PaymentMethod;
        status: PaymentStatus;
        reference: string | null;
        description: string | null;
        /** Règlement hors système / antérieur (case à cocher du formulaire). */
        isOutOfSystem: boolean;
        /** Date effective du règlement : saisie ou instant courant. */
        paidAt: Date;
      };
    }
  | { ok: false; fieldErrors: Partial<Record<PaymentFormField, string>> };

function parsePaymentForm(formData: FormData): ParsedPaymentInput {
  const studentId = String(formData.get("studentId") ?? "").trim();
  // Classe ciblée par l'imputation : optionnelle (étudiant sans inscription).
  const classId = String(formData.get("classId") ?? "").trim();
  const rawAmount = String(formData.get("amount") ?? "").trim();
  const paymentMethod = String(formData.get("paymentMethod") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  const reference = String(formData.get("reference") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  // Case « Paiement hors système / Antérieur » : présente dans FormData
  // uniquement lorsqu'elle est cochée.
  const isOutOfSystem = formData.get("isOutOfSystem") === "on";
  // Date effective du règlement (« YYYY-MM-DD ») — optionnelle ; une date
  // passée est admise pour un règlement hors système / antérieur.
  const rawPaidAt = String(formData.get("paidAt") ?? "").trim();

  const fieldErrors: Partial<Record<PaymentFormField, string>> = {};

  if (!studentId) {
    fieldErrors.studentId = "Veuillez sélectionner un étudiant.";
  }

  // Accepte la virgule décimale saisie sur clavier FR (ex : « 25000,50 »).
  const amount = Number(rawAmount.replace(",", "."));
  if (!rawAmount || Number.isNaN(amount)) {
    fieldErrors.amount = "Le montant est requis.";
  } else if (amount <= 0) {
    fieldErrors.amount = "Le montant doit être supérieur à 0.";
  } else if (amount > MAX_AMOUNT) {
    fieldErrors.amount = "Le montant dépasse la limite autorisée.";
  }

  if (!PAYMENT_METHODS.includes(paymentMethod as PaymentMethod)) {
    fieldErrors.paymentMethod =
      "Le moyen de paiement sélectionné est invalide.";
  }

  if (!PAYMENT_STATUSES.includes(status as PaymentStatus)) {
    fieldErrors.status = "Le statut sélectionné est invalide.";
  }

  if (reference.length > 100) {
    fieldErrors.reference = "La référence ne doit pas dépasser 100 caractères.";
  }

  if (description.length > 255) {
    fieldErrors.description =
      "La description ne doit pas dépasser 255 caractères.";
  }

  // Date effective : midi UTC canonique (même règle que les dossiers de
  // voyage) pour éviter tout décalage de jour lié aux fuseaux horaires.
  let paidAt = new Date();
  if (rawPaidAt) {
    const parsedPaidAt = /^\d{4}-\d{2}-\d{2}$/.test(rawPaidAt)
      ? new Date(`${rawPaidAt}T12:00:00.000Z`)
      : new Date(NaN);
    if (Number.isNaN(parsedPaidAt.getTime())) {
      fieldErrors.paidAt = "La date du règlement est invalide.";
    } else {
      paidAt = parsedPaidAt;
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    data: {
      studentId,
      classId: classId || null,
      amount,
      paymentMethod: paymentMethod as PaymentMethod,
      status: status as PaymentStatus,
      reference: reference || null,
      description: description || null,
      isOutOfSystem,
      paidAt,
    },
  };
}

// --------------------------------------
// Server Actions
// --------------------------------------

/**
 * Libellé de la classe créditée affiché sur les listes / reçus :
 * « Nom de la classe — 2025-2026 ».
 */
function formatClassLabel(
  enrollment: { academicYear: string; class: { name: string } } | null
): string | null {
  if (!enrollment) return null;
  return `${enrollment.class.name} — ${enrollment.academicYear}`;
}

/**
 * Récupère l'historique des règlements de l'organisation active,
 * avec la relation `student`.
 *
 * (`studentId` étant nullable au schéma, on écarte les lignes sans étudiant
 * afin de respecter le contrat `PaymentDTO`.)
 */
export async function getPayments(): Promise<PaymentDTO[]> {
  const organizationId = await getCurrentOrganizationId();

  try {
    const rows = await prisma.payment.findMany({
      where: { organizationId },
      orderBy: { paidAt: "desc" },
      select: {
        id: true,
        amount: true,
        currency: true,
        paymentMethod: true,
        status: true,
        isVoided: true,
        isOutOfSystem: true,
        reference: true,
        description: true,
        paidAt: true,
        createdAt: true,
        student: {
          select: {
            id: true,
            studentCode: true,
            firstName: true,
            lastName: true,
          },
        },
        // Classe créditée (imputation sélective) — relation n-to-one.
        enrollment: {
          select: {
            academicYear: true,
            class: { select: { name: true } },
          },
        },
      },
    });

    return rows.flatMap((row) => {
      if (!row.student) return [];

      const { enrollment, student, ...rest } = row;
      return [
        {
          ...rest,
          student,
          classLabel: formatClassLabel(enrollment),
        },
      ];
    });
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[getPayments] Échec de lecture :", error);

    // Dégradation gracieuse : liste vide plutôt que crash serveur.
    return [];
  }
}

/**
 * Calcule les indicateurs financiers de l'organisation active :
 * - total encaissé (paiements COMPLETED),
 * - montant en attente (paiements PENDING),
 * - dépenses du mois en cours (Expense),
 * - nombre total de transactions.
 */
export async function getFinancialStats(): Promise<FinancialStatsDTO> {
  const organizationId = await getCurrentOrganizationId();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  try {
    const [collected, pending, expenses, transactionCount] = await Promise.all([
      // Total encaissé actif : paiements COMPLETED non suspendus (`isVoided`
      // exclut les écritures d'étudiants repassés au statut Prospect).
      prisma.payment.aggregate({
        where: { organizationId, status: "COMPLETED", isVoided: false },
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where: { organizationId, status: "PENDING", isVoided: false },
        _sum: { amount: true },
      }),
      prisma.expense.aggregate({
        where: {
          organizationId,
          expenseDate: { gte: monthStart, lt: monthEnd },
        },
        _sum: { amount: true },
      }),
      prisma.payment.count({
        where: { organizationId, isVoided: false },
      }),
    ]);

    return {
      totalCollected: collected._sum.amount ?? 0,
      pendingAmount: pending._sum.amount ?? 0,
      monthlyExpenses: expenses._sum.amount ?? 0,
      transactionCount,
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[getFinancialStats] Échec de calcul :", error);

    // Dégradation gracieuse : indicateurs à zéro plutôt que crash serveur.
    return {
      totalCollected: 0,
      pendingAmount: 0,
      monthlyExpenses: 0,
      transactionCount: 0,
    };
  }
}

/**
 * Récupère la liste légère des étudiants de l'organisation active.
 * Utilisée pour alimenter le Select « Étudiant » de la modale d'enregistrement.
 */
export async function getStudentOptions(): Promise<StudentOptionDTO[]> {
  const organizationId = await getCurrentOrganizationId();

  try {
    // Données de scolarité de chaque étudiant (coût net + crédit hérité).
    const students = await prisma.student.findMany({
      where: { organizationId },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: {
        id: true,
        studentCode: true,
        firstName: true,
        lastName: true,
        netAmount: true,
        legacyPaidAmount: true,
        legacyAmountInCashJournal: true,
        currentClassId: true,
      },
    });

    // Montant encaissé par étudiant en UNE requête groupée (évite le N+1) :
    // paiements confirmés (COMPLETED) et actifs (non suspendus).
    const paidByStudent = await prisma.payment.groupBy({
      by: ["studentId"],
      where: { organizationId, status: "COMPLETED", isVoided: false },
      _sum: { amount: true },
    });

    const paidMap = new Map<string, number>();
    for (const row of paidByStudent) {
      if (row.studentId) {
        paidMap.set(row.studentId, row._sum.amount ?? 0);
      }
    }

    const studentIds = students.map((student) => student.id);

    // --- Imputation sélective : inscriptions, encaissements et échéanciers ---
    // Trois lectures batch (jamais de N+1) pour construire les classes
    // imputables de chaque étudiant avec leurs soldes par classe.
    const [enrollments, paidByEnrollmentRows, scheduleRows] = await Promise.all([
      // Toutes les inscriptions (classe + année) des étudiants listés, de la
      // plus récente à la plus ancienne — une réinscription crée une ligne par
      // année académique, l'historique n'est jamais écrasé.
      studentIds.length > 0
        ? prisma.classEnrollment.findMany({
            where: { organizationId, studentId: { in: studentIds } },
            orderBy: { enrolledAt: "desc" },
            select: {
              id: true,
              studentId: true,
              classId: true,
              academicYear: true,
              class: {
                select: {
                  name: true,
                  tuitionFee: true,
                  course: { select: { price: true } },
                },
              },
            },
          })
        : Promise.resolve([] as StudentEnrollmentRow[]),
      // Encaissements par inscription (pour les soldes des anciennes classes).
      studentIds.length > 0
        ? prisma.payment.groupBy({
            by: ["enrollmentId"],
            where: {
              organizationId,
              studentId: { in: studentIds },
              status: "COMPLETED",
              isVoided: false,
              enrollmentId: { not: null },
            },
            _sum: { amount: true },
          })
        : Promise.resolve([]),
      // Total dû par couple (étudiant, classe) : échéancier le plus récent.
      studentIds.length > 0
        ? prisma.paymentSchedule.findMany({
            where: {
              organizationId,
              studentId: { in: studentIds },
              classId: { not: null },
            },
            orderBy: { createdAt: "desc" },
            select: { studentId: true, classId: true, totalAmount: true },
          })
        : Promise.resolve([]),
    ]);

    const paidByEnrollment = new Map<string, number>();
    for (const row of paidByEnrollmentRows) {
      if (row.enrollmentId) {
        paidByEnrollment.set(
          row.enrollmentId,
          (row._sum.amount ?? 0) + (paidByEnrollment.get(row.enrollmentId) ?? 0),
        );
      }
    }

    // `scheduleRows` est trié `createdAt` décroissant : le premier échéancier
    // rencontré pour un couple est le plus récent (celui de la classe en cours).
    const totalDueByKey = new Map<string, number>();
    for (const row of scheduleRows) {
      const key = `${row.studentId}:${row.classId}`;
      if (!totalDueByKey.has(key)) {
        totalDueByKey.set(key, row.totalAmount);
      }
    }

    const enrollmentsByStudent = new Map<string, StudentEnrollmentRow[]>();
    for (const enrollment of enrollments) {
      const list = enrollmentsByStudent.get(enrollment.studentId);
      if (list) list.push(enrollment);
      else enrollmentsByStudent.set(enrollment.studentId, [enrollment]);
    }

    return students.map((student) => {
      const paidAmount = paidMap.get(student.id) ?? 0;
      const { legacyCredit, remainingAmount } = computeStudentBalance({
        netAmount: student.netAmount,
        paidAmount,
        legacyPaidAmount: student.legacyPaidAmount,
        legacyAmountInCashJournal: student.legacyAmountInCashJournal,
      });

      return {
        id: student.id,
        studentCode: student.studentCode,
        firstName: student.firstName,
        lastName: student.lastName,
        netAmount: student.netAmount,
        paidAmount,
        legacyCredit,
        remainingAmount,
        classes: buildClassImputations(
          {
            currentClassId: student.currentClassId,
            netAmount: student.netAmount,
            paidAmount,
            legacyCredit,
            remainingAmount,
          },
          enrollmentsByStudent.get(student.id) ?? [],
          { paidByEnrollment, totalDueByKey, epsilon: AMOUNT_EPSILON },
        ),
      };
    });
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[getStudentOptions] Échec de lecture :", error);

    // Dégradation gracieuse : liste vide plutôt que crash serveur.
    return [];
  }
}

/**
 * Récupère le profil de l'organisation active (nom et coordonnées).
 * Alimente notamment l'en-tête des reçus de paiement imprimables.
 */
export async function getCurrentOrganizationProfile(): Promise<OrganizationProfileDTO> {
  const organizationId = await getCurrentOrganizationId();

  try {
    // `findUnique` sécurisé : l'organisation est garantie par la résolution de
    // session ; une absence ici signale une course (suppression concurrente).
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        city: true,
        website: true,
        logoUrl: true,
        rccm: true,
        ifu: true,
        certificateTemplate: true,
        certificateTextTemplate: true,
      },
    });

    if (!organization) {
      throw new Error(
        "Organisation introuvable : votre session pointe vers une organisation qui n'existe plus.",
      );
    }

    return organization;
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[getCurrentOrganizationProfile] Échec de lecture :", error);

    throw new Error(
      "Impossible de charger le profil de l'organisation pour le moment.",
    );
  }
}

/**
 * Enregistre un nouveau règlement lié à un étudiant existant.
 * Conçu pour être utilisé avec `useActionState` : reçoit l'état précédent et un `FormData`,
 * retourne un état sérialisable (succès, erreurs de champs, message).
 */
export async function createPaymentAction(
  _prevState: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  await assertCanMutate();
  const parsed = parsePaymentForm(formData);

  if (!parsed.ok) {
    return {
      status: "error",
      message: "Veuillez corriger les champs indiqués.",
      fieldErrors: parsed.fieldErrors,
    };
  }

  const organizationId = await getCurrentOrganizationId();

  try {
    // Auteur du règlement : l'ID et le NOM de l'utilisateur connecté sont
    // figés dans les métadonnées de la transaction (traçabilité).
    const actor = await getCurrentSessionActor();

    // Vérifie que l'étudiant appartient bien à l'organisation active (isolation multi-tenant).
    // Les coordonnées sont récupérées pour l'envoi du reçu par e-mail ; les champs
    // de scolarité alimentent le contrôle « montant ≤ reste à payer ».
    const student = await prisma.student.findFirst({
      where: { id: parsed.data.studentId, organizationId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        netAmount: true,
        legacyPaidAmount: true,
        legacyAmountInCashJournal: true,
        currentClassId: true,
      },
    });

    if (!student) {
      return {
        status: "error",
        message: "Étudiant introuvable dans votre organisation.",
        fieldErrors: { studentId: "Étudiant introuvable." },
      };
    }

    // Contrôle du plafond : le montant encaissé ne peut dépasser le reste à
    // payer de la scolarité (même logique que la modale). Sécurité serveur
    // indispensable — le client peut être contourné. `remainingAmount === null`
    // (aucun coût défini) lève le plafond.
    const paidAggregate = await prisma.payment.aggregate({
      where: {
        organizationId,
        studentId: student.id,
        status: "COMPLETED",
        isVoided: false,
      },
      _sum: { amount: true },
    });

    const { remainingAmount: globalRemaining } = computeStudentBalance({
      netAmount: student.netAmount,
      paidAmount: paidAggregate._sum.amount ?? 0,
      legacyPaidAmount: student.legacyPaidAmount,
      legacyAmountInCashJournal: student.legacyAmountInCashJournal,
    });

    // --- IMPUTATION SÉLECTIVE : le règlement est rattaché à UNE classe ---
    // Le champ « Imputer le paiement sur la classe » (AddPaymentDialog)
    // transporte l'identifiant d'une classe existante pour l'étudiant. À
    // défaut (champ vide / étudiant sans classe), le rattachement historique
    // sur la classe courante du profil est conservé.
    const targetClassId = parsed.data.classId;
    let targetEnrollmentId: string | null = null;
    // Reste à payer du périmètre ciblé. `undefined` = aucune classe ciblée ou
    // classe courante (contrôle global historique) ; `null` = solde de
    // l'ancienne classe inconnu (aucun plafond applicable).
    let classRemaining: number | null | undefined = undefined;
    let isCurrentClassTarget = true;

    if (targetClassId) {
      // Inscription de l'étudiant dans la classe ciblée (la plus récente —
      // réinscription sur plusieurs années). Toute classe sans inscription
      // correspondante est rejetée (sécurité contre les saisies forgées).
      const enrollment = await prisma.classEnrollment.findFirst({
        where: {
          organizationId,
          studentId: student.id,
          classId: targetClassId,
        },
        orderBy: { enrolledAt: "desc" },
        select: {
          id: true,
          class: {
            select: {
              name: true,
              tuitionFee: true,
              course: { select: { price: true } },
            },
          },
        },
      });

      if (!enrollment) {
        return {
          status: "error",
          message: "Cette classe n'est pas ouverte à l'étudiant sélectionné.",
          fieldErrors: {
            classId: "Inscription introuvable pour cette classe.",
          },
        };
      }

      targetEnrollmentId = enrollment.id;
      isCurrentClassTarget = targetClassId === student.currentClassId;

      if (!isCurrentClassTarget) {
        // ANCIENNE CLASSE : le plafond est le reste à payer de CETTE classe —
        // un arriéré non soldé reste encaissable même si le solde global est
        // à zéro, et l'excédent d'une classe soldée ne peut pas y fuiter.
        const [scheduleRow, paidOnClass] = await Promise.all([
          // Total dû : échéancier le plus récent du couple, sinon frais de
          // scolarité de la classe / prix du cours.
          prisma.paymentSchedule.findFirst({
            where: {
              organizationId,
              studentId: student.id,
              classId: targetClassId,
            },
            orderBy: { createdAt: "desc" },
            select: { totalAmount: true },
          }),
          // Encaissements déjà rattachés aux inscriptions de cette classe.
          prisma.payment.aggregate({
            where: {
              organizationId,
              studentId: student.id,
              status: "COMPLETED",
              isVoided: false,
              enrollment: { classId: targetClassId },
            },
            _sum: { amount: true },
          }),
        ]);

        const totalDue =
          scheduleRow?.totalAmount ??
          enrollment.class.tuitionFee ??
          enrollment.class.course.price ??
          null;
        const paidAmount = paidOnClass._sum.amount ?? 0;
        classRemaining =
          totalDue === null ? null : Math.max(0, totalDue - paidAmount);

        // RÈGLE STRICTE (miroir du filtrage UI) : une ancienne classe
        // entièrement soldée n'est jamais imputable — saisie forgée bloquée.
        if (classRemaining !== null && classRemaining <= AMOUNT_EPSILON) {
          return {
            status: "error",
            message: `La classe « ${enrollment.class.name} » est entièrement réglée : aucun montant n'y est imputable.`,
            fieldErrors: {
              classId: "Cette classe est entièrement réglée.",
            },
          };
        }
      }
    }

    // Périmètre du plafond : SOLDE DE LA CLASSE ciblée lors d'une imputation
    // sur ancienne classe, solde global de l'étudiant sinon (classe courante
    // ou champ non renseigné — comportement historique inchangé).
    // `undefined` (aucune classe ciblée / classe courante) → solde global ;
    // `null` (ancienne classe sans montant dû connu) → aucun plafond.
    const rawCapRemaining =
      targetClassId && !isCurrentClassTarget ? classRemaining : globalRemaining;
    const capRemaining: number | null =
      rawCapRemaining === undefined ? globalRemaining : rawCapRemaining;

    if (
      capRemaining !== null &&
      parsed.data.amount > capRemaining + AMOUNT_EPSILON
    ) {
      const formatted = Math.round(capRemaining).toLocaleString("fr-FR");
      if (capRemaining <= AMOUNT_EPSILON) {
        return {
          status: "error",
          message:
            targetClassId && !isCurrentClassTarget
              ? "Cette classe est entièrement réglée : aucun montant ne reste à encaisser."
              : "La scolarité de cet étudiant est entièrement réglée : aucun montant ne reste à encaisser.",
          fieldErrors: { amount: "Aucun reste à payer." },
        };
      }
      const scope =
        targetClassId && !isCurrentClassTarget ? " de cette classe" : "";
      return {
        status: "error",
        message: `Le montant dépasse le reste à payer${scope} (${formatted} FCFA).`,
        fieldErrors: {
          amount: `Le montant ne peut pas dépasser le reste à payer${scope} (${formatted} FCFA).`,
        },
      };
    }

    // La date effective provient du formulaire (defaut : instant courant).
    const paidAt = parsed.data.paidAt;

    // Rattachement du règlement à l'inscription (classe + année académique)
    // CIBLÉE par l'imputation : l'historique financier suit la classe créditée,
    // pas le seul profil (séparation stricte Étudiant / Inscription). Sans
    // classe ciblée, la classe courante reste la cible (héritage).
    const enrollmentId =
      targetEnrollmentId ??
      (await resolveEnrollmentIdForStudent(prisma, {
        organizationId,
        studentId: parsed.data.studentId,
      }));

    const payment = await prisma.payment.create({
      data: {
        organizationId,
        studentId: parsed.data.studentId,
        enrollmentId,
        createdById: actor.id,
        createdByName: actor.name,
        amount: parsed.data.amount,
        paymentMethod: parsed.data.paymentMethod,
        status: parsed.data.status,
        reference: parsed.data.reference,
        description: parsed.data.description,
        isOutOfSystem: parsed.data.isOutOfSystem,
        paidAt,
      },
    });

    // VENTILATION sur l'échéancier de LA SEULE classe créditée : les tranches
    // de la classe ciblée sont soldées à concurrence du règlement ; celles des
    // autres classes (nouvelle classe / nouvelle année) restent TOTALEMENT
    // intactes. Seuls les règlements confirmés (COMPLETED) soldent des
    // tranches. L'échec de la ventilation n'annule jamais la recette déjà
    // enregistrée (trésorerie globale à la date du jour).
    if (targetClassId && parsed.data.status === "COMPLETED") {
      const allocation = await allocatePaymentToClassSchedule({
        studentId: parsed.data.studentId,
        classId: targetClassId,
        amount: parsed.data.amount,
      });
      if (!allocation.ok) {
        console.error(
          "[createPaymentAction] Échec de la ventilation d'échéancier :",
          allocation.message,
        );
      }
    }

    revalidatePath("/dashboard/payments");

    // Journal d'audit : enregistrement de paiement (auteur = utilisateur connecté)
    await logAuditEvent({
      action: AUDIT_ACTIONS.PAYMENT_RECEIVED,
      entity: AUDIT_ENTITIES.PAYMENT,
      entityId: payment.id,
      details: {
        createdByUserId: actor.id,
        createdByUserName: actor.name,
        createdByUserRole: actor.role,
        studentId: student.id,
        studentName: `${student.firstName} ${student.lastName}`,
        amount: payment.amount,
        method: payment.paymentMethod,
        status: payment.status,
        isOutOfSystem: payment.isOutOfSystem,
      },
    });

    // Reçu de règlement envoyé en arrière-plan (après la réponse) si l'étudiant
    // a une adresse e-mail valide. L'échec d'envoi ne bloque jamais la création.
    if (student.email) {
      const recipientEmail = student.email;
      const recipientName = `${student.firstName} ${student.lastName}`;
      const amount = parsed.data.amount;
      const reference = parsed.data.reference;

      after(async () => {
        // Adresses de test (ex : etudiant@example.com) : Resend en mode Sandbox
        // les refuse systématiquement. On ignore l'envoi pour ne jamais
        // bloquer ni retarder la création du paiement.
        if (recipientEmail.trim().toLowerCase().endsWith("@example.com")) {
          console.info(
            `[payments] Adresse de test « ${recipientEmail} » : envoi du reçu ignoré.`,
          );
          return;
        }

        try {
          await sendPaymentConfirmationEmail({
            studentEmail: recipientEmail,
            studentName: recipientName,
            amount,
            reference,
            paidAt,
          });
        } catch (error) {
          console.error("[payments] Échec de l'envoi du reçu :", error);
        }
      });
    }

    return {
      status: "success",
      message: "Paiement enregistré avec succès.",
    };
  } catch (error) {
    // Contrainte unique sur `reference` : numéro de transaction déjà utilisé.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        status: "error",
        message: "Cette référence de paiement est déjà utilisée.",
        fieldErrors: { reference: "Cette référence est déjà utilisée." },
      };
    }

    console.error("[createPaymentAction] Échec de création :", error);

    return {
      status: "error",
      message: "Une erreur est survenue lors de l'enregistrement du paiement.",
    };
  }
}

/**
 * Met à jour un règlement existant de l'organisation active.
 * Conçu pour être utilisé avec `useActionState` : reçoit l'état précédent et un `FormData`
 * (incluant le champ caché `id`), retourne un état sérialisable.
 */
export async function updatePaymentAction(
  _prevState: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  await assertCanMutate();
  const paymentId = String(formData.get("id") ?? "").trim();

  if (!paymentId) {
    return {
      status: "error",
      message: "Identifiant du paiement manquant.",
    };
  }

  const parsed = parsePaymentForm(formData);

  if (!parsed.ok) {
    return {
      status: "error",
      message: "Veuillez corriger les champs indiqués.",
      fieldErrors: parsed.fieldErrors,
    };
  }

  const organizationId = await getCurrentOrganizationId();

  try {
    // Isolation multi-tenant : le règlement doit appartenir à l'organisation active.
    const existing = await prisma.payment.findFirst({
      where: { id: paymentId, organizationId },
      select: { id: true, studentId: true, enrollmentId: true },
    });

    if (!existing) {
      return {
        status: "error",
        message: "Paiement introuvable dans votre organisation.",
      };
    }

    // Vérifie que l'étudiant ciblé appartient bien à l'organisation active.
    const student = await prisma.student.findFirst({
      where: { id: parsed.data.studentId, organizationId },
      select: { id: true },
    });

    if (!student) {
      return {
        status: "error",
        message: "Étudiant introuvable dans votre organisation.",
        fieldErrors: { studentId: "Étudiant introuvable." },
      };
    }

    // IMPUTATION PRÉSERVÉE : l'édition d'un règlement (montant, référence,
    // statut…) conserve sa classe créditée — le sélecteur d'imputation
    // n'existe que sur la création et une réédition ne doit jamais basculer
    // silencieusement l'écriture d'une ancienne classe vers la classe
    // courante. Seul un CHANGEMENT D'ÉTUDIENT déclenche une nouvelle
    // résolution (sur la classe du nouvel étudiant). Les corrections
    // « hors système » (isOutOfSystem) restent le mécanisme qui protège la
    // trésorerie active sur les écritures d'historique.
    const enrollmentId =
      existing.studentId === parsed.data.studentId && existing.enrollmentId
        ? existing.enrollmentId
        : await resolveEnrollmentIdForStudent(prisma, {
            organizationId,
            studentId: parsed.data.studentId,
          });

    await prisma.payment.update({
      where: { id: paymentId },
      data: {
        studentId: parsed.data.studentId,
        enrollmentId,
        amount: parsed.data.amount,
        paymentMethod: parsed.data.paymentMethod,
        status: parsed.data.status,
        reference: parsed.data.reference,
        description: parsed.data.description,
        isOutOfSystem: parsed.data.isOutOfSystem,
        paidAt: parsed.data.paidAt,
      },
    });

    revalidatePath("/dashboard/payments");

    return {
      status: "success",
      message: "Paiement mis à jour avec succès.",
    };
  } catch (error) {
    // Contrainte unique sur `reference` : numéro de transaction déjà utilisé.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        status: "error",
        message: "Cette référence de paiement est déjà utilisée.",
        fieldErrors: { reference: "Cette référence est déjà utilisée." },
      };
    }

    console.error("[updatePaymentAction] Échec de mise à jour :", error);

    return {
      status: "error",
      message: "Une erreur est survenue lors de la mise à jour du paiement.",
    };
  }
}

/**
 * Supprime un règlement de l'organisation active.
 */
export async function deletePaymentAction(
  paymentId: string,
): Promise<PaymentMutationResult> {
  await assertCanMutate();
  if (!paymentId) {
    return { ok: false, message: "Identifiant du paiement manquant." };
  }

  try {
    const organizationId = await getCurrentOrganizationId();

    // Isolation multi-tenant : le règlement doit appartenir à l'organisation active.
    const existing = await prisma.payment.findFirst({
      where: { id: paymentId, organizationId },
      select: { id: true },
    });

    if (!existing) {
      return {
        ok: false,
        message: "Paiement introuvable dans votre organisation.",
      };
    }

    await prisma.payment.delete({ where: { id: paymentId } });

    revalidatePath("/dashboard/payments");
    revalidatePath("/dashboard");

    // Journal d'audit : suppression de paiement
    await logAuditEvent({
      action: AUDIT_ACTIONS.PAYMENT_DELETED,
      entity: AUDIT_ENTITIES.PAYMENT,
      entityId: paymentId,
    });

    return { ok: true };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[deletePaymentAction] Échec de suppression :", error);

    return {
      ok: false,
      message: "Une erreur est survenue lors de la suppression du paiement.",
    };
  }
}

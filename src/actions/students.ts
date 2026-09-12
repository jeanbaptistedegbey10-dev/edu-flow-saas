"use server";

import { Prisma, type DiscountType, type StudentStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { sendWelcomeEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { getCurrentOrganizationId, getCurrentSessionUser, isNextRedirectError } from "@/lib/session";
import { assertCanMutate } from "@/lib/license-check";

// --------------------------------------
// Types publics (contrat avec les composants clients)
// --------------------------------------

export type StudentDTO = {
  id: string;
  studentCode: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string;
  status: StudentStatus;
  /** Coût total de la formation (FCFA), facultatif. */
  totalCost: number | null;
  /** Réduction accordée (pourcentage 0–100 ou montant fixe en FCFA). */
  discount: number | null;
  /** Type de réduction : pourcentage du coût total ou montant fixe. */
  discountType: DiscountType;
  /** Net à payer = totalCost − réduction (calculé automatiquement). */
  netAmount: number | null;
  /**
   * Paiements antérieurs hors système (FCFA) : montant déjà réglé avant
   * l'adoption du logiciel. Déduit du reste à payer, mais jamais compté
   * dans le journal de caisse courant (sauf inclusion explicite).
   */
  legacyPaidAmount: number;
  /** Le montant hérité a-t-il été injecté dans le journal de caisse courant ? */
  legacyAmountInCashJournal: boolean;
  /** Frais d'inscription déjà réglés (uniques à vie). */
  hasPaidRegistrationFee: boolean;
  /** Classe / cohorte active de l'étudiant. */
  currentClassId: string | null;
  currentClassName: string | null;
  /** Indique si l'étudiant est autonome (s'assume lui-même financièrement). */
  isSelfFinanced: boolean;
  /** Nom du parent / tuteur (requis si non autonome). */
  parentName: string | null;
  /** Lien avec l'étudiant (Père, Mère, Tuteur, etc.). */
  parentRelation: string | null;
  /** Numéro de téléphone principal du parent / tuteur. */
  parentPhone1: string | null;
  /** Numéro de téléphone secondaire du parent / tuteur (optionnel). */
  parentPhone2: string | null;
  createdAt: Date;
};

export type StudentFormField =
  | "firstName"
  | "lastName"
  | "email"
  | "phone"
  | "status"
  | "totalCost"
  | "discount"
  | "discountType"
  | "legacyPaidAmount"
  | "classId"
  | "registrationFeePayment"
  | "isSelfFinanced"
  | "parentName"
  | "parentRelation"
  | "parentPhone1"
  | "parentPhone2";

export type StudentFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Partial<Record<StudentFormField, string>>;
};

/** Résultat des mutations rapides (suppression) côté client. */
export type StudentMutationResult =
  | { ok: true }
  | { ok: false; message: string };

// --------------------------------------
// Constantes & helpers internes
// --------------------------------------

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Statuts acceptés à la validation serveur. Les contrôles de saisie ne
 * proposent plus que TROIS options produit (Prospect, Inscrit, Abandonné —
 * voir `CANONICAL_STUDENT_STATUS_OPTIONS`), mais la validation reste tolérante
 * sur l'ensemble de l'enum afin de ne jamais bloquer l'édition de fiches
 * historiques créées avant la simplification (IN_PROGRESS, COMPLETED,
 * SUSPENDED).
 */
const STUDENT_STATUSES: readonly StudentStatus[] = [
  "PROSPECT",
  "ENROLLED",
  "IN_PROGRESS",
  "COMPLETED",
  "SUSPENDED",
  "DROPPED_OUT",
];

/** Plafond de sécurité pour un montant saisi (FCFA). */
const MAX_AMOUNT = 1_000_000_000;

type ParsedFinancials = {
  totalCost: number | null;
  discount: number | null;
  discountType: DiscountType;
  netAmount: number | null;
  /**
   * Paiements antérieurs hors système (FCFA), saisis à l'inscription.
   * Toujours défini (0 par défaut) pour simplifier la persistance.
   */
  legacyPaidAmount: number;
  /**
   * État de la case « Ne pas inclure dans le journal de caisse actuel » :
   * true (défaut) → le montant hérité reste informatif, AUCUN impact
   * comptable ; false → une recette « LEGACY-* » est créée pour l'inclure.
   */
  legacyExcludeFromJournal: boolean;
};

/**
 * Analyse et valide les champs financiers du formulaire étudiant.
 * Le Net à Payer est TOUJOURS recalculé côté serveur :
 * - réduction en montant fixe  → `netAmount = totalCost − discount` ;
 * - réduction en pourcentage  → `netAmount = totalCost × (1 − discount / 100)`.
 * La valeur soumise par le client, même présente, n'est jamais utilisée.
 */
function parseFinancialFields(
  formData: FormData,
  fieldErrors: Partial<Record<StudentFormField, string>>
): ParsedFinancials {
  const rawTotalCost = String(formData.get("totalCost") ?? "").trim();
  const rawDiscount = String(formData.get("discount") ?? "").trim();
  const rawDiscountType = String(formData.get("discountType") ?? "FIXED")
    .trim()
    .toUpperCase();

  // Type de réduction : nouveauté serveur-calibrée, défaut sûr « montant fixe ».
  const discountType: DiscountType =
    rawDiscountType === "PERCENTAGE" ? "PERCENTAGE" : "FIXED";

  let totalCost: number | null = null;
  let discount: number | null = null;

  if (rawTotalCost) {
    // Accepte la virgule décimale saisie sur clavier FR (ex : « 150000,50 »).
    const value = Number(rawTotalCost.replace(",", "."));

    if (Number.isNaN(value)) {
      fieldErrors.totalCost = "Le coût total doit être un nombre.";
    } else if (value < 0) {
      fieldErrors.totalCost = "Le coût total ne peut pas être négatif.";
    } else if (value > MAX_AMOUNT) {
      fieldErrors.totalCost = "Le coût total dépasse la limite autorisée.";
    } else {
      totalCost = value;
    }
  }

  if (rawDiscount) {
    const value = Number(rawDiscount.replace(",", "."));

    if (Number.isNaN(value)) {
      fieldErrors.discount = "La réduction doit être un nombre.";
    } else if (value < 0) {
      fieldErrors.discount = "La réduction ne peut pas être négative.";
    } else if (discountType === "PERCENTAGE" && value > 100) {
      fieldErrors.discount =
        "Le pourcentage de réduction ne peut pas dépasser 100 %.";
    } else if (
      discountType === "FIXED" &&
      totalCost !== null &&
      value > totalCost
    ) {
      fieldErrors.discount =
        "La réduction ne peut pas dépasser le coût total de la formation.";
    } else if (value > MAX_AMOUNT) {
      fieldErrors.discount = "La réduction dépasse la limite autorisée.";
    } else {
      discount = value;
    }
  }

  // Réduction par défaut à 0 dès qu'un coût total est défini.
  if (totalCost !== null && discount === null && !fieldErrors.totalCost) {
    discount = 0;
  }

  // Net à payer calculé automatiquement (jamais lu depuis le formulaire).
  let netAmount: number | null = null;
  if (totalCost !== null && discount !== null) {
    netAmount =
      discountType === "PERCENTAGE"
        ? totalCost * (1 - discount / 100)
        : totalCost - discount;
  }

  // Paiements antérieurs hors système (montant déjà réglé avant l'adoption).
  const rawLegacyPaidAmount = String(
    formData.get("legacyPaidAmount") ?? ""
  )
    .trim()
    .replace(",", ".");
  let legacyPaidAmount = 0;
  if (rawLegacyPaidAmount) {
    const value = Number(rawLegacyPaidAmount);
    if (Number.isNaN(value)) {
      fieldErrors.legacyPaidAmount =
        "Le montant des paiements antérieurs doit être un nombre.";
    } else if (value < 0) {
      fieldErrors.legacyPaidAmount =
        "Le montant des paiements antérieurs ne peut pas être négatif.";
    } else if (value > MAX_AMOUNT) {
      fieldErrors.legacyPaidAmount =
        "Le montant des paiements antérieurs dépasse la limite autorisée.";
    } else {
      legacyPaidAmount = value;
    }
  }

  // Case « Ne pas inclure dans le journal de caisse actuel » :
  // - cochée (valeur envoyée) → montant hérité EXCLU de la comptabilité ;
  // - absente alors que la case était rendue (sentinelle) → l'utilisateur
  //   l'a décochée : inclusion explicite dans le journal courant ;
  // - absente sans sentinelle (formulaire tiers) → défaut sûr : exclu.
  const legacyCheckboxRendered =
    String(formData.get("legacyCheckboxRendered") ?? "").trim() === "1";
  const legacyCheckboxChecked =
    String(formData.get("excludeLegacyFromCashJournal") ?? "").trim() !== "";
  const legacyExcludeFromJournal =
    legacyCheckboxChecked || !legacyCheckboxRendered;

  return {
    totalCost,
    discount,
    discountType,
    netAmount,
    legacyPaidAmount,
    legacyExcludeFromJournal,
  };
}

type ParsedStudentInput =
  | {
      ok: true;
      data: {
        firstName: string;
        lastName: string;
        email: string | null;
        phone: string;
        status: StudentStatus;
        totalCost: number | null;
        discount: number | null;
        discountType: DiscountType;
        netAmount: number | null;
        legacyPaidAmount: number;
        legacyExcludeFromJournal: boolean;
        isSelfFinanced: boolean;
        parentName: string | null;
        parentRelation: string | null;
        parentPhone1: string | null;
        parentPhone2: string | null;
      };
    }
  | { ok: false; fieldErrors: Partial<Record<StudentFormField, string>> };

function parseStudentForm(formData: FormData): ParsedStudentInput {
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  const isSelfFinanced = formData.get("isSelfFinanced") === "on";
  const parentName = String(formData.get("parentName") ?? "").trim();
  const parentRelation = String(formData.get("parentRelation") ?? "").trim();
  const parentPhone1 = String(formData.get("parentPhone1") ?? "").trim();
  const parentPhone2 = String(formData.get("parentPhone2") ?? "").trim();

  const fieldErrors: Partial<Record<StudentFormField, string>> = {};

  if (!firstName) {
    fieldErrors.firstName = "Le prénom est requis.";
  } else if (firstName.length > 100) {
    fieldErrors.firstName = "Le prénom ne doit pas dépasser 100 caractères.";
  }

  if (!lastName) {
    fieldErrors.lastName = "Le nom est requis.";
  } else if (lastName.length > 100) {
    fieldErrors.lastName = "Le nom ne doit pas dépasser 100 caractères.";
  }

  if (email && !EMAIL_REGEX.test(email)) {
    fieldErrors.email = "L'adresse email est invalide.";
  }

  if (!phone) {
    fieldErrors.phone = "Le téléphone est requis.";
  } else if (phone.replace(/\D/g, "").length < 8) {
    fieldErrors.phone = "Le numéro de téléphone semble invalide.";
  }

  if (!STUDENT_STATUSES.includes(status as StudentStatus)) {
    fieldErrors.status = "Le statut sélectionné est invalide.";
  }

  // Validation des champs parentaux si l'étudiant n'est pas autonome
  if (!isSelfFinanced) {
    if (!parentName) {
      fieldErrors.parentName = "Le nom du parent / tuteur est requis.";
    }
    if (!parentRelation) {
      fieldErrors.parentRelation = "Le lien avec l'étudiant est requis.";
    }
    if (!parentPhone1) {
      fieldErrors.parentPhone1 = "Le téléphone du parent / tuteur est requis.";
    }
  }

  const financials = parseFinancialFields(formData, fieldErrors);

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    data: {
      firstName,
      lastName,
      email: email || null,
      phone,
      status: status as StudentStatus,
      isSelfFinanced,
      parentName: parentName || null,
      parentRelation: parentRelation || null,
      parentPhone1: parentPhone1 || null,
      parentPhone2: parentPhone2 || null,
      ...financials,
    },
  };
}

// --------------------------------------
// Frais d'inscription uniques & affectation de classe
// --------------------------------------

/** Libellé de la recette générée pour les frais d'inscription. */
const REGISTRATION_FEE_DESCRIPTION = "Frais d'inscription";

/**
 * Libellé de la recette « LEGACY » : paiements antérieurs hors système que
 * l'utilisateur a explicitement choisi d'inclure dans le journal de caisse
 * courant (case dédiée décochée). Par défaut ces montants restent
 * strictement informatifs (aucune écriture comptable).
 */
const LEGACY_PAYMENT_DESCRIPTION =
  "Paiements antérieurs hors système (avant adoption du logiciel)";

/**
 * Référence unique et stable de la recette « LEGACY » d'un étudiant :
 * permet la réconciliation idempotente lors des mises à jour (upsert/suppression).
 */
function buildLegacyPaymentReference(studentCode: string): string {
  return `LEGACY-${studentCode}`;
}

/**
 * Référence unique de la recette de frais d'inscription :
 * code étudiant + horodatage compact (protection anti-collision).
 */
function buildRegistrationReference(studentCode: string): string {
  return `REG-${studentCode}-${Date.now().toString(36).toUpperCase()}`;
}

/** Formate un montant en FCFA (messages utilisateur). */
function formatFcfa(amount: number): string {
  return `${amount.toLocaleString("fr-FR")} FCFA`;
}

type TargetClass = {
  id: string;
  courseId: string;
  /** Frais de scolarité effectifs de la classe (frais de classe, sinon prix du cours). */
  tuitionFee: number | null;
};

/**
 * Résout et valide la classe ciblée par le formulaire (champ `classId`,
 * facultatif). Retourne `null` si aucune classe n'est demandée ; lève une
 * erreur sentinelle si la classe est introuvable dans l'organisation active.
 */
async function resolveTargetClass(
  formData: FormData,
  organizationId: string
): Promise<TargetClass | null> {
  const rawClassId = String(formData.get("classId") ?? "").trim();

  if (!rawClassId) return null;

  const klass = await prisma.class.findFirst({
    where: { id: rawClassId, organizationId },
    select: {
      id: true,
      courseId: true,
      tuitionFee: true,
      course: { select: { price: true } },
    },
  });

  if (!klass) {
    throw new Error("CLASS_NOT_FOUND");
  }

  return {
    id: klass.id,
    courseId: klass.courseId,
    tuitionFee: klass.tuitionFee ?? klass.course.price,
  };
}

/**
 * Complète automatiquement le coût total de scolarité de l'étudiant avec les
 * frais de scolarité de la classe lorsqu'aucun montant n'a été saisi.
 * La réduction et le net à payer sont alors recalculés en conséquence.
 */
function applyClassTuitionFee(
  financials: ParsedFinancials,
  classFee: number | null | undefined
): ParsedFinancials {
  if (financials.totalCost !== null || classFee === null || classFee === undefined) {
    return financials;
  }

  const totalCost = classFee;
  const discount = financials.discount ?? 0;
  const netAmount =
    financials.discountType === "PERCENTAGE"
      ? totalCost * (1 - discount / 100)
      : totalCost - discount;

  return { ...financials, totalCost, discount, netAmount };
}

/**
 * Calcule les montants finaux après application éventuelle des frais
 * d'inscription : ceux-ci sont ajoutés au coût total initial exigé, une
 * seule fois par étudiant (première inscription uniquement).
 */
function computeFinancialsWithFee(
  financials: ParsedFinancials,
  appliesFee: boolean,
  registrationFee: number
): ParsedFinancials {
  if (!appliesFee || registrationFee <= 0) {
    return financials;
  }

  const totalCost = (financials.totalCost ?? 0) + registrationFee;
  const discount = financials.discount ?? 0;
  const discountType = financials.discountType;
  const netAmount =
    discountType === "PERCENTAGE"
      ? totalCost * (1 - discount / 100)
      : totalCost - discount;

  return {
    ...financials,
    totalCost,
    discount,
    discountType,
    netAmount,
  };
}

/**
 * Fiche détaillée d'un étudiant : informations, récapitulatif financier
 * et historique des règlements.
 */
/**
 * Historique d'un règlement rattaché à la fiche d'un étudiant.
 */
export type StudentPaymentDTO = {
  id: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  status: string;
  /**
   * Écriture suspendue (hors trésorerie active) : valorisé lorsque le statut
   * de l'étudiant repasse à PROSPECT — le règlement reste consultable
   * (historique / reçu) mais son montant n'alimente plus la caisse.
   */
  isVoided: boolean;
  reference: string | null;
  description: string | null;
  paidAt: Date;
};

export type StudentDetailDTO = {
  id: string;
  studentCode: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string;
  status: StudentStatus;
  createdAt: Date;
  /** Coût initial de la formation (avant réduction). */
  totalCost: number | null;
  /** Réduction accordée (pourcentage ou montant fixe). */
  discount: number | null;
  /** Type de réduction (pourcentage du coût total ou montant fixe). */
  discountType: DiscountType;
  /** Net à payer (totalCost − réduction). */
  netAmount: number | null;
  /**
   * Paiements antérieurs hors système (FCFA) : montant déjà réglé avant
   * l'adoption du logiciel, affiché comme ligne dédiée sur la fiche.
   */
  legacyPaidAmount: number;
  /** Le montant hérité a-t-il été injecté dans le journal de caisse courant ? */
  legacyAmountInCashJournal: boolean;
  /** Montant déjà encaissé : somme des paiements COMPLETED. */
  paidAmount: number;
  /**
   * Reste à payer : max(0, netAmount − encaissé − hérité). Le montant hérité
   * n'est déduit ici que s'il n'a PAS été injecté dans le journal de caisse
   * (sinon il est déjà compté dans `paidAmount` via la recette « LEGACY-* »).
   */
  remainingAmount: number | null;
  /** Frais d'inscription déjà réglés (uniques à vie). */
  hasPaidRegistrationFee: boolean;
  /** Classe / cohorte active de l'étudiant. */
  currentClassId: string | null;
  currentClassName: string | null;
  /** Intitulé du cours porteur de la classe active (bulletins, attestations). */
  currentCourseTitle: string | null;
  /** Indique si l'étudiant est autonome (s'assume lui-même financièrement). */
  isSelfFinanced: boolean;
  /** Nom du parent / tuteur (requis si non autonome). */
  parentName: string | null;
  /** Lien avec l'étudiant (Père, Mère, Tuteur, etc.). */
  parentRelation: string | null;
  /** Numéro de téléphone principal du parent / tuteur. */
  parentPhone1: string | null;
  /** Numéro de téléphone secondaire du parent / tuteur (optionnel). */
  parentPhone2: string | null;
  payments: StudentPaymentDTO[];
};

/**
 * Récupère la fiche détaillée d'un étudiant avec son récapitulatif
 * financier complet :
 * - coût initial (`totalCost`),
 * - réduction accordée (`discount`),
 * - net à payer (`netAmount = totalCost − discount`),
 * - montant encaissé (somme des paiements `COMPLETED`),
 * - reste à payer (`max(0, netAmount − encaissé)`).
 */
export async function getStudentDetail(
  studentId: string
): Promise<StudentDetailDTO> {
  const organizationId = await getCurrentOrganizationId();

  try {
    const student = await prisma.student.findFirst({
      where: { id: studentId, organizationId },
      select: {
        id: true,
        studentCode: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        status: true,
        createdAt: true,
        totalCost: true,
        discount: true,
        discountType: true,
        netAmount: true,
        legacyPaidAmount: true,
        legacyAmountInCashJournal: true,
        hasPaidRegistrationFee: true,
        currentClassId: true,
        isSelfFinanced: true,
        parentName: true,
        parentRelation: true,
        parentPhone1: true,
        parentPhone2: true,
        currentClass: {
          select: {
            name: true,
            course: { select: { title: true } },
          },
        },
      },
    });

    if (!student) {
      throw new Error("Étudiant introuvable dans votre organisation.");
    }

    const [paidAggregate, payments] = await Promise.all([
      // Montant encaissé : uniquement les règlements confirmés (COMPLETED) et
      // actifs (non suspendus — `isVoided` exclut les écritures d'un étudiant
      // repassé au statut Prospect).
      prisma.payment.aggregate({
        where: { studentId, organizationId, status: "COMPLETED", isVoided: false },
        _sum: { amount: true },
      }),
      prisma.payment.findMany({
        where: { studentId, organizationId },
        orderBy: { paidAt: "desc" },
        select: {
          id: true,
          amount: true,
          currency: true,
          paymentMethod: true,
          status: true,
          isVoided: true,
          reference: true,
          description: true,
          paidAt: true,
        },
      }),
    ]);

    const paidAmount = paidAggregate._sum.amount ?? 0;

    // Montant hérité (paiements antérieurs hors système) : déduit du reste à
    // payer UNIQUEMENT s'il n'a pas été injecté dans le journal de caisse
    // (sinon il est déjà inclus dans `paidAmount` via la recette « LEGACY-* »).
    const legacyAmountInCashJournal = student.legacyAmountInCashJournal;
    const effectiveLegacyCredit = legacyAmountInCashJournal
      ? 0
      : student.legacyPaidAmount;

    const remainingAmount =
      student.netAmount !== null
        ? Math.max(0, student.netAmount - paidAmount - effectiveLegacyCredit)
        : null;

    return {
      id: student.id,
      studentCode: student.studentCode,
      firstName: student.firstName,
      lastName: student.lastName,
      email: student.email,
      phone: student.phone,
      status: student.status,
      createdAt: student.createdAt,
      totalCost: student.totalCost,
      discount: student.discount,
      discountType: student.discountType,
      netAmount: student.netAmount,
      legacyPaidAmount: student.legacyPaidAmount,
      legacyAmountInCashJournal,
      hasPaidRegistrationFee: student.hasPaidRegistrationFee,
      currentClassId: student.currentClassId,
      isSelfFinanced: student.isSelfFinanced,
      parentName: student.parentName,
      parentRelation: student.parentRelation,
      parentPhone1: student.parentPhone1,
      parentPhone2: student.parentPhone2,
      currentClassName: student.currentClass?.name ?? null,
      currentCourseTitle: student.currentClass?.course.title ?? null,
      paidAmount,
      remainingAmount,
      payments,
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[getStudentDetail] Échec de lecture :", error);

    throw new Error(
      "Impossible de charger la fiche de l'étudiant pour le moment."
    );
  }
}

/**
 * Génère un code étudiant unique au format STU-YYYY-NNN.
 *
 * ⚠️ La contrainte d'unicité `studentCode` est GLOBALE au schéma Prisma
 * (`@unique`, toutes organisations confondues) : la séquence doit donc être
 * calculée sur l'ensemble des étudiants de l'année en cours, sans filtre
 * d'organisation. Un comptage limité à l'organisation active produirait des
 * collisions inter-organisations (P2002) et, après suppression d'un étudiant
 * au milieu d'une séquence, un code déjà attribué (échec en boucle).
 *
 * On se base sur le suffixe numérique MAXIMAL existant plutôt que sur un
 * comptage, afin de rester correct même si des codes ont été supprimés.
 * La boucle de réessai de `createStudentAction` couvre les courses concurrentes.
 */
async function generateStudentCode(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `STU-${year}-`;

  const existingCodes = await prisma.student.findMany({
    where: { studentCode: { startsWith: prefix } },
    select: { studentCode: true },
  });

  let maxNumber = 0;

  for (const { studentCode } of existingCodes) {
    const suffix = Number(studentCode.slice(prefix.length));

    if (Number.isInteger(suffix) && suffix > maxNumber) {
      maxNumber = suffix;
    }
  }

  return `${prefix}${String(maxNumber + 1).padStart(3, "0")}`;
}

// --------------------------------------
// Server Actions
// --------------------------------------

/**
 * Récupère la liste des étudiants de l'organisation active,
 * avec leur récapitulatif financier (coût, réduction, net à payer),
 * leur classe active et le statut de leurs frais d'inscription.
 */
export async function getStudents(): Promise<StudentDTO[]> {
  const organizationId = await getCurrentOrganizationId();

  try {
    const students = await prisma.student.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        studentCode: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        status: true,
        totalCost: true,
        discount: true,
        discountType: true,
        netAmount: true,
        legacyPaidAmount: true,
        legacyAmountInCashJournal: true,
        hasPaidRegistrationFee: true,
        currentClassId: true,
        isSelfFinanced: true,
        parentName: true,
        parentRelation: true,
        parentPhone1: true,
        parentPhone2: true,
        currentClass: { select: { name: true } },
        createdAt: true,
      },
    });

    return students.map((student) => ({
      id: student.id,
      studentCode: student.studentCode,
      firstName: student.firstName,
      lastName: student.lastName,
      email: student.email,
      phone: student.phone,
      status: student.status,
      totalCost: student.totalCost,
      discount: student.discount,
      discountType: student.discountType,
      netAmount: student.netAmount,
      legacyPaidAmount: student.legacyPaidAmount,
      legacyAmountInCashJournal: student.legacyAmountInCashJournal,
      hasPaidRegistrationFee: student.hasPaidRegistrationFee,
      currentClassId: student.currentClassId,
      isSelfFinanced: student.isSelfFinanced,
      parentName: student.parentName,
      parentRelation: student.parentRelation,
      parentPhone1: student.parentPhone1,
      parentPhone2: student.parentPhone2,
      currentClassName: student.currentClass?.name ?? null,
      createdAt: student.createdAt,
    }));
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[getStudents] Échec de lecture :", error);

    // Dégradation gracieuse : liste vide plutôt que crash serveur.
    return [];
  }
}

/**
 * Étudiant visible par un enseignant dans sa vue « Mes Étudiants » :
 * STRICTEMENT aucune donnée financière — uniquement le profil académique
 * (classe, formation) et l'assiduité.
 */
export type TeacherStudentDTO = {
  id: string;
  studentCode: string;
  firstName: string;
  lastName: string;
  status: StudentStatus;
  /** Classe / cohorte effective de l'étudiant (celle de l'enseignant). */
  className: string | null;
  /** Intitulé de la formation suivie dans cette classe. */
  courseTitle: string | null;
  /** Récapitulatif d'assiduité (Présents / Retards / Absences / Excusés). */
  attendance: {
    total: number;
    present: number;
    late: number;
    absent: number;
    excused: number;
  };
};

/**
 * Récupère les étudiants inscrits dans les cours / classes assignés à
 * l'enseignant connecté. Réservé au rôle TEACHER — aucun champ financier
 * (coût, réduction, net à payer, paiements) n'est sélectionné ni renvoyé.
 */
export async function getTeacherStudents(): Promise<TeacherStudentDTO[]> {
  const user = await getCurrentSessionUser();

  if (user.role !== "TEACHER") {
    throw new Error("Accès réservé aux enseignants.");
  }

  try {
    const classes = await prisma.class.findMany({
      where: { organizationId: user.organizationId, teacherId: user.id },
      select: {
        id: true,
        name: true,
        course: { select: { title: true } },
      },
      orderBy: { name: "asc" },
    });

    const classIds = classes.map((klass) => klass.id);
    if (classIds.length === 0) return [];

    const students = await prisma.student.findMany({
      where: {
        organizationId: user.organizationId,
        OR: [
          { currentClassId: { in: classIds } },
          { classEnrollments: { some: { classId: { in: classIds } } } },
        ],
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        studentCode: true,
        firstName: true,
        lastName: true,
        status: true,
        currentClass: {
          select: {
            id: true,
            name: true,
            course: { select: { title: true } },
          },
        },
        // Classe de l'enseignant quand l'étudiant est inscrit via une
        // inscription supplémentaire (et pas seulement sa classe active).
        classEnrollments: {
          where: { classId: { in: classIds } },
          select: {
            class: {
              select: {
                id: true,
                name: true,
                course: { select: { title: true } },
              },
            },
          },
          take: 1,
        },
      },
    });

    // Assiduité globale de chaque étudiant (données pédagogiques partagées).
    const attendanceRecords = await prisma.attendance.findMany({
      where: {
        organizationId: user.organizationId,
        studentId: { in: students.map((student) => student.id) },
      },
      select: { studentId: true, status: true },
    });

    const attendanceByStudent = new Map<string, { status: string; count: number }[]>();
    for (const record of attendanceRecords) {
      const bucket = attendanceByStudent.get(record.studentId) ?? [];
      const existing = bucket.find((entry) => entry.status === record.status);
      if (existing) {
        existing.count += 1;
      } else {
        bucket.push({ status: record.status, count: 1 });
      }
      attendanceByStudent.set(record.studentId, bucket);
    }

    const classNameById = new Map(classes.map((klass) => [klass.id, klass]));

    return students.map((student) => {
      // Classe effective : celle de l'enseignant (classe active si elle
      // appartient à ses cours, sinon la première inscription trouvée).
      let effectiveClass: {
        name: string;
        course: { title: string };
      } | null = null;
      if (
        student.currentClass &&
        classNameById.has(student.currentClass.id)
      ) {
        effectiveClass = student.currentClass;
      } else if (student.classEnrollments[0]?.class) {
        effectiveClass = student.classEnrollments[0].class;
      }

      const buckets = attendanceByStudent.get(student.id) ?? [];
      const countFor = (status: string) =>
        buckets.find((entry) => entry.status === status)?.count ?? 0;

      return {
        id: student.id,
        studentCode: student.studentCode,
        firstName: student.firstName,
        lastName: student.lastName,
        status: student.status,
        className: effectiveClass?.name ?? null,
        courseTitle: effectiveClass?.course.title ?? null,
        attendance: {
          total: buckets.reduce((sum, entry) => sum + entry.count, 0),
          present: countFor("PRESENT"),
          late: countFor("LATE"),
          absent: countFor("ABSENT"),
          excused: countFor("EXCUSED"),
        },
      };
    });
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[getTeacherStudents] Échec de lecture :", error);

    // Dégradation gracieuse : liste vide plutôt que crash serveur.
    return [];
  }
}

/**
 * Crée un nouvel étudiant dans l'organisation active.
 * Conçu pour être utilisé avec `useActionState` : reçoit l'état précédent et un `FormData`,
 * retourne un état sérialisable (succès, erreurs de champs, message).
 *
 * Gère également :
 * - l'affectation à une classe / cohorte (`classId`, facultatif) ;
 * - les frais d'inscription uniques : ajoutés au coût total exigé et
 *   encaissés via une recette dédiée lors de cette première inscription.
 */
export async function createStudentAction(
  _prevState: StudentFormState,
  formData: FormData
): Promise<StudentFormState> {
  await assertCanMutate();
  const parsed = parseStudentForm(formData);

  if (!parsed.ok) {
    return {
      status: "error",
      message: "Veuillez corriger les champs indiqués.",
      fieldErrors: parsed.fieldErrors,
    };
  }

  const organizationId = await getCurrentOrganizationId();

  // Contrôle d'unicité de l'email — le champ n'a pas de contrainte @unique
  // au niveau du schéma (il est optionnel), mais l'application exige que deux
  // étudiants d'une même organisation ne partagent pas la même adresse email.
  if (parsed.data.email) {
    const existing = await prisma.student.findFirst({
      where: {
        organizationId,
        email: parsed.data.email,
      },
      select: { id: true },
    });

    if (existing) {
      return {
        status: "error",
        message: "Un étudiant avec cet email existe déjà.",
        fieldErrors: { email: "Cet email est déjà utilisé." },
      };
    }
  }

  // Paramétrage des frais d'inscription de l'organisation active.
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { defaultRegistrationFee: true, registrationFeePolicy: true },
  });

  if (!organization) {
    return {
      status: "error",
      message:
        "Organisation introuvable : votre session pointe vers une organisation qui n'existe plus.",
    };
  }

  const registrationFee = organization.defaultRegistrationFee;

  // ---------------------------------------------------------------
  // Frais d'inscription (15 000 FCFA par défaut) — mode d'encaissement
  // ---------------------------------------------------------------
  // Champ OBLIGATOIRE « registrationFeePayment » dès que le statut est
  // « Inscrit » :
  //   - PAYE              → recette officielle créée dans le système
  //                         (comptabilité / trésorerie) ;
  //   - PAYE_HORS_SYSTEME → frais réputés réglés sur la fiche de l'étudiant,
  //                         AUCUNE écriture dans le journal de caisse.
  // Pour un statut Prospect / Abandonné : aucun frais facturé.
  const rawFeeChoice = String(formData.get("registrationFeePayment") ?? "")
    .trim()
    .toUpperCase();
  const registrationFeeChoice: "PAYE" | "PAYE_HORS_SYSTEME" | "" =
    rawFeeChoice === "PAYE"
      ? "PAYE"
      : rawFeeChoice === "PAYE_HORS_SYSTEME"
        ? "PAYE_HORS_SYSTEME"
        : "";

  if (
    parsed.data.status === "ENROLLED" &&
    registrationFee > 0 &&
    !registrationFeeChoice
  ) {
    return {
      status: "error",
      message: "Veuillez corriger les champs indiqués.",
      fieldErrors: {
        registrationFeePayment:
          "Veuillez sélectionner le statut du paiement des frais d'inscription.",
      },
    };
  }

  // Étudiant « hérité » (repli historique, champ absent) : dès que des
  // paiements antérieurs hors système sont saisis ou que la case « Ne pas
  // inclure dans le journal de caisse actuel » est cochée, les frais
  // d'inscription sont réputés réglés hors système — replacés par le choix
  // explicite du formulaire dès qu'il est présent.
  const registrationFeeExcluded =
    parsed.data.legacyExcludeFromJournal || parsed.data.legacyPaidAmount > 0;

  type RegistrationFeeMode = "SYSTEM" | "OFF_SYSTEM" | "NONE";
  const registrationFeeMode: RegistrationFeeMode =
    parsed.data.status !== "ENROLLED"
      ? "NONE"
      : registrationFeeChoice === "PAYE"
        ? "SYSTEM"
        : registrationFeeChoice === "PAYE_HORS_SYSTEME"
          ? "OFF_SYSTEM"
          : registrationFeeExcluded
            ? "OFF_SYSTEM"
            : "SYSTEM";

  // Recette en caisse UNIQUEMENT pour le mode « Payé » (système).
  const appliesRegistrationFee =
    registrationFeeMode === "SYSTEM" && registrationFee > 0;

  // Frais d'inscription réglés (fiche étudiant) pour tout étudiant « Inscrit »
  // dont les frais ont été déclarés payés (système OU hors système). Un
  // Prospect / Abandonné n'a pas réglé les frais (ils pourront être facturés
  // lors de son passage au statut « Inscrit »).
  const hasPaidRegistrationFee =
    registrationFee <= 0 || registrationFeeMode !== "NONE";

  // Classe / cohorte ciblée (validation multi-tenant) — résolue AVANT le
  // calcul financier afin d'appliquer automatiquement les frais de la classe
  // au coût total de scolarité lorsqu'aucun montant n'est saisi.
  let targetClass: TargetClass | null = null;

  try {
    targetClass = await resolveTargetClass(formData, organizationId);
  } catch (error) {
    if (error instanceof Error && error.message === "CLASS_NOT_FOUND") {
      return {
        status: "error",
        message: "Classe introuvable dans votre organisation.",
        fieldErrors: { classId: "Classe introuvable." },
      };
    }

    throw error;
  }

  // Complète le coût total avec les frais de la classe si nécessaire, puis
  // ajoute les frais d'inscription le cas échéant.
  const financials = computeFinancialsWithFee(
    applyClassTuitionFee(parsed.data, targetClass?.tuitionFee),
    appliesRegistrationFee,
    registrationFee
  );

  // Réessais en cas de collision sur le code étudiant généré (contrainte unique).
  const MAX_ATTEMPTS = 5;
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const studentCode = await generateStudentCode();

      const createdStudent = await prisma.$transaction(async (tx) => {
        const legacyInJournal =
          financials.legacyPaidAmount > 0 &&
          !financials.legacyExcludeFromJournal;

        const student = await tx.student.create({
          data: {
            organizationId,
            studentCode,
            firstName: parsed.data.firstName,
            lastName: parsed.data.lastName,
            email: parsed.data.email,
            phone: parsed.data.phone,
            status: parsed.data.status,
            totalCost: financials.totalCost,
            discount: financials.discount,
            discountType: financials.discountType,
            netAmount: financials.netAmount,
            legacyPaidAmount: financials.legacyPaidAmount,
            legacyAmountInCashJournal: legacyInJournal,
            hasPaidRegistrationFee,
            isSelfFinanced: parsed.data.isSelfFinanced,
            parentName: parsed.data.parentName,
            parentRelation: parsed.data.parentRelation,
            parentPhone1: parsed.data.parentPhone1,
            parentPhone2: parsed.data.parentPhone2,
            ...(targetClass ? { currentClassId: targetClass.id } : {}),
          },
        });

        // Recette « LEGACY » : uniquement si l'utilisateur a décoché la case
        // « Ne pas inclure dans le journal de caisse actuel » — sinon le
        // montant hérité reste strictement informatif (aucune écriture).
        if (legacyInJournal) {
          await tx.payment.create({
            data: {
              organizationId,
              studentId: student.id,
              amount: financials.legacyPaidAmount,
              paymentMethod: "CASH",
              status: "COMPLETED",
              reference: buildLegacyPaymentReference(studentCode),
              description: LEGACY_PAYMENT_DESCRIPTION,
            },
          });
        }

        // Historique d'affectation à la classe + inscription au cours porteur.
        if (targetClass) {
          await tx.classEnrollment.create({
            data: {
              organizationId,
              studentId: student.id,
              classId: targetClass.id,
            },
          });

          await tx.enrollment.upsert({
            where: {
              studentId_courseId: {
                studentId: student.id,
                courseId: targetClass.courseId,
              },
            },
            create: { studentId: student.id, courseId: targetClass.courseId },
            update: {},
          });
        }

        // Recette dédiée aux frais d'inscription (transaction financière).
        if (appliesRegistrationFee) {
          await tx.payment.create({
            data: {
              organizationId,
              studentId: student.id,
              amount: registrationFee,
              paymentMethod: "CASH",
              status: "COMPLETED",
              reference: buildRegistrationReference(studentCode),
              description: REGISTRATION_FEE_DESCRIPTION,
            },
          });
        }

        return student;
      });

      revalidatePath("/dashboard/students");
      revalidatePath("/dashboard/payments");
      revalidatePath("/dashboard/classes");

      // E-mail de bienvenue en arrière-plan (après la réponse) si l'étudiant
      // a une adresse e-mail valide. L'échec d'envoi ne bloque jamais la création.
      if (parsed.data.email) {
        const recipientEmail = parsed.data.email;
        const recipientName = `${parsed.data.firstName} ${parsed.data.lastName}`;

        after(async () => {
          await sendWelcomeEmail({
            studentEmail: recipientEmail,
            studentName: recipientName,
            studentCode,
          });
        });
      }

      const feeNote =
        registrationFee > 0 && registrationFeeMode === "SYSTEM"
          ? ` Frais d'inscription (${formatFcfa(registrationFee)}) encaissés.`
          : registrationFee > 0 && registrationFeeMode === "OFF_SYSTEM"
            ? ` Frais d'inscription (${formatFcfa(
                registrationFee
              )}) réputés réglés hors système (aucune écriture en caisse).`
            : "";

      const legacyNote =
        financials.legacyPaidAmount > 0
          ? financials.legacyExcludeFromJournal
            ? " Paiements antérieurs hors système enregistrés (exclus du journal de caisse)."
            : ` Paiements antérieurs (${formatFcfa(
                financials.legacyPaidAmount
              )}) inclus dans le journal de caisse.`
          : "";

      return {
        status: "success",
        message: `Étudiant créé avec succès (${createdStudent.studentCode}).${feeNote}${legacyNote}`,
      };
    } catch (error) {
      lastError = error;

      // P2002 = violation de contrainte d'unicité.
      const isUniqueViolation =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002";

      if (isUniqueViolation) {
        // La contrainte peut porter sur l'email (déjà vérifié ci-dessus en
        // lecture, mais une course concurrente reste possible) ou sur le code
        // étudiant généré aléatoirement — ce dernier cas est réessayé.
        const target = error.meta?.target;
        const targets = Array.isArray(target)
          ? (target as string[])
          : typeof target === "string"
            ? [target]
            : [];

        if (targets.includes("email")) {
          // L'email existe déjà — pas de retry, message explicite.
          return {
            status: "error",
            message: "Un étudiant avec cet email existe déjà.",
            fieldErrors: { email: "Cet email est déjà utilisé." },
          };
        }

        // Contrainte sur studentCode (ou autre) — on relance une tentative
        // avec un nouveau code généré (boucle for).
        continue;
      }

      // Autre type d'erreur Prisma (P2025, P2003, etc.) — on sort de la boucle.
      break;
    }
  }

  console.error("[createStudentAction] Échec de création :", lastError);

  // Messages d'erreur contextuels selon le type d'erreur Prisma rencontrée.
  let detailMessage =
    "Une erreur est survenue lors de la création de l'étudiant.";

  if (lastError instanceof Prisma.PrismaClientKnownRequestError) {
    switch (lastError.code) {
      case "P2002":
        detailMessage =
          "Conflit d'unicité détecté lors de la création : veuillez réessayer.";
        break;
      case "P2003":
        detailMessage =
          "Référence invalide (classe ou cours introuvable) : veuillez vérifier votre sélection.";
        break;
      case "P2025":
        detailMessage =
          "Enregistrement introuvable lors de la création : la classe sélectionnée a peut-être été modifiée.";
        break;
      default:
        detailMessage = `Erreur de base de données (${lastError.code}) : ${lastError.message}`;
    }
  } else if (lastError instanceof Error) {
    detailMessage = lastError.message;
  }

  return {
    status: "error",
    message: detailMessage,
  };
}
/**
 * Met à jour un étudiant existant de l'organisation active.
 * Conçu pour être utilisé avec `useActionState` : reçoit l'état précédent et un `FormData`
 * (incluant le champ caché `id`), retourne un état sérialisable.
 *
 * Gère également :
 * - la (ré)affectation à une classe / cohorte (`classId`) : une nouvelle
 *   ligne d'historique est créée sans effacer les affectations passées ;
 * - les frais d'inscription uniques : si l'étudiant ne les a pas encore
 *   réglés, ils sont ajoutés au coût total et encaissés à la validation.
 *   En cas de réinscription (`hasPaidRegistrationFee === true`), aucun frais
 *   supplémentaire n'est facturé (0 FCFA) : seule la scolarité est due.
 */
export async function updateStudentAction(
  _prevState: StudentFormState,
  formData: FormData
): Promise<StudentFormState> {
  await assertCanMutate();
  const studentId = String(formData.get("id") ?? "").trim();

  if (!studentId) {
    return {
      status: "error",
      message: "Identifiant de l'étudiant manquant.",
    };
  }

  const parsed = parseStudentForm(formData);

  if (!parsed.ok) {
    return {
      status: "error",
      message: "Veuillez corriger les champs indiqués.",
      fieldErrors: parsed.fieldErrors,
    };
  }

  const organizationId = await getCurrentOrganizationId();

  try {
    // Isolation multi-tenant : l'étudiant doit appartenir à l'organisation active.
    const existing = await prisma.student.findFirst({
      where: { id: studentId, organizationId },
      select: {
        id: true,
        studentCode: true,
        hasPaidRegistrationFee: true,
        currentClassId: true,
        legacyPaidAmount: true,
        legacyAmountInCashJournal: true,
        // Statut actuel : pilote la machine à états des règlements
        // (suspension / restauration) lors d'un changement de statut.
        status: true,
      },
    });

    if (!existing) {
      return {
        status: "error",
        message: "Étudiant introuvable dans votre organisation.",
      };
    }

    // Paramétrage des frais d'inscription de l'organisation active.
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { defaultRegistrationFee: true, registrationFeePolicy: true },
    });

    if (!organization) {
      return {
        status: "error",
        message:
          "Organisation introuvable : votre session pointe vers une organisation qui n'existe plus.",
      };
    }

    const registrationFee = organization.defaultRegistrationFee;
    const isEveryNewEnrollment =
      organization.registrationFeePolicy === "EVERY_NEW_ENROLLMENT";

    // Étudiant « hérité » (paiements antérieurs > 0 ou case « Ne pas inclure
    // dans le journal de caisse actuel » cochée) : les frais d'inscription sont
    // réputés réglés hors système et ne doivent JAMAIS entrer en caisse live.
    const registrationFeeExcluded =
      parsed.data.legacyExcludeFromJournal || parsed.data.legacyPaidAmount > 0;

    // Frais d'inscription :
    // - ONCE_PER_STUDENT : uniquement s'ils n'ont jamais été réglés.
    // - EVERY_NEW_ENROLLMENT : à chaque nouvelle inscription (nouvelle classe/cours).
    const appliesRegistrationFee =
      registrationFee > 0 &&
      !registrationFeeExcluded &&
      (isEveryNewEnrollment || !existing.hasPaidRegistrationFee);

    // Classe / cohorte ciblée (validation multi-tenant).
    // Sélection explicite « Aucune classe » ⇒ retrait de la cohorte active.
    const wantsNoClass =
      String(formData.get("classId") ?? "").trim() === "";
    let targetClass: TargetClass | null = null;

    try {
      targetClass = await resolveTargetClass(formData, organizationId);
    } catch (error) {
      if (error instanceof Error && error.message === "CLASS_NOT_FOUND") {
        return {
          status: "error",
          message: "Classe introuvable dans votre organisation.",
          fieldErrors: { classId: "Classe introuvable." },
        };
      }

      throw error;
    }

    // Complète le coût total avec les frais de la classe si nécessaire (lors
    // d'un changement de classe sans montant saisi), puis ajoute les frais
    // d'inscription le cas échéant.
    const financials = computeFinancialsWithFee(
      applyClassTuitionFee(parsed.data, targetClass?.tuitionFee),
      appliesRegistrationFee,
      registrationFee
    );

    const classChanged =
      targetClass !== null && targetClass.id !== existing.currentClassId;

    // Réconciliation de la recette « LEGACY » (paiements antérieurs hors
    // système) : idempotente, basée sur la référence unique LEGACY-<code>.
    // - case décochée + montant > 0 → upsert de la recette (inclusion) ;
    // - case cochée ou montant nul → suppression de toute recette résiduelle.
    const legacyInJournal =
      financials.legacyPaidAmount > 0 && !financials.legacyExcludeFromJournal;
    const legacyReference = buildLegacyPaymentReference(existing.studentCode);
    const legacyChanged =
      legacyInJournal !== existing.legacyAmountInCashJournal ||
      legacyInJournal;

    // Note comptable générée par la machine à états des statuts (calculée en
    // fin de transaction, retournée par celle-ci) — ajoutée au message de
    // succès.
    const statusImpactNote = await prisma.$transaction(async (tx) => {
      await tx.student.update({
        where: { id: studentId },
        data: {
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
          email: parsed.data.email,
          phone: parsed.data.phone,
          status: parsed.data.status,
          totalCost: financials.totalCost,
          discount: financials.discount,
          discountType: financials.discountType,
          netAmount: financials.netAmount,
          legacyPaidAmount: financials.legacyPaidAmount,
          legacyAmountInCashJournal: legacyInJournal,
          // L'étudiant (y compris hérité) a réglé — ou réputé réglé — ses
          // frais d'inscription : toute réinscription future est gratuite.
          ...(registrationFeeExcluded || appliesRegistrationFee
            ? { hasPaidRegistrationFee: true }
            : {}),
          ...(wantsNoClass
            ? { currentClassId: null }
            : targetClass
              ? { currentClassId: targetClass.id }
              : {}),
        },
      });

      // Journal de caisse : synchronise la recette « LEGACY-* » avec l'état
      // de la case (aucune écriture si le montant reste exclu du journal).
      if (legacyChanged) {
        if (legacyInJournal) {
          await tx.payment.upsert({
            where: { reference: legacyReference },
            create: {
              organizationId,
              studentId,
              amount: financials.legacyPaidAmount,
              paymentMethod: "CASH",
              status: "COMPLETED",
              reference: legacyReference,
              description: LEGACY_PAYMENT_DESCRIPTION,
            },
            update: { amount: financials.legacyPaidAmount },
          });
        } else {
          await tx.payment.deleteMany({
            where: { organizationId, reference: legacyReference },
          });
        }
      }

      // Nouvelle affectation : historique + inscription au cours porteur.
      if (targetClass && classChanged) {
        await tx.classEnrollment.upsert({
          where: {
            studentId_classId: {
              studentId,
              classId: targetClass.id,
            },
          },
          create: {
            organizationId,
            studentId,
            classId: targetClass.id,
          },
          update: {},
        });

        await tx.enrollment.upsert({
          where: {
            studentId_courseId: {
              studentId,
              courseId: targetClass.courseId,
            },
          },
          create: { studentId, courseId: targetClass.courseId },
          update: {},
        });
      }

      // Recette dédiée aux frais d'inscription (première inscription seulement).
      if (appliesRegistrationFee) {
        const studentCode = await tx.student
          .findUniqueOrThrow({
            where: { id: studentId },
            select: { studentCode: true },
          })
          .then((row) => row.studentCode);

        await tx.payment.create({
          data: {
            organizationId,
            studentId,
            amount: registrationFee,
            paymentMethod: "CASH",
            status: "COMPLETED",
            reference: buildRegistrationReference(studentCode),
            description: REGISTRATION_FEE_DESCRIPTION,
          },
        });
      }

      // ---------------------------------------------------------------
      // Machine à états des statuts — impact comptable du changement
      // (exécuté en FIN de transaction pour couvrir TOUTES les écritures
      // de l'étudiant, y compris celles créées ci-dessus) :
      //
      //   • X ➔ PROSPECT    : tous les règlements ACTIFS sont SUSPENDUS
      //     (`isVoided = true`). Les enregistrements et reçus restent
      //     consultables, mais les montants sortent de la trésorerie /
      //     du cash-flow actif.
      //   • X ➔ ENROLLED    : les règlements suspendus sont RESTAURÉS
      //     (`isVoided = false`) et réintègrent le grand livre actif.
      //   • X ➔ DROPPED_OUT : AUCUNE écriture modifiée — l'argent a été
      //     réellement encaissé, l'historique complet est conservé.
      // ---------------------------------------------------------------
      const previousStatus = existing.status;
      const nextStatus = parsed.data.status;

      let statusNote: string | null = null;

      if (previousStatus !== nextStatus) {
        if (nextStatus === "PROSPECT") {
          const voided = await tx.payment.updateMany({
            where: { organizationId, studentId, isVoided: false },
            data: { isVoided: true },
          });

          statusNote =
            voided.count > 0
              ? `Statut « Prospect » : ${voided.count} règlement(s) suspendu(s) et exclu(s) de la trésorerie active.`
              : "Statut « Prospect » : aucun règlement actif à suspendre.";
        } else if (nextStatus === "ENROLLED") {
          const restored = await tx.payment.updateMany({
            where: { organizationId, studentId, isVoided: true },
            data: { isVoided: false },
          });

          statusNote =
            restored.count > 0
              ? `Statut « Inscrit » : ${restored.count} règlement(s) suspendu(s) restauré(s) dans la caisse active.`
              : null;
        }
        // DROPPED_OUT : règlements conservés intacts (aucune écriture).
      }

      return statusNote;
    });

    revalidatePath("/dashboard/students");
    revalidatePath(`/dashboard/students/${studentId}`);
    revalidatePath("/dashboard/payments");
    revalidatePath("/dashboard/classes");
    // Impacts financiers possibles (recette « LEGACY ») : rafraîchit les
    // vues analytiques et la trésorerie.
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/tresorerie");

    const notes: string[] = [];

    if (appliesRegistrationFee) {
      notes.push(
        `Frais d'inscription (${formatFcfa(registrationFee)}) encaissés.`
      );
    } else if (registrationFeeExcluded) {
      notes.push(
        `Frais d'inscription (${formatFcfa(
          registrationFee
        )}) réputés réglés hors système (aucune écriture en caisse).`
      );
    } else if (classChanged && existing.hasPaidRegistrationFee) {
      notes.push(
        "Réinscription enregistrée : frais d'inscription déjà réglés (0 FCFA facturé)."
      );
    }

    if (financials.legacyPaidAmount > 0) {
      notes.push(
        financials.legacyExcludeFromJournal
          ? "Paiements antérieurs hors système mis à jour (exclus du journal de caisse)."
          : `Paiements antérieurs (${formatFcfa(
              financials.legacyPaidAmount
            )}) inclus dans le journal de caisse.`
      );
    }

    if (statusImpactNote) {
      notes.push(statusImpactNote.trim());
    }

    return {
      status: "success",
      message: `Étudiant mis à jour avec succès.${notes.length > 0 ? ` ${notes.join(" ")}` : ""}`,
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[updateStudentAction] Échec de mise à jour :", error);

    return {
      status: "error",
      message: "Une erreur est survenue lors de la mise à jour de l'étudiant.",
    };
  }
}

/**
 * Génère (si nécessaire) et retourne le token d'accès public non modifiable
 * d'un étudiant. Ce token permet de créer un lien parent inaltérable qui
 * donne accès en lecture seule au rapport de l'étudiant sans connexion.
 */
export async function ensureStudentReportToken(
  studentId: string
): Promise<{ ok: true; token: string } | { ok: false; message: string }> {
  const organizationId = await getCurrentOrganizationId();

  try {
    const existing = await prisma.student.findFirst({
      where: { id: studentId, organizationId },
      select: { id: true, publicReportToken: true },
    });

    if (!existing) {
      return {
        ok: false,
        message: "Étudiant introuvable dans votre organisation.",
      };
    }

    if (existing.publicReportToken) {
      return { ok: true, token: existing.publicReportToken };
    }

    const token = randomUUID();

    await prisma.student.update({
      where: { id: studentId },
      data: { publicReportToken: token },
    });

    return { ok: true, token };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[ensureStudentReportToken] Échec :", error);

    return {
      ok: false,
      message:
        "Impossible de générer le lien parent pour le moment.",
    };
  }
}

/**
 * Supprime un étudiant de l'organisation active.
 * Les inscriptions, paiements et dossiers de voyage liés sont supprimés en
 * cascade ; les tâches associées sont simplement détachées (`SetNull`).
 */
export async function deleteStudentAction(
  studentId: string
): Promise<StudentMutationResult> {
  await assertCanMutate();
  if (!studentId) {
    return { ok: false, message: "Identifiant de l'étudiant manquant." };
  }

  try {
    const organizationId = await getCurrentOrganizationId();

    // Isolation multi-tenant : l'étudiant doit appartenir à l'organisation active.
    const existing = await prisma.student.findFirst({
      where: { id: studentId, organizationId },
      select: { id: true },
    });

    if (!existing) {
      return {
        ok: false,
        message: "Étudiant introuvable dans votre organisation.",
      };
    }

    await prisma.student.delete({ where: { id: studentId } });

    revalidatePath("/dashboard/students");
    revalidatePath("/dashboard/payments");
    revalidatePath("/dashboard/travels");

    return { ok: true };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[deleteStudentAction] Échec de suppression :", error);

    return {
      ok: false,
      message:
        "Une erreur est survenue lors de la suppression de l'étudiant.",
    };
  }
}

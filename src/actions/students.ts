"use server";

import { Prisma, type DiscountType, type LeadSource, type StudentStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getCurrentOrganizationId, getCurrentSessionActor, getCurrentSessionUser, isNextRedirectError } from "@/lib/session";
import { getCurrentAcademicYear } from "@/lib/class-status";
import { assertCanMutate } from "@/lib/license-check";
import { ensurePaymentScheduleForStudentClass } from "@/lib/actions/schedules";
import { resolveEnrollmentIdForStudent } from "@/lib/enrollment-scope";
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from "@/lib/audit-constants";
import { logAuditEvent } from "@/lib/actions/audit";

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
  /** Étape du pipeline CRM (null = non suivi). */
  leadStage: string | null;
  /** Source d'acquisition du prospect. */
  leadSource: string | null;
  /**
   * Date de naissance — sert notamment au pré-remplissage des attestations
   * de formation en cours (variable `{{birthDate}}`).
   */
  dateOfBirth: Date | null;
  /** Adresse / ville de résidence (variable `{{city}}` des attestations). */
  address: string | null;
  createdAt: Date;
};

export type StudentFormField =
  | "firstName"
  | "lastName"
  | "email"
  | "phone"
  | "dateOfBirth"
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
  /**
   * Partage WhatsApp post-inscription : résumé pré-rempli + URL `wa.me`
   * (`https://wa.me/?text=...`) permettant à l'entreprise d'envoyer le reçu
   * ou le message de confirmation directement au candidat. Renseigné
   * uniquement en cas de succès.
   */
  whatsappShareUrl?: string;
  /** Texte pré-rempli du message WhatsApp (résumé d'inscription). */
  whatsappShareText?: string;
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
 * Statuts acceptés à la validation serveur. Les contrôles de saisie proposent
 * les QUATRE options produit (Prospect, Inscrit, Diplômé / Terminé, Abandonné —
 * voir `CANONICAL_STUDENT_STATUS_OPTIONS`), mais la validation reste tolérante
 * sur l'ensemble de l'enum afin de ne jamais bloquer l'édition de fiches
 * historiques créées avant l'harmonisation (IN_PROGRESS, SUSPENDED).
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
        /**
         * Date de naissance — champ facultatif du formulaire
         * (`<input type="date">`). Sert au pré-remplissage des attestations
         * (`{{birthDate}}`) et à la variable `{{birthDate}}` des certificats.
         */
        dateOfBirth: Date | null;
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
  const rawDateOfBirth = String(formData.get("dateOfBirth") ?? "").trim();
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

  // Date de naissance (facultative) : `yyyy-mm-dd` attendu par
  // `<input type="date">`. Toute valeur non vide doit être une date valide.
  let dateOfBirth: Date | null = null;
  if (rawDateOfBirth) {
    const parsedDate = new Date(rawDateOfBirth);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(rawDateOfBirth) ||
      Number.isNaN(parsedDate.getTime())
    ) {
      fieldErrors.dateOfBirth = "La date de naissance est invalide.";
    } else {
      dateOfBirth = parsedDate;
    }
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
      dateOfBirth,
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

/**
 * Construit le résumé d'inscription partageable via WhatsApp
 * (`https://wa.me/?text=...`) : identité, code étudiant, classe, montants.
 * Le serveur ne peut pas émettre de message WhatsApp (aucune API WhatsApp
 * Business configurée) : on renvoie une URL préremplie que l'interface ouvre
 * dans un nouvel onglet — même logique que les relances d'échéances
 * (`src/lib/actions/reminders.ts`).
 */
function buildEnrollmentWhatsAppShare(input: {
  studentCode: string;
  firstName: string;
  lastName: string;
  phone: string;
  className?: string | null;
  classSchedule?: string | null;
  netAmount?: number | null;
  registrationFeeNote?: string;
}): { shareText: string; shareUrl: string } {
  const lines = [
    `✅ Inscription confirmée — ${input.firstName} ${input.lastName} (${input.studentCode})`,
    input.className
      ? `📚 Classe : ${input.className}${input.classSchedule ? ` (${input.classSchedule})` : ""}`
      : "📚 Classe : —",
    input.netAmount !== null && input.netAmount !== undefined
      ? `💰 Net à payer : ${formatFcfa(input.netAmount)}`
      : null,
    input.registrationFeeNote ? `🧾 ${input.registrationFeeNote}` : null,
    "Merci de votre confiance !",
  ].filter((line): line is string => line !== null);

  const shareText = lines.join("\n");
  const shareUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  return { shareText, shareUrl };
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
  /** Nom de la classe (résumé WhatsApp post-inscription). */
  name: string;
  /** Créneau d'affichage de la classe (résumé WhatsApp). */
  schedule: string;
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
      name: true,
      schedule: true,
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
    name: klass.name,
    schedule: klass.schedule,
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
  /**
   * Règlement « hors système » / antérieur : met à jour le solde débiteur de
   * l'étudiant mais n'alimente PAS la session de caisse physique du jour.
   */
  isOutOfSystem: boolean;
  reference: string | null;
  description: string | null;
  paidAt: Date;
};

/**
 * Transaction de caisse (achats en comptoir) rattachée à la fiche d'un
 * étudiant : livres, services annexes, frais divers…
 * Alimente le relevé financier 360° (historique complet des mouvements
 * monétaires de l'élève, scolarité comprise).
 */
export type StudentTransactionDTO = {
  id: string;
  /** Nature de la transaction (TUITION / BOOK / SERVICE / OTHER). */
  type: string;
  /** Libellé détaillé de l'achat. */
  description: string;
  /** Montant en FCFA (charge pour l'élève, toujours positif). */
  amount: number;
  /** Moyen de paiement saisi en caisse (Cash, Mobile Money, Card…). */
  paymentMode: string;
  createdAt: Date;
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
  /**
   * Date de naissance — pré-remplissage des attestations de formation en
   * cours (variable `{{birthDate}}`).
   */
  dateOfBirth: Date | null;
  /** Adresse / ville de résidence (variable `{{city}}` des attestations). */
  address: string | null;
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
  /**
   * Transactions de caisse (achats en comptoir) rattachées à l'étudiant :
   * livres, services annexes, frais divers. Alimente le relevé 360°.
   */
  studentTransactions: StudentTransactionDTO[];
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
        dateOfBirth: true,
        address: true,
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

    const [paidAggregate, payments, studentTransactions] = await Promise.all([
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
          isOutOfSystem: true,
          reference: true,
          description: true,
          paidAt: true,
        },
      }),
      // Transactions de caisse (achats comptoir) rattachées à l'étudiant :
      // livres, services annexes, frais divers — alimentent le relevé 360°.
      prisma.studentTransaction.findMany({
        where: { studentId, organizationId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          type: true,
          description: true,
          amount: true,
          paymentMode: true,
          createdAt: true,
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
      dateOfBirth: student.dateOfBirth,
      address: student.address,
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
      studentTransactions,
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[getStudentDetail] Échec de lecture :", error);

    throw new Error(
      "Impossible de charger la fiche de l'étudiant pour le moment."
    );
  }
}

// --------------------------------------
// Réinscription — « Inscrire dans une nouvelle classe »
// --------------------------------------

/** Résultat de la réinscription d'un étudiant. */
export type ReEnrollmentResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

/** Longueur maximale admise pour une année académique saisie. */
const ACADEMIC_YEAR_MAX_LENGTH = 20;

/**
 * Réinscrit un étudiant dans une nouvelle classe (boutons « Inscrire dans une
 * nouvelle classe » de la fiche étudiant et « Réinscription » du module
 * Inscription).
 *
 * Comportement garanti :
 * - l'inscription (`ClassEnrollment`) ACTIVE courante de l'élève passe au
 *   statut `COMPLETED` (inscription terminée sans décision pédagogique de
 *   clôture) et son historique est PRÉSERVÉ (jamais écrasé ni supprimé) ;
 * - une nouvelle `ClassEnrollment` ACTIVE est créée pour la classe cible sur
 *   l'ANNÉE ACADÉMIQUE fournie (par défaut : année courante) — la clé
 *   d'unicité (étudiant, classe, année) garantit qu'une réinscription sur une
 *   NOUVELLE année crée TOUJOURS une nouvelle ligne sans toucher aux années
 *   précédentes ;
 * - l'inscription au cours porteur (`Enrollment`) est créée si absente ;
 * - `currentClassId` de l'étudiant pointe vers la nouvelle classe ;
 * - un ÉCHÉANCIER DÉDIÉ et propre à la NOUVELLE classe est généré (activé si
 *   la classe est déjà démarrée, en attente de démarrage sinon) — l'échéancier
 *   des classes antérieures n'est jamais modifié.
 *
 * Les décisions de passage « officielles » (PASSED / FAILED) restent du
 * ressort de la clôture de classe (`class-closure.ts`) : cette action couvre
 * le cas d'une réinscription administrative hors clôture.
 */
export async function reEnrollStudentAction(input: {
  studentId: string;
  newClassId: string;
  /** Année académique de la NOUVELLE inscription (défaut : année courante). */
  academicYear?: string;
}): Promise<ReEnrollmentResult> {
  await assertCanMutate();

  const academicYear = (input.academicYear ?? "").trim();
  if (academicYear.length > ACADEMIC_YEAR_MAX_LENGTH) {
    return {
      ok: false,
      message: `L'année académique ne doit pas dépasser ${ACADEMIC_YEAR_MAX_LENGTH} caractères.`,
    };
  }
  const targetAcademicYear = academicYear || getCurrentAcademicYear();

  try {
    const organizationId = await getCurrentOrganizationId();

    if (!input.studentId || !input.newClassId) {
      return {
        ok: false,
        message: "Étudiant ou classe cible manquant.",
      };
    }

    const [student, targetClass] = await Promise.all([
      prisma.student.findFirst({
        where: { id: input.studentId, organizationId },
        select: { id: true, firstName: true, lastName: true, currentClassId: true },
      }),
      prisma.class.findFirst({
        where: { id: input.newClassId, organizationId },
        select: { id: true, name: true, courseId: true },
      }),
    ]);

    if (!student) {
      return { ok: false, message: "Étudiant introuvable dans votre organisation." };
    }

    if (!targetClass) {
      return { ok: false, message: "Classe cible introuvable dans votre organisation." };
    }

    if (student.currentClassId === targetClass.id) {
      return {
        ok: false,
        message: "L'étudiant est déjà inscrit dans cette classe.",
      };
    }

    await prisma.$transaction(async (tx) => {
      // 1) Clôture des inscriptions ACTIVE : historique conservé, jamais
      //    écrasé (les lignes passées restent en base avec leur statut).
      //    Statut final COMPLETED (« inscription terminée ») : le transfert
      //    n'est PAS une décision pédagogique de passage (PASSED / FAILED /
      //    PROMOTED_MANUALLY restent le ressort de la clôture de classe).
      await tx.classEnrollment.updateMany({
        where: {
          studentId: student.id,
          organizationId,
          status: "ACTIVE",
        },
        data: { status: "COMPLETED" },
      });

      // 2) Nouvelle inscription ACTIVE dans la classe cible (upsert sur la
      //    clé (étudiant, classe, année académique) : si le dossier
      //    pédagogique existe déjà pour l'année COURANTE, il est simplement
      //    réactivé ; une réinscription sur une nouvelle année crée une
      //    nouvelle ligne d'historique sans écraser les précédentes.
      await tx.classEnrollment.upsert({
        where: {
          studentId_classId_academicYear: {
            studentId: student.id,
            classId: targetClass.id,
            academicYear: targetAcademicYear,
          },
        },
        create: {
          organizationId,
          studentId: student.id,
          classId: targetClass.id,
          status: "ACTIVE",
          academicYear: targetAcademicYear,
        },
        update: {
          status: "ACTIVE",
          finalDecisionNote: null,
          enrolledAt: new Date(),
        },
      });

      // 3) Inscription au cours porteur de la classe (idempotent).
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

      // 4) La classe courante de l'élève devient la classe cible.
      await tx.student.update({
        where: { id: student.id },
        data: { currentClassId: targetClass.id },
      });
    });

    await logAuditEvent({
      action: AUDIT_ACTIONS.STUDENT_UPDATED,
      entity: AUDIT_ENTITIES.STUDENT,
      entityId: student.id,
      details: {
        action: "RE_ENROLLMENT",
        newClassId: targetClass.id,
        newClassName: targetClass.name,
        academicYear: targetAcademicYear,
      },
    });

    // ÉCHÉANCIER DÉDIÉ à la nouvelle classe : créé (et activé si la classe est
    // déjà démarrée) — un échéancier en attente sera activé au démarrage de la
    // classe. Les échéanciers des classes antérieures restent intacts.
    await ensurePaymentScheduleForStudentClass(student.id, targetClass.id);

    revalidatePath("/dashboard/students");
    revalidatePath(`/dashboard/students/${student.id}`);
    revalidatePath("/dashboard/classes");
    revalidatePath("/dashboard/echeances");

    return {
      ok: true,
      message: `${student.firstName} ${student.lastName} a été inscrit dans la classe « ${targetClass.name} ». L'inscription précédente reste dans son historique.`,
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[reEnrollStudentAction] Échec de réinscription :", error);

    return {
      ok: false,
      message: "Une erreur est survenue lors de la réinscription de l'étudiant.",
    };
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
        leadStage: true,
        leadSource: true,
        dateOfBirth: true,
        address: true,
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
      leadStage: student.leadStage,
      leadSource: student.leadSource,
      dateOfBirth: student.dateOfBirth,
      address: student.address,
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
  // Auteur des écritures financières générées par la création (frais
  // d'inscription, montants hérités) : ID + nom de l'utilisateur connecté.
  const actor = await getCurrentSessionActor();

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
  // Pour un statut Prospect / Abandonné / Diplômé : aucun frais facturé
  // (les frais d'inscription ne sont levés qu'au statut « Inscrit »).
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
  // Prospect / Abandonné / Diplômé n'a pas réglé les frais (ils pourront être
  // facturés lors de son passage au statut « Inscrit »).
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
            dateOfBirth: parsed.data.dateOfBirth,
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

        // Historique d'affectation à la classe + inscription au cours porteur.
        // L'inscription est créée AVANT les écritures financières afin de
        // rattacher chaque règlement à l'inscription (classe + année
        // académique) de l'étudiant — séparation stricte Étudiant /
        // Inscription.
        const classEnrollment = targetClass
          ? await tx.classEnrollment.create({
              data: {
                organizationId,
                studentId: student.id,
                classId: targetClass.id,
                academicYear: getCurrentAcademicYear(),
              },
            })
          : null;

        if (targetClass) {
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

        // Recette « LEGACY » : uniquement si l'utilisateur a décoché la case
        // « Ne pas inclure dans le journal de caisse actuel » — sinon le
        // montant hérité reste strictement informatif (aucune écriture).
        if (legacyInJournal) {
          await tx.payment.create({
            data: {
              organizationId,
              studentId: student.id,
              enrollmentId: classEnrollment?.id ?? null,
              createdById: actor.id,
              createdByName: actor.name,
              amount: financials.legacyPaidAmount,
              paymentMethod: "CASH",
              status: "COMPLETED",
              reference: buildLegacyPaymentReference(studentCode),
              description: LEGACY_PAYMENT_DESCRIPTION,
            },
          });
        }

        // Recette dédiée aux frais d'inscription (transaction financière).
        if (appliesRegistrationFee) {
          await tx.payment.create({
            data: {
              organizationId,
              studentId: student.id,
              enrollmentId: classEnrollment?.id ?? null,
              createdById: actor.id,
              createdByName: actor.name,
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

      // Journal d'audit : trace de création d'étudiant
      await logAuditEvent({
        action: AUDIT_ACTIONS.STUDENT_CREATED,
        entity: AUDIT_ENTITIES.STUDENT,
        entityId: createdStudent.id,
        details: {
          studentCode: createdStudent.studentCode,
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
          email: parsed.data.email ?? null,
          status: parsed.data.status,
        },
      });

      // AUCUN e-mail automatique d'inscription : l'envoi Resend / React-Email
      // est volontairement supprimé (erreurs + ressources inutiles). À la
      // place, on prépare un résumé partageable via WhatsApp
      // (`https://wa.me/?text=...`) pour l'envoi manuel du reçu au candidat.
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

      const registrationFeeShareNote =
        registrationFee > 0 && registrationFeeMode === "SYSTEM"
          ? `Frais d'inscription ${formatFcfa(registrationFee)} encaissés`
          : registrationFee > 0 && registrationFeeMode === "OFF_SYSTEM"
            ? `Frais d'inscription ${formatFcfa(registrationFee)} réglés hors système`
            : undefined;

      const { shareText, shareUrl } = buildEnrollmentWhatsAppShare({
        studentCode: createdStudent.studentCode,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        phone: parsed.data.phone,
        className: targetClass?.name ?? null,
        classSchedule: targetClass?.schedule ?? null,
        netAmount: financials.netAmount,
        registrationFeeNote: registrationFeeShareNote,
      });

      return {
        status: "success",
        message: `Étudiant créé avec succès (${createdStudent.studentCode}).${feeNote}${legacyNote}`,
        whatsappShareUrl: shareUrl,
        whatsappShareText: shareText,
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
  // Auteur des écritures financières générées par la mise à jour.
  const actor = await getCurrentSessionActor();

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
          dateOfBirth: parsed.data.dateOfBirth,
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

      // Rattachement des écritures financières à l'inscription (classe +
      // année académique) — séparation stricte Étudiant / Inscription. En
      // l'absence de changement de classe, l'inscription courante (la plus
      // récente) fait foi.
      const existingEnrollmentId = await resolveEnrollmentIdForStudent(tx, {
        organizationId,
        studentId,
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
              enrollmentId: existingEnrollmentId,
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
      // Clé d'unicité (étudiant, classe, année) : une réinscription dans la
      // même classe sur une nouvelle année crée une NOUVELLE ligne sans
      // écraser l'historique des années précédentes.
      let classEnrollmentId: string | null = existingEnrollmentId;

      if (targetClass && classChanged) {
        const classEnrollment = await tx.classEnrollment.upsert({
          where: {
            studentId_classId_academicYear: {
              studentId,
              classId: targetClass.id,
              academicYear: getCurrentAcademicYear(),
            },
          },
          create: {
            organizationId,
            studentId,
            classId: targetClass.id,
            academicYear: getCurrentAcademicYear(),
          },
          update: {},
        });
        classEnrollmentId = classEnrollment.id;

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
            enrollmentId: classEnrollmentId,
            createdById: actor.id,
            createdByName: actor.name,
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

    // Journal d'audit : trace de suppression d'étudiant
    await logAuditEvent({
      action: AUDIT_ACTIONS.STUDENT_DELETED,
      entity: AUDIT_ENTITIES.STUDENT,
      entityId: studentId,
    });

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

// --------------------------------------
// Import CSV d'étudiants / prospects
// --------------------------------------

/** Mapping des libellés français de statut vers l'enum Prisma. */
const STATUS_LABEL_MAP: Record<string, StudentStatus> = {
  prospect: "PROSPECT",
  inscrit: "ENROLLED",
  abandoned: "DROPPED_OUT",
  abandonné: "DROPPED_OUT",
  "in progress": "IN_PROGRESS",
  "en cours": "IN_PROGRESS",
  completed: "COMPLETED",
  diplômé: "COMPLETED",
  suspended: "SUSPENDED",
};

/** Normalise un libellé de statut vers l'enum Prisma. */
function normalizeStatus(label: string): StudentStatus {
  const key = label.trim().toLowerCase();
  return STATUS_LABEL_MAP[key] ?? "PROSPECT";
}

/** Normalise une source libre (CSV) vers l'enum Prisma LeadSource. */
function normalizeLeadSource(source: string | null): LeadSource | null {
  if (!source) return null;
  const key = source.trim().toLowerCase();
  if (key.includes("facebook") || key.includes("instagram") || key.includes("tiktok")) return "FACEBOOK_INSTAGRAM";
  if (key.includes("recommandation") || key.includes("parrain") || key.includes("bouche")) return "RECOMMENDATION";
  if (key.includes("site") || key.includes("web") || key.includes("internet")) return "WEBSITE";
  if (key.includes("passage") || key.includes("visite") || key.includes("walk")) return "WALK_IN";
  return "OTHER";
}

/**
 * Importe des étudiants/prospects depuis un contenu CSV.
 * Gère les doublons d'email/téléphone en les ignorant.
 */
export async function importStudentsFromCsvAction(
  _prevState: ImportState,
  formData: FormData
): Promise<ImportState> {
  try {
    await assertCanMutate();

    const csvContent = formData.get("csvContent");
    // Le contenu réel est lu via le fichier uploadé, mais comme on utilise
    // un formulaire classique, on passe par une approche différente :
    // le composant client lit le fichier et l'envoie via le champ caché.
    // Cependant, les FileReader API ne sont pas disponibles côté serveur.
    // On utilise donc une approche alternative : le fichier est envoyé
    // via un champ file standard et lu ici.

    // Pour cette implémentation, on utilise une approche simplifiée :
    // le contenu CSV est envoyé comme texte dans un champ hidden.
    // Le composant client lit le fichier et le transmet via le formulaire.

    if (!csvContent || typeof csvContent !== "string") {
      return { status: "error", message: "Aucun contenu CSV fourni." };
    }

    return await processCsvImport(csvContent);
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[importStudentsFromCsvAction] Échec :", error);
    return {
      status: "error",
      message: "Une erreur est survenue lors de l'import.",
    };
  }
}

/** Type retourné par l'action d'import CSV. */
export type ImportState = {
  status: "idle" | "pending" | "success" | "error";
  message?: string;
  imported?: number;
  skipped?: number;
};

/** Traite le contenu CSV et importe les étudiants. */
async function processCsvImport(csvContent: string): Promise<ImportState> {
  const lines = csvContent
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "");

  if (lines.length < 2) {
    return { status: "error", message: "Le fichier CSV est vide ou sans données." };
  }

  // Ignore la première ligne (en-têtes)
  const dataLines = lines.slice(1);
  let imported = 0;
  let skipped = 0;
  const importDetails: Array<{ name: string; status: string }> = [];

  for (const line of dataLines) {
    const delimiter = line.includes(";") ? ";" : ",";
    const cells = line.split(delimiter).map((cell) => cell.trim().replace(/^"|"$/g, ""));

    const firstName = cells[0]?.trim();
    const lastName = cells[1]?.trim();
    const email = cells[2]?.trim() || null;
    const phone = cells[3]?.trim();
    const statusLabel = cells[4]?.trim() || "Prospect";
    const source = cells[5]?.trim() || null;

    // Validation minimale : prénom et nom requis
    if (!firstName || !lastName) {
      skipped++;
      continue;
    }

    // Vérifie les doublons par email ou téléphone
    const existingStudent = await prisma.student.findFirst({
      where: {
        organizationId: await getCurrentOrganizationId(),
        OR: [
          ...(email ? [{ email }] : []),
          ...(phone ? [{ phone }] : []),
        ],
      },
      select: { id: true },
    });

    if (existingStudent) {
      skipped++;
      continue;
    }

    // Génère le code étudiant
    const studentCode = await generateStudentCode();

    // Crée l'étudiant
    const status = normalizeStatus(statusLabel);
    const organizationId = await getCurrentOrganizationId();

    const student = await prisma.student.create({
      data: {
        organizationId,
        studentCode,
        firstName,
        lastName,
        email,
        phone: phone || studentCode, // Fallback si téléphone absent
        status,
        ...(normalizeLeadSource(source) ? { leadSource: normalizeLeadSource(source) as LeadSource } : {}),
      },
    });

    await logAuditEvent({
      action: AUDIT_ACTIONS.STUDENT_CREATED,
      entity: AUDIT_ENTITIES.STUDENT,
      entityId: student.id,
      details: {
        source: "csv_import",
        name: `${firstName} ${lastName}`,
        status,
      },
    });

    imported++;
    importDetails.push({ name: `${firstName} ${lastName}`, status });
  }

  // Invalide le cache de la liste des étudiants
  revalidatePath("/dashboard/students");

  return {
    status: "success",
    imported,
    skipped,
    message: `${imported} étudiant(s) importé(s), ${skipped} ignoré(s).`,
  };
}

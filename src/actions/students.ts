"use server";

import { Prisma, type StudentStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { sendWelcomeEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { getCurrentOrganizationId, isNextRedirectError } from "@/lib/session";

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
  /** Réduction accordée sur le coût total (FCFA). */
  discount: number | null;
  /** Net à payer = totalCost − discount (calculé automatiquement). */
  netAmount: number | null;
  /** Frais d'inscription déjà réglés (uniques à vie). */
  hasPaidRegistrationFee: boolean;
  /** Classe / cohorte active de l'étudiant. */
  currentClassId: string | null;
  currentClassName: string | null;
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
  | "classId";

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
  netAmount: number | null;
};

/**
 * Analyse et valide les champs financiers du formulaire étudiant.
 * Le Net à Payer est TOUJOURS recalculé côté serveur
 * (`netAmount = totalCost − discount`) : la valeur soumise par le client,
 * même présente, n'est jamais utilisée.
 */
function parseFinancialFields(
  formData: FormData,
  fieldErrors: Partial<Record<StudentFormField, string>>
): ParsedFinancials {
  const rawTotalCost = String(formData.get("totalCost") ?? "").trim();
  const rawDiscount = String(formData.get("discount") ?? "").trim();

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
    } else if (totalCost !== null && value > totalCost) {
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
  const netAmount =
    totalCost !== null && discount !== null ? totalCost - discount : null;

  return { totalCost, discount, netAmount };
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
        netAmount: number | null;
      };
    }
  | { ok: false; fieldErrors: Partial<Record<StudentFormField, string>> };

function parseStudentForm(formData: FormData): ParsedStudentInput {
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();

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

type TargetClass = { id: string; courseId: string };

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
    select: { id: true, courseId: true },
  });

  if (!klass) {
    throw new Error("CLASS_NOT_FOUND");
  }

  return klass;
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

  return {
    totalCost,
    discount,
    netAmount: totalCost - discount,
  };
}

/**
 * Fiche détaillée d'un étudiant : informations, récapitulatif financier
 * et historique des règlements.
 */
export type StudentPaymentDTO = {
  id: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  status: string;
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
  /** Réduction accordée. */
  discount: number | null;
  /** Net à payer (totalCost − discount). */
  netAmount: number | null;
  /** Montant déjà encaissé : somme des paiements COMPLETED. */
  paidAmount: number;
  /** Reste à payer : max(0, netAmount − paidAmount). */
  remainingAmount: number | null;
  /** Frais d'inscription déjà réglés (uniques à vie). */
  hasPaidRegistrationFee: boolean;
  /** Classe / cohorte active de l'étudiant. */
  currentClassId: string | null;
  currentClassName: string | null;
  /** Intitulé du cours porteur de la classe active (bulletins, attestations). */
  currentCourseTitle: string | null;
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
        netAmount: true,
        hasPaidRegistrationFee: true,
        currentClassId: true,
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
      // Montant encaissé : uniquement les règlements confirmés (COMPLETED).
      prisma.payment.aggregate({
        where: { studentId, organizationId, status: "COMPLETED" },
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
          reference: true,
          description: true,
          paidAt: true,
        },
      }),
    ]);

    const paidAmount = paidAggregate._sum.amount ?? 0;

    const remainingAmount =
      student.netAmount !== null
        ? Math.max(0, student.netAmount - paidAmount)
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
      netAmount: student.netAmount,
      hasPaidRegistrationFee: student.hasPaidRegistrationFee,
      currentClassId: student.currentClassId,
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
        netAmount: true,
        hasPaidRegistrationFee: true,
        currentClassId: true,
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
      netAmount: student.netAmount,
      hasPaidRegistrationFee: student.hasPaidRegistrationFee,
      currentClassId: student.currentClassId,
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
  const parsed = parseStudentForm(formData);

  if (!parsed.ok) {
    return {
      status: "error",
      message: "Veuillez corriger les champs indiqués.",
      fieldErrors: parsed.fieldErrors,
    };
  }

  const organizationId = await getCurrentOrganizationId();

  // Paramétrage des frais d'inscription de l'organisation active.
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { defaultRegistrationFee: true },
  });

  if (!organization) {
    return {
      status: "error",
      message:
        "Organisation introuvable : votre session pointe vers une organisation qui n'existe plus.",
    };
  }

  const registrationFee = organization.defaultRegistrationFee;

  // Un nouvel étudiant n'a jamais réglé les frais d'inscription :
  // ils sont facturés dès cette première inscription (si > 0).
  const appliesRegistrationFee = registrationFee > 0;
  const financials = computeFinancialsWithFee(
    parsed.data,
    appliesRegistrationFee,
    registrationFee
  );

  // Classe / cohorte ciblée (validation multi-tenant).
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

  // Réessais en cas de collision sur le code étudiant généré (contrainte unique).
  const MAX_ATTEMPTS = 5;
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const studentCode = await generateStudentCode();

      const createdStudent = await prisma.$transaction(async (tx) => {
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
            netAmount: financials.netAmount,
            // Les frais d'inscription sont réglés dès la création.
            hasPaidRegistrationFee: true,
            ...(targetClass ? { currentClassId: targetClass.id } : {}),
          },
        });

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

      const feeNote = appliesRegistrationFee
        ? ` Frais d'inscription (${formatFcfa(registrationFee)}) encaissés.`
        : "";

      return {
        status: "success",
        message: `Étudiant créé avec succès (${createdStudent.studentCode}).${feeNote}`,
      };
    } catch (error) {
      lastError = error;

      const isUniqueViolation =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

      if (!isUniqueViolation) break;
    }
  }

  console.error("[createStudentAction] Échec de création :", lastError);

  return {
    status: "error",
    message: "Une erreur est survenue lors de la création de l'étudiant.",
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
      select: { id: true, hasPaidRegistrationFee: true, currentClassId: true },
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
      select: { defaultRegistrationFee: true },
    });

    if (!organization) {
      return {
        status: "error",
        message:
          "Organisation introuvable : votre session pointe vers une organisation qui n'existe plus.",
      };
    }

    const registrationFee = organization.defaultRegistrationFee;

    // Frais d'inscription : uniquement s'ils n'ont jamais été réglés.
    const appliesRegistrationFee =
      !existing.hasPaidRegistrationFee && registrationFee > 0;
    const financials = computeFinancialsWithFee(
      parsed.data,
      appliesRegistrationFee,
      registrationFee
    );

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

    const classChanged =
      targetClass !== null && targetClass.id !== existing.currentClassId;

    await prisma.$transaction(async (tx) => {
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
          netAmount: financials.netAmount,
          ...(appliesRegistrationFee
            ? { hasPaidRegistrationFee: true }
            : {}),
          ...(wantsNoClass
            ? { currentClassId: null }
            : targetClass
              ? { currentClassId: targetClass.id }
              : {}),
        },
      });

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
    });

    revalidatePath("/dashboard/students");
    revalidatePath(`/dashboard/students/${studentId}`);
    revalidatePath("/dashboard/payments");
    revalidatePath("/dashboard/classes");

    const notes: string[] = [];

    if (appliesRegistrationFee) {
      notes.push(
        `Frais d'inscription (${formatFcfa(registrationFee)}) encaissés.`
      );
    } else if (classChanged && existing.hasPaidRegistrationFee) {
      notes.push(
        "Réinscription enregistrée : frais d'inscription déjà réglés (0 FCFA facturé)."
      );
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
 * Supprime un étudiant de l'organisation active.
 * Les inscriptions, paiements et dossiers de voyage liés sont supprimés en
 * cascade ; les tâches associées sont simplement détachées (`SetNull`).
 */
export async function deleteStudentAction(
  studentId: string
): Promise<StudentMutationResult> {
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
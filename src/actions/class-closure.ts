"use server";

import { revalidatePath } from "next/cache";
import type {
  ClassEnrollmentStatus,
  ClassStatus,
  ModuleStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  getCurrentOrganizationId,
  getCurrentSessionUser,
  isNextRedirectError,
} from "@/lib/session";
import { assertCanMutate } from "@/lib/license-check";
import {
  computeModuleStatus,
  summarizeModuleValidation,
  type ModuleValidationSummary,
} from "@/lib/module-status";
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from "@/lib/audit-constants";
import { logAuditEvent } from "@/lib/actions/audit";

// --------------------------------------
// Types publics (contrat avec les composants clients)
// --------------------------------------

/** Module évalué pour un étudiant, avec note, seuil et statut calculé. */
export type ClosureModuleDTO = {
  evaluationTitle: string;
  moduleName: string;
  /** Note obtenue (`null` = non noté). */
  score: number | null;
  maxScore: number;
  /** Seuil de validation effectif du module (passMark). */
  passMark: number;
  /** Statut calculé : VALIDATED / FAILED / RETAKE (`null` si non noté). */
  status: ModuleStatus | null;
};

/** Ligne étudiant de l'écran de clôture, avec récapitulatif et décision proposée. */
export type ClosureStudentDTO = {
  enrollmentId: string;
  studentId: string;
  studentCode: string;
  firstName: string;
  lastName: string;
  modules: ClosureModuleDTO[];
  summary: ModuleValidationSummary;
  /** Décision proposée par le mode automatique : `PASSED` si tous les modules
   * requis (notés) sont validés, sinon `FAILED`. */
  autoDecision: "PASSED" | "FAILED";
};

/** Classe cible éligible au passage (autre classe ACTIVE de l'organisation). */
export type ClosureTargetClassDTO = {
  id: string;
  name: string;
  schedule: string;
  courseTitle: string;
  courseCode: string;
  status: ClassStatus;
};

/** Données de l'écran de clôture d'une classe. */
export type CloseClassDataDTO = {
  id: string;
  name: string;
  schedule: string;
  courseId: string;
  courseTitle: string;
  courseCode: string;
  teacherName: string | null;
  status: ClassStatus;
  students: ClosureStudentDTO[];
  targetClasses: ClosureTargetClassDTO[];
  /** Frais d'inscription par défaut de l'organisation (montant du toggle). */
  defaultRegistrationFee: number;
};

/** Décision de fin de session par étudiant. */
export type ClosureDecision = "PASSED" | "FAILED" | "DROPPED";

/** Entrée de décision individuelle du formulaire de clôture. */
export type ClosureDecisionInput = {
  studentId: string;
  decision: ClosureDecision;
  /** Appréciation optionnelle spécifique à cet étudiant. */
  note?: string;
};

/** Payload d'exécution de la clôture. */
export type CloseClassInput = {
  classId: string;
  /** Classe de destination des étudiants admis (ex : A1 → A2). */
  targetClassId: string;
  decisions: ClosureDecisionInput[];
  /** Appréciation commune appliquée aux étudiants sans note individuelle. */
  globalDecisionNote?: string;
  /**
   * Facturer les frais de réinscription ? `false` par défaut : une promotion
   * interne ne génère AUCUN frais d'inscription afin de ne pas fausser la
   * comptabilité de l'élève.
   */
  chargeReRegistrationFee: boolean;
};

/** Résultat de l'exécution de la clôture. */
export type CloseClassResult =
  | {
      ok: true;
      promoted: number;
      retained: number;
      dropped: number;
      billedCount: number;
    }
  | { ok: false; message: string };

// --------------------------------------
// Constantes & helpers internes
// --------------------------------------

const NOTE_MAX_LENGTH = 500;
/** Rôles autorisés à clôturer une classe (décision administrative). */
const CLOSURE_ALLOWED_ROLES = new Set(["SUPER_ADMIN", "ADMIN", "STAFF"]);

/**
 * Référence de paiement unique pour un frais de réinscription volontaire.
 * Format : `REINSC-<code étudiant>-<horodatage base36>` (unicité garantie).
 */
function buildReRegistrationReference(studentCode: string): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.floor(Math.random() * 1296)
    .toString(36)
    .toUpperCase()
    .padStart(2, "0");
  return `REINSC-${studentCode}-${timestamp}${random}`;
}

/** Description comptable explicite du frais de réinscription. */
const RE_REGISTRATION_DESCRIPTION = "Frais de réinscription (clôture de classe)";

/** Appréciation par défaut selon la décision (sans note saisie). */
function buildDefaultDecisionNote(decision: ClosureDecision): string {
  switch (decision) {
    case "PASSED":
      return "Passage en classe supérieure validé.";
    case "FAILED":
      return "Redoublement : modules non validés à reprendre.";
    case "DROPPED":
      return "Abandon constaté à la clôture de la classe.";
  }
}

// --------------------------------------
// Server Action — Données de l'écran de clôture
// --------------------------------------

/**
 * Prépare l'écran de clôture d'une classe : étudiants inscrits avec le
 * récapitulatif de leurs modules (validés / non validés / à reprendre),
 * décision automatique proposée, classes cibles éligibles au passage et
 * montant des frais de réinscription configurés.
 *
 * Réservée aux rôles administratifs : la décision de passage est un acte de
 * gestion, pas un acte pédagogique.
 */
export async function getCloseClassData(
  classId: string
): Promise<CloseClassDataDTO> {
  const user = await getCurrentSessionUser();
  const organizationId = user.organizationId;

  if (!CLOSURE_ALLOWED_ROLES.has(user.role)) {
    throw new Error(
      "Accès refusé : la clôture de classe est réservée aux administrateurs."
    );
  }

  const klass = await prisma.class.findFirst({
    where: { id: classId, organizationId },
    select: {
      id: true,
      name: true,
      schedule: true,
      courseId: true,
      status: true,
      course: { select: { title: true, code: true } },
      teacher: { select: { firstName: true, lastName: true } },
      enrollments: {
        where: { status: "ACTIVE" },
        select: {
          id: true,
          studentId: true,
          student: {
            select: {
              id: true,
              studentCode: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: [
          { student: { firstName: "asc" } },
          { student: { lastName: "asc" } },
        ],
      },
    },
  });

  if (!klass) {
    throw new Error("Classe introuvable dans votre organisation.");
  }

  const studentIds = klass.enrollments.map((e) => e.studentId);

  // Notes de tous les étudiants inscrits, récupérées en une seule requête
  // (évaluations de la classe → modules → notes des étudiants concernés).
  const evaluations = await prisma.evaluation.findMany({
    where: { classId: klass.id, organizationId },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    select: {
      title: true,
      passMark: true,
      modules: {
        orderBy: { createdAt: "asc" },
        select: {
          name: true,
          maxScore: true,
          passingScore: true,
          grades: {
            where: { studentId: { in: studentIds } },
            select: {
              studentId: true,
              score: true,
              passMark: true,
              status: true,
            },
          },
        },
      },
    },
  });

  // Index des notes : clé `${studentId}:${évaluation}:${module}`.
  type GradeRow = {
    score: number;
    passMark: number;
    status: ModuleStatus | null;
  };
  const gradesByKey = new Map<string, GradeRow>();
  for (const evaluation of evaluations) {
    for (const module of evaluation.modules) {
      for (const grade of module.grades) {
        gradesByKey.set(
          `${grade.studentId}:${evaluation.title}:${module.name}`,
          {
            score: grade.score,
            passMark: grade.passMark ?? module.passingScore ?? evaluation.passMark,
            status: grade.status ?? null,
          }
        );
      }
    }
  }

  const students: ClosureStudentDTO[] = klass.enrollments.map((enrollment) => {
    const modules: ClosureModuleDTO[] = evaluations.flatMap((evaluation) =>
      evaluation.modules.map((module) => {
        const grade = gradesByKey.get(
          `${enrollment.studentId}:${evaluation.title}:${module.name}`
        );
        const passMark =
          grade?.passMark ?? module.passingScore ?? evaluation.passMark;
        const score = grade ? grade.score : null;
        return {
          evaluationTitle: evaluation.title,
          moduleName: module.name,
          score,
          maxScore: module.maxScore,
          passMark,
          // Statut figé (RETAKE inclus) ou recalculé à partir de la note.
          status: grade?.status ?? computeModuleStatus(score, passMark),
        };
      })
    );

    const summary = summarizeModuleValidation(modules);

    return {
      enrollmentId: enrollment.id,
      studentId: enrollment.studentId,
      studentCode: enrollment.student.studentCode,
      firstName: enrollment.student.firstName,
      lastName: enrollment.student.lastName,
      modules,
      summary,
      autoDecision: summary.eligibleForPromotion ? "PASSED" : "FAILED",
    };
  });

  // Classes cibles : autres classes actives de l'organisation (passage A1 → A2).
  const targetClasses = await prisma.class.findMany({
    where: { organizationId, status: "ACTIVE", id: { not: klass.id } },
    orderBy: [{ course: { title: "asc" } }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      schedule: true,
      status: true,
      course: { select: { title: true, code: true } },
    },
  });

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { defaultRegistrationFee: true },
  });

  return {
    id: klass.id,
    name: klass.name,
    schedule: klass.schedule,
    courseId: klass.courseId,
    courseTitle: klass.course.title,
    courseCode: klass.course.code,
    teacherName: klass.teacher
      ? `${klass.teacher.firstName} ${klass.teacher.lastName}`
      : null,
    status: klass.status,
    students,
    targetClasses: targetClasses.map((target) => ({
      id: target.id,
      name: target.name,
      schedule: target.schedule,
      courseTitle: target.course.title,
      courseCode: target.course.code,
      status: target.status,
    })),
    defaultRegistrationFee: organization?.defaultRegistrationFee ?? 0,
  };
}

// --------------------------------------
// Server Action — Exécution de la clôture
// --------------------------------------

/**
 * Clôture une classe et acte les décisions de passage de chaque étudiant.
 *
 * Effets par étudiant :
 * - `PASSED` : inscription actuelle marquée PASSED (ou PROMOTED_MANUALLY si la
 *   décision déroge à la validation automatique des modules), dossier
 *   pédagogique créé dans la classe cible, `currentClassId` mis à jour et
 *   inscription au cours porteur créée si nécessaire — SANS aucun frais
 *   d'inscription (sauf toggle explicite de réinscription) ;
 * - `FAILED` : inscription marquée FAILED (redoublement) et modules échoués
 *   basculés au statut RETAKE (à reprendre) ;
 * - `DROPPED` : inscription marquée DROPPED (abandon).
 *
 * La classe clôturée passe au statut `COMPLETED` : son historique (inscriptions,
 * notes, bulletins) reste consultable sans altérer les données des nouvelles
 * cohortes.
 */
export async function closeClassAction(
  input: CloseClassInput
): Promise<CloseClassResult> {
  try {
    await assertCanMutate();

    const user = await getCurrentSessionUser();
    const organizationId = user.organizationId;

    if (!CLOSURE_ALLOWED_ROLES.has(user.role)) {
      return {
        ok: false,
        message:
          "Accès refusé : la clôture de classe est réservée aux administrateurs.",
      };
    }

    if (!input.classId || !input.targetClassId) {
      return {
        ok: false,
        message: "Classe et classe cible de destination sont obligatoires.",
      };
    }

    if (input.classId === input.targetClassId) {
      return {
        ok: false,
        message: "La classe cible doit être différente de la classe clôturée.",
      };
    }

    if (!Array.isArray(input.decisions) || input.decisions.length === 0) {
      return { ok: false, message: "Aucune décision de passage fournie." };
    }

    // Normalisation des décisions individuelles.
    const decisions = input.decisions.map((decision) => ({
      studentId: String(decision.studentId ?? "").trim(),
      decision: decision.decision,
      note:
        typeof decision.note === "string" && decision.note.trim().length > 0
          ? decision.note.trim().slice(0, NOTE_MAX_LENGTH)
          : null,
    }));

    for (const decision of decisions) {
      if (!decision.studentId) {
        return {
          ok: false,
          message: "Une décision référence un étudiant inconnu.",
        };
      }
      if (!["PASSED", "FAILED", "DROPPED"].includes(decision.decision)) {
        return { ok: false, message: "Décision de passage invalide." };
      }
    }

    // Classe à clôturer : active et rattachée à l'organisation.
    const klass = await prisma.class.findFirst({
      where: { id: input.classId, organizationId },
      select: { id: true, name: true, status: true },
    });

    if (!klass) {
      return { ok: false, message: "Classe introuvable dans votre organisation." };
    }

    if (klass.status !== "ACTIVE") {
      return {
        ok: false,
        message:
          "Cette classe est déjà clôturée : les décisions sont verrouillées.",
      };
    }

    // Classe cible : active et rattachée à la même organisation.
    const targetClass = await prisma.class.findFirst({
      where: { id: input.targetClassId, organizationId, status: "ACTIVE" },
      select: { id: true, name: true, courseId: true },
    });

    if (!targetClass) {
      return {
        ok: false,
        message: "Classe cible introuvable ou inactive dans votre organisation.",
      };
    }

    // Inscriptions actuelles de la classe (base de la validation des décisions).
    const activeEnrollments = await prisma.classEnrollment.findMany({
      where: { classId: klass.id, organizationId, status: "ACTIVE" },
      select: {
        id: true,
        studentId: true,
        student: { select: { studentCode: true } },
      },
    });
    const enrollmentByStudent = new Map(
      activeEnrollments.map((enrollment) => [enrollment.studentId, enrollment])
    );

    for (const decision of decisions) {
      if (!enrollmentByStudent.has(decision.studentId)) {
        return {
          ok: false,
          message:
            "Un des étudiants décisionnaires n'est plus inscrit (actif) dans cette classe.",
        };
      }
    }

    const globalNote =
      typeof input.globalDecisionNote === "string" &&
      input.globalDecisionNote.trim().length > 0
        ? input.globalDecisionNote.trim().slice(0, NOTE_MAX_LENGTH)
        : null;


    const promotedIds = decisions
      .filter((d) => d.decision === "PASSED")
      .map((d) => d.studentId);

    // Snapshot des décisions automatiques réelles : un étudiant passé malgré
    // des modules non validés / non notés est une promotion MANUELLE.
    const autoDecisionByStudent = new Map<string, "PASSED" | "FAILED">();
    if (promotedIds.length > 0) {
      const evaluations = await prisma.evaluation.findMany({
        where: { classId: klass.id, organizationId },
        select: {
          passMark: true,
          modules: {
            select: {
              passingScore: true,
              grades: {
                where: { studentId: { in: promotedIds } },
                select: {
                  studentId: true,
                  score: true,
                  passMark: true,
                  status: true,
                },
              },
            },
          },
        },
      });

      for (const studentId of promotedIds) {
        const entries = evaluations.flatMap((evaluation) =>
          evaluation.modules.map((module) => {
            const grade = module.grades.find((g) => g.studentId === studentId);
            const passMark =
              grade?.passMark ?? module.passingScore ?? evaluation.passMark;
            const score = grade ? grade.score : null;
            return { score, passMark, status: grade?.status ?? null };
          })
        );
        const summary = summarizeModuleValidation(entries);
        autoDecisionByStudent.set(
          studentId,
          summary.eligibleForPromotion ? "PASSED" : "FAILED"
        );
      }
    }

    // Comptabilit� : sans toggle explicite, AUCUN frais n'est cr��. Le montant
    // factur� est celui configur� au niveau de l'organisation (frais par
    // d�faut, ex : 15 000 FCFA).
    let reRegistrationFee = 0;
    if (input.chargeReRegistrationFee) {
      const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { defaultRegistrationFee: true },
      });
      reRegistrationFee = organization?.defaultRegistrationFee ?? 0;
    }

    const result = await prisma.$transaction(async (tx) => {
      let promoted = 0;
      let retained = 0;
      let dropped = 0;
      let billedCount = 0;

      for (const decision of decisions) {
        const enrollment = enrollmentByStudent.get(decision.studentId);
        if (!enrollment) continue;

        const finalNote =
          decision.note ??
          globalNote ??
          buildDefaultDecisionNote(decision.decision);

        if (decision.decision === "PASSED") {
          const isManualOverride =
            autoDecisionByStudent.get(decision.studentId) !== "PASSED";
          const enrollmentStatus: ClassEnrollmentStatus = isManualOverride
            ? "PROMOTED_MANUALLY"
            : "PASSED";

          await tx.classEnrollment.update({
            where: { id: enrollment.id },
            data: { status: enrollmentStatus, finalDecisionNote: finalNote },
          });

          // Dossier pédagogique dans la classe cible — AUCUN frais généré par
          // défaut (la comptabilité de l'élève n'est pas impactée).
          await tx.classEnrollment.upsert({
            where: {
              studentId_classId: {
                studentId: decision.studentId,
                classId: targetClass.id,
              },
            },
            create: {
              organizationId,
              studentId: decision.studentId,
              classId: targetClass.id,
              status: "ACTIVE",
            },
            update: {
              status: "ACTIVE",
              finalDecisionNote: null,
              enrolledAt: new Date(),
            },
          });

          await tx.student.update({
            where: { id: decision.studentId },
            data: { currentClassId: targetClass.id },
          });

          // Inscription au cours porteur de la nouvelle classe (si nouveau
          // cours). Cours déjà suivi : progression préservée, zéro écriture.
          await tx.enrollment.upsert({
            where: {
              studentId_courseId: {
                studentId: decision.studentId,
                courseId: targetClass.courseId,
              },
            },
            create: {
              studentId: decision.studentId,
              courseId: targetClass.courseId,
            },
            update: {},
          });

          promoted += 1;

          // Toggle optionnel : facturer les frais de réinscription.
          if (reRegistrationFee > 0) {
            await tx.payment.create({
              data: {
                organizationId,
                studentId: decision.studentId,
                amount: reRegistrationFee,
                paymentMethod: "CASH",
                status: "COMPLETED",
                reference: buildReRegistrationReference(
                  enrollment.student.studentCode
                ),
                description: RE_REGISTRATION_DESCRIPTION,
              },
            });
            billedCount += 1;
          }
        } else if (decision.decision === "FAILED") {
    // Comptabilité : sans toggle explicite, AUCUN frais n'est créé. Le montant
    // facturé est celui configuré au niveau de l'organisation (frais par
          await tx.classEnrollment.update({
            where: { id: enrollment.id },
            data: { status: "FAILED", finalDecisionNote: finalNote },
          });

          // Modules échoués de la classe → RETAKE (à reprendre l'an prochain).
          const failedGradeIds = (
            await tx.grade.findMany({
              where: {
                studentId: decision.studentId,
                status: "FAILED",
                evaluationModule: { evaluation: { classId: klass.id } },
              },
              select: { id: true },
            })
          ).map((grade) => grade.id);

          if (failedGradeIds.length > 0) {
            await tx.grade.updateMany({
              where: { id: { in: failedGradeIds } },
              data: { status: "RETAKE" },
            });
          }

          retained += 1;
        } else {
          await tx.classEnrollment.update({
            where: { id: enrollment.id },
            data: { status: "DROPPED", finalDecisionNote: finalNote },
          });

          dropped += 1;
        }
      }

      // La classe clôturée est archivée pédagogiquement (COMPLETED).
      await tx.class.update({
        where: { id: klass.id },
        data: { status: "COMPLETED" },
      });

      return { promoted, retained, dropped, billedCount };
    });

    // Journal d'audit (hors transaction : ne doit pas annuler la clôture).
    await logAuditEvent({
      action: AUDIT_ACTIONS.CLASS_CLOSED,
      entity: AUDIT_ENTITIES.CLASS,
      entityId: klass.id,
      details: {
        className: klass.name,
        targetClassId: targetClass.id,
        targetClassName: targetClass.name,
        promoted: result.promoted,
        retained: result.retained,
        dropped: result.dropped,
        chargedReRegistrationFee: result.billedCount > 0 ? reRegistrationFee : 0,
      },
    });

    revalidatePath("/dashboard/classes");
    revalidatePath(`/dashboard/classes/${klass.id}`);
    revalidatePath(`/dashboard/classes/${klass.id}/close`);
    revalidatePath(`/dashboard/classes/${targetClass.id}`);
    revalidatePath("/dashboard/students");

    return {
      ok: true,
      promoted: result.promoted,
      retained: result.retained,
      dropped: result.dropped,
      billedCount: result.billedCount,
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[closeClassAction] Échec de la clôture :", error);
    return {
      ok: false,
      message:
        "Une erreur est survenue lors de la clôture de la classe. Aucune décision n'a été enregistrée.",
    };
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import type {
  ClassEnrollmentStatus,
  ClassStatus,
  ModuleStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getCurrentAcademicYear } from "@/lib/class-status";
import {
  getCurrentOrganizationId,
  getCurrentSessionActor,
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

/** Classe cible éligible au passage (autre classe en cours de l'organisation). */
export type ClosureTargetClassDTO = {
  id: string;
  name: string;
  schedule: string;
  courseTitle: string;
  courseCode: string;
  /** Cours porteur — sert à identifier les sessions « du même niveau ». */
  courseId: string;
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
  /**
   * Classe de destination des étudiants admis (ex : A1 → A2). OPTIONNELLE :
   * absente ⇒ les admis restent rattachés à la classe clôturée (historique)
   * sans transfert, mais leur certificat est quand même généré.
   */
  targetClassId?: string | null;
  /**
   * Classe d'affectation facultative des redoublants : nouvelle session du
   * MÊME niveau (même cours porteur). Absente ⇒ les redoublants restent
   * simplement rattachés à leur classe clôturée (historique) sans nouvelle
   * inscription.
   */
  repeatTargetClassId?: string | null;
  decisions: ClosureDecisionInput[];
  /** Appréciation commune appliquée aux étudiants sans note individuelle. */
  globalDecisionNote?: string;
  /**
   * Facturer les frais de réinscription ? `false` par défaut : une promotion
   * interne ne génère AUCUN frais d'inscription afin de ne pas fausser la
   * comptabilité de l'élève.
   */
  chargeReRegistrationFee: boolean;
  /**
   * Archivage immédiat : `true` ⇒ la classe clôturée passe directement au
   * statut ARCHIVED (lecture seule) au lieu de COMPLETED (clôturée — le
   * « CLOSED » du cycle de vie). Dans les deux cas, les inscriptions sont
   * finalisées (PASSED / FAILED / DROPPED / PROMOTED_MANUALLY selon la
   * décision, COMPLETED sinon) et la comptabilité est scellée.
   */
  archive?: boolean;
};

/** Résultat de l'exécution de la clôture. */
export type CloseClassResult =
  | {
      ok: true;
      promoted: number;
      retained: number;
      dropped: number;
      billedCount: number;
      /** Redoublants réaffectés à une nouvelle session du même niveau. */
      reassigned: number;
      /** Certificats de fin de niveau générés automatiquement (admis). */
      certificatesGenerated: number;
      /** Bulletins finalisés (statuts de modules figés pour l'impression). */
      bulletinsFinalized: number;
      /**
       * Inscriptions sans décision explicite passées au statut final
       * COMPLETED — aucune inscription ne reste ACTIVE après la clôture.
       */
      completedEnrollments: number;
      /** Échéanciers de la classe scellés (décompte figé) à la clôture. */
      sealedSchedules: number;
    }
  | {
      ok: false;
      message: string;
      /**
       * Prérequis de clôture non satisfaits, listés explicitement afin que
       * l'interface puisse afficher une alerte actionnable (défense en
       * profondeur : le contrôle est aussi appliqué côté client).
       */
      missingRequirements?: ClosureMissingRequirement[];
    };

/** Élément de prérequis non satisfait, affiché tel quel dans l'alerte. */
export type ClosureMissingRequirement = {
  /**
   * Clé stable du prérequis (utile pour les tests / l Analytics).
   *
   * - `attendance` : aucune séance avec présence saisie ;
   * - `logbook` : aucune séance avec cahier de texte rempli ;
   * - `evaluationRequired` : aucune évaluation créée / notée pour la classe ;
   * - `evaluations` : évaluations existantes incomplètes (notes manquantes).
   *
   * `evaluationRequired` et `evaluations` sont volontairement distincts : les
   * deux cas ne peuvent pas se produire simultanément (une classe sans aucune
   * évaluation n'a aucune note manquante), et les clés restent uniques dans
   * l'alerte.
   */
  key: "attendance" | "logbook" | "evaluationRequired" | "evaluations";
  /** Libellé expliquant précisément ce qui manque. */
  label: string;
};

/** Résultat de l'évaluation des prérequis de clôture d'une classe. */
export type ClassClosureReadinessDTO =
  | {
      ok: true;
      /** La classe peut être clôturée (tous les prérequis sont satisfaits). */
      canClose: boolean;
      missingRequirements: ClosureMissingRequirement[];
      /** Rappel quantitatif, affiché dans l'alerte pour contextualiser. */
      context: {
        sessionsWithAttendance: number;
        sessionsWithLogbook: number;
        /** Nombre d'évaluations créées pour la classe (0 = prérequis non satisfait). */
        evaluations: number;
        incompleteEvaluations: number;
      };
    }
  | { ok: false; message: string };

/**
 * Message d'erreur agrégé(liste des prérequis manquants) renvoyé par
 * `closeClassAction` lorsqu'un garde-fou bloque la clôture.
 */
function buildClosureBlockedMessage(
  missing: ClosureMissingRequirement[]
): string {
  if (missing.length === 0) {
    return "La clôture est bloquée : des prérequis pédagogiques sont manquants.";
  }

  return `La clôture est bloquée — ${missing.length} prérequis à satisfaire : ${missing
    .map((requirement) => requirement.label)
    .join(" ")}`;
}

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

  // Classes cibles : autres classes en cours de l'organisation
  // (IN_PROGRESS, ou alias historique ACTIVE) — passage A1 → A2 et
  // affectation des redoublants dans une nouvelle session du même niveau.
  const targetClasses = await prisma.class.findMany({
    where: {
      organizationId,
      status: { in: ["ACTIVE", "IN_PROGRESS"] },
      id: { not: klass.id },
    },
    orderBy: [{ course: { title: "asc" } }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      schedule: true,
      status: true,
      courseId: true,
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
      courseId: target.courseId,
      status: target.status,
    })),
    defaultRegistrationFee: organization?.defaultRegistrationFee ?? 0,
  };
}

// --------------------------------------
// Server Action — Garde-fous de clôture
// --------------------------------------

/**
 * Évalue les PRÉREQUIS pédagogiques d'une clôture de classe.
 *
 * Quatre conditions doivent être réunies avant de pouvoir « Terminer la classe » :
 *  1. au moins une séance enregistrée AVEC présence saisie ;
 *  2. au moins une séance dont le CAHIER DE TEXTE est rempli ;
 *  3. au moins une ÉVALUATION créée ET notée pour la classe ;
 *  4. les évaluations existantes sont intégralement complétées.
 *
 * Précision sur les points 3 et 4 : une évaluation est OBLIGATOIRE — un
 * parcours sans aucune évaluation ne peut pas être clôturé (clé
 * `evaluationRequired`, ajoutée à la liste des prérequis manquants). Et dès
 * qu'une évaluation existe, elle doit être intégralement notée : chaque
 * module doit disposer d'une note pour chaque étudiant inscrit
 * (`ClassEnrollment` au statut ACTIVE) — clé `evaluations`.
 *
 * Utilisée par l'interface pour afficher une alerte listant clairement les
 * éléments manquants, ET rappelée par `closeClassAction` (défense en
 * profondeur : le garde-fou reste effectif même en cas de contournement client).
 */
export async function getClassClosureReadiness(
  classId: string
): Promise<ClassClosureReadinessDTO> {
  const user = await getCurrentSessionUser();
  const organizationId = user.organizationId;

  if (!CLOSURE_ALLOWED_ROLES.has(user.role)) {
    return {
      ok: false,
      message:
        "Accès refusé : la clôture de classe est réservée aux administrateurs.",
    };
  }

  try {
    const klass = await prisma.class.findFirst({
      where: { id: classId, organizationId },
      select: { id: true, name: true },
    });

    if (!klass) {
      return { ok: false, message: "Classe introuvable dans votre organisation." };
    }

    // 1 & 2 — Séances : émargement et cahier de texte.
    const sessions = await prisma.classSession.findMany({
      where: { classId: klass.id, organizationId },
      select: {
        id: true,
        chapter: true,
        summary: true,
        _count: { select: { attendances: true } },
      },
    });

    const sessionsWithAttendance = sessions.filter(
      (session) => session._count.attendances > 0
    ).length;

    // Cahier de texte complet : chapitre ET résumé renseignés (le résumé porte
    // le contenu du cours / les devoirs — cf. `saveClassSessionWithAttendance`).
    const sessionsWithLogbook = sessions.filter(
      (session) =>
        session.chapter.trim().length > 0 &&
        (session.summary ?? "").trim().length > 0
    ).length;

    // 3 — Évaluations : chaque module doit être noté pour TOUS les étudiants
    // inscrits. Une classe sans évaluation n'a rien à compléter.
    const [enrollments, evaluations] = await Promise.all([
      prisma.classEnrollment.findMany({
        where: { classId: klass.id, organizationId, status: "ACTIVE" },
        select: { studentId: true },
      }),
      prisma.evaluation.findMany({
        where: { classId: klass.id, organizationId },
        select: {
          id: true,
          title: true,
          modules: {
            select: {
              id: true,
              name: true,
              _count: { select: { grades: true } },
            },
          },
        },
      }),
    ]);

    const studentCount = enrollments.length;

    // 3 — Existence d'au moins UNE évaluation NOTÉE : l'évaluation est un
    // prérequis de clôture à part entière. Distingué du contrôle « notes
    // manquantes » (point 4) appliqué ci-dessous aux évaluations existantes.
    const hasEvaluations = evaluations.length > 0;
    const hasGradedEvaluation = evaluations.some((evaluation) =>
      evaluation.modules.some((module) => module._count.grades > 0)
    );

    // 4 — Évaluations : chaque module doit être noté pour TOUS les étudiants
    // inscrits.
    const incompleteEvaluations = evaluations.filter((evaluation) =>
      evaluation.modules.some(
        (module) => module._count.grades < studentCount
      )
    );

    const missingRequirements: ClosureMissingRequirement[] = [];

    if (sessionsWithAttendance === 0) {
      missingRequirements.push({
        key: "attendance",
        label:
          "Aucune séance enregistrée avec présence saisie — émargez au moins un cours avant de clôturer la classe.",
      });
    }

    if (sessionsWithLogbook === 0) {
      missingRequirements.push({
        key: "logbook",
        label:
          "Aucune séance avec cahier de texte rempli — renseignez le chapitre et le résumé d'au moins un cours.",
      });
    }

    // 3 — Évaluation OBLIGATOIRE : au moins une évaluation créée ET notée
    // pour la classe. Le libellé est pushé dans la liste des prérequis
    // manquants, affichée telle quelle dans l'alerte « Clôture impossible ».
    if (!hasEvaluations) {
      missingRequirements.push({
        key: "evaluationRequired",
        label:
          "Aucune évaluation créée pour cette classe — créez et notez au moins une évaluation avant de clôturer.",
      });
    } else if (!hasGradedEvaluation) {
      missingRequirements.push({
        key: "evaluationRequired",
        label:
          "Aucune note saisie sur les évaluations de la classe — notez au moins un module avant de clôturer.",
      });
    }

    // 4 — Notes manquantes sur les évaluations existantes.
    if (incompleteEvaluations.length > 0) {
      const details = incompleteEvaluations
        .slice(0, 3)
        .map((evaluation) => `« ${evaluation.title} »`)
        .join(", ");

      missingRequirements.push({
        key: "evaluations",
        label: `Évaluations requises non complétées : ${details}${
          incompleteEvaluations.length > 3
            ? ` (et ${incompleteEvaluations.length - 3} autre(s))`
            : ""
        } — toutes les notes doivent être saisies.`,
      });
    }

    return {
      ok: true,
      canClose: missingRequirements.length === 0,
      missingRequirements,
      context: {
        sessionsWithAttendance,
        sessionsWithLogbook,
        evaluations: evaluations.length,
        incompleteEvaluations: incompleteEvaluations.length,
      },
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[getClassClosureReadiness] Échec du contrôle :", error);

    return {
      ok: false,
      message:
        "Impossible de vérifier les prérequis de clôture pour le moment.",
    };
  }
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
 * Effets sur la classe et la comptabilité :
 * - la classe passe à COMPLETED (« clôturée » / CLOSED du cycle de vie), ou
 *   directement à ARCHIVED si `input.archive` est demandé ;
 * - TOUTES les inscriptions de la classe sortent du statut ACTIVE : celles
 *   sans décision explicite passent au statut final COMPLETED ;
 * - la comptabilité de la classe est SCELLÉE : les échéanciers
 *   (`PaymentSchedule.sealedAt`) sont figés — plus de retard automatique. Les
 *   corrections administratives d'historique restent possibles, mais les
 *   règlements qui en découlent doivent être saisis « hors système »
 *   (`isOutOfSystem`) pour ne jamais impacter la trésorerie active.
 *
 * La classe clôturée conserve son historique (inscriptions, notes, bulletins)
 * consultable sans altérer les données des nouvelles cohortes.
 */
export async function closeClassAction(
  input: CloseClassInput
): Promise<CloseClassResult> {
  try {
    await assertCanMutate();

    // Auteur de la clôture (ID + nom) : utilisé pour les écritures
    // financières générées (frais de réinscription) et l'audit.
    const user = await getCurrentSessionActor();
    const organizationId = user.organizationId;

    if (!CLOSURE_ALLOWED_ROLES.has(user.role)) {
      return {
        ok: false,
        message:
          "Accès refusé : la clôture de classe est réservée aux administrateurs.",
      };
    }

    if (!input.classId) {
      return {
        ok: false,
        message: "Identifiant de la classe à clôturer manquant.",
      };
    }

    // Garde-fou métier : la clôture est bloquée tant que les prérequis
    // pédagogiques ne sont pas réunis (au moins une séance émargée, au moins
    // une séance avec cahier de texte, au moins UNE ÉVALUATION créée et notée,
    // évaluations existantes intégralement complétées).
    // Contrôle appliqué ICI, côté serveur, afin qu'aucun contournement de
    // l'interface ne permette de clôturer une classe incomplète : la Server
    // Action délègue au même `getClassClosureReadiness` que l'alerte du bouton
    // « Terminer la classe » — la règle est donc strictement identique des
    // deux côtés.
    const readiness = await getClassClosureReadiness(input.classId);

    if (!readiness.ok) {
      return { ok: false, message: readiness.message };
    }

    if (!readiness.canClose) {
      return {
        ok: false,
        message: buildClosureBlockedMessage(readiness.missingRequirements),
        missingRequirements: readiness.missingRequirements,
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

    // Classe à clôturer : en cours (IN_PROGRESS, ou alias historique ACTIVE)
    // et rattachée à l'organisation.
    const klass = await prisma.class.findFirst({
      where: { id: input.classId, organizationId },
      select: {
        id: true,
        name: true,
        status: true,
        courseId: true,
        course: { select: { title: true, code: true } },
      },
    });

    if (!klass) {
      return { ok: false, message: "Classe introuvable dans votre organisation." };
    }

    if (klass.status !== "ACTIVE" && klass.status !== "IN_PROGRESS") {
      return {
        ok: false,
        message:
          klass.status === "PLANIFIED"
            ? "Cette classe n'est pas démarrée : démarrez-la avant de la clôturer."
            : "Cette classe est déjà clôturée : les décisions sont verrouillées.",
      };
    }

    // Classe cible (passage) : OPTIONNELLE. Absente ⇒ les étudiants admis
    // voient simplement leur inscription marquée comme terminée/admise, sans
    // être transférés dans une nouvelle classe.
    const targetClassId = input.targetClassId?.trim() || null;
    const targetClass = targetClassId
      ? await prisma.class.findFirst({
          where: {
            id: targetClassId,
            organizationId,
            status: { in: ["ACTIVE", "IN_PROGRESS"] },
          },
          select: { id: true, name: true, courseId: true },
        })
      : null;

    if (targetClassId && !targetClass) {
      return {
        ok: false,
        message: "Classe cible introuvable ou inactive dans votre organisation.",
      };
    }

    if (targetClass && targetClass.id === klass.id) {
      return {
        ok: false,
        message: "La classe cible doit être différente de la classe clôturée.",
      };
    }

    // Classe des redoublants (optionnelle) : nouvelle session du MÊME niveau
    // — même cours porteur que la classe clôturée.
    const repeatTargetClassId = input.repeatTargetClassId?.trim() || null;
    let repeatTargetClass: { id: string; name: string; courseId: string } | null =
      null;

    if (repeatTargetClassId) {
      if (repeatTargetClassId === klass.id) {
        return {
          ok: false,
          message:
            "La classe des redoublants doit être différente de la classe clôturée.",
        };
      }

      const repeatClass = await prisma.class.findFirst({
        where: {
          id: repeatTargetClassId,
          organizationId,
          status: { in: ["ACTIVE", "IN_PROGRESS"] },
        },
        select: { id: true, name: true, courseId: true },
      });

      if (!repeatClass) {
        return {
          ok: false,
          message:
            "Classe des redoublants introuvable ou inactive dans votre organisation.",
        };
      }

      if (repeatClass.courseId !== klass.courseId) {
        return {
          ok: false,
          message:
            "La classe des redoublants doit porter le même cours que la classe clôturée (même niveau).",
        };
      }

      repeatTargetClass = repeatClass;
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

    // Comptabilité : sans toggle explicite, AUCUN frais n'est créé. Le montant
    // facturé est celui configuré au niveau de l'organisation (frais par
    // défaut, ex : 15 000 FCFA).
    let reRegistrationFee = 0;
    if (input.chargeReRegistrationFee) {
      const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { defaultRegistrationFee: true },
      });
      reRegistrationFee = organization?.defaultRegistrationFee ?? 0;
    }

    // Admis concernés par la génération automatique de certificats :
    // on exclut ceux qui possèdent déjà un certificat pour ce cours
    // (ré-émission évitée en cas de clôture répétée / historique).
    const promotedIdsForCertificates = decisions
      .filter((d) => d.decision === "PASSED")
      .map((d) => d.studentId);
    const existingCertificateStudentIds = new Set(
      promotedIdsForCertificates.length > 0
        ? (
            await prisma.certificate.findMany({
              where: {
                organizationId,
                courseId: klass.courseId,
                studentId: { in: promotedIdsForCertificates },
              },
              select: { studentId: true },
            })
          ).map((row) => row.studentId)
        : []
    );

    // Niveau imprimé sur les certificats générés automatiquement :
    // le cours porteur de la classe clôturée (ex : « Allemand A1 »).
    const certificateLevel = klass.course.title.slice(0, 100);

    const result = await prisma.$transaction(async (tx) => {
      let promoted = 0;
      let retained = 0;
      let dropped = 0;
      let billedCount = 0;
      let reassigned = 0;
      let certificatesGenerated = 0;

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

          // L'admise est marquée sur l'inscription de la classe clôturée
          // (statut terminé/admis) dans TOUS les cas.
          await tx.classEnrollment.update({
            where: { id: enrollment.id },
            data: { status: enrollmentStatus, finalDecisionNote: finalNote },
          });

          // Inscription dans la classe cible (si passation) : capturée pour
          // rattacher le cas échéant les frais de réinscription à la NOUVELLE
          // inscription. Sans classe cible, le frais reste rattaché à
          // l'inscription de la classe clôturée (cas « admis sans transfert »).
          let newEnrollmentId: string | null = null;

          if (targetClass) {
            // Dossier pédagogique dans la classe cible — AUCUN frais généré par
            // défaut (la comptabilité de l'élève n'est pas impactée). Clé
            // (étudiant, classe, année) : la réinscription crée une nouvelle
            // ligne sans écraser l'historique de la classe clôturée.
            const newEnrollment = await tx.classEnrollment.upsert({
              where: {
                studentId_classId_academicYear: {
                  studentId: decision.studentId,
                  classId: targetClass.id,
                  academicYear: getCurrentAcademicYear(),
                },
              },
              create: {
                organizationId,
                studentId: decision.studentId,
                classId: targetClass.id,
                status: "ACTIVE",
                academicYear: getCurrentAcademicYear(),
              },
              update: {
                status: "ACTIVE",
                finalDecisionNote: null,
                enrolledAt: new Date(),
              },
            });
            newEnrollmentId = newEnrollment.id;

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
          }
          // Pas de classe cible : l'étudiant admis reste rattaché à la classe
          // clôturée (historique) — aucun transfert, pas de frais.

          // Génération automatique du certificat de fin de niveau (admis).
          if (!existingCertificateStudentIds.has(decision.studentId)) {
            // Code de vérification unique : régénération contrôlée en cas de
            // collision (8 caractères hex — improbable, mais sécurisé).
            let verificationCode = randomBytes(4).toString("hex").toUpperCase();
            for (let attempt = 0; attempt < 5; attempt += 1) {
              const collision = await tx.certificate.findUnique({
                where: { verificationCode },
                select: { id: true },
              });
              if (!collision) break;
              verificationCode = randomBytes(4).toString("hex").toUpperCase();
            }

            await tx.certificate.create({
              data: {
                organizationId,
                studentId: decision.studentId,
                courseId: klass.courseId,
                level: certificateLevel,
                score: null,
                verificationCode,
                createdById: user.id,
              },
            });
            certificatesGenerated += 1;
          }

          promoted += 1;

          // Toggle optionnel : facturer les frais de réinscription.
          if (reRegistrationFee > 0) {
            await tx.payment.create({
              data: {
                organizationId,
                studentId: decision.studentId,
                // Le frais de réinscription appartient à la NOUVELLE
                // inscription (classe cible + année courante) si un transfert
                // est acté — sinon à l'inscription de la classe clôturée.
                enrollmentId: newEnrollmentId ?? enrollment.id,
                createdById: user.id,
                createdByName: user.name,
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

          // Affectation volontaire du redoublant à une nouvelle session du
          // même niveau (même cours porteur) : nouvelle inscription ACTIVE
          // sans écraser l'historique de la classe clôturée.
          if (repeatTargetClass) {
            // Clé (étudiant, classe, année) : la réinscription du redoublant
            // crée une NOUVELLE ligne sans écraser la classe clôturée.
            const repeatEnrollment = await tx.classEnrollment.upsert({
              where: {
                studentId_classId_academicYear: {
                  studentId: decision.studentId,
                  classId: repeatTargetClass.id,
                  academicYear: getCurrentAcademicYear(),
                },
              },
              create: {
                organizationId,
                studentId: decision.studentId,
                classId: repeatTargetClass.id,
                status: "ACTIVE",
                finalDecisionNote: finalNote,
                academicYear: getCurrentAcademicYear(),
              },
              update: {
                status: "ACTIVE",
                finalDecisionNote: null,
                enrolledAt: new Date(),
              },
            });

            await tx.student.update({
              where: { id: decision.studentId },
              data: { currentClassId: repeatTargetClass.id },
            });

            await tx.enrollment.upsert({
              where: {
                studentId_courseId: {
                  studentId: decision.studentId,
                  courseId: repeatTargetClass.courseId,
                },
              },
              create: {
                studentId: decision.studentId,
                courseId: repeatTargetClass.courseId,
              },
              update: {},
            });

            // Le redoublant réinscrit peut être facturé (frais de réinscription).
            if (reRegistrationFee > 0) {
              await tx.payment.create({
                data: {
                  organizationId,
                  studentId: decision.studentId,
                  // Le frais appartient à la NOUVELLE inscription (nouvelle
                  // session du même niveau), pas à l'inscription clôturée.
                  enrollmentId: repeatEnrollment.id,
                  createdById: user.id,
                  createdByName: user.name,
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

            reassigned += 1;
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

      // Séparation stricte + clôture intégrale : AUCUNE inscription ne reste
      // ACTIVE dans la classe clôturée. Les étudiants sans décision
      // individuelle explicite passent au statut final COMPLETED (inscription
      // terminée — historique consultable, jamais re-comptabilisé comme
      // « en cours »).
      const completedEnrollments = await tx.classEnrollment.updateMany({
        where: { classId: klass.id, status: "ACTIVE" },
        data: { status: "COMPLETED" },
      });

      // Scellement comptable : les échéanciers de la classe sont figés
      // (aucune tranche ne basculera plus en retard automatique — voir
      // `refreshOverdueStatus`). Les règlements déjà enregistrés restent
      // l'historique vrai de la trésorerie ; toute correction administrative
      // ultérieure doit être saisie « hors système » (`isOutOfSystem`) pour
      // ne jamais impacter la trésorerie active.
      const sealedSchedules = await tx.paymentSchedule.updateMany({
        where: { classId: klass.id, sealedAt: null },
        data: { sealedAt: new Date() },
      });

      // Génération / finalisation automatique des bulletins : les notes
      // encore sans statut sont figées (VALIDATED / FAILED selon le seuil),
      // rendant chaque bulletin complet et imprimable immédiatement.
      const ungradedGrades = await tx.grade.findMany({
        where: {
          status: null,
          evaluationModule: { evaluation: { classId: klass.id } },
        },
        select: {
          id: true,
          studentId: true,
          score: true,
          passMark: true,
          evaluationModule: {
            select: {
              passingScore: true,
              evaluation: { select: { passMark: true } },
            },
          },
        },
      });

      const finalizedStudents = new Set<string>();
      const updateBatches = new Map<ModuleStatus, string[]>();

      for (const grade of ungradedGrades) {
        const effectivePassMark =
          grade.passMark ??
          grade.evaluationModule.passingScore ??
          grade.evaluationModule.evaluation.passMark;
        const computed = computeModuleStatus(grade.score, effectivePassMark);

        if (computed === null) continue;

        const batch = updateBatches.get(computed) ?? [];
        batch.push(grade.id);
        updateBatches.set(computed, batch);
        finalizedStudents.add(grade.studentId);
      }

      for (const [status, gradeIds] of updateBatches) {
        await tx.grade.updateMany({
          where: { id: { in: gradeIds } },
          data: { status },
        });
      }
      const bulletinsFinalized = finalizedStudents.size;

      // La classe clôturée est archivée pédagogiquement (COMPLETED — le
      // « CLOSED » du cycle de vie), ou directement passée en lecture seule
      // (ARCHIVED) si l'archivage immédiat est demandé.
      await tx.class.update({
        where: { id: klass.id },
        data: { status: input.archive ? "ARCHIVED" : "COMPLETED" },
      });

      return {
        promoted,
        retained,
        dropped,
        billedCount,
        reassigned,
        certificatesGenerated,
        bulletinsFinalized,
        completedEnrollments: completedEnrollments.count,
        sealedSchedules: sealedSchedules.count,
      };
    });

    // Journal d'audit (hors transaction : ne doit pas annuler la clôture).
    await logAuditEvent({
      action: AUDIT_ACTIONS.CLASS_CLOSED,
      entity: AUDIT_ENTITIES.CLASS,
      entityId: klass.id,
      details: {
        className: klass.name,
        targetClassId: targetClass?.id ?? null,
        targetClassName: targetClass?.name ?? null,
        repeatTargetClassId: repeatTargetClass?.id ?? null,
        repeatTargetClassName: repeatTargetClass?.name ?? null,
        promoted: result.promoted,
        retained: result.retained,
        dropped: result.dropped,
        reassigned: result.reassigned,
        certificatesGenerated: result.certificatesGenerated,
        bulletinsFinalized: result.bulletinsFinalized,
        chargedReRegistrationFee: result.billedCount > 0 ? reRegistrationFee : 0,
        completedEnrollments: result.completedEnrollments,
        sealedSchedules: result.sealedSchedules,
        finalClassStatus: input.archive ? "ARCHIVED" : "COMPLETED",
      },
    });

    revalidatePath("/dashboard/classes");
    revalidatePath(`/dashboard/classes/${klass.id}`);
    revalidatePath(`/dashboard/classes/${klass.id}/close`);
    if (targetClass) {
      revalidatePath(`/dashboard/classes/${targetClass.id}`);
    }
    if (repeatTargetClass) {
      revalidatePath(`/dashboard/classes/${repeatTargetClass.id}`);
    }
    revalidatePath("/dashboard/students");
    revalidatePath("/dashboard/certificates");

    return {
      ok: true,
      promoted: result.promoted,
      retained: result.retained,
      dropped: result.dropped,
      billedCount: result.billedCount,
      reassigned: result.reassigned,
      certificatesGenerated: result.certificatesGenerated,
      bulletinsFinalized: result.bulletinsFinalized,
      completedEnrollments: result.completedEnrollments,
      sealedSchedules: result.sealedSchedules,
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

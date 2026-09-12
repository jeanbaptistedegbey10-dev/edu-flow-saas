"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import {
  getCurrentOrganizationId,
  getCurrentSessionUser,
  isNextRedirectError,
} from "@/lib/session";
import { assertCanMutate } from "@/lib/license-check";
import {
  computeModuleValidation,
  defaultAppreciationForValidation,
  formatPremiumReportNumber,
  paymentMethodLabel,
  type PremiumFinancialSummary,
  type PremiumPaymentEntry,
  type PremiumReportData,
  type PremiumTravelSummary,
} from "@/lib/premium-report";
import { getTravelStatusLabel } from "@/lib/travel-status";

// --------------------------------------
// Types publics (contrat avec les composants clients)
// --------------------------------------

/**
 * Classe / cohorte éligible à une session d'évaluation
 * (enseignant : les classes qui lui sont assignées).
 */
export type EvaluationClassDTO = {
  id: string;
  name: string;
  /** Créneau horaire de la classe (ex : « 08h-11h »). */
  schedule: string;
  courseId: string;
  courseTitle: string;
  courseCode: string;
  studentCount: number;
};

/** Module évalué au sein d'une session, avec son barème. */
export type EvaluationModuleDTO = {
  id: string;
  name: string;
  maxScore: number;
  passingScore: number;
};

/** Session d'évaluation interne rattachée à une classe / cohorte. */
export type EvaluationDTO = {
  id: string;
  title: string;
  date: Date;
  classId: string;
  className: string;
  courseTitle: string;
  courseCode: string;
  modules: EvaluationModuleDTO[];
  /** Nombre de notes déjà saisies pour cette session. */
  gradeCount: number;
};

/** Résultat des mutations rapides côté client. */
export type EvaluationMutationResult =
  | { ok: true; message?: string }
  | { ok: false; message: string };

export type EvaluationFormField =
  | "classId"
  | "title"
  | "date"
  | "modules";

export type CreateEvaluationFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Partial<Record<EvaluationFormField, string>>;
};

/** Ligne étudiant de la grille de saisie des notes. */
export type GradeSheetStudentDTO = {
  studentId: string;
  studentCode: string;
  firstName: string;
  lastName: string;
  /** Notes existantes indexées par identifiant de module. */
  grades: Record<string, number>;
};

/**
 * Ligne module du bulletin premium cote serveur : note sur le bareme reel
 * configure par le professeur (SANS coefficient, SANS moyenne generale).
 */
export type PremiumReportRowDTO = {
  /** Intitule de la session d'evaluation (ex : « Examen Continu N°1 »). */
  evaluationTitle: string;
  /** Nom du module evalue (ex : « Lesen »). */
  module: string;
  /** Date de la session d'evaluation (null si indisponible). */
  date: Date | null;
  /** Note obtenue sur le bareme du module (null si non note). */
  score: number | null;
  /** Bareme configure par le professeur (ex : 100). */
  maxScore: number;
  /** Seuil de validation du module (ex : 60). */
  passingScore: number;
  /** true si note >= seuil, false si note < seuil, null si non note. */
  passed: boolean | null;
};

/**
 * Bulletin premium securise d'un etudiant (contrat serveur → Dialog).
 * `financial` et `travel` ne sont renseignes QUE pour les roles
 * administratifs (ADMIN / STAFF / SUPER_ADMIN) : le bulletin academique de
 * l'enseignant n'expose AUCUNE donnee financiere ni de procedure de voyage.
 */
export type PremiumReportDTO = PremiumReportData & {
  studentId: string;
  classId: string | null;
  courseId: string | null;
};

/** Grille complète de saisie des notes d'une session d'évaluation. */
export type GradeSheetDTO = {
  evaluation: EvaluationDTO;
  students: GradeSheetStudentDTO[];
};

/** Note d'un module pour l'étudiant consulté (fiche détaillée). */
export type StudentModuleGradeDTO = {
  moduleId: string;
  moduleName: string;
  maxScore: number;
  passingScore: number;
  /** Note obtenue, ou null si le module n'est pas encore noté. */
  score: number | null;
};

/** Session d'évaluation telle que vue dans la fiche d'un étudiant. */
export type StudentEvaluationDTO = {
  id: string;
  title: string;
  date: Date;
  className: string;
  courseTitle: string;
  modules: StudentModuleGradeDTO[];
  /**
   * Moyenne de l'étudiant sur cette évaluation, normalisée sur 100
   * (pondérée par les barèmes ; null si aucune note saisie).
   */
  averageOn100: number | null;
};

/** Statistiques académiques agrégées d'un étudiant. */
export type StudentAcademicStatsDTO = {
  /**
   * Moyenne générale toutes évaluations confondues, normalisée sur 100
   * (somme des notes / somme des barèmes des modules notés).
   */
  overallAverage: number | null;
  /** Taux de validation des modules notés, en pourcentage (0–100). */
  validationRate: number | null;
  /** Nombre total de notes saisies. */
  gradedModuleCount: number;
  /** Nombre de modules validés (note ≥ seuil de validation). */
  validatedModuleCount: number;
  /** Nombre de sessions d'évaluation concernées. */
  evaluationCount: number;
};

/** Dossier académique complet d'un étudiant (évaluations & notes). */
export type StudentAcademicRecordDTO = {
  /** Sessions d'évaluations triées par date croissante. */
  evaluations: StudentEvaluationDTO[];
  stats: StudentAcademicStatsDTO;
};

// --------------------------------------
// Constantes & helpers internes
// --------------------------------------

const MAX_TITLE_LENGTH = 200;
const MAX_MODULE_NAME_LENGTH = 100;
const MAX_MODULES = 20;
const MAX_SCORE_LIMIT = 1000;

/**
 * Vérifie que l'utilisateur connecté peut accéder à la classe demandée :
 * - TEACHER : uniquement les classes qui lui sont assignées ;
 * - ADMIN / STAFF / SUPER_ADMIN : toutes les classes de l'organisation ;
 * - STUDENT : accès systématiquement refusé.
 *
 * Retourne l'utilisateur de session et l'identifiant du cours porteur.
 */
async function assertClassAccess(classId: string) {
  const user = await getCurrentSessionUser();

  if (user.role === "STUDENT") {
    throw new Error("Accès refusé : les étudiants n'ont pas accès au tableau de bord.");
  }

  const where =
    user.role === "TEACHER"
      ? { id: classId, organizationId: user.organizationId, teacherId: user.id }
      : { id: classId, organizationId: user.organizationId };

  const klass = await prisma.class.findFirst({
    where,
    select: { id: true, courseId: true },
  });

  if (!klass) {
    throw new Error("Classe introuvable ou non autorisée.");
  }

  return { user, courseId: klass.courseId };
}

/**
 * Normalise une date saisie (« YYYY-MM-DD ») en minuit UTC afin que les
 * sessions d'examen soient comparables indépendamment de l'heure.
 */
function parseEvaluationDay(raw: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return null;
  }

  const date = new Date(`${raw}T00:00:00.000Z`);

  return Number.isNaN(date.getTime()) ? null : date;
}

type ParsedModuleInput = {
  name: string;
  maxScore: number;
  passingScore: number;
};

/**
 * Analyse et valide les modules soumis par le formulaire de création
 * (`moduleName_<i>`, `moduleMax_<i>`, `modulePassing_<i>`).
 */
function parseModules(
  formData: FormData,
  fieldErrors: Partial<Record<EvaluationFormField, string>>
): ParsedModuleInput[] {
  const rawCount = Number(formData.get("moduleCount") ?? "0");
  const count = Number.isInteger(rawCount)
    ? Math.min(Math.max(rawCount, 0), MAX_MODULES)
    : 0;

  const modules: ParsedModuleInput[] = [];

  for (let index = 0; index < count; index++) {
    const name = String(formData.get(`moduleName_${index}`) ?? "").trim();
    const rawMax = String(formData.get(`moduleMax_${index}`) ?? "").trim();
    const rawPassing = String(
      formData.get(`modulePassing_${index}`) ?? ""
    ).trim();

    // Ligne entièrement vide : ignorée silencieusement.
    if (!name && !rawMax && !rawPassing) continue;

    if (!name) {
      fieldErrors.modules = "Chaque module doit avoir un intitulé.";
      continue;
    }

    if (name.length > MAX_MODULE_NAME_LENGTH) {
      fieldErrors.modules =
        "L'intitulé d'un module ne doit pas dépasser 100 caractères.";
      continue;
    }

    const maxScore = Number(rawMax.replace(",", "."));
    const passingScore = Number(rawPassing.replace(",", "."));

    if (
      !Number.isFinite(maxScore) ||
      maxScore <= 0 ||
      maxScore > MAX_SCORE_LIMIT
    ) {
      fieldErrors.modules = `Barème invalide pour le module « ${name} » (attendu : nombre entre 0 et ${MAX_SCORE_LIMIT}).`;
      continue;
    }

    if (
      !Number.isFinite(passingScore) ||
      passingScore < 0 ||
      passingScore > maxScore
    ) {
      fieldErrors.modules = `Seuil de validation invalide pour le module « ${name} » (attendu : nombre entre 0 et le barème).`;
      continue;
    }

    modules.push({ name, maxScore, passingScore });
  }

  if (modules.length === 0 && !fieldErrors.modules) {
    fieldErrors.modules =
      "Ajoutez au moins un module évalué (ex : Lesen, Hören, Schreiben, Sprechen).";
  }

  return modules;
}

// --------------------------------------
// Server Actions — Sessions d'évaluation
// --------------------------------------

/**
 * Liste des sessions d'évaluation d'une classe / cohorte, de la plus récente
 * à la plus ancienne, avec leurs modules et le nombre de notes saisies.
 */
export async function getEvaluationsForClass(
  classId: string
): Promise<EvaluationDTO[]> {
  await assertClassAccess(classId);

  try {
    const evaluations = await prisma.evaluation.findMany({
      where: { classId },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        title: true,
        date: true,
        class: {
          select: {
            name: true,
            course: { select: { title: true, code: true } },
          },
        },
        modules: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            name: true,
            maxScore: true,
            passingScore: true,
            _count: { select: { grades: true } },
          },
        },
      },
    });

    return evaluations.map((evaluation) => ({
      id: evaluation.id,
      title: evaluation.title,
      date: evaluation.date,
      classId,
      className: evaluation.class.name,
      courseTitle: evaluation.class.course.title,
      courseCode: evaluation.class.course.code,
      modules: evaluation.modules.map((module) => ({
        id: module.id,
        name: module.name,
        maxScore: module.maxScore,
        passingScore: module.passingScore,
      })),
      gradeCount: evaluation.modules.reduce(
        (total, module) => total + module._count.grades,
        0
      ),
    }));
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[getEvaluationsForClass] Échec de lecture :", error);

    // Dégradation gracieuse : liste vide plutôt que crash serveur.
    return [];
  }
}

/**
 * Crée une session d'évaluation interne pour une classe, avec ses modules
 * évalués (barèmes inclus). Conçu pour être utilisé avec `useActionState`.
 *
 * Le formulaire soumet :
 * - `classId`, `title`, `date` (AAAA-MM-JJ) ;
 * - `moduleCount` puis `moduleName_<i>` / `moduleMax_<i>` / `modulePassing_<i>`.
 */
export async function createEvaluationAction(
  _prevState: CreateEvaluationFormState,
  formData: FormData
): Promise<CreateEvaluationFormState> {
  await assertCanMutate();
  const classId = String(formData.get("classId") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const rawDay = String(formData.get("date") ?? "").trim();

  const fieldErrors: Partial<Record<EvaluationFormField, string>> = {};

  if (!classId) {
    fieldErrors.classId = "La classe est requise.";
  }

  if (!title) {
    fieldErrors.title = "L'intitulé de l'examen est requis.";
  } else if (title.length > MAX_TITLE_LENGTH) {
    fieldErrors.title =
      "L'intitulé ne doit pas dépasser 200 caractères.";
  }

  let date: Date | null = null;
  if (!rawDay) {
    fieldErrors.date = "La date de l'examen est requise.";
  } else {
    date = parseEvaluationDay(rawDay);
    if (!date) {
      fieldErrors.date = "Format de date invalide (attendu : AAAA-MM-JJ).";
    }
  }

  const modules = parseModules(formData, fieldErrors);

  if (Object.keys(fieldErrors).length > 0 || !date) {
    return {
      status: "error",
      message: "Veuillez corriger les champs indiqués.",
      fieldErrors,
    };
  }

  try {
    const { user } = await assertClassAccess(classId);

    await prisma.evaluation.create({
      data: {
        organizationId: user.organizationId,
        classId,
        title,
        date,
        modules: {
          create: modules.map((module) => ({
            name: module.name,
            maxScore: module.maxScore,
            passingScore: module.passingScore,
          })),
        },
      },
    });

    revalidatePath("/dashboard/evaluations");
    revalidatePath(`/dashboard/students`);

    return {
      status: "success",
      message: `Session d'évaluation « ${title} » créée (${modules.length} module${modules.length > 1 ? "s" : ""}).`,
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[createEvaluationAction] Échec de création :", error);

    const message =
      error instanceof Error &&
      (error.message.startsWith("Accès refusé") ||
        error.message === "Classe introuvable ou non autorisée.")
        ? error.message
        : "Une erreur est survenue lors de la création de la session d'évaluation.";

    return { status: "error", message };
  }
}

/**
 * Supprime une session d'évaluation et, en cascade, ses modules et notes.
 */
export async function deleteEvaluationAction(
  evaluationId: string
): Promise<EvaluationMutationResult> {
  await assertCanMutate();
  if (!evaluationId) {
    return { ok: false, message: "Identifiant de l'évaluation manquant." };
  }

  try {
    const user = await getCurrentSessionUser();

    if (user.role === "STUDENT") {
      return { ok: false, message: "Accès refusé." };
    }

    // Isolation multi-tenant + restriction enseignant (ses classes uniquement).
    const where =
      user.role === "TEACHER"
        ? {
            id: evaluationId,
            organizationId: user.organizationId,
            class: { teacherId: user.id },
          }
        : { id: evaluationId, organizationId: user.organizationId };

    const existing = await prisma.evaluation.findFirst({
      where,
      select: { id: true },
    });

    if (!existing) {
      return {
        ok: false,
        message: "Évaluation introuvable dans votre organisation.",
      };
    }

    await prisma.evaluation.delete({ where: { id: evaluationId } });

    revalidatePath("/dashboard/evaluations");

    return { ok: true };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[deleteEvaluationAction] Échec de suppression :", error);

    return {
      ok: false,
      message:
        "Une erreur est survenue lors de la suppression de l'évaluation.",
    };
  }
}

// --------------------------------------
// Server Actions — Saisie des notes
// --------------------------------------

/**
 * Récupère la grille complète de saisie des notes d'une session :
 * informations de la session, modules évalués et liste des étudiants
 * membres actuels de la cohorte avec leurs notes existantes.
 */
export async function getGradeSheet(
  evaluationId: string
): Promise<GradeSheetDTO> {
  const user = await getCurrentSessionUser();

  if (user.role === "STUDENT") {
    throw new Error("Accès refusé : les étudiants n'ont pas accès au tableau de bord.");
  }

  try {
    const evaluation = await prisma.evaluation.findFirst({
      where:
        user.role === "TEACHER"
          ? {
              id: evaluationId,
              organizationId: user.organizationId,
              class: { teacherId: user.id },
            }
          : { id: evaluationId, organizationId: user.organizationId },
      select: {
        id: true,
        title: true,
        date: true,
        classId: true,
        class: {
          select: {
            name: true,
            course: { select: { title: true, code: true } },
          },
        },
        modules: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            name: true,
            maxScore: true,
            passingScore: true,
          },
        },
      },
    });

    if (!evaluation) {
      throw new Error("Évaluation introuvable ou non autorisée.");
    }

    const [students, grades] = await Promise.all([
      prisma.student.findMany({
        where: { currentClassId: evaluation.classId },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
        select: {
          id: true,
          studentCode: true,
          firstName: true,
          lastName: true,
        },
      }),
      prisma.grade.findMany({
        where: {
          student: { currentClassId: evaluation.classId },
          evaluationModule: { evaluationId },
        },
        select: {
          studentId: true,
          evaluationModuleId: true,
          score: true,
        },
      }),
    ]);

    const gradesByStudent = new Map<string, Record<string, number>>();

    for (const grade of grades) {
      const entry = gradesByStudent.get(grade.studentId) ?? {};
      entry[grade.evaluationModuleId] = grade.score;
      gradesByStudent.set(grade.studentId, entry);
    }

    return {
      evaluation: {
        id: evaluation.id,
        title: evaluation.title,
        date: evaluation.date,
        classId: evaluation.classId,
        className: evaluation.class.name,
        courseTitle: evaluation.class.course.title,
        courseCode: evaluation.class.course.code,
        modules: evaluation.modules,
        gradeCount: grades.length,
      },
      students: students.map((student) => ({
        studentId: student.id,
        studentCode: student.studentCode,
        firstName: student.firstName,
        lastName: student.lastName,
        grades: gradesByStudent.get(student.id) ?? {},
      })),
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[getGradeSheet] Échec de lecture :", error);

    throw new Error(
      "Impossible de charger la grille de notes pour le moment."
    );
  }
}

/**
 * Enregistre la grille de notes d'une session d'évaluation.
 *
 * Le formulaire client soumet, pour chaque cellule renseignée :
 * `score_<moduleId>_<studentId>`. Une cellule vidée supprime la note
 * existante ; une valeur saisie est validée contre le barème du module
 * (0 ≤ note ≤ maxScore) puis écrite en `upsert` sur la clé unique
 * [evaluationModuleId, studentId].
 */
export async function saveGradesAction(
  formData: FormData
): Promise<EvaluationMutationResult> {
  await assertCanMutate();
  try {
    const evaluationId = String(formData.get("evaluationId") ?? "").trim();

    if (!evaluationId) {
      return { ok: false, message: "Identifiant de l'évaluation manquant." };
    }

    const user = await getCurrentSessionUser();

    if (user.role === "STUDENT") {
      return { ok: false, message: "Accès refusé." };
    }

    // La session doit être accessible (multi-tenant + restriction enseignant).
    const evaluation = await prisma.evaluation.findFirst({
      where:
        user.role === "TEACHER"
          ? {
              id: evaluationId,
              organizationId: user.organizationId,
              class: { teacherId: user.id },
            }
          : { id: evaluationId, organizationId: user.organizationId },
      select: {
        id: true,
        classId: true,
        modules: { select: { id: true, maxScore: true } },
      },
    });

    if (!evaluation) {
      return {
        ok: false,
        message: "Évaluation introuvable dans votre organisation.",
      };
    }

    const moduleMaxScores = new Map(
      evaluation.modules.map((module) => [module.id, module.maxScore])
    );

    // Extraction des cellules soumises depuis le FormData.
    const entries: Array<{
      moduleId: string;
      studentId: string;
      score: number | null;
    }> = [];

    for (const [key, value] of formData.entries()) {
      if (!key.startsWith("score_")) continue;

      const rest = key.slice("score_".length);
      const separatorIndex = rest.indexOf("_");

      if (separatorIndex <= 0 || separatorIndex === rest.length - 1) {
        return { ok: false, message: "Format de données invalide." };
      }

      const moduleId = rest.slice(0, separatorIndex);
      const studentId = rest.slice(separatorIndex + 1);
      const rawScore = String(value).trim();

      if (!moduleMaxScores.has(moduleId)) {
        return {
          ok: false,
          message: "Un des modules ciblés n'appartient pas à cette évaluation.",
        };
      }

      // Cellule vidée : suppression de la note existante.
      if (rawScore === "") {
        entries.push({ moduleId, studentId, score: null });
        continue;
      }

      const score = Number(rawScore.replace(",", "."));
      const maxScore = moduleMaxScores.get(moduleId) ?? 0;

      if (!Number.isFinite(score) || score < 0 || score > maxScore) {
        return {
          ok: false,
          message: `Note invalide détectée (attendu : nombre entre 0 et ${maxScore}).`,
        };
      }

      entries.push({ moduleId, studentId, score });
    }

    if (entries.length === 0) {
      return {
        ok: false,
        message: "Aucune note à enregistrer.",
      };
    }

    // Les étudiants ciblés doivent être membres actuels de la cohorte
    // (protection contre la falsification des identifiants côté client).
    const memberIds = new Set(
      (
        await prisma.student.findMany({
          where: { currentClassId: evaluation.classId },
          select: { id: true },
        })
      ).map((student) => student.id)
    );

    for (const entry of entries) {
      if (!memberIds.has(entry.studentId)) {
        return {
          ok: false,
          message:
            "Un des étudiants ciblés n'appartient pas à la classe de cette évaluation.",
        };
      }
    }

    await prisma.$transaction(
      entries.map((entry) => {
        if (entry.score === null) {
          // Suppression best-effort : aucune erreur si la note n'existait pas.
          return prisma.grade.deleteMany({
            where: {
              evaluationModuleId: entry.moduleId,
              studentId: entry.studentId,
            },
          });
        }

        return prisma.grade.upsert({
          where: {
            evaluationModuleId_studentId: {
              evaluationModuleId: entry.moduleId,
              studentId: entry.studentId,
            },
          },
          create: {
            evaluationModuleId: entry.moduleId,
            studentId: entry.studentId,
            score: entry.score,
          },
          update: {
            score: entry.score,
          },
        });
      })
    );

    revalidatePath("/dashboard/evaluations");
    revalidatePath("/dashboard/students");

    const savedCount = entries.filter((entry) => entry.score !== null).length;

    return {
      ok: true,
      message: `${savedCount} note${savedCount > 1 ? "s" : ""} enregistrée${savedCount > 1 ? "s" : ""}.`,
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error("[saveGradesAction] Échec d'enregistrement :", error);

    return {
      ok: false,
      message:
        "Une erreur est survenue lors de l'enregistrement des notes.",
    };
  }
}

// --------------------------------------
// Server Actions — Dossier académique étudiant
// --------------------------------------

/**
 * Dossier académique complet d'un étudiant : toutes les sessions
 * d'évaluation le concernant (classe active + historique des notes),
 * triées par date croissante, avec statistiques agrégées.
 *
 * Une session est incluse si elle appartient à la classe active de
 * l'étudiant OU si l'étudiant y possède au moins une note (historique
 * conservé après changement de cohorte).
 */
export async function getStudentAcademicRecord(
  studentId: string
): Promise<StudentAcademicRecordDTO> {
  const organizationId = await getCurrentOrganizationId();

  try {
    const student = await prisma.student.findFirst({
      where: { id: studentId, organizationId },
      select: { id: true, currentClassId: true },
    });

    if (!student) {
      throw new Error("Étudiant introuvable dans votre organisation.");
    }

    // Sessions de la classe active de l'étudiant…
    const activeClassEvaluations = student.currentClassId
      ? await prisma.evaluation.findMany({
          where: { organizationId, classId: student.currentClassId },
          orderBy: [{ date: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            title: true,
            date: true,
            class: {
              select: {
                name: true,
                course: { select: { title: true } },
              },
            },
            modules: {
              orderBy: { createdAt: "asc" },
              select: {
                id: true,
                name: true,
                maxScore: true,
                passingScore: true,
                grades: {
                  where: { studentId },
                  select: { score: true },
                  take: 1,
                },
              },
            },
          },
        })
      : [];

    // …et sessions plus anciennes où l'étudiant possède encore des notes.
    const historicalEvaluations = await prisma.evaluation.findMany({
      where: {
        organizationId,
        NOT: student.currentClassId
          ? { classId: student.currentClassId }
          : undefined,
        modules: { some: { grades: { some: { studentId } } } },
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        title: true,
        date: true,
        class: {
          select: {
            name: true,
            course: { select: { title: true } },
          },
        },
        modules: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            name: true,
            maxScore: true,
            passingScore: true,
            grades: {
              where: { studentId },
              select: { score: true },
              take: 1,
            },
          },
        },
      },
    });

    // Fusion dédupliquée (l'historique exclut déjà la classe active).
    const merged = [...activeClassEvaluations, ...historicalEvaluations];

    const evaluations: StudentEvaluationDTO[] = merged.map((evaluation) => {
      const modules: StudentModuleGradeDTO[] = evaluation.modules.map(
        (module) => ({
          moduleId: module.id,
          moduleName: module.name,
          maxScore: module.maxScore,
          passingScore: module.passingScore,
          score: module.grades[0]?.score ?? null,
        })
      );

      const graded = modules.filter((module) => module.score !== null);
      const totalMax = graded.reduce(
        (sum, module) => sum + module.maxScore,
        0
      );
      const totalScore = graded.reduce(
        (sum, module) => sum + (module.score ?? 0),
        0
      );

      return {
        id: evaluation.id,
        title: evaluation.title,
        date: evaluation.date,
        className: evaluation.class.name,
        courseTitle: evaluation.class.course.title,
        modules,
        averageOn100:
          graded.length > 0 && totalMax > 0
            ? Math.round((totalScore / totalMax) * 1000) / 10
            : null,
      };
    });

    // Statistiques globales sur tous les modules notés.
    const allModules = evaluations.flatMap(
      (evaluation) => evaluation.modules
    );
    const gradedModules = allModules.filter(
      (module) => module.score !== null
    );
    const globalMax = gradedModules.reduce(
      (sum, module) => sum + module.maxScore,
      0
    );
    const globalScore = gradedModules.reduce(
      (sum, module) => sum + (module.score ?? 0),
      0
    );
    const validatedCount = gradedModules.filter(
      (module) => (module.score ?? 0) >= module.passingScore
    ).length;

    const stats: StudentAcademicStatsDTO = {
      overallAverage:
        gradedModules.length > 0 && globalMax > 0
          ? Math.round((globalScore / globalMax) * 1000) / 10
          : null,
      validationRate:
        gradedModules.length > 0
          ? Math.round((validatedCount / gradedModules.length) * 1000) / 10
          : null,
      gradedModuleCount: gradedModules.length,
      validatedModuleCount: validatedCount,
      evaluationCount: evaluations.length,
    };

    return { evaluations, stats };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;

    console.error(
      "[getStudentAcademicRecord] Échec de lecture :",
      error
    );

    throw new Error(
      "Impossible de charger le dossier académique de l'étudiant pour le moment."
    );
  }
}

/**
 * Libellé de la réduction d'un étudiant (ex : « 10 % » ou « 25 000 FCFA »).
 * Retourne null si aucune réduction n'est renseignée.
 */
function discountLabelServer(
  discount: number | null,
  discountType: "PERCENTAGE" | "FIXED"
): string | null {
  if (discount === null || discount <= 0) return null;
  return discountType === "PERCENTAGE"
    ? `${Math.round(discount * 100) / 100} %`
    : `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(discount)} FCFA`;
}

function sanitizePeriodLabel(raw: string | null | undefined): string {
  const cleaned = (raw ?? "").trim().slice(0, 60);
  return cleaned.length > 0 ? cleaned : "Période en cours";
}

/**
 * Bulletin premium securise d'un etudiant.
 * TEACHER : uniquement si l'etudiant est inscrit dans l'une de ses
 * classes (via `classId` / `courseId` rattaches a son ID enseignant)
 * ou suit l'un de ses cours ; ADMIN/STAFF : organisation entiere.
 *
 * SEPARATION STRICTE DES ROLES :
 * - TEACHER → bulletin ACADEMIQUE uniquement (scope "academic") : aucune
 *   donnee financiere, aucune donnee de procedure de voyage.
 * - ADMIN / STAFF / SUPER_ADMIN → rapport GLOBAL (scope "global") : bulletin
 *   + recapitulatif financier detaille (historique des versements) + section
 *   procedure de voyage (etapes validees + reglements du dossier).
 */
export async function getPremiumReportForStudent(
  studentId: string,
  periodLabel?: string
): Promise<PremiumReportDTO> {
  const user = await getCurrentSessionUser();
  if (user.role === "STUDENT") {
    throw new Error("Accès refusé : les étudiants n'ont pas accès aux bulletins.");
  }
  const cleanPeriod = sanitizePeriodLabel(periodLabel);
  // Rapport global réservé aux roles administratifs : l'enseignant n'a
  // JAMAIS acces aux donnees financieres ni a la procedure de voyage.
  const canSeeFinancial =
    user.role === "ADMIN" ||
    user.role === "STAFF" ||
    user.role === "SUPER_ADMIN";
  const scope: PremiumReportData["scope"] = canSeeFinancial
    ? "global"
    : "academic";
  try {
    const student = await prisma.student.findFirst({
      where: { id: studentId, organizationId: user.organizationId },
      select: {
        id: true,
        studentCode: true,
        firstName: true,
        lastName: true,
        // Donnees financieres de la formation (rapport global uniquement).
        totalCost: true,
        discount: true,
        discountType: true,
        netAmount: true,
        currentClassId: true,
        currentClass: {
          select: {
            id: true,
            name: true,
            courseId: true,
            teacherId: true,
            course: { select: { title: true } },
            teacher: { select: { firstName: true, lastName: true } },
          },
        },
        classEnrollments: {
          select: { classId: true, class: { select: { teacherId: true } } },
        },
        enrollments: {
          select: {
            courseId: true,
            course: { select: { teacherId: true } },
          },
        },
      },
    });
    if (!student) {
      throw new Error("Étudiant introuvable dans votre organisation.");
    }
    if (user.role === "TEACHER") {
      const inOwnClass =
        student.currentClass?.teacherId === user.id ||
        student.classEnrollments.some((e) => e.class.teacherId === user.id);
      const enrolledInOwnCourse = student.enrollments.some(
        (e) => e.course.teacherId === user.id
      );
      let inOwnCourseByClass = false;
      if (student.currentClass?.courseId != null) {
        const ownClass = await prisma.class.findFirst({
          where: {
            organizationId: user.organizationId,
            courseId: student.currentClass.courseId,
            teacherId: user.id,
          },
          select: { id: true },
        });
        inOwnCourseByClass = ownClass !== null;
      }
      if (!inOwnClass && !inOwnCourseByClass && !enrolledInOwnCourse) {
        throw new Error(
          "Accès refusé : cet étudiant n'est inscrit dans aucun de vos cours."
        );
      }
    }
    const classId = student.currentClass?.id ?? student.currentClassId;
    const className = student.currentClass?.name ?? null;
    const courseId = student.currentClass?.courseId ?? null;
    const courseTitle = student.currentClass?.course.title ?? null;
    const teacherName = student.currentClass?.teacher
      ? `${student.currentClass.teacher.firstName} ${student.currentClass.teacher.lastName}`.trim()
      : null;
    const [evaluations, attendanceRecords, payments, travelProcedures] =
      await Promise.all([
        prisma.evaluation.findMany({
          where: classId
            ? { organizationId: user.organizationId, classId }
            : { organizationId: user.organizationId },
          orderBy: [{ date: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            title: true,
            date: true,
            modules: {
              orderBy: { createdAt: "asc" },
              select: {
                id: true,
                name: true,
                maxScore: true,
                passingScore: true,
                grades: {
                  where: { studentId },
                  select: { score: true },
                  take: 1,
                },
              },
            },
          },
        }),
        prisma.attendance.findMany({
          where: { studentId, organizationId: user.organizationId },
          select: { status: true },
        }),
        // Historique des versements de la formation (rapport global) :
        // paiements aboutis et non suspendus, du plus ancien au plus recent.
        prisma.payment.findMany({
          where: {
            studentId,
            organizationId: user.organizationId,
            travelProcedureId: null,
            status: "COMPLETED",
            isVoided: false,
          },
          orderBy: { paidAt: "asc" },
          select: {
            amount: true,
            paymentMethod: true,
            reference: true,
            description: true,
            paidAt: true,
          },
        }),
        // Dossier de voyage lie a l'etudiant (rapport global uniquement).
        canSeeFinancial
          ? prisma.travelProcedure.findFirst({
              where: { studentId, organizationId: user.organizationId },
              orderBy: { createdAt: "desc" },
              select: {
                destination: true,
                targetProgram: true,
                status: true,
                totalCost: true,
                discount: true,
                netAmount: true,
                currentStageOrder: true,
                workflow: {
                  select: {
                    stages: {
                      orderBy: { order: "asc" },
                      select: { title: true, order: true },
                    },
                  },
                },
                payments: {
                  where: {
                    status: { in: ["COMPLETED", "PARTIAL"] },
                    isVoided: false,
                  },
                  orderBy: { paidAt: "asc" },
                  select: {
                    amount: true,
                    paymentMethod: true,
                    reference: true,
                    description: true,
                    paidAt: true,
                  },
                },
              },
            })
          : Promise.resolve(null),
      ]);
    const attendance: PremiumReportDTO["attendance"] = {
      total: attendanceRecords.length,
      present: attendanceRecords.filter((a) => a.status === "PRESENT").length,
      late: attendanceRecords.filter((a) => a.status === "LATE").length,
      absent: attendanceRecords.filter((a) => a.status === "ABSENT").length,
      excused: attendanceRecords.filter((a) => a.status === "EXCUSED").length,
    };
    /**
     * Lignes du bulletin : note sur le bareme reel du module + statut
     * modulaire (Validé / Non validé) selon le seuil configure par le
     * professeur. Aucune conversion /20, aucun coefficient.
     */
    const rows: PremiumReportRowDTO[] = evaluations.flatMap((ev) =>
      ev.modules.map((m) => {
        const score = m.grades[0]?.score ?? null;
        return {
          evaluationTitle: ev.title,
          module: m.name,
          date: ev.date,
          score,
          maxScore: m.maxScore,
          passingScore: m.passingScore,
          passed:
            score === null
              ? null
              : score >= m.passingScore,
        };
      })
    );
    const { validatedModules, gradedModules } = computeModuleValidation(rows);
    // --------------------------------------
    // Rapport global : recapitulatif financier detaille + procedure voyage
    // (roles administratifs uniquement — jamais pour un enseignant).
    // --------------------------------------
    let financial: PremiumFinancialSummary | null = null;
    let travel: PremiumTravelSummary | null = null;

    if (canSeeFinancial) {
      const paymentHistory: PremiumPaymentEntry[] = payments.map((p) => ({
        paidAt: p.paidAt,
        amount: p.amount,
        method: paymentMethodLabel(p.paymentMethod),
        reference: p.reference ?? p.description ?? null,
      }));
      const formationAmountPaid = paymentHistory.reduce(
        (sum, p) => sum + p.amount,
        0
      );
      const formationRemaining =
        student.netAmount != null
          ? Math.max(0, student.netAmount - formationAmountPaid)
          : null;
      financial = {
        totalCost: student.totalCost,
        discount: student.discount,
        discountLabel: discountLabelServer(student.discount, student.discountType),
        netAmount: student.netAmount,
        amountPaid: formationAmountPaid,
        remaining: formationRemaining,
        isFullyPaid:
          student.netAmount != null ? formationRemaining === 0 : null,
        history: paymentHistory,
      };

      const procedure = travelProcedures;
      if (procedure) {
        const travelHistory: PremiumPaymentEntry[] = procedure.payments.map(
          (p) => ({
            paidAt: p.paidAt,
            amount: p.amount,
            method: paymentMethodLabel(p.paymentMethod),
            reference: p.reference ?? p.description ?? null,
          })
        );
        const travelAmountPaid = travelHistory.reduce(
          (sum, p) => sum + p.amount,
          0
        );
        const travelNet = procedure.netAmount || Math.max(procedure.totalCost - procedure.discount, 0);
        // Etapes validees : toutes celles dont l'ordre est atteint
        // (currentStageOrder = nombre d'etapes franchies).
        const steps = procedure.workflow?.stages.map((stage) => ({
          label: stage.title,
          validated: stage.order <= procedure.currentStageOrder,
        }));
        travel = {
          destination: procedure.destination,
          targetProgram: procedure.targetProgram,
          statusLabel: getTravelStatusLabel(procedure.status),
          steps: steps ?? [],
          validatedSteps:
            procedure.workflow?.stages.filter(
              (stage) => stage.order <= procedure.currentStageOrder
            ).length ?? 0,
          totalSteps: procedure.workflow?.stages.length ?? 0,
          totalCost: procedure.totalCost,
          discount: procedure.discount > 0 ? procedure.discount : null,
          netAmount: travelNet,
          amountPaid: travelAmountPaid,
          remaining: Math.max(travelNet - travelAmountPaid, 0),
          history: travelHistory,
        };
      }
    }
    const issuedAt = new Date();
    const documentNumber = formatPremiumReportNumber(
      student.studentCode,
      issuedAt
    );
    return {
      studentId: student.id,
      studentFirstName: student.firstName,
      studentLastName: student.lastName,
      studentCode: student.studentCode,
      classId,
      className,
      courseId,
      courseTitle,
      periodLabel: cleanPeriod,
      teacherName,
      scope,
      rows,
      validatedModules,
      gradedModules,
      generalAppreciation: defaultAppreciationForValidation(
        validatedModules,
        gradedModules
      ),
      documentNumber,
      issuedAt,
      attendance,
      financial,
      travel,
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    if (error instanceof Error && error.message.startsWith("Accès refusé")) {
      throw error;
    }
    if (error instanceof Error && error.message.startsWith("Étudiant")) {
      throw error;
    }
    console.error("[getPremiumReportForStudent] Échec de lecture :", error);
    throw new Error("Impossible de générer le bulletin pour le moment.");
  }
}

// --------------------------------------
// Rapport public « lien parent » (sans compte)
// --------------------------------------

/**
 * Génère le bulletin premium complet d'un étudiant à partir de son
 * TOKEN PUBLIC (lien parent), SANS session ni authentification.
 *
 * Le token (UUID v4) est l'équivalent d'une clé d'accès : il ne permet
 * aucune modification et expose uniquement les données d'un seul étudiant.
 * L'organisation associée est renvoyée pour l'en-tête du bulletin.
 */
export async function getPublicStudentReport(
  token: string
): Promise<{
  report: PremiumReportDTO;
  organization: {
    name: string;
    address: string | null;
    city: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    logoUrl: string | null;
    rccm: string | null;
    ifu: string | null;
  };
}> {
  const cleanToken = (token ?? "").trim();
  if (cleanToken.length < 8) {
    throw new Error("Lien de rapport invalide.");
  }

  const student = await prisma.student.findFirst({
    where: { publicReportToken: cleanToken },
    select: {
      id: true,
      organizationId: true,
      studentCode: true,
      firstName: true,
      lastName: true,
      currentClassId: true,
      currentClass: {
        select: {
          id: true,
          name: true,
          courseId: true,
          course: { select: { title: true } },
        },
      },
    },
  });

  if (!student) {
    throw new Error("Étudiant introuvable.");
  }

  const organizationId = student.organizationId;

  const organization = await prisma.organization.findFirst({
    where: { id: organizationId },
    select: {
      name: true,
      address: true,
      city: true,
      phone: true,
      email: true,
      website: true,
      logoUrl: true,
      rccm: true,
      ifu: true,
    },
  });

  if (!organization) {
    throw new Error("Établissement introuvable.");
  }

  const classId = student.currentClassId ?? student.currentClass?.id ?? null;
  const className = student.currentClass?.name ?? null;
  const courseId = student.currentClass?.courseId ?? null;
  const courseTitle = student.currentClass?.course.title ?? null;

  const [evaluations, attendanceRecords] = await Promise.all([
    prisma.evaluation.findMany({
      where: classId
        ? { organizationId, classId }
        : { organizationId },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        title: true,
        date: true,
        modules: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            name: true,
            maxScore: true,
            passingScore: true,
            grades: {
              where: { studentId: student.id },
              select: { score: true },
              take: 1,
            },
          },
        },
      },
    }),
    prisma.attendance.findMany({
      where: { studentId: student.id, organizationId },
      select: { status: true },
    }),
  ]);

  /**
   * Lignes du bulletin public : note sur le bareme reel + statut modulaire.
   * Le lien parent expose le BULLETIN ACADEMIQUE uniquement : aucune donnee
   * financiere ni de procedure de voyage.
   */
  const rows: PremiumReportRowDTO[] = evaluations.flatMap((ev) =>
    ev.modules.map((m) => {
      const score = m.grades[0]?.score ?? null;
      return {
        evaluationTitle: ev.title,
        module: m.name,
        date: ev.date,
        score,
        maxScore: m.maxScore,
        passingScore: m.passingScore,
        passed: score === null ? null : score >= m.passingScore,
      };
    })
  );

  const { validatedModules, gradedModules } = computeModuleValidation(rows);

  const attendance: PremiumReportDTO["attendance"] = {
    total: attendanceRecords.length,
    present: attendanceRecords.filter((a) => a.status === "PRESENT").length,
    late: attendanceRecords.filter((a) => a.status === "LATE").length,
    absent: attendanceRecords.filter((a) => a.status === "ABSENT").length,
    excused: attendanceRecords.filter((a) => a.status === "EXCUSED").length,
  };

  const issuedAt = new Date();
  const documentNumber = formatPremiumReportNumber(student.studentCode, issuedAt);

  return {
    report: {
      studentId: student.id,
      studentFirstName: student.firstName,
      studentLastName: student.lastName,
      studentCode: student.studentCode,
      classId,
      className,
      courseId,
      courseTitle,
      periodLabel: "Période en cours",
      teacherName: null,
      scope: "academic",
      rows,
      validatedModules,
      gradedModules,
      generalAppreciation: defaultAppreciationForValidation(
        validatedModules,
        gradedModules
      ),
      documentNumber,
      issuedAt,
      attendance,
      financial: null,
      travel: null,
    },
    organization,
  };
}

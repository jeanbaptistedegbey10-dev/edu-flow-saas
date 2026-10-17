/**
 * Résolution d'inscription (ClassEnrollment) pour le rattachement des données
 * « Étudiant vs Inscription » (séparation stricte, étape 1/3 du cycle de vie
 * des classes).
 *
 * Les notes (Grade), présences (Attendance), échéanciers (PaymentSchedule) et
 * règlements (Payment) sont rattachés à l'inscription de l'étudiant — classe
 * + année académique — et non plus au seul profil étudiant. Ces helpers
 * résolvent l'inscription cible au moment de l'écriture :
 *
 * - avec `classId` : inscription de l'étudiant dans CETTE classe (la plus
 *   récente si le même couple étudiant/classe existe sur plusieurs années —
 *   cas d'une réinscription) ;
 * - sans `classId` : inscription dans la classe courante du profil
 *   (`Student.currentClassId`).
 */

import type { Prisma, PrismaClient } from "@prisma/client";

/** Client Prisma « nu » ou handle de transaction interactive. */
export type EnrollmentScopeDb = Prisma.TransactionClient | PrismaClient;

export type ResolveEnrollmentArgs = {
  organizationId: string;
  studentId: string;
  /** Classe explicite (saisie ciblée) ; à défaut, la classe courante. */
  classId?: string | null;
};

/**
 * Renvoie l'id de l'inscription la plus récente correspondant à l'étudiant
 * (et à la classe fournie / classe courante), ou `null` si aucune inscription
 * n'existe — écriture historique héritée ou étudiant sans classe.
 */
export async function resolveEnrollmentIdForStudent(
  db: EnrollmentScopeDb,
  args: ResolveEnrollmentArgs
): Promise<string | null> {
  const { organizationId, studentId } = args;
  let classId = args.classId ?? null;

  if (!classId) {
    const student = await db.student.findUnique({
      where: { id: studentId },
      select: { currentClassId: true },
    });
    classId = student?.currentClassId ?? null;
    if (!classId) return null;
  }

  const enrollment = await db.classEnrollment.findFirst({
    where: { organizationId, studentId, classId },
    orderBy: { enrolledAt: "desc" },
    select: { id: true },
  });

  return enrollment?.id ?? null;
}

/**
 * Construit la correspondance studentId → enrollmentId pour une classe entière
 * (saisies en lot : grille de notes, émargement). Une seule requête, puis
 * lecture mémoire par étudiant. Inscription la plus récente retenue par
 * étudiant (réinscription sur nouvelle année académique).
 */
export async function buildEnrollmentIdMapForClass(
  db: EnrollmentScopeDb,
  args: { organizationId: string; classId: string }
): Promise<Map<string, string>> {
  const rows = await db.classEnrollment.findMany({
    where: { organizationId: args.organizationId, classId: args.classId },
    orderBy: { enrolledAt: "desc" },
    select: { id: true, studentId: true },
  });

  const map = new Map<string, string>();
  for (const row of rows) {
    if (!map.has(row.studentId)) map.set(row.studentId, row.id);
  }
  return map;
}

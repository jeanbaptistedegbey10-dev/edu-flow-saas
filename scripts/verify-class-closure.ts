/**
 * Vérification ponctuelle du schéma « clôture de classe » (exécution: npx tsx scripts/verify-class-closure.ts).
 * Contrôle : nouveaux enums, colonnes ajoutées, backfill des notes existantes.
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  // 1. Classe : statut lisible + défaut ACTIVE.
  const classes = await prisma.class.findMany({
    take: 3,
    select: { id: true, name: true, status: true },
  });
  console.log("Classes:", classes);

  // 2. Inscriptions : statut + appréciation disponibles.
  const enrollments = await prisma.classEnrollment.findMany({
    take: 3,
    select: { id: true, status: true, finalDecisionNote: true },
  });
  console.log("ClassEnrollments:", enrollments);

  // 3. Notes : passMark snapshot + statut calculé (rétro-rempli).
  const grades = await prisma.grade.findMany({
    take: 5,
    select: { id: true, score: true, passMark: true, status: true },
  });
  console.log("Grades:", grades);

  // 4. Évaluations : seuil par défaut (passMark).
  const evaluations = await prisma.evaluation.findMany({
    take: 3,
    select: { id: true, title: true, passMark: true },
  });
  console.log("Evaluations:", evaluations);

  // 5. Agrégat : répartition des statuts de notes.
  const byStatus = await prisma.grade.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  console.log("Grades by status:", byStatus);
}

main()
  .catch((error) => {
    console.error("VERIFICATION FAILED:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

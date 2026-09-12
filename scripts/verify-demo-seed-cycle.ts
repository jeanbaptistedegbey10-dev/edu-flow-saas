/**
 * Vérification ponctuelle du correctif P2002 (Attendance → ClassSession).
 *
 * Cycle complet contre la base configurée :
 *   1. création d'une organisation + compte ADMIN de test (slug unique) ;
 *   2. injection du jeu de démonstration → DOIT réussir sans erreur P2002 ;
 *   3. intégrité : chaque présence référence une ClassSession réelle,
 *      unicité [sessionId, studentId], compteurs attendus (18 séances / 36
 *      présences : 3 classes × 6 séances × 2 élèves) ;
 *   4. ré-injection → garde `ALREADY_SEEDED` (aucune exception) ;
 *   5. sonde `getOrganizationDataPresence` → hasData = true ;
 *   6. réinitialisation complète (`resetOrganizationData`) → compteurs
 *      classSessions/attendances exacts, AUCUN orphelin (toutes tables vides) ;
 *   7. sonde de présence → hasData = false (statut « Aucune donnée » corrigé) ;
 *   8. purge de l'organisation de test.
 *
 * Exécution : npx dotenvx run -- npx tsx scripts/tmp-verify-demo-seed.ts
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

import {
  getOrganizationDataPresence,
  resetOrganizationData,
} from "../src/lib/demo-data";
import { seedDemoDataForOrganization } from "../src/lib/demo-seed";

/** Client Prisma dédié (indépendant de l'alias « @/ » du projet). */
const prisma = new PrismaClient();

const TEST_SLUG = `zzz-verify-demo-${Date.now().toString(36)}`;
const TEST_EMAIL = `${TEST_SLUG}@verify.local`;

/** Arrêt immédiat avec message d'échec explicite. */
function fail(message: string): never {
  console.error(`❌ ÉCHEC : ${message}`);
  process.exit(1);
}

async function main(): Promise<void> {
  console.log("— Création de l'organisation de test…");
  const org = await prisma.organization.create({
    data: { name: "Vérif Seed Démo", slug: TEST_SLUG },
  });
  const admin = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: TEST_EMAIL,
      passwordHash: await bcrypt.hash("verify12345", 10),
      firstName: "Vérif",
      lastName: "Seed",
      role: "ADMIN",
    },
  });

  try {
    // 1. Injection — doit réussir SANS P2002.
    const injected = await seedDemoDataForOrganization(org.id, admin.id);
    if (!injected.seeded) {
      fail(`injection refusée : ${injected.reason}`);
    }
    console.log("✅ 1. Injection OK :", injected.counts);
    if (injected.counts.classSessions !== 18) {
      fail(
        `classSessions attendu 18 (3 classes × 6 séances), obtenu ${injected.counts.classSessions}`
      );
    }
    if (injected.counts.attendances !== 36) {
      fail(
        `attendances attendu 36 (3 classes × 6 séances × 2 élèves), obtenu ${injected.counts.attendances}`
      );
    }

    // 2. Intégrité référentielle + unicité [sessionId, studentId].
    const sessions = await prisma.classSession.findMany({
      where: { organizationId: org.id },
      select: { id: true },
    });
    const sessionIds = new Set(sessions.map((s) => s.id));
    if (sessions.length !== 18) {
      fail(`séances en base = ${sessions.length}, attendu 18`);
    }
    const attendances = await prisma.attendance.findMany({
      where: { organizationId: org.id },
      select: { sessionId: true, studentId: true },
    });
    if (attendances.length !== 36) {
      fail(`présences en base = ${attendances.length}, attendu 36`);
    }
    const seen = new Set<string>();
    for (const attendance of attendances) {
      if (!sessionIds.has(attendance.sessionId)) {
        fail(`présence orpheline : sessionId=${attendance.sessionId} inconnu`);
      }
      const key = `${attendance.sessionId}-${attendance.studentId}`;
      if (seen.has(key)) {
        fail(`doublon [sessionId, studentId] : ${key}`);
      }
      seen.add(key);
    }
    console.log(
      "✅ 2. Intégrité OK : 18 séances, 36 présences rattachées, 0 orphelin, 0 doublon"
    );

    // 3. Ré-injection — garde ALREADY_SEEDED sans exception.
    const again = await seedDemoDataForOrganization(org.id, admin.id);
    if (again.seeded || again.reason !== "ALREADY_SEEDED") {
      fail(`garde attendu ALREADY_SEEDED, obtenu ${JSON.stringify(again)}`);
    }
    console.log("✅ 3. Garde ALREADY_SEEDED OK (seconde injection ignorée)");

    // 4. Sonde de présence — des données existent.
    const presenceBefore = await getOrganizationDataPresence(org.id);
    if (!presenceBefore.hasData) {
      fail("hasData devrait être true après injection");
    }
    console.log("✅ 4. Sonde de présence : hasData=true (données détectées)");

    // 5. Réinitialisation complète (les 3 étapes).
    const reset = await resetOrganizationData(org.id);
    if (!reset.ok) {
      fail(`réinitialisation échouée : ${reset.reason}`);
    }
    console.log("✅ 5. Reset OK :", reset.deleted);
    if (
      reset.deleted.classSessions !== 18 ||
      reset.deleted.attendances !== 36
    ) {
      fail(
        `compteurs reset inattendus (classSessions=${reset.deleted.classSessions}, attendances=${reset.deleted.attendances})`
      );
    }

    // 6. Aucun orphelin : toutes les tables métier doivent être vides.
    const leftovers: Record<string, number> = {
      classSession: await prisma.classSession.count({
        where: { organizationId: org.id },
      }),
      attendance: await prisma.attendance.count({
        where: { organizationId: org.id },
      }),
      class: await prisma.class.count({
        where: { organizationId: org.id },
      }),
      course: await prisma.course.count({
        where: { organizationId: org.id },
      }),
      student: await prisma.student.count({
        where: { organizationId: org.id },
      }),
      classEnrollment: await prisma.classEnrollment.count({
        where: { organizationId: org.id },
      }),
      enrollment: await prisma.enrollment.count({
        where: { student: { organizationId: org.id } },
      }),
      grade: await prisma.grade.count({
        where: { student: { organizationId: org.id } },
      }),
      evaluation: await prisma.evaluation.count({
        where: { organizationId: org.id },
      }),
      courseLog: await prisma.courseLog.count({
        where: { organizationId: org.id },
      }),
      payment: await prisma.payment.count({
        where: { organizationId: org.id },
      }),
      expense: await prisma.expense.count({
        where: { organizationId: org.id },
      }),
      workflow: await prisma.workflow.count({
        where: { organizationId: org.id },
      }),
      workflowStage: await prisma.workflowStage.count({
        where: { organizationId: org.id },
      }),
      travelProcedure: await prisma.travelProcedure.count({
        where: { organizationId: org.id },
      }),
      document: await prisma.document.count({
        where: { organizationId: org.id },
      }),
      housing: await prisma.housing.count({
        where: { organizationId: org.id },
      }),
      productService: await prisma.productService.count({
        where: { organizationId: org.id },
      }),
      productCategory: await prisma.productCategory.count({
        where: { organizationId: org.id },
      }),
      sale: await prisma.sale.count({
        where: { organizationId: org.id },
      }),
      task: await prisma.task.count({
        where: { organizationId: org.id },
      }),
      payroll: await prisma.payroll.count({
        where: { organizationId: org.id },
      }),
      customRole: await prisma.customRole.count({
        where: { organizationId: org.id },
      }),
      demoUsers: await prisma.user.count({
        where: {
          organizationId: org.id,
          role: { notIn: ["ADMIN", "SUPER_ADMIN"] },
        },
      }),
    };
    const nonZero = Object.entries(leftovers).filter(([, count]) => count > 0);
    if (nonZero.length > 0) {
      fail(`orphelins détectés après reset : ${JSON.stringify(nonZero)}`);
    }
    console.log("✅ 6. Aucun orphelin : toutes les tables métier sont vides");

    // 7. Sonde de présence — organisation redevenue vide.
    const presenceAfter = await getOrganizationDataPresence(org.id);
    if (presenceAfter.hasData) {
      fail("hasData devrait être false après réinitialisation");
    }
    console.log(
      "✅ 7. Sonde de présence : hasData=false (aucune donnée à supprimer)"
    );

    console.log(
      "\n🎉 CYCLE COMPLET VALIDÉ : inject (sans P2002) → ALREADY_SEEDED → purge sans orphelin → organisation vide"
    );
  } finally {
    // 8. Purge de l'organisation de test (cascade sur les comptes restants).
    await prisma.user.deleteMany({ where: { organizationId: org.id } });
    await prisma.organization.delete({ where: { id: org.id } });
    console.log("— Organisation de test supprimée (nettoyage terminé).");
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Erreur inattendue :", error);
  process.exit(1);
});

/**
 * Vérification bout-en-bout du cycle Auto-Backup / Restore.
 *
 * Scénario (sur une organisation de test isolée, purgée à la fin) :
 *   1. création d'une organisation + compte ADMIN ;
 *   2. injection du jeu de démonstration (données réelles à sauvegarder) ;
 *   3. relevé de contrôle des compteurs (étudiants, cours, paiements, ventes) ;
 *   4. création d'une sauvegarde (snapshot avant purge) ;
 *   5. purge complète de l'organisation ;
 *   6. vérification que l'organisation est VIDE ;
 *   7. restauration de la sauvegarde ;
 *   8. vérification que les compteurs sont IDENTIQUES à l'étape 3 ;
 *   9. contrôle d'isolation multi-tenant (sauvegarde inconnue refusée).
 *
 * Exécution : npx tsx scripts/verify-backup-restore.ts
 */
import { PrismaClient } from "@prisma/client";

import {
  resetCoursesAndAssessmentsData,
  resetFinancialAndSettingsData,
  resetStudentsAndSchoolingData,
} from "../src/lib/demo-data";
import { seedDemoDataForOrganization } from "../src/lib/demo-seed";
import {
  createOrganizationBackup,
  listOrganizationBackups,
  restoreOrganizationBackup,
} from "../src/lib/organization-backup";

const prisma = new PrismaClient();

/** Trace persistée dans un fichier (stdout peut être tamponné par l'outillage). */
function trace(message: string): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs") as typeof import("node:fs");
  fs.appendFileSync("vr-trace.log", `${message}\n`);
  console.log(message);
}

trace("début du script");

/** Compteurs servant de référence avant / après restauration. */
type Counters = Record<string, number>;

async function takeCounters(organizationId: string): Promise<Counters> {
  const [
    students,
    courses,
    classes,
    classSessions,
    attendances,
    payments,
    sales,
  ] = await Promise.all([
    prisma.student.count({ where: { organizationId } }),
    prisma.course.count({ where: { organizationId } }),
    prisma.class.count({ where: { organizationId } }),
    prisma.classSession.count({ where: { organizationId } }),
    prisma.attendance.count({ where: { organizationId } }),
    prisma.payment.count({ where: { organizationId } }),
    prisma.sale.count({ where: { organizationId } }),
  ]);

  return { students, courses, classes, classSessions, attendances, payments, sales };
}

function assertDeepEqual(
  actual: Counters,
  expected: Counters,
  label: string
): void {
  const keys = Object.keys(expected) as (keyof Counters)[];
  const mismatches = keys.filter((key) => actual[key] !== expected[key]);

  if (mismatches.length > 0) {
    throw new Error(
      `${label} — compteurs divergents : ${mismatches
        .map((key) => `${key} attendu=${expected[key]} obtenu=${actual[key]}`)
        .join(", ")}`
    );
  }
}

async function main() {
  trace("main: démarrage");
  const stamp = Date.now();
  const slug = `backup-test-${stamp}`;
  const organization = await prisma.organization.create({
    data: { name: "Centre de test (backup)", slug },
  });
  trace(`main: organisation créée ${organization.id}`);

  const admin = await prisma.user.create({
    data: {
      organizationId: organization.id,
      email: `admin-backup-${stamp}@test.local`,
      passwordHash: "x",
      firstName: "Admin",
      lastName: "Test",
      role: "ADMIN",
    },
  });
  trace("main: admin créé");

  try {
    // 1. Injection du jeu de démonstration.
    const seeded = await seedDemoDataForOrganization(organization.id, admin.id);
    if (!seeded.seeded) {
      throw new Error(`Seeding refusé : ${JSON.stringify(seeded)}`);
    }
    trace("main: seeding terminé");

    // 2. Compteurs de référence.
    const reference = await takeCounters(organization.id);
    console.log("Compteurs après injection :", reference);
    if (reference.students === 0) {
      throw new Error("Le seeding n'a produit aucun étudiant.");
    }

    // 3. Sauvegarde (équivalent de l'auto-backup avant purge).
    const backup = await createOrganizationBackup(
      organization.id,
      admin.id,
      "AUTO_PURGE"
    );
    if (!backup.ok) {
      throw new Error(`Sauvegarde refusée : ${backup.reason}`);
    }
    console.log(
      `Sauvegarde créée : ${backup.rowCount} lignes, ${backup.sizeBytes} octets, expire le ${backup.expiresAt.toISOString()}`
    );

    // 4. Purge complète (mêmes trois étapes que la réinitialisation UI).
    await resetFinancialAndSettingsData(organization.id);
    await resetCoursesAndAssessmentsData(organization.id);
    await resetStudentsAndSchoolingData(organization.id);

    // 5. Organisation vide.
    const afterPurge = await takeCounters(organization.id);
    const stillThere = Object.values(afterPurge).filter((value) => value !== 0);
    if (stillThere.length > 0) {
      throw new Error(
        `La purge a laissé des données : ${JSON.stringify(afterPurge)}`
      );
    }
    console.log("Purge OK — organisation vide.");

    // 6. Restauration.
    const restored = await restoreOrganizationBackup(
      backup.backupId,
      organization.id
    );
    if (!restored.ok) {
      throw new Error(`Restauration refusée : ${restored.reason}`);
    }
    console.log(
      `Restauration terminée : ${restored.rowCount} lignes sur ${restored.tableCount} tables.`
    );

    // 7. Compteurs identiques à la référence.
    const afterRestore = await takeCounters(organization.id);
    console.log("Compteurs après restauration :", afterRestore);
    assertDeepEqual(afterRestore, reference, "Restauration");

    // 8. Isolation multi-tenant : sauvegarde inconnue / étrangère refusée.
    const foreign = await restoreOrganizationBackup(
      "id-inexistant",
      organization.id
    );
    if (foreign.ok || foreign.reason !== "BACKUP_NOT_FOUND") {
      throw new Error(
        `L'isolation multi-tenant n'est pas respectée : ${JSON.stringify(foreign)}`
      );
    }
    console.log("Isolation multi-tenant OK (sauvegarde inconnue refusée).");

    // 9. Historique : la sauvegarde AUTO_RESTORE de sécurité est présente.
    const history = await listOrganizationBackups(organization.id);
    console.log(
      `Historique : ${history.length} sauvegarde(s) — motifs : ${history
        .map((item) => item.reason)
        .join(", ")}`
    );
    if (history.length < 2) {
      throw new Error(
        "La sauvegarde de sécurité (avant restauration) n'a pas été créée."
      );
    }

    console.log(
      "\n🎉 CYCLE VALIDÉ : sauvegarde → purge → restauration à l'identique"
    );
  } finally {
    // Nettoyage : purge métier puis suppression de l'organisation (CASCADE :
    // les sauvegardes partent avec elle). L'ADMIN est conservé par la purge,
    // il suffit donc de supprimer l'organisation.
    await resetFinancialAndSettingsData(organization.id);
    await resetCoursesAndAssessmentsData(organization.id);
    await resetStudentsAndSchoolingData(organization.id);
    await prisma.organization.delete({ where: { id: organization.id } });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error("\n❌ ÉCHEC :", error);
    await prisma.$disconnect();
    process.exit(1);
  });

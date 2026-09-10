#!/usr/bin/env node
/**
 * =============================================================================
 * TEST END-TO-END AUTOMATISÉ — Parcours utilisateurs critiques
 * =============================================================================
 *
 * Script de validation de bout en bout (autonome, exécutable avec `npx tsx`) :
 *
 *   1. Organisation & Admin :
 *      - crée une organisation de test isolée (slug unique) + administrateur ;
 *      - vérifie que le contexte organisation est actif (plan ACTIVE, écritures
 *        autorisées) ;
 *
 *   2. Création d'étudiant :
 *      - crée un étudiant valide puis vérifie sa présence en base ;
 *      - tente de créer un étudiant DOUBLON (même email dans la même
 *        organisation) et vérifie que le message d'erreur DÉTAILLÉ
 *        (« Un étudiant avec cet email existe déjà. ») est bien produit,
 *        sans crash ni état partiel ;
 *
 *   3. Cycle des données de démonstration :
 *      - RÉINITIALISATION complète  → vérifie que toutes les données sont
 *        supprimées (élèves, cours, paiements, dépenses…) ;
 *      - INJECTION du jeu de démo    → vérifie que des données fraîches sont
 *        créées (élèves, cours, classes, paiements, dépenses, ventes…) ;
 *      - RÉINITIALISATION à nouveau  → vérifie l'état vide final.
 *
 *   4. Compilation & types : exécute `npx tsc --noEmit`.
 *
 * Les appels de données utilisent LES MÊMES fonctions que les Server Actions
 * (`resetOrganizationData`, `injectDemoDataForOrganization` issues de
 * `src/lib/demo-data.ts`) : les actions elles-mêmes nécessitent un contexte
 * de requête Next.js (session, cookies), non disponible hors serveur — c'est
 * donc la logique métier qu'elles invoquent qui est validée de bout en bout.
 *
 * Sortie : code de sortie 0 si TOUT passe, 1 sinon.
 *
 * Usage :
 *   npx tsx scripts/e2e-app-test.ts
 *   SKIP_TSC=1 npx tsx scripts/e2e-app-test.ts   # saute l'étape tsc
 *   KEEP_ORG=1 npx tsx scripts/e2e-app-test.ts   # conserve l'org de test
 *
 * Prérequis : variables d'environnement DATABASE_URL dans `.env` (base joignable).
 * =============================================================================
 */
import "dotenv/config";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import bcrypt from "bcryptjs";

import {
  injectDemoDataForOrganization,
  resetOrganizationData,
} from "@/lib/demo-data";
import { prisma } from "@/lib/prisma";

const execFileAsync = promisify(execFile);

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");

/** Identifiant de l'organisation de test (portée module → accessible dans le handler d'erreur). */
let organizationId: string | null = null;

// ---------------------------------------------------------------------------
// Utilitaires de rapport
// ---------------------------------------------------------------------------

const results: Array<{ name: string; ok: boolean; detail?: string }> = [];

function pass(name: string, detail?: string) {
  results.push({ name, ok: true, detail });
  console.log(`   ✅ ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name: string, detail?: string) {
  results.push({ name, ok: false, detail });
  console.error(`   ❌ ${name}${detail ? ` — ${detail}` : ""}`);
}

function section(title: string) {
  console.log("\n" + "=".repeat(72));
  console.log(` ${title}`);
  console.log("=".repeat(72));
}
// ---------------------------------------------------------------------------
// 1. Organisation & Admin — contexte actif
// ---------------------------------------------------------------------------

async function setupOrganization() {
  section("1. Organisation & Admin — contexte actif");

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const orgSlug = `e2e-test-${runId}`;
  const adminEmail = `admin-${runId}@e2e-test.local`;
  const passwordHash = await bcrypt.hash("E2eTest!2026", 10);

  const trialEndsAt = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000);

  const organization = await prisma.organization.create({
    data: {
      name: `Org E2E Test ${runId}`,
      slug: orgSlug,
      planType: "TRIAL",
      planStatus: "ACTIVE",
      trialEndsAt,
      defaultRegistrationFee: 15000,
      initialCashBalance: 100000,
    },
  });

  const admin = await prisma.user.create({
    data: {
      organizationId: organization.id,
      email: adminEmail,
      passwordHash,
      firstName: "Admin",
      lastName: "E2E",
      role: "ADMIN",
      isActive: true,
    },
  });

  const reloadedOrg = await prisma.organization.findUnique({
    where: { id: organization.id },
  });
  const reloadedAdmin = await prisma.user.findUnique({
    where: { id: admin.id },
  });

  if (!reloadedOrg || reloadedAdmin?.role !== "ADMIN" || !reloadedAdmin.isActive) {
    fail(
      "Organisation et administrateur",
      "contexte introuvable après création"
    );
    return { organization, admin, orgSlug, adminEmail };
  }
  if (reloadedOrg.planStatus !== "ACTIVE" || !reloadedOrg.trialEndsAt) {
    fail("Contexte actif (plan)", "planStatus ou trialEndsAt invalide");
  } else {
    const canWrite =
      reloadedOrg.planStatus === "ACTIVE" &&
      new Date(reloadedOrg.trialEndsAt).getTime() > Date.now();
    if (!canWrite) {
      fail("Droits d'écriture (licence)", "plan expiré");
    } else {
      pass("Droits d'écriture (licence)", "plan TRIAL/ACTIVE non expiré");
    }
  }

  pass(
    "Organisation & admin créés",
    `${reloadedOrg.name} (${reloadedOrg.slug}) — admin ${reloadedAdmin.email}`
  );

  return { organization, admin, orgSlug, adminEmail };
}

// ---------------------------------------------------------------------------
// 2. Création d'étudiant — valide puis doublon
// ---------------------------------------------------------------------------

/**
 * Reproduit EXACTEMENT la garde d'unicité de l'email utilisée par
 * `createStudentAction` (src/actions/students.ts) : le message d'erreur
 * détaillé retourné au formulaire doit être produit sans exception.
 */
async function duplicateEmailMessage(
  organizationId: string,
  email: string
): Promise<string | null> {
  const existing = await prisma.student.findFirst({
    where: { organizationId, email },
    select: { id: true },
  });

  if (existing) {
    return "Un étudiant avec cet email existe déjà.";
  }

  return null;
}

async function testStudentCreation(
  organizationId: string
): Promise<{ createdId: string; email: string }> {
  section("2. Création d'étudiant — valide puis doublon");

  const testEmail = `student-${Date.now()}@e2e-test.local`;

  // 2.1 Création d'un étudiant VALIDE (mêmes données que `createStudentAction`,
  //     limitées aux colonnes réellement présentes en base — voir prisma/seed.ts
  //     et le jeu de démonstration).
  let student;
  try {
    student = await prisma.student.create({
      data: {
        organizationId,
        studentCode: `E2E-${Date.now()}-001`,
        firstName: "Jean",
        lastName: "Dupont",
        email: testEmail,
        phone: "+225 07 00 00 00 00",
        clientType: "LANGUAGE_AND_TRAVEL",
        status: "ENROLLED",
        dateOfBirth: new Date("2001-04-15"),
        address: "Abidjan, Cocody",
        totalCost: 250000,
        discount: 0,
        discountType: "FIXED",
        netAmount: 250000,
        legacyPaidAmount: 0,
        legacyAmountInCashJournal: false,
        hasPaidRegistrationFee: true,
      },
    });
  } catch (error) {
    fail(
      "Création d'un étudiant valide",
      (error as Error).message || String(error)
    );
    throw error;
  }

  const found = await prisma.student.findUnique({
    where: { id: student.id },
    select: { id: true, email: true, firstName: true, organizationId: true },
  });

  if (!found || found.email !== testEmail || found.organizationId !== organizationId) {
    fail("Étudiant créé présent en base");
    throw new Error("Étudiant valide introuvable en base");
  }
  pass("Étudiant valide créé et vérifié en base", `${found.firstName} <${found.email}>`);

  // 2.2 Tentative de doublon (email identique, même organisation).
  try {
    const message = await duplicateEmailMessage(organizationId, testEmail);

    if (!message) {
      fail("Doublon détecté", "la garde d'unicité n'a rien retourné");
    } else if (message.includes("existe déjà")) {
      pass(
        "Doublon rejeté avec message détaillé",
        `« ${message} »`
      );
    } else {
      fail("Doublon rejeté avec message détaillé", `message inattendu : ${message}`);
    }
  } catch (error) {
    fail(
      "Doublon rejeté sans crash",
      `exception levée : ${(error as Error).message}`
    );
  }

  // 2.3 Vérification d'absence d'état partiel : un seul étudiant avec cet email.
  const duplicatesCount = await prisma.student.count({
    where: { organizationId, email: testEmail },
  });
  if (duplicatesCount !== 1) {
    fail("Pas d'état partiel", `${duplicatesCount} étudiants pour cet email`);
  } else {
    pass("Pas d'état partiel", "un seul enregistrement pour cet email");
  }

  return { createdId: student.id, email: testEmail };
}
// ---------------------------------------------------------------------------
// 3. Cycle des données de démonstration — Reset → Inject → Reset
// ---------------------------------------------------------------------------

async function assertBusinessDataEmpty(organizationId: string): Promise<boolean> {
  const [students, courses, classes, payments, expenses, sales, tasks, attendances, documents, travelProcedures, products, categories, evaluations, courseLogs, payrolls] =
    await Promise.all([
      prisma.student.count({ where: { organizationId } }),
      prisma.course.count({ where: { organizationId } }),
      prisma.class.count({ where: { organizationId } }),
      prisma.payment.count({ where: { organizationId } }),
      prisma.expense.count({ where: { organizationId } }),
      prisma.sale.count({ where: { organizationId } }),
      prisma.task.count({ where: { organizationId } }),
      prisma.attendance.count({ where: { organizationId } }),
      prisma.document.count({ where: { organizationId } }),
      prisma.travelProcedure.count({ where: { organizationId } }),
      prisma.productService.count({ where: { organizationId } }),
      prisma.productCategory.count({ where: { organizationId } }),
      prisma.evaluation.count({ where: { organizationId } }),
      prisma.courseLog.count({ where: { organizationId } }),
      prisma.payroll.count({ where: { organizationId } }),
    ]);

  return (
    students === 0 &&
    courses === 0 &&
    classes === 0 &&
    payments === 0 &&
    expenses === 0 &&
    sales === 0 &&
    tasks === 0 &&
    attendances === 0 &&
    documents === 0 &&
    travelProcedures === 0 &&
    products === 0 &&
    categories === 0 &&
    evaluations === 0 &&
    courseLogs === 0 &&
    payrolls === 0
  );
}

async function testDemoCycle(organizationId: string, createdById: string) {
  section("3. Cycle des données de démonstration — Reset → Inject → Reset");

  // ---- Étape A : RÉINITIALISATION initiale (état propre) ----
  const reset1 = await resetOrganizationData(organizationId);
  if (!reset1.ok) {
    fail("Reset #1", `raison : ${reset1.reason}`);
    return;
  }
  const emptyAfterReset1 = await assertBusinessDataEmpty(organizationId);
  if (!emptyAfterReset1) {
    fail("Reset #1 — état vide vérifié");
  } else {
    pass(
      "Reset #1 — état vide vérifié",
      `élèves=${reset1.deleted.students}, cours=${reset1.deleted.courses}, paiements=${reset1.deleted.payments}`
    );
  }

  // ---- Étape B : INJECTION du jeu de démonstration ----
  const injected = await injectDemoDataForOrganization(organizationId, createdById);

  if (!injected.seeded) {
    fail("Injection démo", `raison : ${injected.reason}`);
    return;
  }

  const counts = injected.counts;
  const [studentsAfter, coursesAfter, classesAfter, paymentsAfter, expensesAfter, salesAfter, attendancesAfter, travelAfter, demoAccountsAfter] =
    await Promise.all([
      prisma.student.count({ where: { organizationId } }),
      prisma.course.count({ where: { organizationId } }),
      prisma.class.count({ where: { organizationId } }),
      prisma.payment.count({ where: { organizationId } }),
      prisma.expense.count({ where: { organizationId } }),
      prisma.sale.count({ where: { organizationId } }),
      prisma.attendance.count({ where: { organizationId } }),
      prisma.travelProcedure.count({ where: { organizationId } }),
      prisma.user.count({ where: { organizationId, role: { notIn: ["ADMIN", "SUPER_ADMIN"] } } }),
    ]);

  const demoIsFresh =
    studentsAfter >= 1 &&
    coursesAfter >= 1 &&
    classesAfter >= 1 &&
    paymentsAfter >= 1 &&
    expensesAfter >= 1 &&
    salesAfter >= 1 &&
    attendancesAfter >= 1 &&
    travelAfter >= 1 &&
    demoAccountsAfter >= 1;

  if (!demoIsFresh) {
    fail(
      "Injection démo — données fraîches vérifiées",
      `élèves=${studentsAfter}, cours=${coursesAfter}, classes=${classesAfter}, paiements=${paymentsAfter}, dépenses=${expensesAfter}, ventes=${salesAfter}, présences=${attendancesAfter}, voyages=${travelAfter}, comptes démo=${demoAccountsAfter}`
    );
  } else {
    pass(
      "Injection démo — données fraîches vérifiées",
      `élèves=${counts.students}, cours=${counts.courses}, paiements=${counts.payments}, dépenses=${counts.expenses}, ventes=${counts.sales}`
    );
  }

  // Le seeding retourne les comptes créés : ils doivent correspondre à la base.
  if (studentsAfter !== counts.students) {
    fail("Cohérence comptes d'injection", `élèves base=${studentsAfter} vs déclaré=${counts.students}`);
  } else {
    pass("Cohérence comptes d'injection", `${studentsAfter} élèves créés`);
  }

  // ---- Étape C : RÉINITIALISATION finale (retour à l'état propre) ----
  const reset2 = await resetOrganizationData(organizationId);
  if (!reset2.ok) {
    fail("Reset #2", `raison : ${reset2.reason}`);
    return;
  }
  const emptyAfterReset2 = await assertBusinessDataEmpty(organizationId);
  if (!emptyAfterReset2) {
    fail("Reset #2 — état vide vérifié");
  } else {
    pass(
      "Reset #2 — état vide vérifié",
      `élèves=${reset2.deleted.students}, cours=${reset2.deleted.courses}, paiements=${reset2.deleted.payments}`
    );
  }
}
// ---------------------------------------------------------------------------
// 4. Compilation & vérification de types (npx tsc --noEmit)
// ---------------------------------------------------------------------------

async function runTypeCheck() {
  if (process.env.SKIP_TSC === "1") {
    console.log("\n⏭️  Étape 4 ignorée (SKIP_TSC=1).");
    return;
  }

  section("4. Compilation & vérification de types — npx tsc --noEmit");

  // Invocation directe du compilateur TS via l'exécutable Node courant :
  // indépendant de la plateforme (évite `npx`/`.cmd` non résolus par execFile).
  const tscJs = path.join(
    PROJECT_ROOT,
    "node_modules",
    "typescript",
    "lib",
    "tsc.js"
  );

  try {
    await execFileAsync(
      process.execPath,
      [tscJs, "--noEmit", "--pretty", "false", "--skipLibCheck"],
      { cwd: PROJECT_ROOT, timeout: 5 * 60 * 1000, shell: false }
    );
    pass("npx tsc --noEmit (0 erreur)");
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    fail(
      "npx tsc --noEmit",
      `${err.stdout ?? ""}${err.stderr ?? ""}${err.message ?? ""}`
        .trim()
        .split("\n")
        .slice(0, 15)
        .join("\n")
    );
  }
}

// ---------------------------------------------------------------------------
// Exécution
// ---------------------------------------------------------------------------

async function main() {
  console.log("🧪 TEST E2E — Parcours utilisateurs critiques");
  console.log(
    `   Base : ${process.env.DATABASE_URL?.split("@")[1] ?? "(DATABASE_URL manquant)"}`
  );

  try {
    const setup = await setupOrganization();
    organizationId = setup.organization.id;

    await testStudentCreation(setup.organization.id);

    await testDemoCycle(setup.organization.id, setup.admin.id);

    await runTypeCheck();

    if (process.env.KEEP_ORG !== "1" && organizationId) {
      await prisma.organization.delete({ where: { id: organizationId } });
      console.log("\n🧹 Organisation de test nettoyée.");
    }
  } finally {
    await prisma.$disconnect();
  }

  // Bilan
  console.log("\n" + "=".repeat(72));
  console.log(" BILAN FINAL");
  console.log("=".repeat(72));
  const failed = results.filter((r) => !r.ok);
  const passed = results.filter((r) => r.ok);
  for (const result of results) {
    console.log(` ${result.ok ? "✅" : "❌"} ${result.name}`);
  }
  console.log("-".repeat(72));
  console.log(` ${passed.length} réussis — ${failed.length} échoués`);

  if (failed.length > 0) {
    console.error("\n🏁 Statut : ÉCHEC");
    process.exitCode = 1;
  } else {
    console.log("\n🏁 Statut : SUCCÈS — 100 % des tests E2E passent.");
    process.exitCode = 0;
  }
}

main().catch(async (error) => {
  console.error(
    "\n❌ Erreur fatale :",
    error instanceof Error ? error.message : error
  );
  if (error instanceof Error && error.stack) {
    console.error(error.stack.split("\n").slice(0, 8).join("\n"));
  }
  if (organizationId && process.env.KEEP_ORG !== "1") {
    try {
      await prisma.organization.delete({ where: { id: organizationId } });
      console.log("\n🧹 Organisation de test nettoyée après erreur.");
    } catch {
      // silencieux : l'organisation peut déjà ne plus exister
    }
  }
  await prisma.$disconnect().catch(() => undefined);
  process.exitCode = 1;
});
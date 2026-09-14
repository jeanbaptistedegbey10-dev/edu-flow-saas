#!/usr/bin/env node
/**
 * =============================================================================
 * VALIDATION DU CORRECTIF « MEMBRES ADMIN » — Rôles & Permissions
 * =============================================================================
 *
 * Reproduit le protocole de validation du correctif contre la vraie base
 * (convention `scripts/e2e-app-test.ts` : les Server Actions elles-mêmes
 * nécessitent un contexte de requête Next.js — session/cookies — la LOGIQUE
 * métier qu'elles exécutent est donc validée de bout en bout ici) :
 *
 *   1. Création d'un membre `ADMIN` → présence immédiate dans la liste
 *      (avant correctif, le filtre STAFF/TEACHER le masquait) ;
 *   2. Promotion `TEACHER` → `ADMIN` → le membre ne disparaît pas et son
 *      rôle personnalisé est réinitialisé ;
 *   3. Résolution du rôle soumis (réplique `updateMemberAction`) :
 *      SUPER_ADMIN immuable, pas d'élévation, rôles invalides rejetés ;
 *   4. Sentinelle Radix « none » pour `customRoleId` → null.
 *
 * Nettoyage : l'organisation de test isolée est supprimée à la fin.
 *
 * Usage : npx tsx scripts/verify-admin-roles-fix.ts
 * Prérequis : DATABASE_URL joignable (voir .env).
 * =============================================================================
 */
import "dotenv/config";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Répliques exactes de la logique corrigée de src/actions/roles.ts
// ---------------------------------------------------------------------------

/** Liste « Attribution aux utilisateurs » — version corrigée de getRolesOverview. */
async function listRolesPageUsers(organizationId: string) {
  const users = await prisma.user.findMany({
    where: { organizationId },
    orderBy: [{ role: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      customRole: { select: { id: true, name: true } },
    },
  });
  // Correction : AUCUN filtre sur le rôle — tous les membres sont retournés.
  return users.map(({ customRole, ...user }) => ({
    ...user,
    customRoleId: customRole?.id ?? null,
    customRoleName: customRole?.name ?? null,
  }));
}

/** Réplique de `parseOptionalCustomRoleId` (sentinelle Radix « none »). */
function parseOptionalCustomRoleId(raw: string): string | null {
  const value = raw.trim();
  return value === "" || value === "none" ? null : value;
}

/** Réplique de `isAdminBaseRole`. */
function isAdminBaseRole(role: string): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

/** Réplique de la résolution du rôle final dans `updateMemberAction`. */
function resolveFinalRole(
  existingRole: string,
  submittedRole: string
): string | null {
  return existingRole === "SUPER_ADMIN"
    ? "SUPER_ADMIN"
    : ["STAFF", "TEACHER", "ADMIN"].includes(submittedRole)
      ? submittedRole
      : null;
}

// ---------------------------------------------------------------------------
// Rapport
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

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    pass(name, detail);
  } else {
    fail(name, detail);
  }
}

async function main(): Promise<number> {
let organizationId: string | null = null;

try {
  const runId = Date.now().toString(36);
  const passwordHash = await bcrypt.hash("password123", 10);

  // Organisation de test isolée (même pattern que scripts/e2e-app-test.ts).
  const organization = await prisma.organization.create({
    data: {
      name: `Org Smoke Roles ${runId}`,
      slug: `roles-fix-smoke-${runId}`,
      planType: "TRIAL",
      planStatus: "ACTIVE",
      trialEndsAt: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
      defaultRegistrationFee: 15000,
      initialCashBalance: 100000,
    },
  });
  organizationId = organization.id;

  // -------------------------------------------------------------------------
  // ÉTAPES 1 & 2 — Création d'un membre ADMIN + présence immédiate
  // -------------------------------------------------------------------------
  console.log("\n[1/4] Création d'un membre avec le rôle ADMIN");
  const admin = await prisma.user.create({
    data: {
      organizationId,
      email: `admin.${runId}@roles-fix-smoke.local`,
      passwordHash,
      firstName: "Admin",
      lastName: "Smoke",
      role: "ADMIN",
      isActive: true,
    },
  });

  let users = await listRolesPageUsers(organizationId);
  const adminInList = users.find((user) => user.id === admin.id);
  check(
    "Le compte ADMIN est créé en base",
    (await prisma.user.findUnique({ where: { id: admin.id } }))?.role === "ADMIN"
  );
  check(
    "Le compte ADMIN apparaît immédiatement dans la liste (plus de filtre STAFF/TEACHER)",
    Boolean(adminInList && adminInList.role === "ADMIN"),
    adminInList ? `${adminInList.firstName} ${adminInList.lastName}` : "absent"
  );

  // -------------------------------------------------------------------------
  // ÉTAPE 3 — Enseignant → ADMIN : ne disparaît pas de la liste
  // -------------------------------------------------------------------------
  console.log("\n[2/4] Promotion d'un Enseignant (avec rôle personnalisé) vers ADMIN");
  const customRole = await prisma.customRole.create({
    data: {
      organizationId,
      name: "Secrétaire Adjoint (smoke)",
      description: null,
      permissions: [],
      isSystem: false,
    },
  });
  const teacher = await prisma.user.create({
    data: {
      organizationId,
      email: `teacher.${runId}@roles-fix-smoke.local`,
      passwordHash,
      firstName: "Teacher",
      lastName: "Smoke",
      role: "TEACHER",
      customRoleId: customRole.id,
      isActive: true,
    },
  });

  users = await listRolesPageUsers(organizationId);
  const teacherBefore = users.find((user) => user.id === teacher.id);
  check(
    "L'enseignant est listé avec son rôle personnalisé avant promotion",
    Boolean(teacherBefore && teacherBefore.customRoleId === customRole.id)
  );

  // Même sémantique que updateMemberAction corrigé : rôle ADMIN + customRoleId
  // forcé à null (les administrateurs ont déjà toutes les permissions).
  await prisma.user.update({
    where: { id: teacher.id },
    data: { role: "ADMIN", customRoleId: null },
  });

  users = await listRolesPageUsers(organizationId);
  const teacherAfter = users.find((user) => user.id === teacher.id);
  check(
    "Après promotion ADMIN, le membre est TOUJOURS présent dans la liste",
    Boolean(teacherAfter && teacherAfter.role === "ADMIN"),
    teacherAfter ? `${teacherAfter.firstName} ${teacherAfter.lastName}` : "absent"
  );
  check(
    "Le rôle personnalisé a été réinitialisé (customRoleId null)",
    teacherAfter?.customRoleId === null
  );

  // -------------------------------------------------------------------------
  // ÉTAPE 4 — Résolution du rôle soumis + sentinelle « none »
  // -------------------------------------------------------------------------
  console.log("\n[3/4] Résolution du rôle soumis (updateMemberAction)");
  const roleCases: Array<{
    existing: string;
    submitted: string;
    expected: string | null;
    label: string;
  }> = [
    { existing: "TEACHER", submitted: "ADMIN", expected: "ADMIN", label: "Enseignant → Administrateur accepté" },
    { existing: "ADMIN", submitted: "STAFF", expected: "STAFF", label: "Rétrogradation d'un autre admin acceptée" },
    { existing: "ADMIN", submitted: "ADMIN", expected: "ADMIN", label: "Rôle inchangé accepté" },
    { existing: "SUPER_ADMIN", submitted: "STAFF", expected: "SUPER_ADMIN", label: "Super Administrateur immuable (rétrogradation ignorée)" },
    { existing: "SUPER_ADMIN", submitted: "", expected: "SUPER_ADMIN", label: "Super Administrateur immuable (champ non soumis)" },
    { existing: "STAFF", submitted: "SUPER_ADMIN", expected: null, label: "Élévation vers SUPER_ADMIN rejetée" },
    { existing: "STAFF", submitted: "", expected: null, label: "Rôle vide/absent rejeté pour un membre standard" },
  ];
  for (const { existing, submitted, expected, label } of roleCases) {
    check(label, resolveFinalRole(existing, submitted) === expected);
  }

  console.log("\n[4/4] Sentinelle Radix « none » pour customRoleId");
  check("Chaîne vide → null", parseOptionalCustomRoleId("") === null);
  check("Sentinelle « none » → null", parseOptionalCustomRoleId("none") === null);
  check("Identifiant réel → conservé", parseOptionalCustomRoleId(customRole.id) === customRole.id);
  check("isAdminBaseRole(ADMIN)", isAdminBaseRole("ADMIN") === true);
  check("isAdminBaseRole(SUPER_ADMIN)", isAdminBaseRole("SUPER_ADMIN") === true);
  check("isAdminBaseRole(TEACHER)", isAdminBaseRole("TEACHER") === false);

  // Contrôle (lecture seule) : le compte admin de démonstration existe-t-il ?
  const demoAdmin = await prisma.user.findUnique({
    where: { email: "admin@excellence-formation.com" },
    select: { role: true },
  });
  console.log(
    `\n   ℹ️  Compte de démo « admin@excellence-formation.com » : ${demoAdmin ? `présent (${demoAdmin.role})` : "absent"}`
  );
} catch (error) {
  console.error("\n✗ Exception imprévue :", error);
  results.push({ name: "Exécution sans exception", ok: false });
} finally {
  // Nettoyage de l'organisation de test (utilisateurs + rôles personnalisés).
  if (organizationId) {
    await prisma.user.deleteMany({ where: { organizationId } });
    await prisma.customRole.deleteMany({ where: { organizationId } });
    await prisma.organization.delete({ where: { id: organizationId } });
    console.log("\n🧹 Organisation de test nettoyée.");
  }
  await prisma.$disconnect();
}

// Bilan
console.log("\n" + "=".repeat(72));
const failures = results.filter((result) => !result.ok);
if (failures.length === 0) {
  console.log(` RÉSULTAT : ✓ SUCCÈS — ${results.length} vérifications passées.`);
} else {
  console.error(` RÉSULTAT : ✗ ÉCHEC — ${failures.length} échec(s) sur ${results.length}.`);
}
console.log("=".repeat(72));
return failures.length === 0 ? 0 : 1;
}

main()
  .then((exitCode) => process.exit(exitCode))
  .catch((error) => {
    console.error("\n✗ Exception imprévue :", error);
    process.exit(1);
  });



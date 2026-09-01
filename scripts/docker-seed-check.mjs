// =============================================================================
// EduFlow — Contrôle « base vide ? » pour le seed conditionnel
// =============================================================================
// Code de sortie :
//   0 → la base est VIDE        (le seed doit être exécuté — premier démarrage)
//   1 → des données existent     (seed ignoré)
//   2 → erreur de connexion      (le seed est ignoré ; le log est conservé)
// =============================================================================

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  const count = await prisma.organization.count();
  await prisma.$disconnect();

  if (count === 0) {
    console.log("[eduflow:init] Base vide — seed nécessaire.");
    process.exit(0);
  }

  console.log(
    `[eduflow:init] ${count} organisation(s) déjà présente(s) — seed ignoré.`
  );
  process.exit(1);
} catch (error) {
  console.error(
    "[eduflow:init] Échec du contrôle d'état de la base (seed ignoré) :",
    error instanceof Error ? error.message : error
  );
  await prisma.$disconnect().catch(() => undefined);
  process.exit(2);
}
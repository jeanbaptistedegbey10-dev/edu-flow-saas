"use strict";
// =============================================================================
// EduFlow Desktop — Détecteur de base vide (seed-check)
// =============================================================================
// Code de sortie (identique à `scripts/docker-seed-check.mjs`) :
//   0 → la base est VIDE      (le seed doit s'exécuter — premier démarrage)
//   1 → des données existent   (seed ignoré)
//   2 → erreur de connexion    (seed ignoré ; le log est conservé)
//
// Utilise @prisma/client résolu depuis `prisma-tools/node_modules/`.
// =============================================================================

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

(async () => {
  try {
    const count = await prisma.organization.count();
    await prisma.$disconnect();

    if (count === 0) {
      process.exit(0);
    }
    process.exit(1);
  } catch (error) {
    console.error(
      "[desktop:init] Erreur de connexion (seed-check) :",
      error instanceof Error ? error.message : String(error)
    );
    await prisma.$disconnect().catch(() => undefined);
    process.exit(2);
  }
})();

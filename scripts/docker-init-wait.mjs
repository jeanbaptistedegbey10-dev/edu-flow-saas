// =============================================================================
// EduFlow — Attente de PostgreSQL (initialisation Docker / Desktop)
// =============================================================================
// Boucle de disponibilité avec tentatives avant d'exécuter les migrations.
// Utilise UNIQUEMENT DATABASE_URL/DIRECT_URL fournies par l'environnement
// (aucun chargement de .env nécessaire).
// =============================================================================

import { PrismaClient } from "@prisma/client";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("[eduflow:init] DATABASE_URL n'est pas définie.");
  process.exit(1);
}

const MAX_ATTEMPTS = 30;
const RETRY_DELAY_MS = 2000;

const prisma = new PrismaClient();

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log(`[eduflow:init] PostgreSQL prêt (tentative ${attempt}).`);
    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    await prisma.$disconnect().catch(() => undefined);

    if (attempt === MAX_ATTEMPTS) {
      console.error(
        `[eduflow:init] PostgreSQL injoignable après ${MAX_ATTEMPTS} tentatives.`
      );
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }

    console.log(
      `[eduflow:init] PostgreSQL indisponible (${attempt}/${MAX_ATTEMPTS}) — nouvelle tentative dans ${RETRY_DELAY_MS} ms…`
    );
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  }
}
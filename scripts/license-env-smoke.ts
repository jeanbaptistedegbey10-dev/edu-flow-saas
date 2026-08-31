/**
 * Test de fumée — Cycle complet avec les clés du `.env` :
 *   npx tsx scripts/license-env-smoke.ts
 *
 * Vérifie que LICENSE_PRIVATE_KEY / LICENSE_PUBLIC_KEY sont correctement
 * configurées : génération d'une licence avec la clé privée de la
 * plateforme, puis vérification hors-ligne avec la clé publique.
 */
import "dotenv/config";

import {
  generateLicenseKey,
  verifyLicenseKey,
} from "../src/lib/crypto-license";

const licenseKey = generateLicenseKey({
  organizationId: "org-smoke-test",
  planType: "SAAS_YEARLY",
  expiresAt: new Date(Date.now() + 365 * 86_400_000).toISOString(),
  maxStudents: 250,
});

console.log("Clé générée  :", licenseKey);

const result = verifyLicenseKey(licenseKey);

if (!result.valid) {
  console.error("❌ ÉCHEC :", result.reason);
  process.exit(1);
}

console.log("✅ Vérification hors-ligne réussie avec les clés du .env");
console.log("   Plan       :", result.payload.planType);
console.log("   Expire le  :", result.expiresAt.toISOString());
console.log("   Plafonds   :", result.payload.maxStudents, "étudiants");

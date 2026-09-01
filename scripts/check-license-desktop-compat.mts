/**
 * Vérification de compatibilité entre le vérificateur CJS du Desktop
 * (`desktop/electron/license-verifier.cjs`) et le moteur serveur
 * (`src/lib/crypto-license.ts`).
 *
 * Les deux implémentations doivent être INTERCHANGEABLES : une clé signée par
 * le serveur doit pouvoir être vérifiée par le Desktop et réciproquement, car
 * le format `EDU-…` et les raisons d'invalidité sont partagés.
 *
 * Usage :  npx tsx scripts/check-license-desktop-compat.mts
 *
 * N'a aucune dépendance réseau ni base de données.
 */
import { createRequire } from "node:module";

import {
  generateLicenseKeyPair,
  generateLicenseKey,
  verifyLicenseKey,
} from "../src/lib/crypto-license";

// `require` CommonJS → charge le vérificateur embarqué dans l'exécutable.
const require = createRequire(import.meta.url);
const desktopVerifier = require("../desktop/electron/license-verifier.cjs");

type Result = {
  valid: boolean;
  reason?: string;
  payload?: {
    organizationId: string;
    planType: string;
    expiresAt: string;
    maxStudents?: number;
    maxUsers?: number;
  };
  expiresAt?: Date;
};

let failures = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ✅ ${label}`);
  } else {
    console.error(`  ❌ ${label}`);
    failures += 1;
  }
}

function equal(a: Result, b: Result): boolean {
  if (a.valid !== b.valid) {
    return false;
  }

  if (a.valid) {
    return a.payload?.organizationId === b.payload?.organizationId;
  }

  return a.reason === b.reason;
}

async function main(): Promise<void> {
  console.log("== 1. Couples de clés Ed25519 (serveur ↔ desktop) ==\n");

  const { privateKeyPem, publicKeyPem } = generateLicenseKeyPair();

  console.log("-- Paire de clés générée via src/lib/crypto-license.ts");

  // Sanity : le desktop peut charger une clé PEM SPKI.
  assert(
    publicKeyPem.includes("BEGIN PUBLIC KEY"),
    "Clé publique au format PEM SPKI"
  );

  console.log("\n== 2. Clé de licence valide (vérification croisée) ==\n");

  const payload = {
    organizationId: "org-compat-check",
    planType: "SELF_HOSTED" as const,
    expiresAt: new Date(Date.now() + 86_400_000 * 365).toISOString(),
  };

  const licenseKey = generateLicenseKey(payload, privateKeyPem);

  const serverResult = verifyLicenseKey(licenseKey, publicKeyPem) as Result;
  const desktopResult = desktopVerifier.verifyLicenseKey(
    licenseKey,
    publicKeyPem
  ) as Result;

  assert(serverResult.valid, "Serveur : clé valide acceptée");
  assert(desktopResult.valid, "Desktop : clé valide acceptée");
  assert(
    equal(serverResult, desktopResult),
    "Serveur ↔ Desktop : résultats identiques (clé valide)"
  );

  console.log("\n== 3. Clé signée par une autre clé privée (rejet) ==\n");

  const rogue = generateLicenseKeyPair();
  const forged = generateLicenseKey(payload, rogue.privateKeyPem);

  const serverForged = verifyLicenseKey(forged, publicKeyPem) as Result;
  const desktopForged = desktopVerifier.verifyLicenseKey(
    forged,
    publicKeyPem
  ) as Result;

  assert(!serverForged.valid, "Serveur : clé forgée rejetée");
  assert(!desktopForged.valid, "Desktop : clé forgée rejetée");
  assert(
    equal(serverForged, desktopForged),
    "Serveur ↔ Desktop : résultats identiques (clé forgée)"
  );

  console.log("\n== 4. Clé corrompue (checksum / typo) ==\n");

  const corrupted =
    licenseKey.slice(0, -1) + (licenseKey.endsWith("A") ? "B" : "A");
  const serverCorrupted = verifyLicenseKey(
    corrupted,
    publicKeyPem
  ) as Result;
  const desktopCorrupted = desktopVerifier.verifyLicenseKey(
    corrupted,
    publicKeyPem
  ) as Result;

  assert(!serverCorrupted.valid, "Serveur : clé corrompue rejetée");
  assert(!desktopCorrupted.valid, "Desktop : clé corrompue rejetée");

  console.log("\n== 5. Entrée arbitraire (MALFORMED) ==\n");

  const serverMalformed = verifyLicenseKey("####", publicKeyPem) as Result;
  const desktopMalformed = desktopVerifier.verifyLicenseKey(
    "####",
    publicKeyPem
  ) as Result;

  assert(serverMalformed.reason === "MALFORMED", "Serveur : '####' → MALFORMED");
  assert(
    desktopMalformed.reason === "MALFORMED",
    "Desktop : '####' → MALFORMED"
  );

  console.log("\n== 6. Entrées malveillantes (tirets / casse) ==\n");

  const sloppy = "edu" + licenseKey.slice(4).replace(/-/g, " ").trim();
  const serverSloppy = verifyLicenseKey(sloppy, publicKeyPem) as Result;
  const desktopSloppy = desktopVerifier.verifyLicenseKey(
    sloppy,
    publicKeyPem
  ) as Result;

  assert(serverSloppy.valid, "Serveur : casse/tirets/espaces arbitraires OK");
  assert(
    desktopSloppy.valid,
    "Desktop : casse/tirets/espaces arbitraires OK"
  );

  console.log(`\n== Résultat : ${failures === 0 ? "✅ TOUTE LA COMPATIBILITÉ EST CONFIRMÉE" : `❌ ${failures} échec(s)`} ==`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("❌ Erreur fatale :", error);
  process.exit(1);
});

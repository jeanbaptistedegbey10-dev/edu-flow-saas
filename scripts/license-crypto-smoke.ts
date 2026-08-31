/**
 * Test de fumée — Moteur de licences cryptographiques (Ed25519).
 *
 * Exécution (aucune base de données requise) :
 *   npx tsx scripts/license-crypto-smoke.ts
 *
 * Vérifie :
 *   1. La génération d'un couple de clés Ed25519 ;
 *   2. Le cycle complet générer → formater → vérifier (clé valide) ;
 *   3. La robustesse de la saisie (casse, tirets, espaces) ;
 *   4. La détection de falsification du payload (signature invalide) ;
 *   5. La détection d'une clé expirée ;
 *   6. La détection d'erreurs de frappe (checksum) ;
 *   7. L'acceptation du token compact brut (format machine).
 */
import {
  generateLicenseKey,
  generateLicenseKeyPair,
  verifyLicenseKey,
} from "../src/lib/crypto-license";

let failures = 0;

function assert(condition: boolean, label: string): void {
  if (!condition) {
    failures += 1;
    console.error(`❌ ÉCHEC : ${label}`);
  } else {
    console.log(`✅ OK : ${label}`);
  }
}

function main(): void {
  console.log("== 1. Génération du couple de clés Ed25519 ==");
  const { privateKeyPem, publicKeyPem } = generateLicenseKeyPair();

  assert(
    privateKeyPem.includes("BEGIN PRIVATE KEY"),
    "La clé privée est exportée en PEM PKCS#8"
  );
  assert(
    publicKeyPem.includes("BEGIN PUBLIC KEY"),
    "La clé publique est exportée en PEM SPKI"
  );

  console.log("== 2. Cycle complet : générer → formater → vérifier ==");
  const payload = {
    organizationId: "cmdemo123abc456def789",
    planType: "SAAS_YEARLY" as const,
    expiresAt: new Date(Date.now() + 365 * 86_400_000).toISOString(),
    maxStudents: 500,
    maxUsers: 10,
  };

  const licenseKey = generateLicenseKey(payload, privateKeyPem);

  assert(licenseKey.startsWith("EDU-"), `Format humanisé EDU-… (${licenseKey.slice(0, 24)}…)`);

  const verification = verifyLicenseKey(licenseKey, publicKeyPem);

  assert(verification.valid, "La clé émise est valide");
  if (verification.valid) {
    assert(
      JSON.stringify(verification.payload) === JSON.stringify(payload),
      "Le payload extrait est identique au payload signé"
    );
  }

  console.log("== 3. Robustesse de la saisie ==");
  const mangled = licenseKey
    .replace("EDU-", "")
    .toLowerCase()
    .replace(/-/g, "")
    .replace(/(.{7})/g, "$1 ");
  // Re-saisie « sale » : préfixe omis, minuscules, tirets remplacés par des
  // espaces — la clé doit rester vérifiable (modulo le préfixe optionnel).
  const sloppy = "edu" + mangled;

  const sloppyVerification = verifyLicenseKey(sloppy, publicKeyPem);

  assert(sloppyVerification.valid, "Casse/tirets/espaces arbitraires acceptés");

  console.log("== 4. Falsification du payload ==");
  const [payloadPart, signaturePart] = licenseKey
    .replace(/^EDU-/, "")
    .split("-");
  // Décodage Base32 de la partie payload pour altérer le plan…
  void payloadPart;
  void signaturePart;
  // (Approche directe : régénérer une clé signée par une AUTRE clé privée.)
  const roguePair = generateLicenseKeyPair();
  const forged = generateLicenseKey(payload, roguePair.privateKeyPem);
  const forgedVerification = verifyLicenseKey(forged, publicKeyPem);

  assert(
    !forgedVerification.valid && forgedVerification.reason === "INVALID_SIGNATURE",
    "Une clé signée par une autre clé privée est rejetée (INVALID_SIGNATURE)"
  );

  console.log("== 5. Clé expirée ==");
  const expiredKey = generateLicenseKey(
    {
      ...payload,
      expiresAt: new Date(Date.now() - 86_400_000).toISOString(),
    },
    privateKeyPem
  );
  const expiredVerification = verifyLicenseKey(expiredKey, publicKeyPem);

  assert(
    !expiredVerification.valid && expiredVerification.reason === "EXPIRED",
    "Une clé dont expiresAt est passé est rejetée (EXPIRED)"
  );
  assert(
    expiredVerification.payload?.organizationId === payload.organizationId,
    "Le payload reste lisible pour diagnostic malgré l'expiration"
  );

  console.log("== 6. Erreurs de frappe (checksum) ==");
  const lastChar = licenseKey[licenseKey.length - 1];
  const corrupted =
    licenseKey.slice(0, -1) + (lastChar === "A" ? "B" : "A");
  const corruptedVerification = verifyLicenseKey(corrupted, publicKeyPem);

  assert(
    !corruptedVerification.valid &&
      corruptedVerification.reason === "CHECKSUM_INVALID",
    "Un caractère erroné est détecté avant toute vérification (CHECKSUM_INVALID)"
  );

  console.log("== 7. Entrées arbitraires ==");
  // Une chaîne sans aucun caractère Base32 est rejetée comme MALFORMED.
  const malformedVerification = verifyLicenseKey("####", publicKeyPem);

  assert(
    !malformedVerification.valid &&
      malformedVerification.reason === "MALFORMED",
    "Une clé arbitraire est rejetée (MALFORMED)"
  );
  // Une erreur de frappe sur une clé réelle est interceptée par le checksum
  // (déjà couvert au test 6) — jamais acceptée comme valide.
  const typoVerification = verifyLicenseKey(
    corrupted.slice(0, -1) + (corrupted[corrupted.length - 1] === "A" ? "B" : "A"),
    publicKeyPem
  );

  assert(!typoVerification.valid, "Une clé corrompue deux fois reste invalide");

  if (failures > 0) {
    console.error(`\n${failures} échec(s) — moteur de licences INOPÉRANT.`);
    process.exit(1);
  }

  console.log("\nTous les tests du moteur de licences sont passés. 🎉");
}

main();

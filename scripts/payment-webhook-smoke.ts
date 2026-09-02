/**
 * Test de fumée — Vérification de signature des webhooks de paiement.
 *   npx tsx scripts/payment-webhook-smoke.ts
 *
 * Exercé sur la VRAIE routine `verifyWebhookSignature` de src/lib/payment.ts
 * (sans toucher au .env) :
 *   - Fedapay : signature authentique acceptée ; corps falsifié rejeté ;
 *     en-tête manquant rejeté ; rejeu (horodatage > 5 min) rejeté ;
 *   - Kkiapay : secret correct accepté ; secret incorrect rejeté.
 */
import "dotenv/config";
import { createHmac } from "node:crypto";

import { verifyWebhookSignature } from "../src/lib/payment";

const TEST_WEBHOOK_SECRET = "whsec_local_smoke_test_secret";
const BODY = JSON.stringify({
  id: "t_123",
  name: "transaction.approved",
  entity: {
    id: "t_123",
    amount: 15000,
    status: "approved",
    custom_data: {
      organizationId: "org-smoke",
      planType: "SAAS_CLOUD",
      durationMonths: 12,
    },
  },
});

/** Reproduit le schéma Fedapay : `t=<ts>,v1=<hmac>` avec HMAC-SHA256. */
function makeFedapayHeader(
  secret: string,
  rawBody: string,
  timestampMs = Date.now()
): string {
  const timestampSec = Math.floor(timestampMs / 1000);
  const hmac = createHmac("sha256", secret)
    .update(`${timestampSec}.${rawBody}`)
    .digest("hex");

  return `t=${timestampSec},v1=${hmac}`;
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`❌ ${message}`);
    process.exit(1);
  }
  console.log(`✅ ${message}`);
}

function main(): void {
  // Surcharge locale de l'environnement (uniquement pour ce test).
  process.env.PAYMENT_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;

  // 1. Fedapay : signature authentique → acceptée.
  const validHeader = makeFedapayHeader(TEST_WEBHOOK_SECRET, BODY);
  const ok = verifyWebhookSignature(
    "fedapay",
    BODY,
    TEST_WEBHOOK_SECRET,
    new Headers({ "x-fedapay-signature": validHeader })
  );
  assert(ok.valid, "Fedapay : signature authentique acceptée");

  // 2. Fedapay : corps falsifié → rejetée (la signature ne correspond pas).
  const tamperedBody = BODY.replace("15000", "15001");
  const tampered = verifyWebhookSignature(
    "fedapay",
    tamperedBody,
    TEST_WEBHOOK_SECRET,
    new Headers({ "x-fedapay-signature": validHeader })
  );
  assert(!tampered.valid, "Fedapay : corps falsifié rejeté");

  // 3. Fedapay : en-tête absent → rejetée (fail-closed).
  const missing = verifyWebhookSignature("fedapay", BODY, TEST_WEBHOOK_SECRET, new Headers());
  assert(!missing.valid, "Fedapay : en-tête absent rejeté");

  // 4. Fedapay : signature rejouée (horodatage > 5 min) → rejetée.
  const staleHeader = makeFedapayHeader(
    TEST_WEBHOOK_SECRET,
    BODY,
    Date.now() - 10 * 60 * 1000
  );
  const replayed = verifyWebhookSignature(
    "fedapay",
    BODY,
    TEST_WEBHOOK_SECRET,
    new Headers({ "x-fedapay-signature": staleHeader })
  );
  assert(!replayed.valid, "Fedapay : rejeu (horodatage trop ancien) rejeté");

  // 5. Kkiapay : secret correct → acceptée.
  const kkOk = verifyWebhookSignature(
    "kkiapay",
    BODY,
    TEST_WEBHOOK_SECRET,
    new Headers({ "x-kkiapay-secret": TEST_WEBHOOK_SECRET })
  );
  assert(kkOk.valid, "Kkiapay : secret correct accepté");

  // 6. Kkiapay : secret incorrect → rejetée.
  const kkBad = verifyWebhookSignature(
    "kkiapay",
    BODY,
    TEST_WEBHOOK_SECRET,
    new Headers({ "x-kkiapay-secret": "secret-falsifie" })
  );
  assert(!kkBad.valid, "Kkiapay : secret incorrect rejeté");

  console.log("\n🎉 Tous les contrôles de signature passent.");
}

main();
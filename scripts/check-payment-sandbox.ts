/**
 * Smoke test — Mode démo/sandbox du paiement en ligne (KKiapay).
 *
 * Vérifie que `getPaymentConfig()` / `isPaymentGatewayConfigured()` /
 * `getKkiapayWidgetConfig()` basculent bien en mode démo/sandbox quand aucune
 * clé réelle n'est fournie (instance vierge), de sorte que la page
 * `/dashboard/billing` affiche des boutons cliquables (widget sandbox) au
 * lieu de bloquer le composant.
 *
 * Exécution : npx tsx scripts/check-payment-sandbox.ts
 */
import "dotenv/config";

import {
  getKkiapayWidgetConfig,
  getPaymentConfig,
  isPaymentGatewayConfigured,
} from "@/lib/payment";

let failed = false;

function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "✅" : "❌"} ${label}${detail ? ` — ${String(detail)}` : ""}`);
  if (!ok) failed = true;
}

function clearPaymentEnv() {
  delete process.env.PAYMENT_PROVIDER;
  delete process.env.PAYMENT_PUBLIC_KEY;
  delete process.env.PAYMENT_SECRET_KEY;
  delete process.env.PAYMENT_WEBHOOK_SECRET;
  delete process.env.PAYMENT_SANDBOX;
}

function main() {
  console.log("=== 1. Avec .env (clés sandbox explicites) ===");
  const fromEnv = getPaymentConfig();
  check("provider = kkiapay", fromEnv.provider === "kkiapay", fromEnv.provider);
  check(
    "clé publique sandbox",
    fromEnv.publicKey === "public_key_sandbox_test",
    fromEnv.publicKey
  );
  check("sandbox = true", fromEnv.sandbox === true, fromEnv.sandbox);
  check("passerelle considérée configurée", isPaymentGatewayConfigured() === true);
  check("widget Kkiapay disponible", getKkiapayWidgetConfig() !== null);

  console.log("\n=== 2. Instance vierge (aucune clé, sandbox par défaut) ===");
  clearPaymentEnv();
  const fallback = getPaymentConfig();
  check(
    "provider forcé sur kkiapay (mode démo)",
    fallback.provider === "kkiapay",
    fallback.provider
  );
  check(
    "clé publique = public_key_sandbox_test",
    fallback.publicKey === "public_key_sandbox_test",
    fallback.publicKey
  );
  check(
    "clé secrète = secret_key_sandbox_test",
    fallback.secretKey === "secret_key_sandbox_test",
    fallback.secretKey
  );
  check("sandbox = true", fallback.sandbox === true, fallback.sandbox);
  check("passerelle considérée configurée", isPaymentGatewayConfigured() === true);
  check("widget Kkiapay disponible (bouton cliquable)", getKkiapayWidgetConfig() !== null);

  console.log("\n=== 3. Production (sandbox=false, aucune clé) ===");
  clearPaymentEnv();
  process.env.PAYMENT_SANDBOX = "false";
  const prod = getPaymentConfig();
  check(
    "passerelle NON configurée (blocage conservé en prod)",
    isPaymentGatewayConfigured() === false
  );
  check(
    "widget indisponible",
    getKkiapayWidgetConfig() === null,
    `publicKey="${prod.publicKey || "vide"}"`
  );

  console.log(failed ? "\n❌ ÉCHEC — un ou plusieurs contrôles ne passent pas." : "\n🎉 Tous les contrôles passent.");
  process.exitCode = failed ? 1 : 0;
}

main();

/**
 * Smoke test — Passerelle FedaPay (mode Live / mode démo sandbox).
 *
 * Vérifie que `getPaymentConfig()` / `isPaymentGatewayConfigured()` /
 * `getFedapayWidgetConfig()` résolvent correctement FedaPay :
 *   1. mode Live  (`PAYMENT_PROVIDER_MODE="live"`) → provider = fedapay,
 *      sandbox = false, widget `environment: "live"`, AUCUNE clé de test ;
 *   2. instance vierge → repli sur les clés de test (boutons cliquables) ;
 *   3. production sans clé → passerelle NON configurée (blocage conservé).
 *
 * Exécution : npx tsx scripts/check-payment-sandbox.ts
 */
import "dotenv/config";

import {
  getFedapayWidgetConfig,
  getPaymentConfig,
  isPaymentGatewayConfigured,
} from "@/lib/payment";

let failed = false;

function check(label: string, ok: boolean, detail?: unknown) {
  const suffix = detail === undefined ? "" : ` — ${String(detail)}`;
  console.log(`${ok ? "✅" : "❌"} ${label}${suffix}`);
  if (!ok) failed = true;
}

function clearPaymentEnv() {
  delete process.env.PAYMENT_PROVIDER;
  delete process.env.PAYMENT_PROVIDER_MODE;
  delete process.env.PAYMENT_PUBLIC_KEY;
  delete process.env.PAYMENT_SECRET_KEY;
  delete process.env.PAYMENT_WEBHOOK_SECRET;
  delete process.env.PAYMENT_SANDBOX;
  delete process.env.NEXT_PUBLIC_FEDAPAY_PUBLIC_KEY;
  delete process.env.FEDAPAY_PUBLIC_KEY;
  delete process.env.FEDAPAY_SECRET_KEY;
}

function main() {
  console.log("=== 1. Mode Live (PAYMENT_PROVIDER_MODE=live, clés FedaPay réelles) ===");
  clearPaymentEnv();
  process.env.PAYMENT_PROVIDER = "fedapay";
  process.env.PAYMENT_PROVIDER_MODE = "live";
  process.env.NEXT_PUBLIC_FEDAPAY_PUBLIC_KEY = "pk_live_test";
  process.env.FEDAPAY_SECRET_KEY = "sk_live_test";
  process.env.PAYMENT_WEBHOOK_SECRET = "whsec_live_test";

  const live = getPaymentConfig();
  check("provider = fedapay", live.provider === "fedapay", live.provider);
  check("clé publique = pk_live_test", live.publicKey === "pk_live_test", live.publicKey);
  check("clé secrète = sk_live_test", live.secretKey === "sk_live_test", live.secretKey);
  check("sandbox = false", live.sandbox === false, live.sandbox);
  check("passerelle configurée", isPaymentGatewayConfigured() === true);

  const liveWidget = getFedapayWidgetConfig();
  check("widget FedaPay disponible", liveWidget !== null);
  check(
    "environnement du widget = live",
    liveWidget?.environment === "live",
    liveWidget?.environment
  );
  check(
    "script officiel fedapay.js",
    liveWidget?.scriptUrl === "https://cdn.fedapay.com/fedapay.js",
    liveWidget?.scriptUrl
  );

  console.log("\n=== 2. Instance vierge (aucune clé, sandbox par défaut) ===");
  clearPaymentEnv();
  const fallback = getPaymentConfig();
  check(
    "provider = fedapay (mode démo)",
    fallback.provider === "fedapay",
    fallback.provider
  );
  check(
    "clé publique de test = pk_sandbox_test",
    fallback.publicKey === "pk_sandbox_test",
    fallback.publicKey
  );
  check(
    "clé secrète de test = sk_sandbox_test",
    fallback.secretKey === "sk_sandbox_test",
    fallback.secretKey
  );
  check("sandbox = true", fallback.sandbox === true, fallback.sandbox);
  check("passerelle configurée", isPaymentGatewayConfigured() === true);

  const demoWidget = getFedapayWidgetConfig();
  check("widget FedaPay disponible (bouton cliquable)", demoWidget !== null);
  check(
    "environnement du widget = sandbox",
    demoWidget?.environment === "sandbox",
    demoWidget?.environment
  );

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
    getFedapayWidgetConfig() === null,
    `publicKey="${prod.publicKey || "vide"}"`
  );

  console.log(failed ? "\n❌ ÉCHEC — un ou plusieurs contrôles ne passent pas." : "\n🎉 Tous les contrôles passent.");
  process.exitCode = failed ? 1 : 0;
}

main();

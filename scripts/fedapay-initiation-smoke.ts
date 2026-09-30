/**
 * Test de fumée — Démarrage du paiement FedaPay (hôte API + guichet).
 *   npx tsx scripts/fedapay-initiation-smoke.ts
 *
 * Exercé sur la VRAIE routine `initiateFedapayCheckout` de src/lib/payment.ts
 * (aucun réseau, aucune clé réelle : le `fetch` est substitué) :
 *   - clé `pk_live_*` → hôte PRODUCTION https://api.fedapay.com (jamais
 *     sandbox, même si le drapeau `sandbox` vaut true) ;
 *   - clé `pk_sandbox_*` → hôte Sandbox officiel https://sandbox-api.fedapay.com
 *     (régression : l'ancien hôte « api-sandbox.fedapay.com » n'existe pas) ;
 *   - clés non préfixées → hôte selon le drapeau `sandbox` ;
 *   - réponse de création plate `{ id }`, enveloppée `{ v1: { transaction } }`
 *     OU enveloppée `{ "v1/transaction": { id } }` acceptées pour extraire
 *     l'identifiant de transaction ;
 *   - token → URL de guichet transmise au client (champ `url` de FedaPay, ou
 *     reconstruite checkout.fedapay.com/<token> ; enveloppes `v1` et
 *     `v1/token` acceptées) ;
 *   - échec HTTP 401 → cause PRÉCISE (statut + corps FedaPay) au lieu du
 *     message générique « Impossible de joindre la passerelle ».
 */
import "dotenv/config";

import {
  initiateFedapayCheckout,
  resolveFedapayApiBaseUrl,
  type InitiateSubscriptionInput,
  type SubscriptionPrice,
} from "../src/lib/payment";

/** Entrée d'initiation de test (formule SaaS Cloud, 12 mois). */
const INPUT: InitiateSubscriptionInput = {
  organizationId: "org-smoke",
  organizationName: "École Test",
  planType: "SAAS_CLOUD",
  durationMonths: 12,
  customerEmail: "admin@ecole-test.bj",
  customerPhone: null,
};

/** Tarif facturable de test (50 000 XOF, renouvellement 12 mois). */
const PRICING: SubscriptionPrice = {
  planType: "SAAS_CLOUD",
  durationMonths: 12,
  amount: 50000,
  currency: "XOF",
  kind: "RENEWAL_ANNUAL",
  isInitial: false,
  label: "SaaS Cloud — Renouvellement 12 mois",
};

/** Config FedaPay minimaliste (même forme que `getPaymentConfig`). */
function fedapayConfig(publicKey: string, secretKey: string, sandbox: boolean) {
  return {
    provider: "fedapay" as const,
    publicKey,
    secretKey,
    webhookSecret: "whsec_smoke_test",
    sandbox,
  };
}

type StubOutcome = { status: number; body: unknown };
type StubCall = { url: string; init?: RequestInit };

/** Substitue `fetch` : enregistre chaque appel et répond selon `responder`. */
function makeFetchStub(responder: (url: string) => StubOutcome) {
  const calls: StubCall[] = [];

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : String(input);
    calls.push({ url, init });
    const outcome = responder(url);

    return new Response(JSON.stringify(outcome.body), {
      status: outcome.status,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;

  return { calls, fetchImpl };
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`❌ ${message}`);
    process.exit(1);
  }
  console.log(`✅ ${message}`);
}

async function main(): Promise<void> {
  // ------------------------------------------------------------------
  // 1. Résolution de l'hôte API selon les clés.
  // ------------------------------------------------------------------
  assert(
    resolveFedapayApiBaseUrl("pk_live_abc123", "sk_live_xyz", false) ===
      "https://api.fedapay.com",
    "pk_live_* → Production https://api.fedapay.com"
  );
  assert(
    resolveFedapayApiBaseUrl("pk_live_abc123", "", true) ===
      "https://api.fedapay.com",
    "pk_live_* → Production MÊME si le drapeau sandbox vaut true (la clé prime)"
  );
  assert(
    resolveFedapayApiBaseUrl("", "sk_live_abc", true) ===
      "https://api.fedapay.com",
    "sk_live_* (clé secrète) → Production"
  );
  assert(
    resolveFedapayApiBaseUrl("pk_sandbox_abc", "sk_sandbox_xyz", true) ===
      "https://sandbox-api.fedapay.com",
    "pk_sandbox_* → Sandbox officielle https://sandbox-api.fedapay.com (plus d'hôte « api-sandbox » inexistant)"
  );
  assert(
    resolveFedapayApiBaseUrl("pk_autre", "sk_autre", true) ===
      "https://sandbox-api.fedapay.com",
    "clés non préfixées + drapeau sandbox → Sandbox"
  );
  assert(
    resolveFedapayApiBaseUrl("pk_autre", "sk_autre", false) ===
      "https://api.fedapay.com",
    "clés non préfixées + drapeau production → Production"
  );

  // ------------------------------------------------------------------
  // 2. Clé LIVE + drapeau sandbox=true → guichet créé sur la PRODUCTION.
  // ------------------------------------------------------------------
  {
    const { calls, fetchImpl } = makeFetchStub((url) =>
      url.endsWith("/token")
        ? {
            status: 200,
            body: {
              token: "tok_smoke_1",
              url: "https://checkout.fedapay.com/tok_smoke_1",
            },
          }
        : { status: 201, body: { id: 4242, reference: "TX-SMOKE-1" } }
    );

    const checkoutUrl = await initiateFedapayCheckout(
      INPUT,
      "EDU-1-SMOKE",
      fedapayConfig("pk_live_smoke", "sk_live_smoke", true),
      PRICING,
      fetchImpl
    );

    assert(
      calls[0]?.url === "https://api.fedapay.com/v1/transactions",
      "création de transaction POSTée sur la PRODUCTION (api.fedapay.com)"
    );
    assert(
      calls[1]?.url === "https://api.fedapay.com/v1/transactions/4242/token",
      "token généré via POST /v1/transactions/4242/token (id extrait de la réponse plate { id })"
    );
    const headers = (calls[0]?.init?.headers ?? {}) as Record<string, string>;
    assert(
      headers.Authorization === "Bearer sk_live_smoke",
      "clé secrète envoyée en Bearer (aucune clé logguée)"
    );
    const body = String(calls[0]?.init?.body ?? "");
    assert(
      body.includes('"merchant_reference":"EDU-1-SMOKE"') &&
        body.includes('"organizationId":"org-smoke"'),
      "référence + metadata (custom_data) transmises à la transaction"
    );
    assert(
      checkoutUrl === "https://checkout.fedapay.com/tok_smoke_1",
      "URL de guichet (champ `url` de FedaPay) retournée pour redirection client"
    );
  }

  // ------------------------------------------------------------------
  // 3. Clé sandbox + réponse enveloppée { v1 } + token sans `url`.
  // ------------------------------------------------------------------
  {
    const { calls, fetchImpl } = makeFetchStub((url) =>
      url.endsWith("/token")
        ? { status: 200, body: { token: "tok_smoke_2" } }
        : {
            status: 201,
            body: { v: "v1", v1: { transaction: { id: 777 } } },
          }
    );

    const checkoutUrl = await initiateFedapayCheckout(
      INPUT,
      "EDU-2-SMOKE",
      fedapayConfig("pk_sandbox_smoke", "sk_sandbox_smoke", true),
      PRICING,
      fetchImpl
    );

    assert(
      calls[0]?.url === "https://sandbox-api.fedapay.com/v1/transactions",
      "clé sandbox → création POSTée sur https://sandbox-api.fedapay.com"
    );
    assert(
      calls[1]?.url ===
        "https://sandbox-api.fedapay.com/v1/transactions/777/token",
      "id extrait de la réponse enveloppée { v1: { transaction: { id } } }"
    );
    assert(
      checkoutUrl ===
        "https://checkout.fedapay.com/tok_smoke_2?reference=EDU-2-SMOKE",
      "token sans `url` → guichet reconstruit checkout.fedapay.com/<token>"
    );
  }

  // ------------------------------------------------------------------
  // 4. Enveloppe `v1/transaction` (réponse de création) + `v1/token`
  //    (génération du token) — formes renvoyées par certaines versions
  //    de l'API FedaPay (même préfixe d'entité que les webhooks).
  // ------------------------------------------------------------------
  {
    const { calls, fetchImpl } = makeFetchStub((url) =>
      url.endsWith("/token")
        ? { status: 200, body: { "v1/token": { token: "tok_smoke_3", url: "https://checkout.fedapay.com/tok_smoke_3" } } }
        : {
            status: 201,
            body: { v: "v1", "v1/transaction": { id: 8888 } },
          }
    );

    const checkoutUrl = await initiateFedapayCheckout(
      INPUT,
      "EDU-4-SMOKE",
      fedapayConfig("pk_live_smoke", "sk_live_smoke", false),
      PRICING,
      fetchImpl
    );

    assert(
      calls[1]?.url === "https://api.fedapay.com/v1/transactions/8888/token",
      "id extrait de la réponse enveloppée { \"v1/transaction\": { id } }"
    );
    assert(
      checkoutUrl === "https://checkout.fedapay.com/tok_smoke_3",
      "token extrait de l'enveloppe { \"v1/token\": { token, url } } (url renvoyée)"
    );
  }

  // ------------------------------------------------------------------
  // 5. Échec HTTP 401 → cause PRÉCISE (statut + corps FedaPay).
  // ------------------------------------------------------------------
  {
    const { fetchImpl } = makeFetchStub(() => ({
      status: 401,
      body: { code: "unauthorized", message: "Invalid API key" },
    }));

    try {
      await initiateFedapayCheckout(
        INPUT,
        "EDU-3-SMOKE",
        fedapayConfig("pk_live_bad", "sk_live_bad", false),
        PRICING,
        fetchImpl
      );
      assert(false, "erreur 401 non levée — le guichet ne doit pas s'ouvrir");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      assert(
        message.includes("401") && message.includes("Invalid API key"),
        `échec 401 → cause PRÉCISE propagée (« ${message.slice(0, 90)} ») au lieu du message générique`
      );
    }
  }

  console.log("\n🎉 Tous les contrôles d'initiation FedaPay passent.");
}

main().catch((error) => {
  console.error("💥 Échec inattendu du test de fumée :", error);
  process.exit(1);
});

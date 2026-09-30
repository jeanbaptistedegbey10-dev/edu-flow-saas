/**
 * Test de régression — verrouillage du mode bac à sable (simulation).
 *
 * OBJECTIF DE SÉCURITÉ : les clés de test de `SANDBOX_TEST_KEYS` sont
 * versionnées dans le dépôt (donc publiques). Leur `webhookSecret` permet
 * de FORGER une notification de paiement. Le repli sandbox ne doit donc
 * JAMAIS se produire lorsque `NODE_ENV === "production"`.
 *
 * Règle : sandbox autorisé si
 *   1. `PAYMENT_PROVIDER_MODE === "sandbox"`, OU
 *   2. `NODE_ENV !== "production"`.
 *
 * Exécution : npx tsx scripts/check-payment-sandbox-lock.ts
 */
import {
  getPaymentConfig,
  isPaymentSandboxEnabled,
  isTestWebhookSecret,
} from "../src/lib/payment";

const ENV_KEYS = [
  "NODE_ENV",
  "PAYMENT_PROVIDER_MODE",
  "PAYMENT_SANDBOX",
  "PAYMENT_PUBLIC_KEY",
  "PAYMENT_SECRET_KEY",
  "PAYMENT_WEBHOOK_SECRET",
  "PAYMENT_PROVIDER",
] as const;

type EnvKey = (typeof ENV_KEYS)[number];

const saved = new Map<EnvKey, string | undefined>();
for (const key of ENV_KEYS) saved.set(key, process.env[key]);

/** Applique un scénario d'environnement puis lance les assertions. */
function scenario(
  label: string,
  env: Partial<Record<EnvKey, string>>,
  expect: {
    sandbox: boolean;
    webhookSecret: string;
    configured: boolean;
    /**
     * `true` si ce scénario active le bac à sable de façon VOLONTAIRE
     * (développement, ou opt-in explicite via PAYMENT_PROVIDER_MODE).
     * Dans ce cas, l'usage d'un secret de test est le comportement attendu —
     * le webhook refusera par ailleurs de l'accepter en production.
     */
    optIn?: boolean;
  }
) {
  for (const key of ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(env)) {
    // `NODE_ENV` est typé en lecture seule par @types/node ; le cast est
    // local au script de test (l'environnement du process reste modifiable).
    (process.env as Record<string, string | undefined>)[key as string] = value;
  }

  const config = getPaymentConfig();
  const allowed = isPaymentSandboxEnabled();
  const failures: string[] = [];

  if (allowed !== expect.sandbox) {
    failures.push(
      `isPaymentSandboxEnabled() = ${allowed}, attendu ${expect.sandbox}`
    );
  }
  if (config.sandbox !== expect.sandbox) {
    failures.push(`config.sandbox = ${config.sandbox}, attendu ${expect.sandbox}`);
  }
  if (config.webhookSecret !== expect.webhookSecret) {
    failures.push(
      `webhookSecret = "${config.webhookSecret}", attendu "${expect.webhookSecret}"`
    );
  }

  // Un secret de test public n'est toléré que si le bac à sable a été
  // demandé VOLONTAIREMENT. En production sans opt-in, c'est une faille.
  const isProductionWithoutOptIn =
    process.env.NODE_ENV === "production" &&
    (env.PAYMENT_PROVIDER_MODE ?? "").toLowerCase() !== "sandbox";

  if (isTestWebhookSecret(config.webhookSecret) && isProductionWithoutOptIn) {
    failures.push(
      "Secret de webhook de TEST public utilisé en production sans opt-in : " +
        "un attaquant pourrait forger une notification de paiement."
    );
  }

  console.log(`\n${label}`);
  console.log(
    `  sandbox=${config.sandbox}  webhookSecret="${config.webhookSecret || "(vide)"}"`
  );

  if (failures.length > 0) {
    for (const failure of failures) console.error(`  ECHEC : ${failure}`);
    process.exitCode = 1;
  } else {
    console.log("  OK");
  }
}

// 1. Production SANS configuration : aucun repli sandbox (corrige la faille).
scenario(
  "1. Production, aucune clé (le cas dangereux)",
  { NODE_ENV: "production" },
  { sandbox: false, webhookSecret: "", configured: false }
);

// 2. Production avec clés réelles : le tunnel fonctionne normalement.
scenario(
  "2. Production avec clés réelles",
  {
    NODE_ENV: "production",
    PAYMENT_PUBLIC_KEY: "pk_live_abc",
    PAYMENT_SECRET_KEY: "sk_live_abc",
    PAYMENT_WEBHOOK_SECRET: "whsec_live_abc",
  },
  { sandbox: false, webhookSecret: "whsec_live_abc", configured: true }
);

// 3. Production + opt-in explicite du bac à sable (recette hébergée).
scenario(
  "3. Production + PAYMENT_PROVIDER_MODE=sandbox (opt-in)",
  { NODE_ENV: "production", PAYMENT_PROVIDER_MODE: "sandbox" },
  {
    sandbox: true,
    webhookSecret: "whsec_sandbox_test",
    configured: true,
  }
);

// 4. Développement : le bac à sable reste disponible par défaut.
scenario("4. Développement (sandbox par défaut)", { NODE_ENV: "development" }, {
  sandbox: true,
  webhookSecret: "whsec_sandbox_test",
  configured: true,
});

// 5. Désactivation explicite prioritaire, même hors production.
scenario(
  "5. Développement + PAYMENT_SANDBOX=false",
  { NODE_ENV: "development", PAYMENT_SANDBOX: "false" },
  { sandbox: false, webhookSecret: "", configured: false }
);

// Restauration de l'environnement.
for (const [key, value] of saved) {
  if (value === undefined) delete process.env[key];
  else (process.env as Record<string, string | undefined>)[key] = value;
}

console.log(
  process.exitCode === 1
    ? "\n=== ECHEC ==="
    : "\n=== OK : le bac à sable est correctement verrouillé en production. ==="
);

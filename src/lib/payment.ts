// --------------------------------------
// Passerelle de paiement Mobile Money / Carte (Kkiapay & Fedapay)
// --------------------------------------
//
// Module SERVEUR uniquement : il manipule les clés secrètes de l'agrégateur
// et la clé privée de licence Ed25519. Ne jamais l'importer depuis un
// composant client — passer par une Server Action (src/actions/billing.ts).
//
// Sources (documentation officielle) :
// - Fedapay  : POST /v1/transactions puis POST /v1/transactions/{id}/token
//              (https://docs.fedapay.com/api-reference/transactions/) ;
//              webhook signé via l'en-tête `X-FEDAPAY-SIGNATURE`
//              (schéma `t=<timestamp>,s=<hmac>` — HMAC-SHA256 sur
//              `<timestamp>.<corps brut>`, cf. docs.fedapay.com Webhooks).
// - Kkiapay  : initiation via le widget client (cdn.kkiapay.me/k.js,
//              global `openKkiapayWidget`) ; webhook notifié avec
//              l'en-tête `x-kkiapay-secret` portant le « secret hash »
//              configuré dans le tableau de bord (cf. docs.kkiapay.me,
//              page Webhook). Payload : `transaction.success` /
//              `transaction.failed`, champ `isPaymentSucces` (sic).

import { createHmac, timingSafeEqual } from "node:crypto";

import {
  addMonths,
  generateLicenseKey,
  verifyLicenseKey,
  type LicensePayload,
} from "@/lib/crypto-license";
import { prisma } from "@/lib/prisma";

// --------------------------------------
// Tarification des offres SaaS (XOF / FCFA)
// --------------------------------------

/** Offres d'abonnement achetables en ligne via la passerelle. */
export type SaasPlanType = "SAAS_MONTHLY" | "SAAS_YEARLY";

export const SAAS_PLAN_TYPES: readonly SaasPlanType[] = [
  "SAAS_MONTHLY",
  "SAAS_YEARLY",
] as const;

/** Définition d'une offre commerciale (source de vérité des prix). */
export type SaasPlanDefinition = {
  planType: SaasPlanType;
  /** Libellé commercial affiché dans l'UI. */
  label: string;
  /** Prix en XOF (FCFA) — pas de centimes dans la zone UEMOA. */
  amountXOF: number;
  /** Durée de validité de la licence générée. */
  periodMonths: number;
  /** Accroche marketing affichée sous le prix. */
  tagline: string;
};

/**
 * Grille tarifaire du SaaS :
 * - Mensuel  : 15 000 XOF / mois ;
 * - Annuel   : 150 000 XOF / an (soit 2 mois offerts vs. le mensuel).
 */
export const SAAS_PLAN_PRICES: Record<SaasPlanType, SaasPlanDefinition> = {
  SAAS_MONTHLY: {
    planType: "SAAS_MONTHLY",
    label: "Abonnement mensuel",
    amountXOF: 15_000,
    periodMonths: 1,
    tagline: "Flexibilité totale, sans engagement.",
  },
  SAAS_YEARLY: {
    planType: "SAAS_YEARLY",
    label: "Abonnement annuel",
    amountXOF: 150_000,
    periodMonths: 12,
    tagline: "2 mois offerts par rapport au mensuel.",
  },
};

/** Vérifie que la valeur est bien une offre achetable en ligne. */
export function isSaasPlanType(value: unknown): value is SaasPlanType {
  return (
    typeof value === "string" &&
    (SAAS_PLAN_TYPES as readonly string[]).includes(value)
  );
}

/** Formate un montant XOF pour l'affichage (ex : « 15 000 FCFA »). */
export function formatXOF(amount: number): string {
  return (
    new Intl.NumberFormat("fr-FR", {
      style: "decimal",
      maximumFractionDigits: 0,
    }).format(amount) + " FCFA"
  );
}

// --------------------------------------
// Configuration de l'agrégateur (variables d'environnement)
// --------------------------------------

/** Agrégateurs supportés. Fedapay = initiation server-side ; Kkiapay = widget. */
export type PaymentProvider = "fedapay" | "kkiapay";

/**
 * Lit la configuration de la passerelle depuis l'environnement :
 * - `PAYMENT_PROVIDER`       : « fedapay » (défaut) ou « kkiapay » ;
 * - `PAYMENT_PUBLIC_KEY`     : clé publique (widget Kkiapay / identification) ;
 * - `PAYMENT_SECRET_KEY`     : clé secrète (appels server-to-server) ;
 * - `PAYMENT_WEBHOOK_SECRET` : secret de vérification des webhooks ;
 * - `PAYMENT_SANDBOX`        : « true » (défaut) / « false ».
 */
export function getPaymentConfig(): {
  provider: PaymentProvider;
  publicKey: string;
  secretKey: string;
  webhookSecret: string;
  sandbox: boolean;
} {
  const providerRaw = (process.env.PAYMENT_PROVIDER ?? "fedapay").toLowerCase();
  const provider: PaymentProvider =
    providerRaw === "kkiapay" ? "kkiapay" : "fedapay";

  return {
    provider,
    publicKey: process.env.PAYMENT_PUBLIC_KEY ?? "",
    secretKey: process.env.PAYMENT_SECRET_KEY ?? "",
    webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET ?? "",
    sandbox: (process.env.PAYMENT_SANDBOX ?? "true").toLowerCase() !== "false",
  };
}

/** `true` si l'agrégateur est utilisable (initiation + vérification webhook). */
export function isPaymentGatewayConfigured(): boolean {
  const config = getPaymentConfig();

  return Boolean(config.publicKey && config.secretKey && config.webhookSecret);
}

// --------------------------------------
// URLs d'application (retour de paiement / webhook)
// --------------------------------------

/** URL de base de l'application (NEXT_PUBLIC_APP_URL sinon déduite de Vercel). */
export function getAppBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (explicit) {
    return explicit;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return "http://localhost:3000";
}

/** URL publique de réception des webhooks de paiement. */
export function getWebhookUrl(): string {
  return `${getAppBaseUrl()}/api/webhooks/payment`;
}

// --------------------------------------
// Initiation d'un paiement d'abonnement
// --------------------------------------

export type InitiateSubscriptionInput = {
  organizationId: string;
  organizationName: string;
  planType: SaasPlanType;
  /** Email / téléphone du payeur (pré-remplissage chez l'agrégateur). */
  customerEmail?: string | null;
  customerPhone?: string | null;
};

/**
 * Configuration transmise au widget Kkiapay côté navigateur (l'initiation
 * Kkiapay est pilotée côté client ; seule la notification signée du webhook
 * fait foi côté serveur).
 */
export type KkiapayWidgetPayment = {
  /** Clé publique unique de l'intégration (PAYMENT_PUBLIC_KEY). */
  publicKey: string;
  /** Montant à payer en XOF (FCFA). */
  amount: number;
  currency: "XOF";
  /** Référence unique de la tentative (EDU-<timestamp>-<aléa>). */
  reference: string;
  sandbox: boolean;
  /** Page de retour après tentative de paiement. */
  callbackUrl: string;
  /** Métadonnées ré-acheminées par Kkiapay dans le webhook (`stateData`). */
  metadata: { organizationId: string; planType: SaasPlanType };
};

export type InitiateSubscriptionResult =
  | { status: "success"; provider: "fedapay"; checkoutUrl: string }
  | {
      status: "kkiapay_widget";
      provider: "kkiapay";
      widget: KkiapayWidgetPayment;
    }
  | { status: "error"; message: string };

/**
 * Crée une transaction Fedapay et renvoie l'URL de la page de paiement.
 * Contrat : POST /v1/transactions (montant XOF, callback + custom_data) puis
 * POST /v1/transactions/{id}/token → URL checkout.fedapay.com.
 */
async function initiateFedapayCheckout(
  input: InitiateSubscriptionInput,
  reference: string,
  config: ReturnType<typeof getPaymentConfig>
): Promise<string> {
  const plan = SAAS_PLAN_PRICES[input.planType];
  const baseUrl = config.sandbox
    ? "https://api-sandbox.fedapay.com"
    : "https://api.fedapay.com";

  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.secretKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-API-VERSION": "v1",
  };

  // Étape 1 : création de la transaction.
  const createResponse = await fetch(`${baseUrl}/v1/transactions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      description: `${plan.label} EduFlow — ${input.organizationName}`,
      amount: plan.amountXOF,
      currency: { iso: "XOF" },
      callback_url: `${getAppBaseUrl()}/dashboard/billing?payment=pending`,
      merchant_reference: reference,
      custom_data: {
        organizationId: input.organizationId,
        planType: input.planType,
      },
    }),
  });

  if (!createResponse.ok) {
    const body = await createResponse.text().catch(() => "");

    throw new Error(
      `Fedapay /v1/transactions a répondu ${createResponse.status} : ${body.slice(0, 300)}`
    );
  }

  const created = (await createResponse.json()) as {
    v1?: { transaction?: { id?: number } };
    transaction?: { id?: number };
  };
  const transactionId = created.v1?.transaction?.id ?? created.transaction?.id;

  if (typeof transactionId !== "number") {
    throw new Error("Fedapay : identifiant de transaction introuvable.");
  }

  // Étape 2 : génération du token de paiement → URL de checkout.
  const tokenResponse = await fetch(
    `${baseUrl}/v1/transactions/${transactionId}/token`,
    { method: "POST", headers }
  );

  if (!tokenResponse.ok) {
    const body = await tokenResponse.text().catch(() => "");

    throw new Error(
      `Fedapay /token a répondu ${tokenResponse.status} : ${body.slice(0, 300)}`
    );
  }

  const tokenData = (await tokenResponse.json()) as {
    token?: string;
    url?: string;
  };

  if (!tokenData.token) {
    throw new Error("Fedapay : token de paiement manquant dans la réponse.");
  }

  return (
    tokenData.url ??
    `https://checkout.fedapay.com/${tokenData.token}?reference=${encodeURIComponent(reference)}`
  );
}

/**
 * Vérifie que le widget Kkiapay est intégrable : le script `k.js` et la clé
 * publique doivent être disponibles. L'initiation elle-même est réalisée par
 * le widget côté navigateur ; le webhook signé fait foi côté serveur.
 */
export function getKkiapayWidgetConfig(): {
  scriptUrl: string;
  publicKey: string;
  sandbox: boolean;
} | null {
  const config = getPaymentConfig();

  if (!config.publicKey) {
    return null;
  }

  return {
    scriptUrl: "https://cdn.kkiapay.me/k.js",
    publicKey: config.publicKey,
    sandbox: config.sandbox,
  };
}

// --------------------------------------
// Orchestration : initiation + enregistrement de la facture
// --------------------------------------

/**
 * Démarre l'achat d'un abonnement :
 * 1. Génère une référence unique `EDU-<timestamp>-<aléa>` ;
 * 2. Enregistre une facture PENDING (audit + réconciliation) ;
 * 3. Appelle l'agrégateur configuré pour obtenir l'URL de paiement.
 *
 * Aucune activation n'a lieu ici : seule la confirmation signée du webhook
 * (`activateSubscriptionAfterPayment`) débloque la licence.
 */
export async function initiateSubscriptionPayment(
  input: InitiateSubscriptionInput
): Promise<InitiateSubscriptionResult> {
  const config = getPaymentConfig();

  if (!isPaymentGatewayConfigured()) {
    return {
      status: "error",
      message:
        "La passerelle de paiement n'est pas configurée sur le serveur (PAYMENT_PUBLIC_KEY / PAYMENT_SECRET_KEY / PAYMENT_WEBHOOK_SECRET).",
    };
  }

  const plan = SAAS_PLAN_PRICES[input.planType];
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  const reference = `EDU-${Date.now()}-${random}`;

  // Trace de la demande de paiement, avant tout appel réseau.
  await prisma.invoice.create({
    data: {
      organizationId: input.organizationId,
      planType: input.planType,
      amount: plan.amountXOF,
      currency: "XOF",
      paymentProvider: config.provider,
      status: "PENDING",
      description: `${plan.label} EduFlow — ${input.organizationName}`,
    },
  });

  try {
    if (config.provider === "fedapay") {
      const checkoutUrl = await initiateFedapayCheckout(
        input,
        reference,
        config
      );

      return { status: "success", provider: config.provider, checkoutUrl };
    }

    // Kkiapay : initiation pilotée par le widget côté navigateur. Le webhook
    // signé (`x-kkiapay-secret`) reste la seule source de vérité côté serveur.
    if (!config.publicKey) {
      throw new Error("PAYMENT_PUBLIC_KEY manquante pour l'agrégateur Kkiapay.");
    }

    return {
      status: "kkiapay_widget",
      provider: "kkiapay",
      widget: {
        publicKey: config.publicKey,
        amount: plan.amountXOF,
        currency: "XOF",
        reference,
        sandbox: config.sandbox,
        callbackUrl: `${getAppBaseUrl()}/dashboard/billing?payment=pending`,
        metadata: {
          organizationId: input.organizationId,
          planType: input.planType,
        },
      },
    };
  } catch (error) {
    console.error(
      "[payment] Échec d'initiation du paiement :",
      error instanceof Error ? error.message : error
    );

    return {
      status: "error",
      message:
        "Impossible de joindre la passerelle de paiement. Réessayez dans quelques instants.",
    };
  }
}

// --------------------------------------
// Vérification des webhooks (anti-falsification)
// --------------------------------------

/**
 * Compare deux chaînes en temps constant (évite les attaques temporelles).
 * Retourne `false` si les longueurs diffèrent.
 */
function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");

  if (bufferA.length !== bufferB.length) {
    return false;
  }

  return timingSafeEqual(bufferA, bufferB);
}

export type WebhookVerificationResult =
  | { valid: true }
  | { valid: false; reason: string };

/**
 * Vérifie l'authenticité d'une notification de paiement.
 *
 * - Fedapay : en-tête `x-fedapay-signature` au format `t=<ts>,v1=<hmac>` où
 *   `hmac = HMAC_SHA256(secret, "<ts>.<corps brut>")` et où l'horodatage doit
 *   dater de moins de 5 minutes (anti-rejeu).
 * - Kkiapay : en-tête `x-kkiapay-secret` contenant le « secret hash » configuré
 *   dans le tableau de bord ; il est comparé au secret local en temps constant.
 *
 * Le corps brut (`rawBody`) est obligatoire : le HMAC est calculé sur les
 * octets exacts envoyés par la passerelle, jamais sur un objet re-sérialisé.
 */
export function verifyWebhookSignature(
  provider: PaymentProvider,
  rawBody: string,
  headers: Headers
): WebhookVerificationResult {
  const { webhookSecret } = getPaymentConfig();

  if (!webhookSecret) {
    return {
      valid: false,
      reason: "PAYMENT_WEBHOOK_SECRET non configuré côté serveur.",
    };
  }

  if (provider === "kkiapay") {
    // Kkiapay renvoie le secret configuré dans un en-tête dédié.
    const provided = headers.get("x-kkiapay-secret");

    if (!provided) {
      return { valid: false, reason: "En-tête x-kkiapay-secret manquant." };
    }

    return safeEqual(provided.trim(), webhookSecret)
      ? { valid: true }
      : { valid: false, reason: "Secret Kkiapay invalide (signature refusée)." };
  }

  // Fedapay : schéma `t=<timestamp>,v1=<signature>`.
  const signatureHeader = headers.get("x-fedapay-signature");

  if (!signatureHeader) {
    return { valid: false, reason: "En-tête x-fedapay-signature manquant." };
  }

  const parts = signatureHeader.split(",").reduce<Record<string, string>>(
    (acc, part) => {
      const [key, value] = part.split("=", 2);

      if (key && value) {
        acc[key.trim().toLowerCase()] = value.trim();
      }

      return acc;
    },
    {}
  );

  const timestamp = parts.t;
  const signature = parts.v1 ?? parts.s;

  if (!timestamp || !signature) {
    return {
      valid: false,
      reason: "En-tête de signature Fedapay malformé (t / v1 attendus).",
    };
  }

  // Anti-rejeu : notification de plus de 5 minutes → rejet.
  const ageMs = Date.now() - Number(timestamp) * 1000;

  if (!Number.isFinite(ageMs) || Math.abs(ageMs) > 5 * 60 * 1000) {
    return {
      valid: false,
      reason: "Horodatage de la signature trop ancien ou invalide (rejeu ?).",
    };
  }

  const expected = createHmac("sha256", webhookSecret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  return safeEqual(signature.toLowerCase(), expected)
    ? { valid: true }
    : { valid: false, reason: "Signature HMAC invalide." };
}

// --------------------------------------
// Normalisation des payloads de webhook
// --------------------------------------

/** Payload normalisé d'une notification de paiement. */
export type NormalizedWebhook = {
  /** `true` si la passerelle confirme un paiement réussi. */
  success: boolean;
  /** Référence de transaction côté passerelle. */
  transactionReference: string | null;
  /** Moyen de paiement signalé (mobile_money, card…). */
  method: string | null;
  /** Montant payé, si la passerelle le renvoie. */
  amount: number | null;
  /** Métadonnées transmises à l'initiation (organizationId, planType). */
  metadata: { organizationId?: string; planType?: string };
};

/** Valeurs considérées comme « paiement réussi » chez les deux agrégateurs. */
const SUCCESS_STATUSES = new Set([
  "success",
  "approved",
  "completed",
  "paid",
  "transferred",
  "sent",
]);

/** Transforme un payload Kkiapay (`transaction.success` / `failed`) en commun. */
function normalizeKkiapayPayload(
  payload: Record<string, unknown>
): NormalizedWebhook {
  const data = (payload.data ?? payload) as Record<string, unknown>;
  const stateData = (data.stateData ?? {}) as Record<string, unknown>;

  // NB : la faute de frappe `isPaymentSucces` est celle de l'API Kkiapay.
  const success =
    data.isPaymentSucces === true ||
    payload.name === "transaction.success" ||
    (typeof data.status === "string" &&
      SUCCESS_STATUSES.has(data.status.toLowerCase()));

  return {
    success,
    transactionReference:
      typeof data.transactionId === "string" ? data.transactionId : null,
    method: typeof data.method === "string" ? data.method : null,
    amount: typeof data.amount === "number" ? data.amount : null,
    metadata: {
      organizationId:
        typeof stateData.organizationId === "string"
          ? stateData.organizationId
          : undefined,
      planType:
        typeof stateData.planType === "string"
          ? stateData.planType
          : undefined,
    },
  };
}

/** Transforme un payload Fedapay (`transaction.approved` / `declined`…) en commun. */
function normalizeFedapayPayload(
  payload: Record<string, unknown>
): NormalizedWebhook {
  const name = typeof payload.name === "string" ? payload.name : "";
  const entity = (payload.entity ?? {}) as Record<string, unknown>;

  const status = typeof entity.status === "string" ? entity.status : "";
  const success =
    name === "transaction.approved" ||
    name === "transaction.successful" ||
    SUCCESS_STATUSES.has(status.toLowerCase());

  const customData = (entity.custom_data ?? {}) as Record<string, unknown>;

  return {
    success,
    transactionReference:
      typeof entity.reference === "string"
        ? entity.reference
        : entity.id !== undefined
          ? String(entity.id)
          : null,
    method: null,
    amount: typeof entity.amount === "number" ? entity.amount : null,
    metadata: {
      organizationId:
        typeof customData.organizationId === "string"
          ? customData.organizationId
          : undefined,
      planType:
        typeof customData.planType === "string"
          ? customData.planType
          : undefined,
    },
  };
}

/**
 * Normalise le corps JSON d'un webhook selon l'agrégateur configuré.
 * Retourne `null` si le corps n'est pas un objet exploitable.
 */
export function normalizeWebhookPayload(
  provider: PaymentProvider,
  payload: unknown
): NormalizedWebhook | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const record = payload as Record<string, unknown>;

  return provider === "kkiapay"
    ? normalizeKkiapayPayload(record)
    : normalizeFedapayPayload(record);
}

// --------------------------------------
// Activation automatique de l'abonnement
// --------------------------------------

export type SubscriptionActivationResult =
  | { status: "success"; message: string }
  | { status: "ignored"; message: string }
  | {
      status: "error";
      message: string;
      /**
       * `true` si l'erreur est transitoire (base de données…) et que la
       * passerelle doit réessayer (réponse HTTP 500) ; `false` pour une
       * erreur permanente (metadata invalide, organisation inconnue) où une
       * nouvelle tentative ne changerait rien.
       */
      retryable: boolean;
    };

/**
 * Active l'abonnement d'une organisation après un paiement confirmé :
 * 1. Vérifie que le plan transmis est bien une offre achetable en ligne ;
 * 2. Génère la clé de licence signée Ed25519 (via `crypto-license.ts`) ;
 * 3. Met à jour l'organisation : `planType`, `planStatus = "ACTIVE"`,
 *    `licenseKey`, `licenseEndsAt` (+1 mois ou +12 mois) ;
 * 4. Enregistre la facture (montant, référence de transaction, date, statut) —
 *    idempotent grâce à l'unicité de `transactionReference`.
 *
 * Doit être appelée UNIQUEMENT après `verifyWebhookSignature` réussie.
 */
export async function activateSubscriptionAfterPayment(
  webhook: NormalizedWebhook
): Promise<SubscriptionActivationResult> {
  if (!webhook.success) {
    return { status: "ignored", message: "Paiement non réussi — ignoré." };
  }

  const { organizationId, planType } = webhook.metadata;

  if (!organizationId || !isSaasPlanType(planType)) {
    console.error(
      "[payment][webhook] Metadata manquante ou plan inconnu :",
      webhook.metadata
    );

    return {
      status: "error",
      message: "Metadata organizationId / planType absente ou invalide.",
      retryable: false,
    };
  }

  const plan = SAAS_PLAN_PRICES[planType];

  try {
    // Idempotence : une référence de transaction déjà traitée est ignorée.
    if (webhook.transactionReference) {
      const existing = await prisma.invoice.findUnique({
        where: { transactionReference: webhook.transactionReference },
        select: { id: true },
      });

      if (existing) {
        return {
          status: "ignored",
          message: "Transaction déjà traitée (idempotence).",
        };
      }
    }

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true },
    });

    if (!organization) {
      return {
        status: "error",
        message: `Organisation ${organizationId} introuvable.`,
        retryable: false,
      };
    }

    // 1. Période d'abonnement : +1 mois (mensuel) ou +12 mois (annuel).
    const periodStart = new Date();
    const periodEnd = addMonths(periodStart, plan.periodMonths);

    // 2. Clé de licence signée Ed25519 (LICENSE_PRIVATE_KEY).
    //    `planType` a été resserré à SaasPlanType, un sous-ensemble direct de
    //    LicensePlanType (pas de « TRIAL » : l'essai ne porte pas de clé).
    const licensePayload: LicensePayload = {
      organizationId,
      planType,
      expiresAt: periodEnd.toISOString(),
    };

    const licenseKey = generateLicenseKey(licensePayload);

    // 3. Auto-contrôle : la clé émise doit repasser la vérification hors-ligne.
    const selfCheck = verifyLicenseKey(licenseKey);

    if (!selfCheck.valid) {
      throw new Error(
        `Auto-contrôle de la licence échoué (${selfCheck.reason}) — activation annulée.`
      );
    }

    // 4. Mise à jour de l'organisation + enregistrement de la facture.
    await prisma.$transaction([
      prisma.organization.update({
        where: { id: organizationId },
        data: {
          planType,
          planStatus: "ACTIVE",
          licenseKey,
          licenseEndsAt: periodEnd,
          trialEndsAt: null,
        },
      }),
      prisma.invoice.create({
        data: {
          organizationId,
          planType,
          amount: webhook.amount ?? plan.amountXOF,
          currency: "XOF",
          paymentProvider: getPaymentConfig().provider,
          paymentMethod: webhook.method,
          transactionReference: webhook.transactionReference,
          status: "COMPLETED",
          description: `${plan.label} EduFlow — ${organization.name}`,
          licenseKey,
          periodStart,
          periodEnd,
          paidAt: new Date(),
        },
      }),
    ]);

    console.log(
      `[payment][webhook] Abonnement ${planType} activé pour ${organization.name} (jusqu'au ${periodEnd.toISOString()}).`
    );

    return {
      status: "success",
      message: `Abonnement ${plan.label} activé jusqu'au ${periodEnd.toLocaleDateString("fr-FR")}.`,
    };
  } catch (error) {
    console.error(
      "[payment][webhook] Échec d'activation de l'abonnement :",
      error instanceof Error ? error.message : error
    );

    return {
      status: "error",
      message: "Erreur base de données lors de l'activation de l'abonnement.",
      retryable: true,
    };
  }
}






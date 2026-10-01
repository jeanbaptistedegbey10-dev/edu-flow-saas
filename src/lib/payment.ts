// --------------------------------------
// Passerelle de paiement Mobile Money / Carte (FedaPay — passerelle active)
// --------------------------------------
//
// Module SERVEUR uniquement : il manipule les clés secrètes de l'agrégateur
// et la clé privée de licence Ed25519. Ne jamais l'importer depuis un
// composant client — passer par une Server Action (src/actions/billing.ts).
//
// Sources (documentation officielle) :
// - Fedapay  : widget client (https://cdn.fedapay.com/fedapay.js, global
//              `FedaPay`, `FedaPay.init({ public_key, environment })` puis
//              `widget.open()`) ; serveur : POST /v1/transactions puis
//              POST /v1/transactions/{id}/token
//              (https://docs.fedapay.com/api-reference/transactions/) ;
//              webhook signé via l'en-tête `X-FEDAPAY-SIGNATURE`
//              (schéma `t=<timestamp>,s=<hmac>` — HMAC-SHA256 sur
//              `<timestamp>.<corps brut>`, cf. docs.fedapay.com Webhooks).
// - Kkiapay  : LEGACY — conservé uniquement pour la lecture des webhooks
//              historiques et des factures déjà enregistrées. Le widget
//              Kkiapay (cdn.kkiapay.me/k.js) n'est plus chargé : toute
//              configuration Kkiapay est migrée automatiquement vers FedaPay.

import { createHmac, timingSafeEqual } from "node:crypto";

import {
  addMonths,
  generateLicenseKey,
  verifyLicenseKey,
  type LicensePayload,
} from "@/lib/crypto-license";
import {
  DEFAULT_PLAN_PRICING,
  PRICING_PLAN_LABELS,
  PRICING_PLAN_TAGLINES,
  PRICING_PLAN_TYPES,
  SUBSCRIPTION_PRICE_KIND_LABELS,
  getLicensePlanTypeFor,
  getPricingPlanForLicensePlanSafe,
  isBillingDuration,
  isPricingPlanType,
  type BillingDuration,
  type PlanPricingValues,
  type PricingPlanType,
  type SubscriptionPriceKind,
} from "@/lib/plan-pricing";
import { prisma } from "@/lib/prisma";
import {
  validateTransactionReference,
  validateWebhookAmount,
  validateWebhookLabel,
  validateWebhookMetadata,
} from "@/lib/payment-webhook-schema";

// --------------------------------------
// Tarification dynamique (modèle commercial hybride)
// --------------------------------------
//
// La grille tarifaire n'est PLUS une constante : elle vit dans la table
// `PlanPricing`, éditable en direct par le Super-Admin
// (/super-admin/pricing → Server Action `updatePlanPricingAction`).
//
// `calculateSubscriptionPrice` applique le modèle « Acquisition +
// Renouvellement » en contrôlant l'HISTORIQUE DE FACTURATION de
// l'organisation :
//   - AUCUNE facture COMPLETED        → `initialPrice` (1ʳᵉ année / licence +
//     logiciel) ;
//   - au moins une facture COMPLETED  → tarif de renouvellement selon la
//     durée souscrite : `renewalAnnualPrice` (12 mois) ou
//     `renewalHalfYearPrice` (6 mois).

/** Ligne de la grille tarifaire (base ou repli par défaut). */
export type PlanPricingRow = PlanPricingValues & {
  planType: PricingPlanType;
  currency: string;
  /** Dernière modification en base (absente en mode repli). */
  updatedAt?: Date;
};

/** Résultat du calcul dynamique du tarif d'un abonnement. */
export type SubscriptionPrice = {
  planType: PricingPlanType;
  /** Durée souscrite : 12 ou 6 mois. */
  durationMonths: BillingDuration;
  /** Montant à facturer (XOF / FCFA — pas de centimes en zone UEMOA). */
  amount: number;
  currency: string;
  /** Prix appliqué : première souscription ou renouvellement. */
  kind: SubscriptionPriceKind;
  /** `true` si première souscription (aucune facture COMPLETED). */
  isInitial: boolean;
  /** Libellé commercial complet (ex : « SaaS Cloud — Renouvellement 12 mois »). */
  label: string;
};

/**
 * Grille tarifaire par défaut — miroir du seed de la migration
 * `20260901000000_add_plan_pricing` :
 * - SaaS Cloud      : 80 000 (1ʳᵉ année) / 50 000 (12 mois) / 30 000 (6 mois) ;
 * - Self-Hosted     : 160 000 / 80 000 / 45 000 ;
 * - Desktop Offline : 160 000 / 80 000 / 45 000.
 * Utilisée en repli si une ligne `PlanPricing` est absente de la base.
 */
/**
 * Retourne la grille tarifaire complète (une ligne par formule commerciale).
 * Les formules absentes de la base retombent sur `DEFAULT_PLAN_PRICING` :
 * aucune page de paiement ne casse si le seed n'a pas encore été joué.
 */
export async function getPlanPricingGrid(): Promise<
  Record<PricingPlanType, PlanPricingRow>
> {
  const rows = await prisma.planPricing.findMany();

  const grid = {} as Record<PricingPlanType, PlanPricingRow>;

  for (const planType of PRICING_PLAN_TYPES) {
    const row = rows.find((candidate) => candidate.planType === planType);

    grid[planType] = row
      ? {
          planType,
          initialPrice: row.initialPrice,
          renewalAnnualPrice: row.renewalAnnualPrice,
          renewalHalfYearPrice: row.renewalHalfYearPrice,
          currency: row.currency,
          updatedAt: row.updatedAt,
        }
      : {
          planType,
          ...DEFAULT_PLAN_PRICING[planType],
          currency: "XOF",
        };
  }

  return grid;
}

/** Nombre de factures réglées (COMPLETED) d'une organisation. */
async function countCompletedInvoices(organizationId: string): Promise<number> {
  return prisma.invoice.count({
    where: { organizationId, status: "COMPLETED" },
  });
}

/**
 * Calcule DYNAMIQUEMENT le tarif applicable à une organisation pour une
 * formule et une durée données (modèle hybride Acquisition + Renouvellement).
 *
 * Contrôle effectué sur la table `Invoice` :
 *   1. aucune facture COMPLETED → `initialPrice` (durée 12 mois : 1ʳᵉ année) ;
 *   2. au moins une facture COMPLETED → `renewalAnnualPrice` (12 mois) ou
 *      `renewalHalfYearPrice` (6 mois).
 *
 * @param organizationId Organisation cliente (contexte serveur résolu).
 * @param planType       Formule commerciale (SAAS_CLOUD | SELF_HOSTED | DESKTOP_OFFLINE).
 * @param durationMonths Durée souscrite (12 ou 6 mois).
 */
export async function calculateSubscriptionPrice(
  organizationId: string,
  planType: PricingPlanType,
  durationMonths: BillingDuration
): Promise<SubscriptionPrice> {
  if (!isPricingPlanType(planType)) {
    throw new Error(
      `[pricing] Formule commerciale inconnue : ${String(planType)}.`
    );
  }

  if (!isBillingDuration(durationMonths)) {
    throw new Error(
      `[pricing] Durée de facturation non supportée : ${String(durationMonths)} (12 ou 6 mois attendus).`
    );
  }

  const [completedInvoices, grid] = await Promise.all([
    countCompletedInvoices(organizationId),
    getPlanPricingGrid(),
  ]);

  const pricing = grid[planType];
  const isInitial = completedInvoices === 0;
  const kind: SubscriptionPriceKind = isInitial
    ? "INITIAL"
    : durationMonths === 12
      ? "RENEWAL_ANNUAL"
      : "RENEWAL_HALF_YEAR";

  const amount = isInitial
    ? pricing.initialPrice
    : durationMonths === 12
      ? pricing.renewalAnnualPrice
      : pricing.renewalHalfYearPrice;

  return {
    planType,
    durationMonths,
    amount,
    currency: pricing.currency,
    kind,
    isInitial,
    label: `${PRICING_PLAN_LABELS[planType]} — ${SUBSCRIPTION_PRICE_KIND_LABELS[kind]}`,
  };
}

/** Entrée du catalogue tarifaire affiché sur /dashboard/billing. */
export type PricingCatalogEntry = PlanPricingRow & {
  label: string;
  tagline: string;
  /** `true` = première souscription : le prix initial s'applique. */
  isInitial: boolean;
  /**
   * Type de déploiement commercial de la formule (ex:
   * « Cloud (hébergé) ») — miroir de `PRICING_DEPLOYMENT_LABELS`.
   */
  deploymentType: PricingPlanType;
  /**
   * `true` si cette formule est celle actuellement souscrite par
   * l'organisation (détectée via `Organization.planType`). La carte
   * correspondante est désactivée et affichée comme « Offre actuelle ».
   */
  isCurrent: boolean;
};

/**
 * Catalogue tarifaire d'une organisation : pour CHAQUE formule commerciale,
 * indique si le client est en acquisition (prix initial) ou en
 * renouvellement — la page de facturation affiche ainsi automatiquement le
 * bon tarif selon le statut du client.
 */
export async function getPricingCatalogForOrganization(
  organizationId: string
): Promise<PricingCatalogEntry[]> {
  const [grid, completedInvoices, organization] = await Promise.all([
    getPlanPricingGrid(),
    countCompletedInvoices(organizationId),
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { planType: true },
    }),
  ]);

  const isInitial = completedInvoices === 0;

  // Détermine la formule commerciale actuellement souscrite par
  // l'organisation (ex : SAAS_YEARLY → SAAS_CLOUD). `null` si l'organisation
  // est en essai ou n'a pas encore de licence active.
  const currentPricingPlan = organization?.planType
    ? getPricingPlanForLicensePlanSafe(organization.planType)
    : null;

  return PRICING_PLAN_TYPES.map((planType) => ({
    ...grid[planType],
    label: PRICING_PLAN_LABELS[planType],
    tagline: PRICING_PLAN_TAGLINES[planType],
    isInitial,
    deploymentType: planType,
    isCurrent: currentPricingPlan === planType,
  }));
}

/** Formate un montant XOF pour l'affichage (ex : « 80 000 FCFA »). */
export { formatXOF } from "@/lib/plan-pricing";

// --------------------------------------
// Configuration de l'agrégateur (variables d'environnement)
// --------------------------------------

/**
 * Agrégateurs supportés. FedaPay est la passerelle ACTIVE (widget client
 * `cdn.fedapay.com/fedapay.js` + initiation server-side).
 *
 * `kkiapay` n'est conservé que comme valeur LECTURE : normalisation des
 * webhooks historiques et colonne `Invoice.paymentProvider` des factures déjà
 * enregistrées. Toute initiation de paiement passe désormais par FedaPay.
 */
export type PaymentProvider = "fedapay" | "kkiapay";

/**
 * Mode d'exécution d'une passerelle :
 * - `test` : bac à sable (sandbox), aucune transaction réelle ;
 * - `live` : production, transactions réelles.
 */
export type PaymentMode = "test" | "live";

// --------------------------------------
// Clés de TEST (sandbox) utilisées PAR DÉFAUT dès qu'aucune clé réelle n'est
// renseignée dans l'environnement ET que le bac à sable est autorisé
// (voir `isPaymentSandboxEnabled`) :
// - FedaPay : le widget officiel s'ouvre côté navigateur avec la seule clé
//   publique sandbox (aucun appel server-to-server n'est nécessaire à
//   l'initiation) → idéal pour tester / démontrer le parcours de paiement.
// - Kkiapay : conservé uniquement comme valeur de repli historique (plus
//   aucune initiation ne l'utilise depuis le basculement sur FedaPay).
//
// ⚠️ SÉCURITÉ — Ces valeurs sont PUBLIQUES (versionnées dans le dépôt).
// Leur `webhookSecret` permet à quiconque de forger une notification de
// paiement signée. Elles ne doivent donc JAMAIS être utilisées en
// production : `isPaymentSandboxEnabled()` garantit que le repli n'a lieu
// que hors production, et le webhook refuse explicitement les secrets de
// test lorsqu'il tourne avec `NODE_ENV === "production"`.
const SANDBOX_TEST_KEYS: Record<
  PaymentProvider,
  { publicKey: string; secretKey: string; webhookSecret: string }
> = {
  kkiapay: {
    publicKey: "public_key_sandbox_test",
    secretKey: "secret_key_sandbox_test",
    webhookSecret: "whsec_sandbox_test",
  },
  fedapay: {
    publicKey: "pk_sandbox_test",
    secretKey: "sk_sandbox_test",
    webhookSecret: "whsec_sandbox_test",
  },
};

/**
 * Détermine si le mode bac à sable (simulation) est AUTORISÉ.
 *
 * Règle de sécurité (fail-closed) — le sandbox n'est actif que si :
 *   1. `PAYMENT_PROVIDER_MODE` vaut explicitement « sandbox » OU
 *   2. `NODE_ENV` n'est PAS « production ».
 *
 * `PAYMENT_PROVIDER_MODE="live"` est prioritaire : il force le mode
 * PRODUCTION même hors `NODE_ENV=production` (ex. recette locale), de sorte
 * que le widget FedaPay s'initialise avec `environment: "live"` et que les
 * transactions soient réellement débitées.
 *
 * En production, le mode sandbox est donc refusé SAUF demande explicite de
 * l'opérateur via `PAYMENT_PROVIDER_MODE="sandbox"`. Cette exception
 * volontaire permet à un environnement de recette hébergé en production de
 * tester le tunnel, tout en garantissant qu'un déploiement classique
 * (`NODE_ENV=production` sans variable supplémentaire) ne retombe JAMAIS
 * sur les clés de test publiques.
 *
 * `PAYMENT_SANDBOX` reste honoré comme désactivation explicite (prioritaire
 * sur l'autorisation) : `PAYMENT_SANDBOX="false"` force le mode réel même en
 * développement.
 */
export function isPaymentSandboxEnabled(): boolean {
  // Désactivation explicite : l'opérateur veut de vraies transactions.
  if ((process.env.PAYMENT_SANDBOX ?? "").trim().toLowerCase() === "false") {
    return false;
  }

  const providerMode = (process.env.PAYMENT_PROVIDER_MODE ?? "")
    .trim()
    .toLowerCase();

  // Production demandée explicitement : prioritaire sur tout le reste
  // (y compris `NODE_ENV !== "production"`).
  if (providerMode === "live") {
    return false;
  }

  // Activation explicite, y compris en production.
  if (providerMode === "sandbox") {
    return true;
  }

  // Hors production : autorisé par défaut (dev, recette, CI).
  return process.env.NODE_ENV !== "production";
}

/**
 * Environnement FedaPay à transmettre au widget client :
 * « live » dès que le sandbox est refusé, « sandbox » sinon.
 *
 * Source de vérité : `isPaymentSandboxEnabled()` — c'est donc exactement le
 * même calcul que celui appliqué côté serveur pour résoudre l'hôte de l'API
 * (`resolveFedapayApiBaseUrl`), ce qui garantit qu'aucun widget sandbox ne
 * peut s'ouvrir pendant qu'une transaction réelle est initiée.
 */
export function getFedapayWidgetEnvironment(): "live" | "sandbox" {
  return isPaymentSandboxEnabled() ? "sandbox" : "live";
}

/**
 * Secrets de webhook issus de `SANDBOX_TEST_KEYS` — publics, donc
 * INTERDITS en production (ils permettraient de forger un paiement).
 */
const KNOWN_TEST_WEBHOOK_SECRETS: ReadonlySet<string> = new Set(
  Object.values(SANDBOX_TEST_KEYS).map((keys) => keys.webhookSecret)
);

/**
 * `true` si le secret de webhook correspond à une valeur de test publique.
 *
 * Utilisé par la route webhook pour refuser, en production, toute
 * notification signée avec un secret de bac à sable (défense en
 * profondeur : même si une régression réintroduisait le repli sandbox,
 * aucune activation d'abonnement ne pourrait être forgée).
 */
export function isTestWebhookSecret(secret: string): boolean {
  return KNOWN_TEST_WEBHOOK_SECRETS.has(secret.trim());
}

/**
 * Lit la configuration de la passerelle depuis l'environnement :
 * - `PAYMENT_PROVIDER`           : « fedapay » (défaut) ou « kkiapay » (legacy) ;
 * - `NEXT_PUBLIC_FEDAPAY_PUBLIC_KEY` / `FEDAPAY_PUBLIC_KEY`
 *                                 : clé PUBLIQUE (widget FedaPay côté client) ;
 * - `FEDAPAY_SECRET_KEY`         : clé SECRÈTE (appels server-to-server) ;
 * - `PAYMENT_PUBLIC_KEY`         : clé publique générique (fallback legacy) ;
 * - `PAYMENT_SECRET_KEY`         : clé secrète générique (fallback legacy) ;
 * - `PAYMENT_WEBHOOK_SECRET`     : secret de vérification des webhooks ;
 * - `PAYMENT_SANDBOX`            : « false » pour forcer le mode réel ;
 * - `PAYMENT_PROVIDER_MODE`      : « live » / « sandbox » pour choisir
 *                                 explicitement l'environnement FedaPay.
 *
 * Mode démo/sandbox : si le bac à sable est AUTORISÉ (voir
 * `isPaymentSandboxEnabled`) et qu'AUCUNE clé réelle n'est fournie, la
 * configuration retombe sur des clés de TEST et le fournisseur est forcé sur
 * FedaPay — le paiement en ligne reste testable sur une instance vierge.
 *
 * En production, ce repli sur les clés de test est IMPOSSIBLE : sans clés
 * réelles, la configuration reste vide et le webhook répond 503 plutôt que
 * d'accepter une signature falsifiable.
 *
 * NOTE : cette fonction lit UNIQUEMENT les variables d'environnement.
 * Pour la résolution complète (BDD → env → défaut), utiliser
 * `getPaymentConfigWithDb()` qui interroge d'abord `SystemSettings`.
 */
export function getPaymentConfig(): {
  provider: PaymentProvider;
  publicKey: string;
  secretKey: string;
  webhookSecret: string;
  sandbox: boolean;
} {
  const providerRaw = (process.env.PAYMENT_PROVIDER ?? "fedapay").toLowerCase();
  let provider: PaymentProvider =
    providerRaw === "kkiapay" ? "kkiapay" : "fedapay";

  const sandbox = isPaymentSandboxEnabled();

  // Clés FedaPay : nomenclature actuelle (NEXT_PUBLIC_FEDAPAY_PUBLIC_KEY /
  // FEDAPAY_SECRET_KEY) avec repli sur l'ancienne (FEDA_PAY_*) et sur les
  // variables génériques (PAYMENT_*).
  const fedapayPublicKey =
    process.env.NEXT_PUBLIC_FEDAPAY_PUBLIC_KEY?.trim() ||
    process.env.FEDAPAY_PUBLIC_KEY?.trim() ||
    process.env.FEDA_PAY_PUBLIC_KEY?.trim() ||
    "";
  const fedapaySecretKey =
    process.env.FEDAPAY_SECRET_KEY?.trim() ||
    process.env.FEDA_PAY_SECRET_KEY?.trim() ||
    "";

  // Aucune clé réelle ? → mode démo : on force FedaPay, seul agrégateur dont
  // le widget officiel s'ouvre avec la seule clé publique (testable).
  const hasRealKeys = Boolean(
    fedapayPublicKey ||
      fedapaySecretKey ||
      process.env.PAYMENT_PUBLIC_KEY ||
      process.env.PAYMENT_SECRET_KEY ||
      process.env.PAYMENT_WEBHOOK_SECRET
  );

  if (sandbox && !hasRealKeys) {
    provider = "fedapay";
  }

  const fallback = sandbox ? SANDBOX_TEST_KEYS[provider] : null;

  if (provider === "fedapay") {
    return {
      provider,
      publicKey: fedapayPublicKey || fallback?.publicKey || "",
      secretKey:
        fedapaySecretKey ||
        process.env.PAYMENT_SECRET_KEY?.trim() ||
        fallback?.secretKey ||
        "",
      webhookSecret:
        process.env.PAYMENT_WEBHOOK_SECRET?.trim() ||
        process.env.FEDAPAY_WEBHOOK_SECRET?.trim() ||
        fedapaySecretKey ||
        fallback?.webhookSecret ||
        "",
      sandbox,
    };
  }

  return {
    provider,
    publicKey:
      process.env.PAYMENT_PUBLIC_KEY?.trim() || fallback?.publicKey || "",
    secretKey:
      process.env.PAYMENT_SECRET_KEY?.trim() || fallback?.secretKey || "",
    webhookSecret:
      process.env.PAYMENT_WEBHOOK_SECRET?.trim() || fallback?.webhookSecret || "",
    sandbox,
  };
}

/**
 * Résolution COMPLÈTE de la configuration de paiement :
 *   1. Base de données (`SystemSettings`) — prioritaire ;
 *   2. Variable d'environnement (rétrocompatibilité) ;
 *   3. Clés de test sandbox (mode démo).
 *
 * Fonction asynchrone (requête BDD) à `await`er. Utilisée par les Server
 * Actions critiques (checkout, webhook) pour garantir que les clés saisies
 * dans le back-office Super-Admin priment toujours sur les variables env.
 */
export async function getPaymentConfigWithDb(): Promise<{
  provider: PaymentProvider;
  publicKey: string;
  secretKey: string;
  webhookSecret: string;
  sandbox: boolean;
  activeGateways: { kkiapay: boolean; fedapay: boolean };
}> {
  const settings = await prisma.systemSettings.findMany({
    where: {
      key: {
        in: [
          "kkiapay.publicKey", "kkiapay.privateKey", "kkiapay.secret",
          "kkiapay.mode", "kkiapay.isActive",
          "fedapay.publicKey", "fedapay.secretKey", "fedapay.mode",
          "fedapay.isActive",
        ],
      },
    },
    select: { key: true, value: true },
  });

  const get = (k: string) => settings.find((s) => s.key === k)?.value?.trim() || "";

  const kkiapayDbKey = get("kkiapay.publicKey");
  const kkiapayDbPrivate = get("kkiapay.privateKey");
  const kkiapayDbSecret = get("kkiapay.secret");
  const fedapayDbKey = get("fedapay.publicKey");
  const fedapayDbSecret = get("fedapay.secretKey");

  // Un agrégateur est actif s'il n'y a pas de valeur en base (défaut: activé)
  // ou si la valeur enregistrée vaut explicitement "true".
  const kkiapayIsActiveDb = get("kkiapay.isActive");
  const fedapayIsActiveDb = get("fedapay.isActive");
  const kkiapayIsActive = kkiapayIsActiveDb === "" ? true : kkiapayIsActiveDb === "true";
  const fedapayIsActive = fedapayIsActiveDb === "" ? true : fedapayIsActiveDb === "true";

  const providerRaw = (process.env.PAYMENT_PROVIDER ?? "fedapay").toLowerCase();
  let provider: PaymentProvider =
    providerRaw === "kkiapay" ? "kkiapay" : "fedapay";

  const fedapayEnvPublicKey =
    process.env.NEXT_PUBLIC_FEDAPAY_PUBLIC_KEY?.trim() ||
    process.env.FEDAPAY_PUBLIC_KEY?.trim() ||
    process.env.FEDA_PAY_PUBLIC_KEY?.trim() ||
    "";
  const fedapayEnvSecretKey =
    process.env.FEDAPAY_SECRET_KEY?.trim() ||
    process.env.FEDA_PAY_SECRET_KEY?.trim() ||
    "";

  // Résolution du fournisseur en respectant le drapeau `isActive` :
  // un agrégateur désactivé (IsActive = false) est ignoré, même s'il a des clés.
  // FedaPay est prioritaire : c'est la seule passerelle d'initiation active.
  if (fedapayIsActive && (fedapayDbKey || fedapayEnvPublicKey || fedapayEnvSecretKey)) {
    provider = "fedapay";
  } else if (fedapayIsActive && fedapayDbSecret) {
    provider = "fedapay";
  } else if (kkiapayIsActive && kkiapayDbKey) {
    provider = "kkiapay";
  } else if (kkiapayIsActive && process.env.KKIAPAY_PUBLIC_KEY) {
    provider = "kkiapay";
  }

  const kkiapayModeDb = get("kkiapay.mode");
  const fedapayModeDb = get("fedapay.mode");
  // Le bac à sable n'est AUTORISÉ que si l'environnement l'y autorise
  // (PAYMENT_PROVIDER_MODE=sandbox ou NODE_ENV !== production). Le mode
  // « test » stocké en base ne peut donc jamais, à lui seul, rouvrir le
  // repli sur les clés de test publiques en production.
  const envSandbox = isPaymentSandboxEnabled();
  const dbSandbox = kkiapayModeDb === "live" || fedapayModeDb === "live" ? false : undefined;

  const kkiapayPublicKey = kkiapayDbKey || process.env.KKIAPAY_PUBLIC_KEY?.trim() || process.env.PAYMENT_PUBLIC_KEY?.trim() || "";
  const kkiapayPrivateKey = kkiapayDbPrivate || process.env.KKIAPAY_PRIVATE_KEY?.trim() || "";
  const kkiapaySecret = kkiapayDbSecret || process.env.KKIAPAY_SECRET?.trim() || process.env.PAYMENT_WEBHOOK_SECRET?.trim() || "";

  const fedapayPublicKey = fedapayDbKey || fedapayEnvPublicKey;
  const fedapaySecretKey = fedapayDbSecret || fedapayEnvSecretKey;

  // Cohérence clé ↔ environnement : une clé FedaPay LIVE (`pk_live_*` /
  // `sk_live_*`) force le mode Production (sandbox = false) même si le
  // commutateur « fedapay.mode » est resté sur « test » — même automatisme
  // que l'UI Super-Admin (détection pk_live_* → bascule sur « live »).
  const fedapayLiveKeyDetected =
    provider === "fedapay" &&
    (fedapayPublicKey.startsWith("pk_live_") ||
      fedapaySecretKey.startsWith("sk_live_"));
  const sandbox = fedapayLiveKeyDetected ? false : dbSandbox ?? envSandbox;

  const hasRealKeys = Boolean(kkiapayPublicKey || kkiapayPrivateKey || fedapayPublicKey || fedapaySecretKey);
  if (sandbox && !hasRealKeys) {
    provider = "fedapay";
  }

  const fallback = sandbox ? SANDBOX_TEST_KEYS[provider] : null;

  const isFedapay = provider === "fedapay";
  const publicKey = isFedapay
    ? fedapayPublicKey || fallback?.publicKey || ""
    : kkiapayPublicKey || fallback?.publicKey || "";
  const secretKey = isFedapay
    ? fedapaySecretKey || fallback?.secretKey || ""
    : kkiapayPrivateKey || fallback?.secretKey || "";
  const webhookSecret = isFedapay
    ? fedapaySecretKey || fallback?.webhookSecret || ""
    : kkiapaySecret || fallback?.webhookSecret || "";

  return {
    provider,
    publicKey,
    secretKey,
    webhookSecret,
    sandbox,
    activeGateways: { kkiapay: kkiapayIsActive, fedapay: fedapayIsActive },
  };
}

/** Métadonnées d'availability des passerelles (pour l'UI). */
const PAYMENT_GATEWAY_QUERY_KEYS: string[] = [
  "kkiapay.publicKey", "kkiapay.privateKey", "kkiapay.secret",
  "kkiapay.mode", "kkiapay.isActive",
  "fedapay.publicKey", "fedapay.secretKey", "fedapay.mode",
  "fedapay.isActive",
];

/**
 * Retourne l'état de chaque agrégateur (actif + configuré + mode) pour
 * l'affichage dans l'UI. Permet de savoir quelles passerelles proposer
 * lors d'un checkout client.
 *
 * Un agrégateur apparaît comme « configuré » s'il possède des clés réelles
 * (base ou variables d'environnement). Il est « actif » si le commutateur
 * `isActive` est activé en base (ou absent → activé par défaut).
 */
export async function getPaymentGatewaysStatus(): Promise<{
  kkiapay: { active: boolean; configured: boolean; mode: PaymentMode };
  fedapay: { active: boolean; configured: boolean; mode: PaymentMode };
}> {
  const settings = await prisma.systemSettings.findMany({
    where: { key: { in: PAYMENT_GATEWAY_QUERY_KEYS } },
    select: { key: true, value: true },
  });

  const get = (k: string) => settings.find((s) => s.key === k)?.value?.trim() || "";

  const kkiapayPublicKey = get("kkiapay.publicKey") || process.env.KKIAPAY_PUBLIC_KEY?.trim() || process.env.PAYMENT_PUBLIC_KEY?.trim() || "";
  const kkiapayPrivateKey = get("kkiapay.privateKey") || process.env.KKIAPAY_PRIVATE_KEY?.trim() || "";
  const kkiapaySecret = get("kkiapay.secret") || process.env.KKIAPAY_SECRET?.trim() || process.env.PAYMENT_WEBHOOK_SECRET?.trim() || "";
  const kkiapayMode: PaymentMode = get("kkiapay.mode") === "live" || process.env.KKIAPAY_MODE?.trim() === "live" ? "live" : "test";
  const kkiapayIsActiveDb = get("kkiapay.isActive");
  const kkiapayIsActive = kkiapayIsActiveDb === "" ? true : kkiapayIsActiveDb === "true";

  const fedapayPublicKey =
    get("fedapay.publicKey") ||
    process.env.NEXT_PUBLIC_FEDAPAY_PUBLIC_KEY?.trim() ||
    process.env.FEDAPAY_PUBLIC_KEY?.trim() ||
    process.env.FEDA_PAY_PUBLIC_KEY?.trim() ||
    "";
  const fedapaySecretKey =
    get("fedapay.secretKey") ||
    process.env.FEDAPAY_SECRET_KEY?.trim() ||
    process.env.FEDA_PAY_SECRET_KEY?.trim() ||
    "";
  const fedapayMode: PaymentMode =
    get("fedapay.mode") === "live" ||
    process.env.FEDAPAY_MODE?.trim() === "live" ||
    process.env.FEDA_PAY_MODE?.trim() === "live" ||
    getFedapayWidgetEnvironment() === "live"
      ? "live"
      : "test";
  const fedapayIsActiveDb = get("fedapay.isActive");
  const fedapayIsActive = fedapayIsActiveDb === "" ? true : fedapayIsActiveDb === "true";

  return {
    kkiapay: {
      active: kkiapayIsActive,
      configured: Boolean(kkiapayPublicKey && kkiapayPrivateKey && kkiapaySecret),
      mode: kkiapayMode,
    },
    fedapay: {
      active: fedapayIsActive,
      configured: Boolean(fedapayPublicKey && fedapaySecretKey),
      mode: fedapayMode,
    },
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
  /** Formule commerciale de la grille tarifaire dynamique. */
  planType: PricingPlanType;
  /** Durée souscrite : 12 mois (annuel) ou 6 mois (semestriel). */
  durationMonths: BillingDuration;
  /** Email / téléphone du payeur (pré-remplissage chez l'agrégateur). */
  customerEmail?: string | null;
  customerPhone?: string | null;
};

/**
 * Configuration transmise au widget FedaPay côté navigateur.
 *
 * Intégration DIRECTE (widget modal / pop-up inline) : la transaction est
 * créée par l'agrégateur depuis le navigateur, via
 * `FedaPay.init({ public_key, environment })` puis `widget.open()` — aucune
 * redirection d'URL, la modale s'ouvre par-dessus la page courante.
 *
 * Seule la clé PUBLIQUE est transmise au client ; la validation finale
 * (licence + organisation + facture) reste faite côté serveur par le webhook
 * signé `/api/webhooks/payment`.
 */
export type FedapayWidgetPayment = {
  /** Clé publique de l'intégration (`NEXT_PUBLIC_FEDAPAY_PUBLIC_KEY`). */
  publicKey: string;
  /** Montant à payer en XOF (FCFA), calculé côté serveur. */
  amount: number;
  currency: "XOF";
  /** Référence unique de la tentative (EDU-<timestamp>-<aléa>). */
  reference: string;
  /** Libellé affiché dans le guichet FedaPay. */
  description: string;
  /**
   * Environnement FedaPay du widget : « live » cible la production
   * (transactions réelles avec `NEXT_PUBLIC_FEDAPAY_PUBLIC_KEY`).
   */
  environment: "live" | "sandbox";
  /** Métadonnées ré-acheminées par FedaPay dans le webhook. */
  metadata: {
    organizationId: string;
    planType: PricingPlanType;
    durationMonths: BillingDuration;
  };
};

/**
 * Résultat de l'initiation d'un abonnement.
 *
 * FedaPay passe par le WIDGET MODAL : le composant client ouvre la modale
 * inline (SDK `cdn.fedapay.com/fedapay.js`) au-dessus de la page — aucune
 * redirection d'URL. Le montant reste calculé côté serveur : le navigateur
 * ne fait que le déclencher.
 */
export type InitiateSubscriptionResult =
  | {
      status: "fedapay_widget";
      provider: "fedapay";
      widget: FedapayWidgetPayment;
    }
  | { status: "error"; message: string };

// --------------------------------------
// API FedaPay : hôtes officiels
// --------------------------------------
// Source : OpenAPI FedaPay (`servers`, docs.fedapay.com/api-reference) :
//   - Production : https://api.fedapay.com/v1
//   - Sandbox    : https://sandbox-api.fedapay.com/v1
// (ATTENTION : l'ancien hôte « api-sandbox.fedapay.com » N'EXISTE PAS —
// toute requête vers lui échouait en DNS → « passerelle injoignable ».)

/** Hôte officiel de l'API FedaPay en Production (clés live). */
const FEDAPAY_LIVE_API_BASE_URL = "https://api.fedapay.com";

/** Hôte officiel de l'API FedaPay en Sandbox (clés de test). */
const FEDAPAY_SANDBOX_API_BASE_URL = "https://sandbox-api.fedapay.com";

/**
 * Script officiel du widget FedaPay, exposé en global `FedaPay`
 * (`FedaPay.init({ public_key, environment })` puis `widget.open()`).
 *
 * Le MÊME script sert aux deux environnements : c'est l'option
 * `environment` passée à `FedaPay.init` qui cible `live` ou `sandbox`.
 */
export const FEDAPAY_SCRIPT_URL = "https://cdn.fedapay.com/fedapay.js";

/**
 * Résout l'hôte de l'API FedaPay à partir des CLÉS réellement utilisées :
 *
 * - une clé LIVE (`pk_live_*` pour la clé publique, `sk_live_*` pour la
 *   clé secrète) est TOUJOURS adressée à la Production
 *   (`https://api.fedapay.com`) — même si le commutateur « fedapay.mode »
 *   de la base ou `PAYMENT_SANDBOX` est resté sur « test » (on évite ainsi
 *   un appel Sandbox avec une clé Live, systématiquement refusé 401) ;
 * - une clé SANDBOX (`pk_sandbox_*` / `sk_sandbox_*`) part vers l'hôte de
 *   test officiel (`https://sandbox-api.fedapay.com`) ;
 * - clés non préfixées reconnaissables → on retombe sur le drapeau
 *   `sandbox` de la configuration résolue.
 */
export function resolveFedapayApiBaseUrl(
  publicKey: string,
  secretKey: string,
  sandbox: boolean
): string {
  if (publicKey.startsWith("pk_live_") || secretKey.startsWith("sk_live_")) {
    return FEDAPAY_LIVE_API_BASE_URL;
  }

  if (
    publicKey.startsWith("pk_sandbox_") ||
    secretKey.startsWith("sk_sandbox_")
  ) {
    return FEDAPAY_SANDBOX_API_BASE_URL;
  }

  return sandbox
    ? FEDAPAY_SANDBOX_API_BASE_URL
    : FEDAPAY_LIVE_API_BASE_URL;
}

/**
 * Crée une transaction Fedapay et renvoie l'URL de la page de paiement.
 * Contrat : POST /v1/transactions (montant XOF, callback + custom_data) puis
 * POST /v1/transactions/{id}/token → URL checkout.fedapay.com.
 *
 * `fetchImpl` : injection facultative du client HTTP (tests de fumée) —
 * en production, le `fetch` global de Node est utilisé.
 */
export async function initiateFedapayCheckout(
  input: InitiateSubscriptionInput,
  reference: string,
  config: ReturnType<typeof getPaymentConfig>,
  pricing: SubscriptionPrice,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  // L'hôte est déduit des clés (pk_live_* → Production) : voir
  // `resolveFedapayApiBaseUrl` ci-dessus.
  const baseUrl = resolveFedapayApiBaseUrl(
    config.publicKey,
    config.secretKey,
    config.sandbox
  );

  console.log(
    `[payment][fedapay] Initiation de la transaction ${reference} — hôte API : ${baseUrl} (drapeau sandbox de la config : ${config.sandbox ? "true" : "false"})`
  );

  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.secretKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-API-VERSION": "v1",
  };

  // Étape 1 : création de la transaction.
  const createResponse = await fetchImpl(`${baseUrl}/v1/transactions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      description: `${pricing.label} EduFlow — ${input.organizationName}`,
      amount: pricing.amount,
      currency: { iso: "XOF" },
      callback_url: `${getAppBaseUrl()}/dashboard/billing?payment=pending`,
      merchant_reference: reference,
      custom_data: {
        organizationId: input.organizationId,
        planType: input.planType,
        durationMonths: input.durationMonths,
      },
    }),
  });

  if (!createResponse.ok) {
    const body = await createResponse.text().catch(() => "");

    // Erreur PRÉCISE : statut HTTP + corps renvoyé par FedaPay (clé invalide,
    // montant refusé, compte non vérifié…). C'est ce message qui remonte
    // jusqu'à l'UI via le `catch` de `initiateSubscriptionPayment`.
    throw new Error(
      `Fedapay /v1/transactions a répondu ${createResponse.status} : ${body.slice(0, 300)}`
    );
  }

  // Réponse tantôt enveloppée (`v1` ou `v1/transaction` — les webhooks FedaPay
  // utilisent ce préfixe d'entité, certaines versions de l'API le renvoient
  // aussi sur les réponses de création), tantôt plate — l'OpenAPI FedaPay
  // documente POST /transactions → 201 avec l'objet transaction directement
  // (`{ id, reference, … }`). Les quatre formes sont donc acceptées.
  const created = (await createResponse.json()) as {
    id?: number;
    transaction?: { id?: number };
    v1?: { transaction?: { id?: number } };
    "v1/transaction"?: { id?: number };
  };
  const transactionId =
    created["v1/transaction"]?.id ??
    created.v1?.transaction?.id ??
    created.transaction?.id ??
    created.id;

  if (typeof transactionId !== "number") {
    throw new Error(
      `Fedapay : identifiant de transaction introuvable dans la réponse de création : ${JSON.stringify(created).slice(0, 300)}`
    );
  }

  console.log(
    `[payment][fedapay] Transaction ${reference} créée (id ${transactionId}) — génération du token de paiement…`
  );

  // Étape 2 : génération du token de paiement → URL de checkout.
  const tokenResponse = await fetchImpl(
    `${baseUrl}/v1/transactions/${transactionId}/token`,
    { method: "POST", headers }
  );

  if (!tokenResponse.ok) {
    const body = await tokenResponse.text().catch(() => "");

    throw new Error(
      `Fedapay /token a répondu ${tokenResponse.status} : ${body.slice(0, 300)}`
    );
  }

  // Contrat FedaPay : `{ token, url }` (cf. docs « Get the payment link for
  // a transaction ») — on tolère aussi les enveloppes `v1` et `v1/token`
  // (même préfixe d'entité que les réponses de création / webhooks).
  const tokenData = (await tokenResponse.json()) as {
    token?: string;
    url?: string;
    v1?: { token?: string; url?: string };
    "v1/token"?: { token?: string; url?: string };
  };
  const token =
    tokenData["v1/token"]?.token ??
    tokenData.v1?.token ??
    tokenData.token;
  const checkoutUrl =
    tokenData["v1/token"]?.url ??
    tokenData.v1?.url ??
    tokenData.url;

  if (!token) {
    throw new Error("Fedapay : token de paiement manquant dans la réponse.");
  }

  // L'URL de guichet retournée par FedaPay (`url`) prime ; à défaut on
  // reconstruit le guichet officiel checkout.fedapay.com/<token>. Cette URL
  // est renvoyée à l'action `initiateSubscriptionPaymentAction` qui la
  // transmet au composant client (redirection `window.location.assign`).
  return (
    checkoutUrl ??
    `https://checkout.fedapay.com/${token}?reference=${encodeURIComponent(reference)}`
  );
}

/**
 * Vérifie que le widget FedaPay est intégrable : le script `fedapay.js` et la
 * clé publique doivent être disponibles. L'initiation elle-même est réalisée
 * par le widget côté navigateur ; le webhook signé fait foi côté serveur.
 *
 * L'environnement transmis au widget (« live » ou « sandbox ») provient de
 * `getFedapayWidgetEnvironment()`, donc de `PAYMENT_PROVIDER_MODE` : en mode
 * Live, le widget s'ouvre sur l'environnement de PRODUCTION FedaPay.
 */
export function getFedapayWidgetConfig(): {
  scriptUrl: string;
  publicKey: string;
  environment: "live" | "sandbox";
} | null {
  const config = getPaymentConfig();

  if (config.provider !== "fedapay" || !config.publicKey) {
    return null;
  }

  return {
    scriptUrl: FEDAPAY_SCRIPT_URL,
    publicKey: config.publicKey,
    environment: getFedapayWidgetEnvironment(),
  };
}

// --------------------------------------
// Orchestration : initiation + enregistrement de la facture
// --------------------------------------

/**
 * Démarre l'achat d'un abonnement :
 * 1. Génère une référence unique `EDU-<timestamp>-<aléa>` ;
  * 2. Calcule le tarif dynamique (initial / renouvellement) selon l'historique ;
 * 3. Démarre le paiement via FedaPay.
 *
 * FedaPay fonctionne en INTÉGRATION DIRECTE : le composant client ouvre la
 * modale / pop-up inline via le SDK officiel (`cdn.fedapay.com/fedapay.js`,
 * `FedaPay.init({ public_key: NEXT_PUBLIC_FEDAPAY_PUBLIC_KEY, environment:
 * "live" })` puis `widget.open()`) PAR-DESSUS la page courante — aucune
 * redirection d'URL, aucun changement de page. Seule la clé PUBLIQUE est
 * transmise au navigateur ; le montant et les metadata d'abonnement sont
 * calculés ici, côté serveur, afin qu'ils parviennent intacts au webhook.
 *
 * Aucune activation n'a lieu ici : seule la confirmation signée du webhook
 * (`activateSubscriptionAfterPayment`) débloque la licence.
 */
export async function initiateSubscriptionPayment(
  input: InitiateSubscriptionInput
): Promise<InitiateSubscriptionResult> {
  const config = await getPaymentConfigWithDb();

  if (!config.publicKey || !config.secretKey || !config.webhookSecret) {
    return {
      status: "error",
      message:
        "La passerelle de paiement n'est pas configurée sur le serveur (NEXT_PUBLIC_FEDAPAY_PUBLIC_KEY / FEDAPAY_SECRET_KEY / PAYMENT_WEBHOOK_SECRET).",
    };
  }

  // Vérifie que le fournisseur résolu est bien actif (IsActive = true en base).
  const isActive = config.provider === "fedapay" ? config.activeGateways.fedapay : config.activeGateways.kkiapay;
  if (!isActive) {
    return {
      status: "error",
      message:
        "Cette passerelle de paiement a été désactivée par l'administrateur. Aucun moyen de paiement en ligne n'est disponible pour le moment.",
    };
  }

  // Tarif DYNAMIQUE : prix initial (1ʳᵉ année) ou renouvellement (12 / 6 mois)
  // selon l'historique de facturation de l'organisation (factures COMPLETED).
  const pricing = await calculateSubscriptionPrice(
    input.organizationId,
    input.planType,
    input.durationMonths
  );

  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  const reference = `EDU-${Date.now()}-${random}`;

  // Aucune facture n'est créée au clic « Payer » : FedaPay ne crée la
  // transaction que côté agrégateur (widget ou appel serveur). La facture est
  // écrite UNIQUEMENT par le webhook signé (`activateSubscriptionAfterPayment`),
  // une fois le succès (ou l'échec) confirmé — ce qui garantit un historique
  // net, sans lignes PENDING.
  try {
    // FedaPay — WIDGET MODAL INLINE (intégration directe).
    //
    // Aucun appel server-to-server et AUCUNE redirection : les paramètres de
    // la collecte sont calculés ici (montant côté serveur, référence unique,
    // metadata d'abonnement) puis transmis au client, qui ouvre la modale
    // FedaPay par-dessus la page courante via le SDK officiel
    // (`FedaPay.init(...).open()`).
    //
    // La clé publique `NEXT_PUBLIC_FEDAPAY_PUBLIC_KEY` suffit au widget : la
    // clé secrète n'est jamais exposée au navigateur. Le webhook signé reste
    // la seule source de vérité pour activer la licence.
    if (config.provider === "fedapay") {
      return {
        status: "fedapay_widget",
        provider: "fedapay",
        widget: {
          publicKey: config.publicKey,
          amount: pricing.amount,
          currency: "XOF",
          reference,
          description: `${pricing.label} EduFlow — ${input.organizationName}`,
          // Environnement « live » : la clé publique désigne le compte
          // FedaPay de production, le widget encaisse de vrais paiements.
          environment: "live",
          metadata: {
            organizationId: input.organizationId,
            planType: input.planType,
            durationMonths: input.durationMonths,
          },
        },
      };
    }

    throw new Error(
      `Passerelle de paiement non prise en charge : « ${config.provider} ». Seule FedaPay est active.`
    );
  } catch (error) {
    // Journalisation PRÉCISE de la cause : message de l'erreur (statut HTTP +
    // corps renvoyé par FedaPay lorsque la création de transaction échoue),
    // cause réseau sous-jacente (`fetch failed` → `getaddrinfo ENOTFOUND …`)
    // et pile d'appels. La VRAIE raison est ainsi tracée côté serveur ET
    // remontée à l'interface, au lieu du message générique « passerelle
    // injoignable ».
    const detail = error instanceof Error ? error.message : String(error);
    const cause =
      error instanceof Error && error.cause instanceof Error
        ? error.cause.message
        : undefined;

    console.error(
      `[payment] Échec d'initiation du paiement (référence ${reference}) :`,
      {
        message: detail,
        cause: cause ?? null,
        stack: error instanceof Error ? error.stack : undefined,
      }
    );

    return {
      status: "error",
      // La cause exacte est affichée à l'utilisateur (les erreurs FedaPay
      // levées par `initiateFedapayCheckout` incluent déjà le statut HTTP +
      // le corps de la réponse) ; la cause réseau est ajoutée entre
      // parenthèses le cas échéant.
      message: `Le paiement n'a pas pu être démarré : ${detail}${cause ? ` (${cause})` : ""}`,
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
 *
 * Le `webhookSecret` est passé en paramètre (résolu en amont via
 * `getPaymentConfigWithDb`) pour garantir la cohérence avec la configuration
 * active (BDD + env).
 */
export function verifyWebhookSignature(
  provider: PaymentProvider,
  rawBody: string,
  webhookSecret: string,
  headers: Headers
): WebhookVerificationResult {
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
  /**
   * Métadonnées transmises à l'initiation (organizationId, formule
   * commerciale et durée souscrite).
   */
  metadata: {
    organizationId?: string;
    planType?: string;
    durationMonths?: number;
  };
};

/**
 * Parse robuste de la durée souscrite renvoyée par l'agrégateur : certains
 * transitent en nombre, d'autres ré-encodent les metadata en chaînes.
 */
function parseDurationMonths(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return Number(value.trim());
  }

  return undefined;
}

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
      durationMonths: parseDurationMonths(stateData.durationMonths),
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
      durationMonths: parseDurationMonths(customData.durationMonths),
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
    // La passerelle a notifié un échec/rejet : on consigne un historique
    // traçable (statut FAILED) uniquement si la notification comporte une
    // référence de transaction + une organisation — les échecs sans
    // metadata restent ignorés (aucune ligne temporaire ne persiste).
    // Idempotent : une référence déjà connue n'est pas dupliquée.
    if (webhook.transactionReference && webhook.metadata.organizationId) {
      try {
        const already = await prisma.invoice.findUnique({
          where: { transactionReference: webhook.transactionReference },
          select: { id: true },
        });

        if (!already) {
          await prisma.invoice.create({
            data: {
              organizationId: webhook.metadata.organizationId,
              planType:
                typeof webhook.metadata.planType === "string"
                  ? webhook.metadata.planType
                  : "UNKNOWN",
              amount: webhook.amount ?? 0,
              currency: "XOF",
              paymentProvider: getPaymentConfig().provider,
              paymentMethod: webhook.method,
              transactionReference: webhook.transactionReference,
              status: "FAILED",
              description: "Paiement échoué (notification de la passerelle)",
            },
          });
        }
      } catch (error) {
        console.error(
          "[payment][webhook] Échec de l'enregistrement du paiement échoué :",
          error instanceof Error ? error.message : error
        );
      }
    }

    return { status: "ignored", message: "Paiement non réussi — ignoré." };
  }

  const { organizationId, planType, durationMonths } = webhook.metadata;

  // VALIDATION ZOD — Défense en profondeur. La signature HMAC garantit
  // l'origine du message, pas la validité de son contenu : on revalide la
  // forme des metadata AVANT toute écriture en base.
  const metadataCheck = validateWebhookMetadata(webhook.metadata);

  if (
    !organizationId ||
    !isPricingPlanType(planType) ||
    !isBillingDuration(durationMonths) ||
    !metadataCheck.valid
  ) {
    console.error(
      "[payment][webhook] Metadata manquante, invalide ou formule/durée inconnue :",
      metadataCheck.valid ? webhook.metadata : metadataCheck.reason
    );

    return {
      status: "error",
      message:
        "Metadata organizationId / planType / durationMonths absente ou invalide.",
      retryable: false,
    };
  }

  try {
    // Idempotence : une référence de transaction déjà traitée est ignorée.
    // La reference est d'abord validee (Zod) : une chaine arbitraire
    // injectee par un tiers ne doit jamais atteindre une requete Prisma.
    const referenceCheck = validateTransactionReference(
      webhook.transactionReference
    );

    if (!referenceCheck.valid) {
      console.error(
        `[payment][webhook] ${referenceCheck.reason} Notification rejetée.`
      );

      return {
        status: "error",
        message: "Référence de transaction inexploitable.",
        retryable: false,
      };
    }

    if (referenceCheck.value) {
      const existing = await prisma.invoice.findUnique({
        where: { transactionReference: referenceCheck.value },
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

    // 1. Tarif DYNAMIQUE (initial vs renouvellement selon l'historique de
    //    facturation) + période d'abonnement couverte par le paiement.
    const pricing = await calculateSubscriptionPrice(
      organizationId,
      planType,
      durationMonths
    );

    // Type de plan de LICENCE correspondant à la formule commerciale et à la
    // durée (ex : SAAS_CLOUD + 6 mois → SAAS_HALF_YEAR) — utilisé pour
    // `Organization.planType`, la facture et le payload signé.
    const licensePlanType = getLicensePlanTypeFor(planType, durationMonths);

    const periodStart = new Date();
    const periodEnd = addMonths(periodStart, durationMonths);

    // 2. Clé de licence signée Ed25519 (LICENSE_PRIVATE_KEY).
    //    `licensePlanType` est un LicensePlanType (pas de « TRIAL » : l'essai
    //    ne porte pas de clé).
    const licensePayload: LicensePayload = {
      organizationId,
      planType: licensePlanType,
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

    // Montant et moyen de paiement : validés (Zod) avant persistance pour
    // écarter les valeurs aberrantes transmises par l'agregateur.
    const amountCheck = validateWebhookAmount(webhook.amount);
    const methodCheck = validateWebhookLabel(webhook.method);

    if (!amountCheck.valid || !methodCheck.valid) {
      const reason = !amountCheck.valid
        ? amountCheck.reason
        : methodCheck.valid
          ? "Moyen de paiement inexploitable."
          : methodCheck.reason;

      console.error(`[payment][webhook] ${reason} Notification rejetée.`);

      return {
        status: "error",
        message: "Montant ou moyen de paiement inexploitable.",
        retryable: false,
      };
    }

    // 4. Mise a jour de l'organisation + enregistrement de la facture.
    await prisma.$transaction([
      prisma.organization.update({
        where: { id: organizationId },
        data: {
          planType: licensePlanType,
          planStatus: "ACTIVE",
          licenseKey,
          licenseEndsAt: periodEnd,
          trialEndsAt: null,
        },
      }),
      prisma.invoice.create({
        data: {
          organizationId,
          planType: licensePlanType,
          amount: amountCheck.value ?? pricing.amount,
          currency: pricing.currency,
          paymentProvider: getPaymentConfig().provider,
          paymentMethod: methodCheck.value,
          transactionReference: referenceCheck.value,
          status: "COMPLETED",
          description: `${pricing.label} EduFlow — ${organization.name}`,
          licenseKey,
          periodStart,
          periodEnd,
          paidAt: new Date(),
        },
      }),
    ]);

    console.log(
      `[payment][webhook] Abonnement ${pricing.label} activé pour ${organization.name} (jusqu'au ${periodEnd.toISOString()}).`
    );

    // Parrainage : si l'administrateur de cette organisation a été parrainé,
    // convertit la referral une seule fois — le parrain reçoit une RÉCOMPENSE
    // FIXE de 10 000 FCFA (voir src/lib/referral-conversion.ts, module
    // « server-only » : cette logique ne doit surtout pas être exposée
    // comme Server Action, sinon un utilisateur pourrait créditer la
    // récompense d'un tiers).
    try {
      const { convertReferralOnPayment } = await import(
        "@/lib/referral-conversion"
      );
      const orgAdmin = await prisma.user.findFirst({
        where: { organizationId, role: "ADMIN", referredById: { not: null } },
        select: { id: true },
      });
      if (orgAdmin) {
        await convertReferralOnPayment(orgAdmin.id, webhook.amount ?? pricing.amount);
      }
    } catch (refError) {
      console.error(
        "[payment][webhook] Échec de la conversion de la referral :",
        refError
      );
    }

    return {
      status: "success",
      message: `Abonnement ${pricing.label} activé jusqu'au ${periodEnd.toLocaleDateString("fr-FR")}.`,
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






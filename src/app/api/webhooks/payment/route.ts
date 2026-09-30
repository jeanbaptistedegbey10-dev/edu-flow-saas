// --------------------------------------
// Webhook de notification de paiement (Kkiapay / Fedapay)
// --------------------------------------
//
// Route PUBLIQUE : appelée server-to-server par la passerelle de paiement.
// Le proxy (src/proxy.ts) ne couvre que /dashboard et /super-admin — cette
// route n'y est jamais soumise. L'authentification repose sur la SIGNATURE
// du webhook (HMAC-SHA256 sur le corps brut), fail-closed : sans signature
// valide, la requête est rejetée avant tout traitement métier.
//
// Configuration côté agrégateur :
//   URL    : https://<domaine>/api/webhooks/payment
//   Secret : valeur de PAYMENT_WEBHOOK_SECRET (partagée des deux côtés)
//
// Sémantique de réponse :
//   200 → notification traitée (ou ignorée à dessein : metadata absente,
//         organisation inconnue, paiement déjà traité) ;
//   401 → signature absente/invalide (falsification suspectée) ;
//   400 → corps illisible ou inexploitable ;
//   422 → erreur permanente (l'agrégateur ne doit pas re-notifier) ;
//   500 → erreur transitoire (la passerelle re-notifiera : le traitement
//         est idempotent grâce à la référence de transaction unique) ;
//   503 → passerelle non configurée sur cette instance (réessai plus tard).

import { NextResponse } from "next/server";

import {
  activateSubscriptionAfterPayment,
  getPaymentConfigWithDb,
  isTestWebhookSecret,
  normalizeWebhookPayload,
  verifyWebhookSignature,
} from "@/lib/payment";
import { validateWebhookEnvelope } from "@/lib/payment-webhook-schema";

// Les webhooks ne doivent jamais être mis en cache ni pré-rendus.
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  // 1. Corps BRUT obligatoire : la signature porte sur les octets exacts
  //    envoyés par la passerelle (jamais sur un JSON re-sérialisé).
  let rawBody: string;

  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json(
      { error: "Corps de requête illisible." },
      { status: 400 }
    );
  }

  if (rawBody.length === 0) {
    return NextResponse.json(
      { error: "Corps de requête vide." },
      { status: 400 }
    );
  }

  const gatewayConfig = await getPaymentConfigWithDb();

  if (!gatewayConfig.publicKey || !gatewayConfig.secretKey || !gatewayConfig.webhookSecret) {
    console.error(
      "[webhooks/payment] Passerelle non configurée — notification ignorée."
    );

    // 503 : l'agrégateur réessaiera une fois la configuration en place.
    return NextResponse.json(
      { error: "Passerelle de paiement non configurée." },
      { status: 503 }
    );
  }

  const provider = gatewayConfig.provider;

  // 2. Garde-fou production : les secrets de webhook de TEST sont publiés
  //    dans le dépôt (SANDBOX_TEST_KEYS). Les accepter en production
  //    reviendrait à accepter des notifications signables par n'importe
  //    qui. Defense en profondeur, meme si le repli sandbox est bloque.
  if (
    process.env.NODE_ENV === "production" &&
    isTestWebhookSecret(gatewayConfig.webhookSecret)
  ) {
    console.error(
      "[webhooks/payment] Secret de webhook de TEST detecte en production — notification rejetee."
    );

    return NextResponse.json(
      { error: "Configuration de securite invalide." },
      { status: 503 }
    );
  }

  // 3. Vérification de la signature — fail-closed.
  const verification = verifyWebhookSignature(
    provider,
    rawBody,
    gatewayConfig.webhookSecret,
    request.headers
  );

  if (!verification.valid) {
    console.error(
      `[webhooks/payment] Signature invalide (${verification.reason}) — requête rejetée.`
    );

    return NextResponse.json(
      { error: "Signature de webhook invalide." },
      { status: 401 }
    );
  }

  // 3. Normalisation (Fedapay / Kkiapay → forme interne unique). Le corps
  //    signé a déjà été lu en brut : on le parse pour la normalisation.
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  // 4. Validation Zod de l'ENVELOPPE avant normalisation. La signature
  //    prouve l'origine du message, pas la validité de sa structure.
  const envelope = validateWebhookEnvelope(provider, parsed);

  if (!envelope.valid) {
    console.error(`[webhooks/payment] ${envelope.reason}`);

    return NextResponse.json(
      { error: "Payload de paiement inexploitable." },
      { status: 400 }
    );
  }

  const webhook = normalizeWebhookPayload(provider, parsed);

  if (!webhook) {
    return NextResponse.json(
      { error: "Payload de paiement inexploitable." },
      { status: 400 }
    );
  }

  // 5. Paiement réussi → activation automatique de l'abonnement
  //    (licence Ed25519 + mise à jour de l'organisation + facture).
  const outcome = await activateSubscriptionAfterPayment(webhook);

  switch (outcome.status) {
    case "success":
      return NextResponse.json({
        received: true,
        status: "activated",
        message: outcome.message,
      });

    case "ignored":
      // Notification signée mais sans effet (paiement non réussi, déjà
      // traité) — 200 pour stopper les re-essais de l'agrégateur.
      console.log(`[webhooks/payment] Notification ignorée : ${outcome.message}`);
      return NextResponse.json({
        received: true,
        status: "ignored",
        message: outcome.message,
      });

    case "error":
      // Erreur permanente (metadata invalide, organisation inconnue) vs
      // transitoire (base de données) : 422 vs 500 pour piloter les retries.
      return NextResponse.json(
        { error: outcome.message },
        { status: outcome.retryable ? 500 : 422 }
      );
  }
}


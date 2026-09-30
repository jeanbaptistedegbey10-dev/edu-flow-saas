import "server-only";

import { prisma } from "@/lib/prisma";
import { REFERRAL_REWARD_AMOUNT } from "@/lib/referral";

// --------------------------------------
// Conversion d'une referral lors d'un paiement (USAGE INTERNE)
// --------------------------------------
//
// SÉCURITÉ — Ce module est « server-only » et n'est PAS un fichier
// « use server ». C'est délibéré : `convertReferralOnPayment` manipule une
// donnée financière (récompense de parrainage) et ne doit surtout pas
// devenir un endpoint HTTP appelable depuis le navigateur.
//
// Tant qu'elle vivait dans `src/actions/referral.ts` (« use server »),
// n'importe quel utilisateur authentifié pouvait l'appeler avec un
// `userId` arbitraire et forcer la conversion d'un tiers — créditant une
// récompense de 10 000 FCFA induite (fraude au parrainage, cross-tenant).
//
// Seul `src/lib/payment.ts` l'importe, dans le webhook SIGNÉ, après avoir
// résolu le `userId` côté serveur à partir de l'organisation créditée.

/**
 * Met à jour le statut d'une referral en CONVERTED lorsque le filleul
 * souscrit un paiement réussi.
 *
 * La récompense est FIXE à 10 000 FCFA (cf. `REFERRAL_REWARD_AMOUNT`),
 * indépendante du montant du premier abonnement. La conversion n'a lieu
 * qu'une seule fois (une referral déjà CONVERTED est ignorée).
 *
 * @param userId        Identifiant du filleul (administrateur parrainé).
 * @param paymentAmount Montant du paiement (conservé pour compatibilité
 *                      d'appel ; la récompense étant fixe, il n'entre pas
 *                      dans le calcul).
 */
export async function convertReferralOnPayment(
  userId: string,
  paymentAmount: number
): Promise<void> {
  try {
    const referral = await prisma.referral.findUnique({
      where: { referredId: userId },
      select: { id: true, status: true },
    });

    if (!referral || referral.status === "CONVERTED") {
      return;
    }

    void paymentAmount; // récompense fixe — le montant du paiement n'est plus utilisé.
    const rewardAmount = REFERRAL_REWARD_AMOUNT; // 10 000 FCFA fixes

    await prisma.referral.update({
      where: { id: referral.id },
      data: {
        status: "CONVERTED",
        rewardAmount,
      },
    });

    console.log(
      `[referral] Referral ${referral.id} convertie : récompense fixe=${rewardAmount} FCFA`
    );
  } catch (error) {
    console.error("[convertReferralOnPayment] Échec de mise à jour :", error);
  }
}

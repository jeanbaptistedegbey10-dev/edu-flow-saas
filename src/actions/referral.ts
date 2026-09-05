"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getValidatedSessionContext } from "@/lib/session";

// --------------------------------------
// Types publics (contrat avec les composants clients)
// --------------------------------------

export type ReferralDTO = {
  id: string;
  referredId: string;
  referredName: string;
  referredEmail: string;
  status: string;
  rewardAmount: number;
  createdAt: Date;
};

export type ReferralStatsDTO = {
  referralCode: string;
  referralLink: string;
  totalReferrals: number;
  convertedReferrals: number;
  pendingReferrals: number;
  totalRewards: number;
  referrals: ReferralDTO[];
};

// --------------------------------------
// Server Actions
// --------------------------------------

/**
 * Récupère les statistiques de parrainage de l'utilisateur connecté :
 * code personnel, lien unique, nombre de filleuls, conversions et gains.
 */
export async function getReferralStats(
  baseUrl: string
): Promise<ReferralStatsDTO | null> {
  const context = await getValidatedSessionContext();

  if (!context) {
    return null;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: context.id },
      select: { referralCode: true },
    });

    const referralCode = user?.referralCode ?? null;

    if (!referralCode) {
      return {
        referralCode: "",
        referralLink: "",
        totalReferrals: 0,
        convertedReferrals: 0,
        pendingReferrals: 0,
        totalRewards: 0,
        referrals: [],
      };
    }

    const referralLink = `${baseUrl}/register?ref=${referralCode}`;

    // Récupère toutes les referrals avec les infos de l'utilisateur filleul.
    const referrals = await prisma.referral.findMany({
      where: { referrerId: context.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        referredId: true,
        status: true,
        rewardAmount: true,
        createdAt: true,
        referred: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    const totalReferrals = referrals.length;
    const convertedReferrals = referrals.filter(
      (r) => r.status === "CONVERTED"
    ).length;
    const pendingReferrals = referrals.filter(
      (r) => r.status === "PENDING"
    ).length;
    const totalRewards = referrals.reduce(
      (sum, r) => sum + r.rewardAmount,
      0
    );

    const referralDTOs: ReferralDTO[] = referrals.map((r) => ({
      id: r.id,
      referredId: r.referredId,
      referredName: `${r.referred.firstName} ${r.referred.lastName}`,
      referredEmail: r.referred.email ?? "",
      status: r.status,
      rewardAmount: r.rewardAmount,
      createdAt: r.createdAt,
    }));

    return {
      referralCode,
      referralLink,
      totalReferrals,
      convertedReferrals,
      pendingReferrals,
      totalRewards,
      referrals: referralDTOs,
    };
  } catch (error) {
    console.error("[getReferralStats] Échec de lecture :", error);
    return null;
  }
}

/**
 * Met à jour le statut d'une referral en CONVERTED lorsque le filleul
 * souscrit un paiement réussi. Appelée par le webhook de paiement
 * (src/lib/payment.ts → activateSubscriptionAfterPayment).
 * Montant de la récompense = 10 % du montant du premier abonnement (FCFA).
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

    const rewardAmount = Math.round(paymentAmount * 0.1); // 10 % de récompense

    await prisma.referral.update({
      where: { id: referral.id },
      data: {
        status: "CONVERTED",
        rewardAmount,
      },
    });

    console.log(
      `[referral] Referral ${referral.id} convertie : récompense=${rewardAmount} FCFA`
    );
  } catch (error) {
    console.error(
      "[convertReferralOnPayment] Échec de mise à jour :",
      error
    );
  }
}

/**
 * Génère (ou régénère) le code de parrainage d'un utilisateur.
 * Utilisé si le code est absent (comptes existants avant la feature).
 */
export async function ensureReferralCode(): Promise<string | null> {
  const context = await getValidatedSessionContext();

  if (!context) {
    return null;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: context.id },
      select: { id: true, referralCode: true },
    });

    if (!user) {
      return null;
    }

    if (user.referralCode) {
      return user.referralCode;
    }

    // Génère un code pour un utilisateur existant qui n'en a pas.
    const { createHash } = await import("crypto");
    const referralCode = createHash("sha256")
      .update(user.id)
      .digest("hex")
      .slice(0, 8)
      .toUpperCase();

    await prisma.user.update({
      where: { id: context.id },
      data: { referralCode },
    });

    revalidatePath("/dashboard/billing");

    return referralCode;
  } catch (error) {
    console.error("[ensureReferralCode] Échec :", error);
    return null;
  }
}

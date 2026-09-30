"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getValidatedSessionContext } from "@/lib/session";

// --------------------------------------
// Récompense de parrainage
// --------------------------------------
// La constante `REFERRAL_REWARD_AMOUNT` (10 000 FCFA) vit dans `@/lib/referral` :
// la contrainte Next.js interdit d'exporter des constantes depuis un fichier
// « use server » (build « Only async functions are allowed »). Elle n'est
// directement utilisée que par `@/lib/referral-conversion` (voir ci-dessous).

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

// --------------------------------------
// Conversion d'une referral lors d'un paiement
// --------------------------------------
//
// `convertReferralOnPayment` s'est déplacée vers `@/lib/referral-conversion`
// (module « server-only »). Motif de sécurité : tout export d'un fichier
// « use server » — donc de CE fichier — devient un endpoint HTTP public.
// Exposer ici la conversion aurait permis à n'importe quel utilisateur
// authentifié de forcer la conversion du parrainage d'un tiers et de
// créditer une récompense de 10 000 FCFA induite.

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

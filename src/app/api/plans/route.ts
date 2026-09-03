import { NextResponse } from "next/server";

import { getPlanPricingGrid } from "@/lib/payment";
import {
  DEFAULT_PLAN_PRICING,
  type PricingPlanType,
} from "@/lib/plan-pricing";

export const dynamic = "force-dynamic";

/**
 * GET /api/plans
 *
 * Source de vérité unique des tarifs affichés sur la page d'accueil publique :
 * la grille tarifaire dynamique `PlanPricing` (éditable par le Super-Admin
 * dans /portal-sys-admin-sec/pricing). Toute mise à jour des prix dans
 * l'administration se répercute donc automatiquement ici, sans redéploiement.
 *
 * Modèle « Acquisition + Renouvellement » :
 * - `initialPrice`          : prix de la 1ʳᵉ année (licence + logiciel) ;
 * - `renewalHalfYearPrice`  : renouvellement 6 mois (semestriel) ;
 * - `renewalAnnualPrice`    : renouvellement 12 mois (annuel).
 *
 * Stratégie de repli (dégradation gracieuse) :
 * 1. grille `PlanPricing` lue en base ;
 * 2. si la base est indisponible, constantes `DEFAULT_PLAN_PRICING`
 *    (miroir du seed) — la landing page ne casse jamais.
 */

/** Métadonnées commerciales statiques de chaque formule (non éditables). */
const PLAN_METADATA: Array<{
  planType: PricingPlanType;
  id: string;
  name: string;
  description: string;
  features: string[];
  popular: boolean;
  ctaText: string;
}> = [
  {
    planType: "SAAS_CLOUD",
    id: "saas-cloud",
    name: "SaaS Cloud",
    description: "Solution cloud cle en main, hebergee et mise a jour automatiquement.",
    features: [
      "Etudiants illimites",
      "Hebergement cloud securise",
      "Mises a jour automatiques",
      "Support email prioritaire",
      "Sauvegarde automatique",
      "Pipeline Visa complet",
      "POS & Caisse integres",
      "Portail etudiant",
    ],
    popular: true,
    ctaText: "Essai Gratuit 14 jours",
  },
  {
    planType: "SELF_HOSTED",
    id: "self-hosted",
    name: "Self-Hosted Docker",
    description: "Deployez sur vos propres serveurs pour un controle total de vos donnees.",
    features: [
      "Tout le plan SaaS Cloud",
      "Deploiement Docker sur vos serveurs",
      "Controle total des donnees",
      "API & integrations avancees",
      "Support email + telephone",
      "SLA 99.9%",
      "Multi-sites",
      "Account manager dedie",
    ],
    popular: false,
    ctaText: "Essai Gratuit 14 jours",
  },
  {
    planType: "DESKTOP_OFFLINE",
    id: "desktop-offline",
    name: "Desktop Offline",
    description: "Application bureau pour les zones a faible connectivite avec sync manuelle.",
    features: [
      "Jusqu'a 500 etudiants",
      "Fonctionnement 100% hors-ligne",
      "Synchronisation manuelle",
      "POS & Caisse hors-ligne",
      "Pipeline Visa local",
      "Bulletins et attestations",
      "Support email (48h)",
      "Mises a jour annuelles",
    ],
    popular: false,
    ctaText: "Telecharger la demo",
  },
];

export async function GET() {
  // Lecture de la grille tarifaire dynamique, avec repli sur les constantes
  // par défaut si la base est inaccessible (build / démarrage à froid…).
  let grid: Record<PricingPlanType, { initialPrice: number; renewalAnnualPrice: number; renewalHalfYearPrice: number }>;

  try {
    const dbGrid = await getPlanPricingGrid();
    grid = {
      SAAS_CLOUD: {
        initialPrice: dbGrid.SAAS_CLOUD.initialPrice,
        renewalAnnualPrice: dbGrid.SAAS_CLOUD.renewalAnnualPrice,
        renewalHalfYearPrice: dbGrid.SAAS_CLOUD.renewalHalfYearPrice,
      },
      SELF_HOSTED: {
        initialPrice: dbGrid.SELF_HOSTED.initialPrice,
        renewalAnnualPrice: dbGrid.SELF_HOSTED.renewalAnnualPrice,
        renewalHalfYearPrice: dbGrid.SELF_HOSTED.renewalHalfYearPrice,
      },
      DESKTOP_OFFLINE: {
        initialPrice: dbGrid.DESKTOP_OFFLINE.initialPrice,
        renewalAnnualPrice: dbGrid.DESKTOP_OFFLINE.renewalAnnualPrice,
        renewalHalfYearPrice: dbGrid.DESKTOP_OFFLINE.renewalHalfYearPrice,
      },
    };
  } catch (error) {
    console.error("[GET /api/plans] Grille tarifaire indisponible, repli sur les valeurs par défaut :", error);
    grid = DEFAULT_PLAN_PRICING;
  }

  const plans = PLAN_METADATA.map((metadata) => {
    const pricing = grid[metadata.planType];

    return {
      id: metadata.id,
      name: metadata.name,
      price: {
        initial: pricing.initialPrice,
        semiAnnual: pricing.renewalHalfYearPrice,
        annually: pricing.renewalAnnualPrice,
      },
      description: metadata.description,
      features: metadata.features,
      popular: metadata.popular,
      ctaText: metadata.ctaText,
      checkoutUrl: {
        initial: `/register?plan=${metadata.id}&billing=initial`,
        semiAnnual: `/register?plan=${metadata.id}&billing=semi-annual`,
        annually: `/register?plan=${metadata.id}&billing=annually`,
      },
    };
  });

  return NextResponse.json({ plans });
}


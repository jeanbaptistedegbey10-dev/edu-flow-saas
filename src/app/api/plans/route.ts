import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/plans
 * Returns the list of active pricing plans.
 * This route is the single source of truth for pricing data displayed on the
 * public landing page. When an admin updates plans in the database, the
 * changes automatically reflect here.
 */
export async function GET() {
  const plans = [
    {
      id: "saas-cloud",
      name: "SaaS Cloud",
      price: { monthly: 20000, annually: 200000 },
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
      checkoutUrl: {
        monthly: "/register?plan=saas-cloud&billing=monthly",
        annually: "/register?plan=saas-cloud&billing=annually",
      },
    },
    {
      id: "self-hosted",
      name: "Self-Hosted Docker",
      price: { monthly: 120000, annually: 1200000 },
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
      checkoutUrl: {
        monthly: "/register?plan=self-hosted&billing=monthly",
        annually: "/register?plan=self-hosted&billing=annually",
      },
    },
    {
      id: "desktop-offline",
      name: "Desktop Offline",
      price: { monthly: 60000, annually: 600000 },
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
      checkoutUrl: {
        monthly: "/register?plan=desktop-offline&billing=monthly",
        annually: "/register?plan=desktop-offline&billing=annually",
      },
    },
  ];

  return NextResponse.json({ plans });
}

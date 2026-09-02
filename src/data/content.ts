// ============================================================================
// EduFlow Landing Page - Central Data Source
// ============================================================================

export interface NavLink {
  label: string;
  href: string;
}

export interface PricingPlan {
  id: string;
  name: string;
  price: {
    monthly: number;
    annually: number;
  };
  description: string;
  features: string[];
  popular?: boolean;
  ctaText: string;
  checkoutUrl: {
    monthly: string;
    annually: string;
  };
}

export interface Feature {
  id: string;
  title: string;
  description: string;
  icon: string;
  items: string[];
}

export interface FAQItem {
  question: string;
  answer: string;
}

export interface Stat {
  value: string;
  label: string;
  icon: string;
}

export interface VisaStep {
  step: number;
  title: string;
  status: "completed" | "current" | "upcoming";
}

// Navigation
export const NAV_LINKS: NavLink[] = [
  { label: "Fonctionnalites", href: "#features" },
  { label: "Tarifs", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

// Stats
export const STATS: Stat[] = [
  { value: "150+", label: "Centres de formation", icon: "Building2" },
  { value: "25 000+", label: "Etudiants geres", icon: "GraduationCap" },
  { value: "15+", label: "Pays couverts", icon: "Globe" },
  { value: "4.9/5", label: "Satisfaction client", icon: "Star" },
];

// Features
export const FEATURES: Feature[] = [
  {
    id: "language-courses",
    title: "Gestion des Cours de Langues",
    description: "Creez et gerez des sessions de formation par langue et par niveau. Assignez des formateurs, suivez les presences et generez des attestations.",
    icon: "GraduationCap",
    items: [
      "Sessions par langue et niveau (A1-C2)",
      "Suivi des presences par QR code",
      "Bulletins et attestations automatiques",
      "Gestion des formateurs et emplois du temps",
    ],
  },
  {
    id: "visa-pipeline",
    title: "Pipeline Visa & Immigration",
    description: "Accompagnez vos clients dans leurs demarches d\'immigration avec un suivi visuel etape par etape.",
    icon: "IdCard",
    items: [
      "Suivi visuel des dossiers par etape",
      "Checklist documentaire personnalisee",
      "Rendez-vous consulaires et relances",
      "Alertes deadlines automatiques",
    ],
  },
  {
    id: "pos-cash",
    title: "POS & Caisse",
    description: "Gerez les encaissements de votre centre avec les moyens de paiement locaux et les paiements par tranche.",
    icon: "CreditCard",
    items: [
      "Especes, Mobile Money (MTN, Moov, Wave)",
      "Paiements par tranche et virements",
      "Recus automatiques et journal de caisse",
      "Rapports financiers en temps reel",
    ],
  },
  {
    id: "student-portal",
    title: "Portail Etudiant",
    description: "Offrez a vos apprenants un espace personnel pour suivre leur progression et leur dossier.",
    icon: "Users",
    items: [
      "Emploi du temps personnel",
      "Notes, bulletins et attestations",
      "Suivi du dossier visa",
      "Notifications automatiques",
    ],
  },
];

// Pricing Plans
export const PRICING_DATA: PricingPlan[] = [
  {
    id: "starter",
    name: "Starter",
    price: { monthly: 29000, annually: 290000 },
    description: "Ideal pour les petits centres de formation qui demarrent avec la gestion numerique.",
    features: [
      "Jusqu\'a 50 etudiants",
      "Gestion des cours et emplois du temps",
      "Portail etudiant",
      "Support email",
    ],
    ctaText: "Commencer gratuitement",
    checkoutUrl: {
      monthly: "/checkout?plan=starter&billing=monthly",
      annually: "/checkout?plan=starter&billing=annually",
    },
  },
  {
    id: "professional",
    name: "Professional",
    price: { monthly: 79000, annually: 790000 },
    description: "Pour les centres de formation et agences de voyage en croissance.",
    features: [
      "Jusqu\'a 500 etudiants",
      "Gestion multilingue et pipeline visa",
      "Module POS & Caisse",
      "Rapports et analytics",
      "Support prioritaire",
    ],
    popular: true,
    ctaText: "Demarrer l\'essai",
    checkoutUrl: {
      monthly: "/checkout?plan=professional&billing=monthly",
      annually: "/checkout?plan=professional&billing=annually",
    },
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: { monthly: 199000, annually: 1990000 },
    description: "Solution sur mesure pour les reseaux de centres et grandes agences.",
    features: [
      "Etudiants illimites",
      "Multi-sites et multi-utilisateurs",
      "Licence Self-Hosted disponible",
      "API et integrations personnalisees",
      "Account manager dedie",
      "SLA garanti 99.9%",
    ],
    ctaText: "Contacter les ventes",
    checkoutUrl: {
      monthly: "/checkout?plan=enterprise&billing=monthly",
      annually: "/checkout?plan=enterprise&billing=annually",
    },
  },
];

// FAQ
export const FAQ_DATA: FAQItem[] = [
  {
    question: "Comment fonctionne la gestion des langues ?",
    answer: "EduFlow vous permet de creer des sessions par langue et par niveau (A1, A2, B1, B2, etc.), d\'assigner des formateurs, de suivre les presences via QR code, et de generer automatiquement des bulletins et attestations de fin de formation."
  },
  {
    question: "Puis-je suivre les procedures de visa etape par etape ?",
    answer: "Oui, EduFlow integre un pipeline visuel complet pour suivre chaque dossier d\'immigration : depot de documents, relances administratives, rendez-vous consulaires et obtention du visa."
  },
  {
    question: "L\'application fonctionne-t-elle hors-ligne ?",
    answer: "Absolument. En plus de l\'offre SaaS Cloud, nous proposons une version Desktop Offline (.exe) parfaitement adaptee aux zones a faible connectivite avec synchronisation differee."
  },
  {
    question: "Quels moyens de paiement locaux sont supportes ?",
    answer: "Le module POS & Caisse gere les encaissements en especes, Mobile Money (MTN, Moov, Wave) et virements, avec gestion des paiements par tranche et recus automatiques."
  },
  {
    question: "Les etudiants ont-ils acces a un espace personnel ?",
    answer: "Oui, un portail etudiant dedie permet a vos apprenants de consulter leurs emargements, notes, bulletins et l\'avancement de leur dossier de visa."
  },
  {
    question: "Puis-je changer de formule a tout moment ?",
    answer: "Oui, vous pouvez passer d\'une formule SaaS Cloud a une licence Self-Hosted ou Desktop selon l\'evolution de votre centre."
  }
];

// Visa Timeline Steps
export const VISA_TIMELINE_STEPS: VisaStep[] = [
  { step: 1, title: "Inscription", status: "completed" },
  { step: 2, title: "Documents", status: "completed" },
  { step: 3, title: "Entretien", status: "current" },
  { step: 4, title: "Visa", status: "upcoming" },
];

// Footer Links
export const FOOTER_LINKS = {
  product: [
    { label: "Fonctionnalites", href: "#features" },
    { label: "Tarifs", href: "#pricing" },
    { label: "FAQ", href: "#faq" },
    { label: "Connexion", href: "/auth/login" },
  ],
  company: [
    { label: "A propos", href: "#" },
    { label: "Blog", href: "#" },
    { label: "Carrieres", href: "#" },
    { label: "Contact", href: "#" },
  ],
  legal: [
    { label: "Conditions d\'utilisation", href: "#" },
    { label: "Politique de confidentialite", href: "#" },
    { label: "Mentions legales", href: "#" },
    { label: "RGPD", href: "#" },
  ],
  social: [
    { label: "Facebook", href: "#", icon: "Globe" },
    { label: "Twitter", href: "#", icon: "MessageCircle" },
    { label: "LinkedIn", href: "#", icon: "ExternalLink" },
    { label: "Instagram", href: "#", icon: "Share2" },
  ],
};
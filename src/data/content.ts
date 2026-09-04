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
    /** Prix initial : 1ʳᵉ année (licence + logiciel). */
    initial: number;
    /** Prix de renouvellement pour 6 mois (semestriel). */
    semiAnnual: number;
    /** Prix de renouvellement pour 12 mois (annuel). */
    annually: number;
  };
  description: string;
  features: string[];
  popular?: boolean;
  ctaText: string;
  checkoutUrl: {
    initial: string;
    semiAnnual: string;
    annually: string;
  };
}

export interface ComparisonRow {
  category: string;
  items: {
    feature: string;
    saasCloud: string | boolean;
    selfHosted: string | boolean;
    desktopOffline: string | boolean;
  }[];
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
  { label: "Tarifs", href: "#tarifs" },
  { label: "FAQ", href: "#faq" },
];

// Stats
// Statistiques conformes au produit (aucune métrique hypothétique).
export const STATS: Stat[] = [
  { value: "150+", label: "Centres équipés", icon: "Building2" },
  { value: "5+", label: "Années d'expérience", icon: "GraduationCap" },
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
      "Suivi des presences",
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
// Valeurs de repli : miroir de `DEFAULT_PLAN_PRICING` (src/lib/plan-pricing.ts)
// et du seed de la migration `20260901000000_add_plan_pricing`. La source de
// vérité reste l'API `/api/plans` (table `PlanPricing`, éditable par le
// Super-Admin) — ces montants ne servent qu'en cas d'indisponibilité.
export const PRICING_DATA: PricingPlan[] = [
  {
    id: "saas-cloud",
    name: "SaaS Cloud",
    price: { initial: 80000, semiAnnual: 30000, annually: 50000 },
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
      initial: "/register?plan=saas-cloud&billing=initial",
      semiAnnual: "/register?plan=saas-cloud&billing=semi-annual",
      annually: "/register?plan=saas-cloud&billing=annually",
    },
  },
  {
    id: "self-hosted",
    name: "Self-Hosted Docker",
    price: { initial: 160000, semiAnnual: 45000, annually: 80000 },
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
    ctaText: "Essai Gratuit 14 jours",
    checkoutUrl: {
      initial: "/register?plan=self-hosted&billing=initial",
      semiAnnual: "/register?plan=self-hosted&billing=semi-annual",
      annually: "/register?plan=self-hosted&billing=annually",
    },
  },
  {
    id: "desktop-offline",
    name: "Desktop Offline",
    price: { initial: 160000, semiAnnual: 45000, annually: 80000 },
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
    ctaText: "Telecharger la demo",
    checkoutUrl: {
      initial: "/register?plan=desktop-offline&billing=initial",
      semiAnnual: "/register?plan=desktop-offline&billing=semi-annual",
      annually: "/register?plan=desktop-offline&billing=annually",
    },
  },
];

// Comparison Matrix
export const COMPARISON_MATRIX: ComparisonRow[] = [
  {
    category: "GESTION ACADÉMIQUE & COURS",
    items: [
      { feature: "Gestion des étudiants & inscriptions", saasCloud: "Illimité", selfHosted: "Illimité", desktopOffline: "Jusqu'à 500" },
      { feature: "Suivi des niveaux de langue (A1 à C2)", saasCloud: true, selfHosted: true, desktopOffline: true },
      { feature: "Marquage de présence (émargement quotidien)", saasCloud: true, selfHosted: true, desktopOffline: "Hors-ligne" },
      { feature: "Gestion des notes & bulletins d'évaluation", saasCloud: true, selfHosted: true, desktopOffline: true },
    ],
  },
  {
    category: "SUIVI VISA & IMMIGRATIONS",
    items: [
      { feature: "Pipeline de suivi des demandes de Visa (étape par étape)", saasCloud: true, selfHosted: true, desktopOffline: true },
      { feature: "Checklist des documents consulaires", saasCloud: true, selfHosted: true, desktopOffline: true },
      { feature: "Alertes & rappels d'échéances de dossiers", saasCloud: true, selfHosted: true, desktopOffline: false },
    ],
  },
  {
    category: "FINANCE & ADMINISTRATION",
    items: [
      { feature: "Gestion de la caisse POS & émission de reçus", saasCloud: true, selfHosted: true, desktopOffline: "Hors-ligne" },
      { feature: "Suivi des paiements de scolarité & relances", saasCloud: true, selfHosted: true, desktopOffline: "Manuel" },
      { feature: "Exportation de rapports financiers & statistiques", saasCloud: true, selfHosted: true, desktopOffline: "Limité" },
      { feature: "Mobile Money (MTN, Moov, Wave)", saasCloud: true, selfHosted: "Configurable", desktopOffline: false },
    ],
  },
  {
    category: "PLATEFORME, SÉCURITÉ & SUPPORT",
    items: [
      { feature: "Multi-utilisateurs", saasCloud: true, selfHosted: true, desktopOffline: "1 utilisateur" },
      { feature: "Déploiement", saasCloud: "Cloud géré", selfHosted: "Docker (vos serveurs)", desktopOffline: "Windows local" },
      { feature: "Portail étudiant", saasCloud: true, selfHosted: true, desktopOffline: false },
      { feature: "Synchronisation cloud", saasCloud: true, selfHosted: false, desktopOffline: "Manuelle" },
      { feature: "Support", saasCloud: "Email prioritaire", selfHosted: "Email + téléphone", desktopOffline: "Email (48h)" },
      { feature: "Mises à jour", saasCloud: "Incluses", selfHosted: "Incluses", desktopOffline: "Annuelles" },
    ],
  },
];

// FAQ
export const FAQ_DATA: FAQItem[] = [
  {
    question: "Comment fonctionne le suivi des cours de langues ?",
    answer: "EduFlow permet de creer des sessions par langue et par niveau (A1 a C2), d'assigner des formateurs, de suivre les presences, et de generer automatiquement des bulletins et attestations de fin de formation. Chaque etudiant dispose d'un historique complet de sa progression.",
  },
  {
    question: "Comment est gere le pipeline de visa et d'immigration ?",
    answer: "Le pipeline visa offre un suivi visuel etape par etape de chaque dossier : depot de documents, relances administratives, rendez-vous consulaires et obtention du visa. Des alertes automatiques vous evitent de manquer une deadline.",
  },
  {
    question: "L'application fonctionne-t-elle en mode hors-ligne ?",
    answer: "Oui. La version Desktop Offline (Windows) permet de gerer vos cours, presences et dossiers sans connexion Internet. Une synchronisation manuelle permet de reunir les donnees avec le cloud lorsque la connectivite est retablie."
  },
  {
    question: "Quels moyens de paiement locaux sont integres au POS ?",
    answer: "Le module POS & Caisse gere les encaissements en especes, Mobile Money (MTN, Moov, Wave) et virements bancaires. Les paiements par tranche sont supportes et les recus sont generes automatiquement pour chaque transaction."
  },
  {
    question: "Les etudiants ont-ils acces a un portail personnel ?",
    answer: "Oui, chaque etudiant dispose d'un portail dedie pour consulter son emploi du temps, ses notes, bulletins, attestations, et l'avancement de son dossier de visa. Des notifications automatiques les informent des evenements importants.",
  },
  {
    question: "Puis-je changer de formule ou migrer vers une autre version ?",
    answer: "Absolument. Vous pouvez passer du SaaS Cloud au Self-Hosted Docker ou a la version Desktop Offline a tout moment. La migration des donnees est accompagnee par notre support pour garantir une transition sans interruption.",
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
    { label: "Tarifs", href: "#tarifs" },
    { label: "FAQ", href: "#faq" },
    { label: "Connexion", href: "/login" },
  ],
  company: [
    { label: "A propos", href: "/" },
    { label: "Contact", href: "/contact" },
  ],
  legal: [
    { label: "Conditions d\'utilisation", href: "/conditions-d-utilisation" },
    { label: "Politique de confidentialite", href: "/politique-de-confidentialite" },
    { label: "Mentions legales", href: "/mentions-legales" },
    { label: "RGPD", href: "/politique-de-confidentialite" },
  ],
  social: [
    { label: "Facebook", href: "#", icon: "Globe" },
    { label: "Twitter", href: "#", icon: "MessageCircle" },
    { label: "LinkedIn", href: "#", icon: "ExternalLink" },
    { label: "Instagram", href: "#", icon: "Share2" },
  ],
};
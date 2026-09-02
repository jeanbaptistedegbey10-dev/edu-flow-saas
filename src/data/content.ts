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
    ctaText: "Telecharger la demo",
    checkoutUrl: {
      monthly: "/register?plan=desktop-offline&billing=monthly",
      annually: "/register?plan=desktop-offline&billing=annually",
    },
  },
];

// Comparison Matrix
export const COMPARISON_MATRIX: ComparisonRow[] = [
  {
    category: "GESTION",
    items: [
      { feature: "Clients / Etudiants", saasCloud: "Illimites", selfHosted: "Illimites", desktopOffline: "Jusqu'a 500" },
      { feature: "Inscriptions", saasCloud: true, selfHosted: true, desktopOffline: true },
      { feature: "Multi-utilisateurs", saasCloud: true, selfHosted: true, desktopOffline: "1 utilisateur" },
    ],
  },
  {
    category: "COURS DE LANGUE",
    items: [
      { feature: "Sessions A1-B2", saasCloud: true, selfHosted: true, desktopOffline: true },
      { feature: "Presences QR", saasCloud: true, selfHosted: true, desktopOffline: "Hors-ligne" },
      { feature: "Bulletins & attestations", saasCloud: true, selfHosted: true, desktopOffline: true },
      { feature: "Gestion formateurs", saasCloud: true, selfHosted: true, desktopOffline: true },
    ],
  },
  {
    category: "SUIVI VISA",
    items: [
      { feature: "Pipeline d'immigration", saasCloud: true, selfHosted: true, desktopOffline: true },
      { feature: "Depot documents", saasCloud: "Cloud", selfHosted: "Local", desktopOffline: "Local" },
      { feature: "Relances automatiques", saasCloud: true, selfHosted: "Configurable", desktopOffline: false },
      { feature: "Alertes deadlines", saasCloud: true, selfHosted: true, desktopOffline: false },
    ],
  },
  {
    category: "POS & CAISSE",
    items: [
      { feature: "Encaissements", saasCloud: true, selfHosted: true, desktopOffline: true },
      { feature: "Paiement par tranche", saasCloud: true, selfHosted: true, desktopOffline: true },
      { feature: "Recus automatiques", saasCloud: true, selfHosted: true, desktopOffline: "Local" },
      { feature: "Mobile Money (MTN, Moov, Wave)", saasCloud: true, selfHosted: "Configurable", desktopOffline: false },
    ],
  },
  {
    category: "EXPORTS & SUPPORT",
    items: [
      { feature: "Exports PDF / Excel", saasCloud: true, selfHosted: true, desktopOffline: "Limite" },
      { feature: "Support", saasCloud: "Email prioritaire", selfHosted: "Email + telephone", desktopOffline: "Email (48h)" },
      { feature: "Mises a jour", saasCloud: "Incluses", selfHosted: "Incluses", desktopOffline: "Annuelles" },
      { feature: "Synchronisation cloud", saasCloud: true, selfHosted: false, desktopOffline: false },
    ],
  },
];

// FAQ
export const FAQ_DATA: FAQItem[] = [
  {
    question: "Comment fonctionne le suivi des cours de langues ?",
    answer: "EduFlow permet de creer des sessions par langue et par niveau (A1 a C2), d'assigner des formateurs, de suivre les presences via QR code, et de generer automatiquement des bulletins et attestations de fin de formation. Chaque etudiant dispose d'un historique complet de sa progression.",
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
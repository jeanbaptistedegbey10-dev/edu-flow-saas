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
  { value: "2 500+", label: "Etudiants accompagnes", icon: "GraduationCap" },
  { value: "98%", label: "Taux de reussite visa", icon: "ShieldCheck" },
  { value: "15+", label: "Pays partenaires", icon: "Globe" },
  { value: "4.9/5", label: "Satisfaction client", icon: "Star" },
];

// Features
export const FEATURES: Feature[] = [
  {
    id: "campus-france",
    title: "Campus France",
    description: "Accompagnement complet dans vos demarches Campus France : constitution du dossier, preparation aux entretiens et suivi personnalise.",
    icon: "Building2",
    items: [
      "Inscription et compte Campus France",
      "Redaction du projet motive",
      "Preparation entretien l\'etranger",
      "Suivi du dossier en temps reel",
    ],
  },
  {
    id: "visa",
    title: "Demande de Visa",
    description: "Guide etape par etape pour votre demande de visa etudiant. Documents, rendez-vous consulaires et preparation aux entretiens.",
    icon: "IdCard",
    items: [
      "Liste de documents personnalisee",
      "Preparation a l\'entretien visa",
      "Suivi de la demande en temps reel",
      "Conseils pays par pays",
    ],
  },
  {
    id: "accommodation",
    title: "Recherche de Logement",
    description: "Trouvez votre logement etudiant a l\'etranger : residences universitaires, colocations ou familles d\'accueil.",
    icon: "Home",
    items: [
      "Residences universitaires CROUS",
      "Colocations verifiees",
      "Familles d\'accueil",
      "Garant et caution solidaire",
    ],
  },
  {
    id: "tracking",
    title: "Suivi de Dossier",
    description: "Tableau de bord interactif pour suivre l\'avancement de votre candidature et de votre visa a chaque etape.",
    icon: "ClipboardCheck",
    items: [
      "Statut en temps reel",
      "Notifications intelligentes",
      "Historique complet",
      "Alertes deadlines",
    ],
  },
];

// Pricing Plans
export const PRICING_DATA: PricingPlan[] = [
  {
    id: "starter",
    name: "Pack Etudiant Standard",
    price: { monthly: 0, annually: 0 },
    description: "Ideal pour demarches de candidature en autonomie.",
    features: [
      "Acces au catalogue des universites",
      "Suivi de dossier de base",
      "Modeles de CV et Lettres de motivation",
      "Support communautaire",
    ],
    popular: false,
    ctaText: "Commencer gratuitement",
    checkoutUrl: {
      monthly: "/auth/signup?plan=starter",
      annually: "/auth/signup?plan=starter",
    },
  },
  {
    id: "premium",
    name: "Pack Accompagnement Visa",
    price: { monthly: 15000, annually: 150000 },
    description: "Une prise en charge complete pour reussir votre projet d\'etude a l\'international.",
    features: [
      "Tout ce qu\'il y a dans le Pack Standard",
      "Verification personnalisee des documents",
      "Simulation d\'entretien Campus France / Visa",
      "Assistance recherche de logement et garant",
      "Support prioritaire 7j/7",
    ],
    popular: true,
    ctaText: "Souscrire maintenant",
    checkoutUrl: {
      monthly: "/checkout?plan=premium&billing=monthly",
      annually: "/checkout?plan=premium&billing=annually",
    },
  },
];

// FAQ
export const FAQ_DATA: FAQItem[] = [
  {
    question: "Comment fonctionne l\'accompagnement EduFlow ?",
    answer: "EduFlow vous accompagne a chaque etape de votre projet d\'etudes a l\'international. Apres votre inscription, un conseiller dedie analyse votre profil et vos objectifs. Vous accedez ensuite a un tableau de bord personnalise avec des taches guidees, des modeles de documents et un suivi en temps reel de votre progression.",
  },
  {
    question: "Quels sont les delais pour obtenir un visa etudiant ?",
    answer: "Les delais varient selon le pays de destination : comptez en moyenne 2 a 4 semaines pour un visa Schengen etudiant, 3 a 6 semaines pour le Canada, et 4 a 8 semaines pour les Etats-Unis. Notre Pack Premium inclut un planning personnalise pour optimiser vos delais.",
  },
  {
    question: "Le paiement est-il securise ?",
    answer: "Absolument. Tous les paiements sont securises via des partenaires certifies PCI-DSS (KKiaPay, FedaPay, Mobile Money). Vos donnees bancaires ne sont jamais stockees sur nos serveurs. Vous beneficiez d\'une garantie satisfait ou rembourse de 14 jours.",
  },
  {
    question: "Puis-je changer de formule a tout moment ?",
    answer: "Oui, vous pouvez passer du Pack Standard au Pack Premium a tout moment. La difference de tarif sera calculee au prorata. Pour un passage a l\'annuel, contactez notre equipe qui s\'occupera de la transition sans interruption de service.",
  },
  {
    question: "Proposez-vous un support en francais et en anglais ?",
    answer: "Oui, notre equipe multilingue vous accompagne en francais, anglais et selon la langue de votre pays de destination. Le Pack Premium inclut un support prioritaire 7j/7 par chat, email et telephone.",
  },
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

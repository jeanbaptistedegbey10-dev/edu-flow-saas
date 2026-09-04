import type { ComponentType } from "react";

import {
  BookOpenCheckIcon,
  CalendarCheckIcon,
  CalendarClockIcon,
  CloudOffIcon,
  DownloadIcon,
  FileCheckIcon,
  KeyRoundIcon,
  ListChecksIcon,
  MoonIcon,
  PlaneTakeoffIcon,
  SchoolIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  StoreIcon,
  UserCogIcon,
  UsersRoundIcon,
  WalletIcon,
} from "lucide-react";

/**
 * Base de connaissances exhaustive de l'assistant d'aide EduFlow.
 *
 * Chaque sujet décrit un workflow réel de l'application (route cible, guide pas
 * à pas) et fournit des listes riches de mots-clés et de synonymes consommées
 * par le moteur de recherche flou local (`src/utils/helpSearchEngine.ts`) ainsi
 * que par la route `/api/chat` (ancrage du prompt Gemini).
 *
 * Le fichier ne contient que des données : il est importable côté client
 * (widget d'aide) comme côté serveur (route API).
 */

/** Identifiants des maquettes Generative UI disponibles (`HelpUiPreview`). */
export type HelpTopicId =
  | "attendance"
  | "enrollment"
  | "visa"
  | "pos"
  | "teachers"
  | "classes"
  | "grades"
  | "visa-documents"
  | "visa-appointment"
  | "visa-status"
  | "payments"
  | "mobile-money"
  | "financial-exports"
  | "roles"
  | "dark-mode"
  | "password-reset"
  | "offline-sync";

/** Grandes familles de sujets (pédagogie, visa, finance, système). */
export type HelpTopicCategory = "academic" | "visa" | "finance" | "system";

export type HelpTopic = {
  /** Identifiant de la maquette Generative UI à afficher. */
  id: HelpTopicId;
  /** Catégorie fonctionnelle. */
  category: HelpTopicCategory;
  /** Icône illustrative (lucide-react). */
  icon: ComponentType<{ className?: string }>;
  /** Sujet mis en avant dans les suggestions rapides du widget. */
  featured: boolean;
  /** Question d'exemple affichée dans les suggestions rapides. */
  question: string;
  /** Route de navigation directe proposée à la fin de la réponse. */
  route: string;
  /** Nom lisible de la section cible (menu latéral). */
  routeName: string;
  /** Phrase d'introduction de la réponse. */
  intro: string;
  /** Guide pas à pas. */
  steps: string[];
  /** Mots-clés déclencheurs (normalisés, sans accents). */
  keywords: string[];
  /** Synonymes & expressions utiles (poids légèrement réduit dans la recherche). */
  synonyms: string[];
};

// --------------------------------------
// Coordonnées de l'escalade humaine
// --------------------------------------

/**
 * Coordonnées support officielles d'EduFlow (cohérentes avec la page /contact
 * et les mentions légales). Le message WhatsApp est prérempli.
 */
export const SUPPORT_CONTACT = {
  /** Numéro WhatsApp au format international sans « + » ni espaces. */
  whatsappNumber: "22900000000",
  /** Message prérempli du bouton WhatsApp. */
  defaultMessage: "Bonjour, j'ai besoin d'aide sur EduFlow...",
  email: "contact@eduflow.com",
  phoneDisplay: "+229 00 00 00 00",
  phoneHref: "tel:+22900000000",
  hours: "Lundi – Vendredi, 8 h – 18 h",
} as const;

/** Construit l'URL WhatsApp avec un message prérempli (contexte facultatif). */
export function buildWhatsAppUrl(context?: string): string {
  const message = context
    ? `${SUPPORT_CONTACT.defaultMessage} (Sujet : ${context})`
    : SUPPORT_CONTACT.defaultMessage;

  return `https://wa.me/${SUPPORT_CONTACT.whatsappNumber}?text=${encodeURIComponent(message)}`;
}

/**
 * Déclencheurs d'escalade humaine : si la question contient l'un de ces mots
 * ou expressions (mots entiers, sans accents), le widget affiche la carte
 * « Parler à un humain » avant même de chercher un guide.
 */
export const HUMAN_SUPPORT_TRIGGERS = [
  "humain",
  "humaine",
  "vraie personne",
  "personne reelle",
  "agent",
  "support",
  "assistance",
  "conseiller",
  "service client",
  "contact",
  "contacter",
  "telephone",
  "numero de telephone",
  "whatsapp",
  "appeler",
  "joignable",
  "parler a quelqu un",
  "parler a un humain",
  "email",
  "e mail",
  "mail",
] as const;

/** Retrouve un sujet par son identifiant (sécurise les réponses distantes). */
export function getHelpTopicById(id: string): HelpTopic | undefined {
  return HELP_TOPICS.find((topic) => topic.id === id);
}


// --------------------------------------
// Base de connaissances
// --------------------------------------

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: "enrollment",
    icon: UsersRoundIcon,
    category: "academic",
    featured: true,
    question: "Comment associer un étudiant à un cours ?",
    route: "/dashboard/students",
    routeName: "Étudiants",
    intro:
      "Pour associer un étudiant à un cours, on l'inscrit dans sa « Classe / Cohorte » : c'est elle qui le rattache aux cours, à l'emploi du temps et au registre d'appel. Voici la marche à suivre :",
    steps: [
      "Ouvrez le menu « Étudiants » dans la barre latérale, puis cliquez sur « Ajouter un étudiant ».",
      "Renseignez les informations de base : prénom, nom, e-mail et téléphone.",
      "Dans la liste déroulante « Classe / Cohorte », sélectionnez la classe correspondant au cours souhaité (ex. « Anglais A2 — Matin »).",
      "Les frais de scolarité se verrouillent automatiquement sur le tarif de la classe choisie.",
      "Enregistrez : l'étudiant apparaît immédiatement dans la classe, l'emploi du temps et la feuille de présence du professeur.",
    ],
    keywords: [
      "etudiant",
      "etudiants",
      "eleve",
      "eleves",
      "classe",
      "cohorte",
      "cours",
      "associer",
      "affecter",
      "inscrire",
      "inscription",
      "ajouter",
      "rattacher",
      "admission",
    ],
    synonyms: [
      "inscrire un etudiant",
      "nouvel etudiant",
      "ajouter un eleve",
      "affecter un etudiant",
      "inscrire a un cours",
      "matriculer",
      "adhesion",
    ],
  },
  {
    id: "attendance",
    icon: CalendarCheckIcon,
    category: "academic",
    featured: true,
    question: "Comment le professeur marque la présence ?",
    route: "/dashboard/attendance",
    routeName: "Présences & Cahier de texte",
    intro:
      "Le professeur fait l'appel depuis la page « Présences & Cahier de texte » — moins d'une minute par classe :",
    steps: [
      "Ouvrez « Présences & Cahier de texte » dans la barre latérale.",
      "Sélectionnez la classe et la date : les statuts déjà enregistrés se rechargent automatiquement.",
      "Pour chaque étudiant, cliquez sur un statut rapide : Présent, Absent ou Excusé (une remarque facultative peut être ajoutée).",
      "Terminez en cliquant sur « Enregistrer les présences » — un bandeau vert confirme la sauvegarde.",
      "Astuce : la date du jour est présélectionnée, l'appel peut donc être fait en direct pendant le cours.",
    ],
    keywords: [
      "presence",
      "presences",
      "absent",
      "absence",
      "absences",
      "retard",
      "excuse",
      "professeur",
      "prof",
      "appel",
      "cahier de texte",
      "marquer",
      "marque",
      "assiduite",
      "pointer",
      "emargement",
    ],
    synonyms: [
      "faire l appel",
      "feuille de presence",
      "marquer les absents",
      "eleve absent",
      "etudiant absent",
      "registre d appel",
      "emarger",
      "lappel",
      "faire lappel",
    ],
  },
  {
    id: "visa",
    icon: PlaneTakeoffIcon,
    category: "visa",
    featured: true,
    question: "Comment créer un dossier de Visa ?",
    route: "/dashboard/travels",
    routeName: "Procédures voyage",
    intro:
      "Un dossier de visa se crée depuis « Procédures voyage » : chaque candidat avance dans un pipeline à étapes, avec documents exigés et échéances :",
    steps: [
      "Ouvrez « Procédures voyage » dans la barre latérale (onglet « Dossiers candidats »).",
      "Cliquez sur « Nouveau dossier » : choisissez le candidat et le modèle de procédure (ex. « France — Visa étudiant »).",
      "Le dossier démarre à l'étape « Dossier » : rassemblez les documents exigés (passeport, photos, justificatifs…).",
      "Sur la fiche du dossier, validez chaque étape une à une : Test de langue → Admission → Visa → Départ.",
      "La barre de progression et l'échéance de l'étape active indiquent en permanence où en est le candidat.",
    ],
    keywords: [
      "visa",
      "visas",
      "dossier",
      "voyage",
      "procedure",
      "mobilite",
      "consulat",
      "ambassade",
      "depart",
      "pipeline",
      "candidat",
      "candidats",
      "etranger",
      "ausbildung",
    ],
    synonyms: [
      "dossier visa",
      "procedure voyage",
      "visa etudiant",
      "mobilite internationale",
      "etudier a l etranger",
      "creer un dossier",
    ],
  },
  {
    id: "pos",
    icon: StoreIcon,
    category: "finance",
    featured: true,
    question: "Comment enregistrer une vente POS ?",
    route: "/dashboard/pos",
    routeName: "Caisse / POS",
    intro:
      "Une vente comptoir s'enregistre en moins d'une minute depuis la caisse POS :",
    steps: [
      "Ouvrez « Caisse / POS » dans la barre latérale (onglet « Nouvelle vente »).",
      "Cliquez sur les cartes produits pour les ajouter au panier : les quantités s'incrémentent automatiquement.",
      "Renseignez éventuellement le client de passage (nom + téléphone) pour retrouver la vente.",
      "Cliquez sur « Encaisser & imprimer » : le paiement est encaissé et la facturette s'affiche.",
      "Retrouvez et réimprimez chaque vente dans l'onglet « Historique des ventes ».",
    ],
    keywords: [
      "pos",
      "vente",
      "ventes",
      "vendre",
      "caisse",
      "encaisser",
      "encaissement",
      "panier",
      "produit",
      "produits",
      "comptoir",
      "facture",
      "facturette",
      "recu",
      "recus",
      "boutique",
    ],
    synonyms: [
      "enregistrer une vente",
      "vendre un article",
      "caisse du jour",
      "encaisser une vente",
      "historique des ventes",
      "ticket de caisse",
    ],
  },
  {
    id: "teachers",
    icon: UserCogIcon,
    category: "academic",
    featured: true,
    question: "Comment ajouter un enseignant et lui attribuer un cours ?",
    route: "/dashboard/courses",
    routeName: "Cours",
    intro:
      "Un professeur se met en place en deux temps : d'abord son compte membre (rôle Enseignant), puis son affectation au cours. Voici la marche à suivre :",
    steps: [
      "Ouvrez « Rôles & Permissions » dans la barre latérale, puis cliquez sur « Ajouter un membre ».",
      "Renseignez prénom, nom et e-mail, puis choisissez le rôle « Enseignant » : le compte reçoit ses identifiants.",
      "Ouvrez ensuite le menu « Cours » et cliquez sur « Nouveau cours » (ou modifiez un cours existant).",
      "Dans la liste déroulante « Enseignant », sélectionnez le professeur concerné, puis enregistrez.",
      "L'enseignant ne voit désormais que ses cours, ses classes assignées, son émargement et ses cahiers de texte.",
    ],
    keywords: [
      "enseignant",
      "enseignants",
      "professeur",
      "professeurs",
      "prof",
      "profs",
      "formateur",
      "intervenant",
      "attribuer",
      "assigner",
      "affecter",
      "charger",
      "titulaire",
    ],
    synonyms: [
      "ajouter un enseignant",
      "ajouter un prof",
      "nouveau professeur",
      "compte enseignant",
      "affecter un cours",
      "attribuer un cours",
      "creer un prof",
    ],
  },
  {
    id: "classes",
    icon: SchoolIcon,
    category: "academic",
    featured: false,
    question: "Comment créer une classe et y inscrire des étudiants ?",
    route: "/dashboard/classes",
    routeName: "Classes",
    intro:
      "Les classes (ou cohortes) regroupent les étudiants autour d'un cours, d'un horaire et d'un professeur :",
    steps: [
      "Ouvrez « Classes » dans la barre latérale, puis cliquez sur « Nouvelle classe ».",
      "Choisissez le cours associé (ex. « Anglais A2 ») et l'horaire de la cohorte.",
      "Désignez l'enseignant titulaire : il retrouvera la classe dans son émargement.",
      "Fixez la capacité d'accueil : la jauge d'effectif se met à jour à chaque inscription.",
      "Inscrivez ensuite les étudiants depuis « Étudiants » en sélectionnant cette classe dans « Classe / Cohorte ».",
    ],
    keywords: [
      "classe",
      "classes",
      "cohorte",
      "cohortes",
      "groupe",
      "groupes",
      "capacite",
      "effectif",
      "horaire",
      "promotion",
      "niveau",
    ],
    synonyms: [
      "creer une classe",
      "nouvelle classe",
      "groupe de niveau",
      "ouvrir une cohorte",
      "effectif d une classe",
    ],
  },
  {
    id: "grades",
    icon: BookOpenCheckIcon,
    category: "academic",
    featured: false,
    question: "Comment saisir les notes et générer les bulletins ?",
    route: "/dashboard/evaluations",
    routeName: "Évaluations & Examens",
    intro:
      "Les examens et les bulletins vivent dans « Évaluations & Examens » : notes par module, moyennes calculées automatiquement et bulletin PDF prêt à imprimer :",
    steps: [
      "Ouvrez « Évaluations & Examens » puis créez une session d'examen pour une classe.",
      "Renseignez les modules évalués et leur barème (note sur 20, sur 100…).",
      "Saisissez les notes étudiant par étudiant : la moyenne générale se calcule au fil de l'eau.",
      "Une appréciation par défaut est proposée selon la moyenne ; personnalisez-la librement.",
      "Générez le bulletin PDF : logo du centre, en-tête, notes, appréciations et zones de signature inclus.",
    ],
    keywords: [
      "note",
      "notes",
      "noter",
      "bulletin",
      "bulletins",
      "moyenne",
      "moyennes",
      "examen",
      "examens",
      "evaluation",
      "evaluations",
      "appreciation",
      "semestre",
      "resultats",
      "barème",
      "bareme",
    ],
    synonyms: [
      "bulletin de notes",
      "saisie des notes",
      "generer le bulletin",
      "report card",
      "grille de notes",
      "conseil de classe",
      "carte scolaire",
    ],
  },
  {
    id: "visa-documents",
    icon: FileCheckIcon,
    category: "visa",
    featured: false,
    question: "Où cocher les documents exigés d'un dossier visa ?",
    route: "/dashboard/travels",
    routeName: "Procédures voyage — Documents",
    intro:
      "Chaque étape du dossier liste ses documents exigés (passeport, photos, justificatifs…) avec une case par pièce :",
    steps: [
      "Ouvrez « Procédures voyage » et cliquez sur le dossier du candidat.",
      "À l'étape « Dossier », consultez la liste des pièces exigées par le modèle de procédure.",
      "Cochez « Document reçu » au fur et à mesure : la progression du dossier s'actualise.",
      "Joignez si besoin un lien externe (Google Drive, Dropbox…) pour archiver la pièce.",
      "Une pièce manquante reste signalée tant que l'étape n'est pas complète.",
    ],
    keywords: [
      "document",
      "documents",
      "piece",
      "pieces",
      "checklist",
      "passeport",
      "justificatif",
      "justificatifs",
      "joindre",
      "papiers",
      "verifier",
    ],
    synonyms: [
      "liste des documents",
      "pieces a fournir",
      "documents requis",
      "documents exigés",
      "dossier complet",
      "pieces justificatives",
    ],
  },
  {
    id: "visa-appointment",
    icon: CalendarClockIcon,
    category: "visa",
    featured: false,
    question: "Comment planifier le rendez-vous au consulat ?",
    route: "/dashboard/travels",
    routeName: "Procédures voyage — Rendez-vous",
    intro:
      "La date de rendez-vous (ambassade, consulat, test de langue) se gère via l'échéance de l'étape active du dossier :",
    steps: [
      "Ouvrez « Procédures voyage » puis la fiche du candidat concerné.",
      "Sur l'étape active (ex. « Visa »), renseignez la date limite : c'est la date du rendez-vous consulaire.",
      "La barre de progression et le compte à rebours mettent en évidence l'échéance qui approche.",
      "Préparez les pièces du jour J depuis la liste de documents de l'étape.",
      "Après l'entretien, validez l'étape : le candidat bascule automatiquement sur la suivante (ex. « Départ »).",
    ],
    keywords: [
      "rendez-vous",
      "rdv",
      "consulat",
      "ambassade",
      "entretien",
      "planifier",
      "echeance",
      "echeances",
      "date",
      "calendrier",
      "convocation",
    ],
    synonyms: [
      "rendez vous consulaire",
      "rdv ambassade",
      "date de rendez-vous",
      "entretien visa",
      "planifier un rendez vous",
    ],
  },
  {
    id: "visa-status",
    icon: ListChecksIcon,
    category: "visa",
    featured: false,
    question: "Comment suivre et mettre à jour le statut d'un dossier visa ?",
    route: "/dashboard/travels",
    routeName: "Procédures voyage",
    intro:
      "Chaque dossier avance dans un pipeline à étapes (Dossier → Test de langue → Admission → Visa → Départ) :",
    steps: [
      "Ouvrez « Procédures voyage » (onglet « Dossiers candidats ») : la barre de progression donne l'état en un coup d'œil.",
      "Cliquez sur un dossier pour voir l'étape en cours, son échéance et son historique.",
      "Validez l'étape terminée : le dossier bascule sur la suivante et la progression s'actualise.",
      "Enregistrez les tranches payées (versements) directement depuis la fiche du dossier.",
      "Un reçu officiel est généré pour chaque tranche encaissée.",
    ],
    keywords: [
      "statut",
      "status",
      "suivre",
      "suivi",
      "avancement",
      "progression",
      "etape",
      "etapes",
      "valider",
      "tranche",
      "tranches",
      "versement",
      "modifier",
    ],
    synonyms: [
      "ou en est mon dossier",
      "mettre a jour le statut",
      "avancement du dossier",
      "suivi de dossier",
      "changer l etape",
    ],
  },
  {
    id: "payments",
    icon: WalletIcon,
    category: "finance",
    featured: true,
    question: "Comment enregistrer un paiement de scolarité ?",
    route: "/dashboard/payments",
    routeName: "Paiements",
    intro:
      "Les encaissements de scolarité se gèrent depuis « Paiements », avec versements en une ou plusieurs tranches :",
    steps: [
      "Ouvrez « Paiements » dans la barre latérale, puis cliquez sur « Nouveau paiement ».",
      "Sélectionnez l'étudiant : le net à payer et le reste dû s'affichent automatiquement.",
      "Saisissez le montant du versement et le moyen de paiement (espèces, Mobile Money, virement, chèque…).",
      "Ajoutez une référence (ex. « PAY-2026-0001 » ou l'ID de la transaction Mobile Money).",
      "Enregistrez : le reçu officiel est généré et imprimable, et le solde de l'étudiant se met à jour.",
    ],
    keywords: [
      "paiement",
      "paiements",
      "payer",
      "paye",
      "scolarite",
      "frais",
      "tranche",
      "tranches",
      "versement",
      "versements",
      "encaisser",
      "reglement",
      "solde",
      "reste",
      "impaye",
      "impayes",
      "echelonne",
    ],
    synonyms: [
      "frais de scolarite",
      "payer la scolarite",
      "enregistrer un paiement",
      "reglement etudiant",
      "paiement en plusieurs fois",
      "reste a payer",
      "nouveau paiement",
    ],
  },
  {
    id: "mobile-money",
    icon: SmartphoneIcon,
    category: "finance",
    featured: false,
    question: "Comment encaisser un paiement Mobile Money (MTN, Moov, Wave) ?",
    route: "/dashboard/payments",
    routeName: "Paiements — Mobile Money",
    intro:
      "Les paiements Mobile Money (MTN, Moov, Wave) s'enregistrent comme n'importe quel encaissement, avec la référence de la transaction :",
    steps: [
      "Demandez au payeur d'envoyer le montant au numéro marchand du centre via MTN, Moov ou Wave.",
      "Ouvrez « Paiements » puis « Nouveau paiement » (ou « Caisse / POS » pour une vente comptoir).",
      "Choisissez « Mobile Money » dans la liste des moyens de paiement.",
      "Recopiez l'ID de transaction reçu par SMS dans le champ « Référence » pour la réconciliation.",
      "Enregistrez : le reçu est généré et la recette alimente la trésorerie du jour.",
    ],
    keywords: [
      "mobile",
      "money",
      "mobile money",
      "mtn",
      "moov",
      "wave",
      "orange",
      "flooz",
      "transaction",
      "sms",
    ],
    synonyms: [
      "paiement mobile",
      "encaisser par mobile money",
      "mtn money",
      "moov money",
      "wave payment",
      "orange money",
    ],
  },
  {
    id: "financial-exports",
    icon: DownloadIcon,
    category: "finance",
    featured: false,
    question: "Comment exporter les données financières ?",
    route: "/dashboard/tresorerie",
    routeName: "Trésorerie",
    intro:
      "La « Trésorerie » consolide recettes, dépenses et solde net — et permet d'exporter les états financiers :",
    steps: [
      "Ouvrez « Trésorerie » dans la barre latérale.",
      "Filtrez la période à exporter (mois, trimestre, année de formation).",
      "Vérifiez les recettes (scolarité, caisse POS) face aux dépenses (loyer, salaires…).",
      "Lancez l'export de l'état financier, ou imprimez la vue depuis le navigateur.",
      "Les reçus et facturettes restent imprimables individuellement depuis « Paiements » et « Caisse / POS ».",
    ],
    keywords: [
      "export",
      "exporter",
      "excel",
      "pdf",
      "csv",
      "tresorerie",
      "rapport",
      "rapports",
      "finances",
      "finance",
      "comptabilite",
      "bilan",
      "statistiques",
    ],
    synonyms: [
      "exporter les donnees",
      "rapport financier",
      "etat financier",
      "extrait de compte",
      "telecharger les rapports",
      "bilan financier",
    ],
  },
  {
    id: "roles",
    icon: ShieldCheckIcon,
    category: "system",
    featured: true,
    question: "Comment gérer les rôles et permissions ?",
    route: "/dashboard/settings/roles",
    routeName: "Rôles & Permissions",
    intro:
      "La page « Rôles & Permissions » centralise les comptes membres de l'équipe et leurs droits d'accès :",
    steps: [
      "Ouvrez « Rôles & Permissions » dans la barre latérale (réservé aux administrateurs).",
      "Créez un rôle personnalisé (ex. « Secrétaire Adjoint ») et cochez ses permissions case par case.",
      "Cliquez sur « Ajouter un membre » pour créer un compte et lui attribuer un rôle.",
      "Modifiez ou désactivez un membre à tout moment depuis la liste de l'équipe.",
      "Les accès s'appliquent immédiatement : un enseignant, par exemple, ne voit jamais les données financières.",
    ],
    keywords: [
      "role",
      "roles",
      "permission",
      "permissions",
      "admin",
      "administrateur",
      "droits",
      "acces",
      "membre",
      "membres",
      "user",
      "users",
      "utilisateur",
      "utilisateurs",
      "compte",
    ],
    synonyms: [
      "gerer les utilisateurs",
      "creer un compte",
      "droits d acces",
      "autorisations",
      "equipe",
      "supprimer un utilisateur",
    ],
  },
  {
    id: "dark-mode",
    icon: MoonIcon,
    category: "system",
    featured: false,
    question: "Comment activer le mode sombre ?",
    route: "/dashboard/settings",
    routeName: "Paramètres",
    intro:
      "Le thème d'affichage se règle en un instant depuis les paramètres de l'application :",
    steps: [
      "Ouvrez « Paramètres » dans la barre latérale.",
      "Rendez-vous dans la section d'apparence / préférences d'affichage.",
      "Choisissez le thème « Sombre » (ou « Système » pour suivre votre appareil).",
      "La préférence est mémorisée et s'applique immédiatement à toute l'interface.",
      "Astuce : le mode sombre réduit la fatigue visuelle lors des saisies du soir.",
    ],
    keywords: [
      "sombre",
      "dark",
      "mode",
      "theme",
      "apparence",
      "clair",
      "luminosite",
      "nuit",
      "affichage",
    ],
    synonyms: [
      "mode sombre",
      "dark mode",
      "theme sombre",
      "changer le theme",
      "mettre en noir",
    ],
  },
  {
    id: "password-reset",
    icon: KeyRoundIcon,
    category: "system",
    featured: false,
    question: "Comment réinitialiser un mot de passe oublié ?",
    route: "/login",
    routeName: "Connexion",
    intro:
      "Un mot de passe perdu se réinitialise en une minute depuis la page de connexion :",
    steps: [
      "Ouvrez la page de connexion d'EduFlow.",
      "Cliquez sur « Mot de passe oublié ? » sous le formulaire.",
      "Saisissez l'adresse e-mail du compte : un lien de réinitialisation est envoyé.",
      "Ouvrez le lien reçu (valide une durée limitée) et choisissez un nouveau mot de passe.",
      "Administrateur : vous pouvez aussi ajuster le compte d'un membre depuis « Rôles & Permissions ».",
    ],
    keywords: [
      "mot de passe",
      "motdepasse",
      "oubli",
      "oublie",
      "perdu",
      "reinitialiser",
      "reinitialisation",
      "reset",
      "connexion",
      "identifiants",
      "login",
      "connecter",
    ],
    synonyms: [
      "mot de passe oublie",
      "changer mot de passe",
      "je ne peux plus me connecter",
      "acces bloque",
      "nouveau mot de passe",
    ],
  },
  {
    id: "offline-sync",
    icon: CloudOffIcon,
    category: "system",
    featured: false,
    question: "Comment fonctionne le mode hors ligne et la synchronisation ?",
    route: "/dashboard/settings",
    routeName: "Paramètres",
    intro:
      "EduFlow garde vos saisies en file d'attente locale quand la connexion tombe, puis resynchronise dès le retour du réseau :",
    steps: [
      "Continuez à travailler normalement : présences, ventes POS et paiements restent saisissables hors ligne.",
      "Un indicateur signale que l'application est en mode hors ligne (données stockées localement).",
      "Au retour de la connexion, la file d'attente est envoyée automatiquement au serveur.",
      "Vérifiez le bandeau « Synchronisé » pour confirmer que tout est remonté.",
      "En cas de doute, ouvrez « Paramètres » et lancez une synchronisation manuelle.",
    ],
    keywords: [
      "hors ligne",
      "offline",
      "sync",
      "synchronisation",
      "synchro",
      "synchroniser",
      "reseau",
      "connexion",
      "internet",
      "file",
      "attente",
      "local",
    ],
    synonyms: [
      "mode hors ligne",
      "synchroniser mes donnees",
      "pas d internet",
      "connexion perdue",
      "reprendre la synchro",
    ],
  },
];

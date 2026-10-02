// --------------------------------------
// Coordonnées de contact officielles EduFlow
// --------------------------------------
// Source de vérité UNIQUE des numéros de téléphone affichés publiquement :
//   - Footer du landing et de toutes les pages vitrine (src/components/landing/Footer.tsx)
//   - Page « Contact » (src/app/contact/page.tsx)
//   - Widget d'aide in-app (src/data/helpKnowledgeBase.ts)
//
// ⚠️ L'adresse e-mail publique `contact@eduflow.com` a été VOLONTAIREMENT
// retirée de l'interface : aucun e-mail n'est exposé publiquement. Les
// soumissions du formulaire de contact sont en revanche RELAYÉES côté serveur
// vers la variable d'environnement `CONTACT_EMAIL_TO` (voir
// `src/lib/email.ts` → `sendContactFormEmail` et `src/actions/contact.ts`).
//
// Ce module ne porte PAS de directive « use server » : il est importé à la
// fois par des composants clients (Footer, page Contact) et par des modules
// serveur. La contrainte Next.js interdisant d'exporter des constantes depuis
// un fichier « use server », il doit rester dans cette forme partagée.

/** Message pré-rempli dans les liens WhatsApp ouverts depuis le site. */
export const CONTACT_WHATSAPP_MESSAGE =
  "Bonjour EduFlow, je vous contacte depuis le site...";

/** Horaires d'ouverture du support (affichés sous les coordonnées). */
export const CONTACT_HOURS = "Lundi – Vendredi, 8 h – 18 h";

/** Un numéro de téléphone public, avec ses deux actions interactives. */
export interface ContactPhoneChannel {
  /** Pays / zone d'affectation, affiché à côté du numéro. */
  country: string;
  /** Numéro lisible par un humain (« +229 01 62 20 48 25 »). */
  display: string;
  /** Numéro international sans « + » ni espaces (format attendu par wa.me). */
  whatsappNumber: string;
  /** Cible du lien « Appel direct » (protocole `tel:`). */
  telHref: string;
}

/** Les deux numéros officiels d'EduFlow (Bénin et Togo). */
export const CONTACT_PHONE_CHANNELS: readonly ContactPhoneChannel[] = [
  {
    country: "Bénin",
    display: "+229 01 62 20 48 25",
    whatsappNumber: "2290162204825",
    telHref: "tel:+2290162204825",
  },
  {
    country: "Togo",
    display: "+228 97 78 52 70",
    whatsappNumber: "22897785270",
    telHref: "tel:+22897785270",
  },
] as const;

/**
 * Construit l'URL WhatsApp d'un numéro avec un message pré-rempli
 * (`https://wa.me/<numéro>?text=<message encodé>`).
 */
export function buildContactWhatsAppUrl(
  phone: ContactPhoneChannel,
  message: string = CONTACT_WHATSAPP_MESSAGE
): string {
  return `https://wa.me/${phone.whatsappNumber}?text=${encodeURIComponent(message)}`;
}

// --------------------------------------
// Sujets du formulaire de contact
// --------------------------------------

/** Valeurs acceptées par le champ « Sujet » du formulaire. */
export const CONTACT_SUBJECT_VALUES = [
  "demo",
  "pricing",
  "support",
  "partnership",
  "other",
] as const;

export type ContactSubject = (typeof CONTACT_SUBJECT_VALUES)[number];

/** Libellés affichés dans le `<select>` et repris dans l'e-mail reçu. */
export const CONTACT_SUBJECT_LABELS: Record<ContactSubject, string> = {
  demo: "Demande de démonstration",
  pricing: "Tarifs et abonnement",
  support: "Support technique",
  partnership: "Partenariat",
  other: "Autre demande",
};
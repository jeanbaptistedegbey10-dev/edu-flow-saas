"use server";

// --------------------------------------
// Formulaire de contact public (/contact)
// --------------------------------------
//
// Reçoit les soumissions du formulaire de contact du site vitrine, les
// VALIDE côté serveur, puis les RELAIE vers l'adresse interne de l'équipe
// (`CONTACT_EMAIL_TO`) via Resend — voir `src/lib/email.ts`.
//
// L'adresse de réception n'est JAMAIS renvoyée au client : elle n'est lue
// qu'au sein des modules serveur. Le visiteur n'obtient en retour qu'un
// message générique.
//
// Cette action est PUBLIQUE : elle ne dépend d'aucune session et ne touche
// pas la base de données. Elle est donc protégée par :
//   - une validation stricte des champs (longueurs, format e-mail, sujet
//     parmi une liste blanche) ;
//   - un champ « honeypot » invisible (`website`) qui piège les robots ;
//   - un délai minimum de remplissage, incompatible avec une soumission
//     automatique instantanée.
//
// ⚠️ Contrainte Next.js : ce fichier ne peut exporter QUE des fonctions
// asynchrones. Les types exportés ci-dessous sont effacés à la compilation
// (donc sans effet de bord) ; toute constante exportée casserait le build.
// Les constantes métier vivent dans `@/data/contact-channels`.

import { sendContactFormEmail } from "@/lib/email";
import {
  CONTACT_SUBJECT_VALUES,
  type ContactSubject,
} from "@/data/contact-channels";

// --------------------------------------
// Types publics (contrat avec le composant client)
// --------------------------------------

export type ContactFormField =
  | "name"
  | "email"
  | "organization"
  | "subject"
  | "message";

export type ContactFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Partial<Record<ContactFormField, string>>;
};

// --------------------------------------
// Constantes & validation
// --------------------------------------

/** Longueurs maximales acceptées (garde-fou anti-abus et anti-spam). */
const MAX_NAME_LENGTH = 120;
const MAX_EMAIL_LENGTH = 200;
const MAX_ORGANIZATION_LENGTH = 150;
const MAX_MESSAGE_LENGTH = 4000;

/** Regex de validation basique d'une adresse e-mail (identique à src/lib/email.ts). */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Délai minimal (en ms) entre l'affichage du formulaire et sa soumission.
 * Un robot qui remplit et envoie instantanément est ignoré.
 */
const MIN_FILL_DURATION_MS = 3000;

/** Message de confirmation, volontairement identique quelle que soit l'issue. */
const SUCCESS_MESSAGE =
  "Merci de nous avoir contactés. Notre équipe vous répondra sous 24 h ouvrées.";

type ParsedContactInput =
  | {
      ok: true;
      data: {
        name: string;
        email: string;
        organization: string | null;
        subject: ContactSubject;
        message: string;
      };
    }
  | { ok: false; fieldErrors: Partial<Record<ContactFormField, string>> };

/** Vérifie qu'une valeur est un sujet de la liste blanche. */
function isContactSubject(value: string): value is ContactSubject {
  return (CONTACT_SUBJECT_VALUES as readonly string[]).includes(value);
}

/**
 * Valide et normalise les champs du formulaire.
 * Aucun accès réseau ni base de données : uniquement de la validation.
 */
function parseContactForm(formData: FormData): ParsedContactInput {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const organization = String(formData.get("organization") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  const fieldErrors: Partial<Record<ContactFormField, string>> = {};

  if (!name) {
    fieldErrors.name = "Le nom complet est requis.";
  } else if (name.length > MAX_NAME_LENGTH) {
    fieldErrors.name = `Le nom ne doit pas dépasser ${MAX_NAME_LENGTH} caractères.`;
  }

  if (!email) {
    fieldErrors.email = "L'adresse e-mail est requise.";
  } else if (email.length > MAX_EMAIL_LENGTH) {
    fieldErrors.email = `L'adresse e-mail ne doit pas dépasser ${MAX_EMAIL_LENGTH} caractères.`;
  } else if (!EMAIL_REGEX.test(email)) {
    fieldErrors.email = "Adresse e-mail invalide (ex : vous@exemple.com).";
  }

  if (organization.length > MAX_ORGANIZATION_LENGTH) {
    fieldErrors.organization = `Le centre ne doit pas dépasser ${MAX_ORGANIZATION_LENGTH} caractères.`;
  }

  if (!subject) {
    fieldErrors.subject = "Veuillez choisir un sujet.";
  } else if (!isContactSubject(subject)) {
    fieldErrors.subject = "Sujet inconnu.";
  }

  if (!message) {
    fieldErrors.message = "Le message est requis.";
  } else if (message.length > MAX_MESSAGE_LENGTH) {
    fieldErrors.message = `Le message ne doit pas dépasser ${MAX_MESSAGE_LENGTH} caractères.`;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    data: {
      name,
      email,
      organization: organization || null,
      // La vérification ci-dessus garantit le type ContactSubject.
      subject: subject as ContactSubject,
      message,
    },
  };
}

// --------------------------------------
// Server Action
// --------------------------------------

/**
 * Traite une soumission du formulaire de contact.
 * Conçu pour être utilisé avec `useActionState` : reçoit l'état précédent et
 * un `FormData`, retourne un état sérialisable (succès, erreurs de champs,
 * message).
 */
export async function submitContactFormAction(
  _prevState: ContactFormState,
  formData: FormData
): Promise<ContactFormState> {
  // --- Garde anti-robots -----------------------------------------------
  // Honeypot : champ invisible masqué en CSS. Rempli => soumission automatisée.
  const honeypot = String(formData.get("website") ?? "").trim();
  if (honeypot) {
    console.warn("[submitContactFormAction] Soumission rejetée (honeypot).");
    // Réponse identique au succès : on ne révèle pas le mécanisme de défense.
    return { status: "success", message: SUCCESS_MESSAGE };
  }

  // Temporisation : un formulaire légitime demande au moins quelques secondes.
  const renderedAt = Number(formData.get("renderedAt") ?? 0);
  if (
    Number.isFinite(renderedAt) &&
    renderedAt > 0 &&
    Date.now() - renderedAt < MIN_FILL_DURATION_MS
  ) {
    console.warn("[submitContactFormAction] Soumission rejetée (trop rapide).");
    return {
      status: "error",
      message: "Votre message a été envoyé trop rapidement. Merci de le renvoyer.",
    };
  }

  // --- Validation -------------------------------------------------------
  const parsed = parseContactForm(formData);

  if (!parsed.ok) {
    return {
      status: "error",
      message: "Veuillez corriger les champs indiqués.",
      fieldErrors: parsed.fieldErrors,
    };
  }

  // --- Relais vers l'adresse interne -----------------------------------
  try {
    const result = await sendContactFormEmail(parsed.data);

    if (!result.ok) {
      console.error(
        "[submitContactFormAction] Échec de l'envoi du message de contact :",
        result.reason
      );

      return {
        status: "error",
        message:
          "Votre message n'a pas pu être transmis pour le moment. Merci de réessayer dans quelques instants, ou de nous joindre par téléphone ou WhatsApp.",
      };
    }

    return { status: "success", message: SUCCESS_MESSAGE };
  } catch (error) {
    // Filet de sécurité : `sendContactFormEmail` ne lève jamais, mais on ne
    // veut jamais exposer une erreur serveur au visiteur.
    console.error(
      "[submitContactFormAction] Exception lors de l'envoi du message :",
      error
    );

    return {
      status: "error",
      message:
        "Une erreur est survenue lors de l'envoi du message. Merci de réessayer plus tard ou de nous joindre par téléphone ou WhatsApp.",
    };
  }
}
import { createElement, type ReactNode } from "react";
import { Resend } from "resend";

import { ContactFormEmail } from "@/components/emails/contact-form-email";
import { PaymentEmail } from "@/components/emails/payment-email";
import { formatFcfa } from "@/components/emails/format";
import { WelcomeEmail } from "@/components/emails/welcome-email";
import {
  CONTACT_PHONE_CHANNELS,
  CONTACT_SUBJECT_LABELS,
  type ContactSubject,
} from "@/data/contact-channels";

// --------------------------------------
// Configuration
// --------------------------------------

/** Expéditeur par défaut (à remplacer par un domaine vérifié Resend en production). */
const DEFAULT_FROM = "EduFlow <onboarding@resend.dev>";

/**
 * Destinataire par défaut des messages du formulaire de contact public.
 *
 * ⚠️ L'adresse n'est JAMAIS exposée au navigateur : elle n'est lue que dans
 * ce module serveur. La variable d'environnement `CONTACT_EMAIL_TO` est
 * prioritaire ; cette valeur n'est qu'un repli de secours pour que le
 * formulaire reste fonctionnel sur une instance où la variable n'a pas été
 * renseignée.
 */
const DEFAULT_CONTACT_EMAIL_TO = "jeanbaptistedegbey10@gmail.com";

/** Regex de validation basique d'une adresse e-mail. */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Client Resend initialisé paresseusement.
 * - `undefined` : pas encore initialisé.
 * - `null` : RESEND_API_KEY absente → l'envoi est désactivé (aucune erreur bloquante).
 */
let cachedClient: Resend | null | undefined;

function getResendClient(): Resend | null {
  if (cachedClient !== undefined) {
    return cachedClient;
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (!apiKey) {
    console.warn(
      "[email] RESEND_API_KEY n'est pas configurée : l'envoi d'e-mails transactionnels est désactivé."
    );
    cachedClient = null;
    return cachedClient;
  }

  cachedClient = new Resend(apiKey);
  return cachedClient;
}

function getFromAddress(): string {
  return process.env.EMAIL_FROM?.trim() || DEFAULT_FROM;
}

// --------------------------------------
// Types publics
// --------------------------------------

/** Résultat d'un envoi d'e-mail (jamais une exception levée). */
export type SendEmailResult =
  | { ok: true; emailId: string }
  | {
      ok: false;
      reason: "not_configured" | "invalid_recipient" | "send_failed";
    };

export interface WelcomeEmailPayload {
  /** Adresse e-mail de l'étudiant (déjà validée en amont). */
  studentEmail: string;
  /** Nom complet de l'étudiant (prénom + nom). */
  studentName: string;
  /** Code identifiant unique généré à l'inscription (STU-YYYY-NNN). */
  studentCode: string;
}

export interface PaymentConfirmationEmailPayload {
  /** Adresse e-mail de l'étudiant (déjà validée en amont). */
  studentEmail: string;
  /** Nom complet de l'étudiant (prénom + nom). */
  studentName: string;
  /** Montant réglé, en francs CFA (XOF). */
  amount: number;
  /** Référence de la transaction (peut être absente). */
  reference?: string | null;
  /** Date effective du règlement (par défaut : maintenant). */
  paidAt?: Date;
}

export interface ContactFormEmailPayload {
  /** Nom complet du demandeur. */
  name: string;
  /** Adresse e-mail du demandeur (utilisée en `replyTo`). */
  email: string;
  /** Centre / organisation du demandeur (facultatif). */
  organization?: string | null;
  /** Sujet du formulaire, déjà validé par la Server Action. */
  subject: ContactSubject;
  /** Corps du message. */
  message: string;
}

// --------------------------------------
// Mécanique d'envoi interne
// --------------------------------------

/**
 * Envoie un e-mail transactionnel via Resend.
 *
 * Ne lève JAMAIS d'exception : toute erreur est journalisée et renvoyée
 * sous forme de résultat, afin de ne jamais bloquer le flux métier appelant
 * (création en base, etc.).
 */
async function sendEmail(options: {
  to: string;
  subject: string;
  /** Élément React Email à rendre en HTML par le SDK Resend. */
  react: ReactNode;
  /** Adresse de réponse (facultatif) : permet de répondre au demandeur. */
  replyTo?: string;
}): Promise<SendEmailResult> {
  const client = getResendClient();

  if (!client) {
    console.warn(
      `[email] Envoi ignoré (client non configuré) : « ${options.subject} » → ${options.to}`
    );
    return { ok: false, reason: "not_configured" };
  }

  if (!EMAIL_REGEX.test(options.to)) {
    console.warn(
      `[email] Adresse destinataire invalide, envoi ignoré : ${options.to}`
    );
    return { ok: false, reason: "invalid_recipient" };
  }

  try {
    const { data, error } = await client.emails.send({
      from: getFromAddress(),
      to: options.to,
      subject: options.subject,
      replyTo: options.replyTo,
      react: options.react,
    });

    if (error) {
      console.error(
        `[email] Échec d'envoi à ${options.to} (« ${options.subject} ») :`,
        error.message
      );
      return { ok: false, reason: "send_failed" };
    }

    if (!data) {
      console.error(
        `[email] Réponse inattendue de Resend pour ${options.to} (« ${options.subject} »).`
      );
      return { ok: false, reason: "send_failed" };
    }

    console.info(`[email] Envoyé à ${options.to} (id: ${data.id}).`);
    return { ok: true, emailId: data.id };
  } catch (error) {
    // Erreur réseau / indisponibilité de l'API : journalisée sans bloquer l'appelant.
    console.error(
      `[email] Exception lors de l'envoi à ${options.to} (« ${options.subject} ») :`,
      error
    );
    return { ok: false, reason: "send_failed" };
  }
}

// --------------------------------------
// Helpers d'envoi typés
// --------------------------------------

/**
 * Envoie l'e-mail de confirmation d'inscription à un étudiant,
 * incluant son code identifiant unique (STU-YYYY-NNN).
 *
 * Silencieux en cas d'échec : ne lève jamais d'exception.
 */
export async function sendWelcomeEmail({
  studentEmail,
  studentName,
  studentCode,
}: WelcomeEmailPayload): Promise<SendEmailResult> {
  return sendEmail({
    to: studentEmail,
    subject: "Confirmation d'inscription — bienvenue !",
    react: createElement(WelcomeEmail, { studentName, studentCode }),
  });
}

/**
 * Envoie le reçu de confirmation de règlement à un étudiant
 * (montant FCFA, référence de transaction, date).
 *
 * Silencieux en cas d'échec : ne lève jamais d'exception.
 */
export async function sendPaymentConfirmationEmail({
  studentEmail,
  studentName,
  amount,
  reference,
  paidAt,
}: PaymentConfirmationEmailPayload): Promise<SendEmailResult> {
  return sendEmail({
    to: studentEmail,
    subject: `Reçu de paiement — ${formatFcfa(amount)}`,
    react: createElement(PaymentEmail, {
      studentName,
      amount,
      reference,
      paidAt,
    }),
  });
}

// --------------------------------------
// Formulaire de contact public
// --------------------------------------

/**
 * Destinataire des soumissions du formulaire de contact.
 *
 * La valeur provient de la variable d'environnement serveur `CONTACT_EMAIL_TO`
 * (jamais exposée au client). En son absence, on retombe sur l'adresse
 * interne par défaut afin que le formulaire reste opérationnel.
 */
function getContactRecipient(): string {
  return process.env.CONTACT_EMAIL_TO?.trim() || DEFAULT_CONTACT_EMAIL_TO;
}

/**
 * Relaye une soumission du formulaire de contact vers l'adresse interne de
 * l'équipe (`CONTACT_EMAIL_TO`), en mettant l'expéditeur en `replyTo` pour
 * permettre une réponse directe au demandeur.
 *
 * Silencieux en cas d'échec : ne lève jamais d'exception (voir `SendEmailResult`).
 */
export async function sendContactFormEmail({
  name,
  email,
  organization,
  subject,
  message,
}: ContactFormEmailPayload): Promise<SendEmailResult> {
  const subjectLabel = CONTACT_SUBJECT_LABELS[subject];

  return sendEmail({
    to: getContactRecipient(),
    subject: `[Site EduFlow] ${subjectLabel} — ${name}`,
    replyTo: email,
    react: createElement(ContactFormEmail, {
      name,
      email,
      organization,
      subjectLabel,
      message,
      replyPhoneDisplay: CONTACT_PHONE_CHANNELS[0].display,
    }),
  });
}
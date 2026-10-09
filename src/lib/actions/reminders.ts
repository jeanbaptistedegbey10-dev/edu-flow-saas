"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentOrganizationId, isNextRedirectError } from "@/lib/session";
import { sendPaymentReminderEmail } from "@/lib/email";

// --------------------------------------
// Relances d'échéances (WhatsApp + Email centralisés)
// --------------------------------------
//
// Déclenchées par l'administrateur depuis le tableau de bord « Échéances »
// (relance en un clic). Deux canaux centralisés sont exposés :
//   - EMAIL  : envoi effectif via Resend (voir `src/lib/email.ts`), en
//              spécifiant le RELIQUAT EXACT restant dû ;
//   - WHATSAPP: le serveur ne peut pas émettre de message WhatsApp (aucune API
//              WhatsApp Business configurée) : on renvoie une URL `wa.me`
//              préremplie que l'interface ouvre dans un nouvel onglet — même
//              logique que les canaux de contact existants.
//
// La charge utile du message est identique sur les deux canaux (montant exact
// du reliquat + date d'échéance) pour une traçabilité cohérente.

/** Charge utile de relance calculée pour une échéance donnée. */
export type ReminderPreview = {
  studentName: string;
  studentPhone: string | null;
  studentEmail: string | null;
  /** Reliquat exact restant dû (FCFA). */
  remainingAmount: number;
  installmentNumber: number;
  dueDate: Date;
  courseTitle: string | null;
  className: string | null;
  /** Message texte prérempli, commun WhatsApp / Email. */
  message: string;
};

export type SendReminderResult =
  | {
      ok: true;
      /** Canal réellement utilisé. */
      channel: "email" | "whatsapp";
      /** URL wa.me à ouvrir (canal WhatsApp uniquement). */
      whatsappUrl?: string;
      /** Statut de l'envoi email (canal email uniquement). */
      emailSent?: boolean;
    }
  | { ok: false; message: string };

/**
 * Formate le message de relance commun aux deux canaux. Mentionne le montant
 * EXACT du reliquat dû, la date d'échéance et le contexte de formation.
 */
function buildReminderMessage(input: {
  studentName: string;
  remainingAmount: number;
  installmentNumber: number;
  dueDate: Date;
  courseTitle: string | null;
}): string {
  const amount = input.remainingAmount.toLocaleString("fr-FR");
  const date = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(input.dueDate);

  const course = input.courseTitle ? ` (${input.courseTitle})` : "";
  return (
    `Bonjour ${input.studentName}, ` +
    `nous vous relions concernant le règlement de votre formation${course}. ` +
    `L'échéance n°${input.installmentNumber} arrivée à terme le ${date} ` +
    `présente un solde restant dû de ${amount} FCFA. ` +
    `Merci de bien vouloir régulariser dans les meilleurs délais.`
  );
}

/**
 * Récupère les données nécessaires à une relance pour une tranche donnée
 * (avec contexte étudiant / classe / cours). Isolation multi-tenant par
 * `organizationId` dérivé de la session.
 */
async function loadReminderContext(itemId: string, organizationId: string) {
  return prisma.paymentScheduleItem.findFirst({
    where: { id: itemId, schedule: { organizationId } },
    select: {
      id: true,
      installmentNumber: true,
      amount: true,
      paidAmount: true,
      dueDate: true,
      schedule: {
        select: {
          id: true,
          studentId: true,
          activatedAt: true,
          student: {
            select: {
              id: true,
              studentCode: true,
              firstName: true,
              lastName: true,
              phone: true,
              email: true,
            },
          },
          class: {
            select: {
              id: true,
              name: true,
              course: { select: { title: true } },
            },
          },
        },
      },
    },
  });
}

/**
 * Construit l'aperçu de relance (message prérempli + coordonnées) pour une
 * tranche. Lecture seule : utilisée par l'UI pour afficher le récapitulatif
 * avant déclenchement.
 */
export async function getReminderPreview(
  itemId: string
): Promise<ReminderPreview | null> {
  const organizationId = await getCurrentOrganizationId();

  try {
    const item = await loadReminderContext(itemId, organizationId);
    if (!item) return null;

    const student = item.schedule.student;
    const studentName = `${student.firstName} ${student.lastName}`.trim();
    const remainingAmount = Math.max(item.amount - item.paidAmount, 0);
    const courseTitle = item.schedule.class?.course?.title ?? null;

    return {
      studentName,
      studentPhone: student.phone,
      studentEmail: student.email,
      remainingAmount,
      installmentNumber: item.installmentNumber,
      dueDate: item.dueDate,
      courseTitle,
      className: item.schedule.class?.name ?? null,
      message: buildReminderMessage({
        studentName,
        remainingAmount,
        installmentNumber: item.installmentNumber,
        dueDate: item.dueDate,
        courseTitle,
      }),
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error("[getReminderPreview] Échec :", error);
    return null;
  }
}


/**
 * Déclenche une relance pour une échéance, sur le canal demandé.
 *
 * - `channel: "email"` : envoie un e-mail via Resend (canal centralisé) en
 *   spécifiant le reliquat exact. Nécessite une adresse e-mail étudiante.
 * - `channel: "whatsapp"` : renvoie une URL `wa.me` préremplie (le serveur ne
 *   peut pas émettre de message WhatsApp). Nécessite un numéro de téléphone.
 *
 * L'organisation est dérivée de la session (isolation multi-tenant).
 */
export async function sendScheduleReminderAction(input: {
  itemId: string;
  channel: "email" | "whatsapp";
}): Promise<SendReminderResult> {
  const organizationId = await getCurrentOrganizationId();

  if (!input.itemId) {
    return { ok: false, message: "Échéance manquante." };
  }

  try {
    const item = await loadReminderContext(input.itemId, organizationId);
    if (!item) {
      return { ok: false, message: "Échéance introuvable dans votre organisation." };
    }

    const student = item.schedule.student;
    const studentName = `${student.firstName} ${student.lastName}`.trim();
    const remainingAmount = Math.max(item.amount - item.paidAmount, 0);
    const courseTitle = item.schedule.class?.course?.title ?? null;
    const className = item.schedule.class?.name ?? null;

    if (remainingAmount <= 0) {
      return { ok: false, message: "Cette échéance est déjà soldée : aucune relance nécessaire." };
    }

    const message = buildReminderMessage({
      studentName,
      remainingAmount,
      installmentNumber: item.installmentNumber,
      dueDate: item.dueDate,
      courseTitle,
    });

    if (input.channel === "whatsapp") {
      if (!student.phone) {
        return { ok: false, message: "Aucun numéro de téléphone pour cet étudiant." };
      }
      const cleaned = student.phone.replace(/[\s+\-()]/g, "");
      const whatsappUrl = `https://wa.me/${cleaned}?text=${encodeURIComponent(message)}`;
      return { ok: true, channel: "whatsapp", whatsappUrl };
    }

    // Canal email : envoi effectif via Resend.
    if (!student.email) {
      return { ok: false, message: "Aucune adresse e-mail pour cet étudiant." };
    }

    const result = await sendPaymentReminderEmail({
      studentEmail: student.email,
      studentName,
      studentCode: student.studentCode,
      installmentAmount: item.amount,
      paidAmount: item.paidAmount,
      remainingAmount,
      installmentNumber: item.installmentNumber,
      dueDate: item.dueDate,
      courseTitle,
      className,
    });

    if (result.ok) {
      return { ok: true, channel: "email", emailSent: true };
    }

    // Resend non configuré ou envoi refusé (ex : bac à sable) : message clair.
    return {
      ok: false,
      message:
        result.reason === "not_configured"
          ? "Le service d'envoi d'e-mails n'est pas configuré (RESEND_API_KEY absente)."
          : "L'envoi de l'e-mail de relance a échoué. Réessayez plus tard.",
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error("[sendScheduleReminderAction] Échec :", error);
    return { ok: false, message: "Une erreur est survenue lors de la relance." };
  }
}


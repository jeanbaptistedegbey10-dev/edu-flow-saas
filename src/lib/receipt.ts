/**
 * Génération du reçu de paiement imprimable.
 *
 * Approche retenue : modèle HTML autonome et stylisé + impression via
 * `window.print()` dans un iframe caché. Ce choix évite d'intégrer une
 * bibliothèque PDF côté serveur (compilation, polices, empreinte mémoire)
 * tout en permettant l'enregistrement en PDF nativement depuis la boîte de
 * dialogue d'impression du navigateur (« Destination : Enregistrer au
 * format PDF »).
 *
 * Le même document sert à l'aperçu à l'écran (iframe de la modale) et à
 * l'impression : l'aperçu est strictement identique au reçu final.
 */

import type { PaymentStatus } from "@prisma/client";

import type { OrganizationProfileDTO, PaymentDTO } from "@/actions/payments";
import {
  getPaymentMethodLabel,
  getPaymentStatusLabel,
} from "@/lib/payment-status";

// Formatage déterministe (locale + fuseau fixes) pour un rendu stable.
const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const dateTimeFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

const amountFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 0,
});

/** Styles des pastilles de statut dans le document imprimé. */
const STATUS_BADGE_STYLES: Record<
  PaymentStatus,
  { background: string; color: string }
> = {
  PENDING: { background: "#fef3c7", color: "#92400e" },
  PARTIAL: { background: "#e0f2fe", color: "#075985" },
  COMPLETED: { background: "#d1fae5", color: "#065f46" },
  FAILED: { background: "#fee2e2", color: "#991b1b" },
  REFUNDED: { background: "#ede9fe", color: "#5b21b6" },
};

/**
 * Caractères spéciaux construits dynamiquement : permet d'assembler les
 * entités HTML d'échappement sans jamais les écrire littéralement dans le
 * fichier source (elles seraient sinon interprétées à l'écriture).
 */
const AMPERSAND = String.fromCharCode(38); // esperluette
const LESS_THAN = String.fromCharCode(60); // chevron ouvrant
const GREATER_THAN = String.fromCharCode(62); // chevron fermant
const DOUBLE_QUOTE = String.fromCharCode(34); // guillemet double
const SINGLE_QUOTE = String.fromCharCode(39); // apostrophe

/** Échappe les caractères sensibles du HTML dans les valeurs dynamiques. */
function escapeHtml(value: string): string {
  return value
    .replace(new RegExp(AMPERSAND, "g"), `${AMPERSAND}amp;`)
    .replace(new RegExp(LESS_THAN, "g"), `${AMPERSAND}lt;`)
    .replace(new RegExp(GREATER_THAN, "g"), `${AMPERSAND}gt;`)
    .replace(new RegExp(DOUBLE_QUOTE, "g"), `${AMPERSAND}quot;`)
    .replace(new RegExp(SINGLE_QUOTE, "g"), `${AMPERSAND}#39;`);
}

/**
 * Construit le document HTML complet et autonome du reçu de paiement.
 * Toutes les valeurs dynamiques sont échappées avant injection.
 */
export function buildPaymentReceiptDocument(
  payment: PaymentDTO,
  organization: OrganizationProfileDTO
): string {
  const studentName = `${payment.student.firstName} ${payment.student.lastName}`;

  // Numéro de reçu affiché : référence transaction si présente, sinon un
  // numéro dérivé de l'identifiant du règlement (toute ligne est imprimable).
  const receiptNumber =
    payment.reference ?? `REC-${payment.id.slice(-8).toUpperCase()}`;

  const badge = STATUS_BADGE_STYLES[payment.status];

  const orgContactLine = [organization.phone, organization.email]
    .filter(Boolean)
    .map((value) => escapeHtml(String(value)))
    .join(" · ");

  const descriptionRow = payment.description
    ? `<tr>
            <th scope="row">Description</th>
            <td>${escapeHtml(payment.description)}</td>
          </tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Reçu de paiement ${escapeHtml(receiptNumber)}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: "Segoe UI", system-ui, -apple-system, Arial, sans-serif;
    color: #111827;
    background: #f3f4f6;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .sheet {
    max-width: 720px;
    margin: 24px auto;
    padding: 36px 40px;
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
  }
  @media print {
    body { background: #ffffff; }
    .sheet { margin: 0 auto; border: none; border-radius: 0; max-width: none; padding: 24px 12px; }
  }
  .receipt-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 24px;
    padding-bottom: 20px;
    border-bottom: 2px solid #111827;
  }
  .organization h1 {
    margin: 0 0 6px;
    font-size: 20px;
    line-height: 1.25;
    letter-spacing: -0.01em;
  }
  .organization p {
    margin: 2px 0;
    font-size: 12px;
    color: #6b7280;
  }
  .doc-title { text-align: right; white-space: nowrap; }
  .doc-kind {
    margin: 0;
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.14em;
  }
  .doc-number {
    margin: 6px 0 0;
    font-size: 12px;
    color: #6b7280;
    font-variant-numeric: tabular-nums;
  }
  .details {
    width: 100%;
    margin-top: 22px;
    border-collapse: collapse;
  }
  .details th,
  .details td {
    padding: 9px 0;
    font-size: 13px;
    text-align: left;
    vertical-align: top;
    border-bottom: 1px solid #f3f4f6;
  }
  .details th {
    width: 190px;
    font-weight: 500;
    color: #6b7280;
  }
  .details td.strong { font-weight: 600; }
  .details td.mono {
    font-family: Consolas, "Courier New", monospace;
    letter-spacing: 0.02em;
  }
  .badge {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
  }
  .amount-block {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-top: 22px;
    padding: 16px 20px;
    border: 1px solid #111827;
    border-radius: 8px;
    background: #f9fafb;
  }
  .amount-label {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #6b7280;
  }
  .amount-value { font-size: 24px; font-variant-numeric: tabular-nums; }
  .signatures {
    display: flex;
    gap: 20px;
    margin-top: 34px;
  }
  .signature-box {
    position: relative;
    flex: 1;
    height: 110px;
    border: 1px dashed #9ca3af;
    border-radius: 8px;
  }
  .signature-box span {
    position: absolute;
    top: 8px;
    left: 12px;
    font-size: 11px;
    color: #6b7280;
  }
  .receipt-footer {
    margin-top: 28px;
    padding-top: 14px;
    border-top: 1px solid #e5e7eb;
  }
  .receipt-footer p {
    margin: 2px 0;
    font-size: 11px;
    color: #9ca3af;
  }
</style>
</head>
<body>
  <main class="sheet">
    <header class="receipt-header">
      <div class="organization">
        <h1>${escapeHtml(organization.name)}</h1>
        ${organization.address ? `<p>${escapeHtml(organization.address)}</p>` : ""}
        ${orgContactLine ? `<p>${orgContactLine}</p>` : ""}
      </div>
      <div class="doc-title">
        <p class="doc-kind">Reçu de paiement</p>
        <p class="doc-number">N° ${escapeHtml(receiptNumber)}</p>
      </div>
    </header>

    <table class="details">
      <tbody>
        <tr>
          <th scope="row">Étudiant</th>
          <td class="strong">${escapeHtml(studentName)}</td>
        </tr>
        <tr>
          <th scope="row">Code étudiant</th>
          <td class="mono">${escapeHtml(payment.student.studentCode)}</td>
        </tr>
        <tr>
          <th scope="row">Moyen de règlement</th>
          <td>${escapeHtml(getPaymentMethodLabel(payment.paymentMethod))}</td>
        </tr>
        <tr>
          <th scope="row">Date de paiement</th>
          <td>${dateFormatter.format(payment.paidAt)}</td>
        </tr>
        <tr>
          <th scope="row">Statut</th>
          <td>
            <span class="badge" style="background:${badge.background};color:${badge.color};">${getPaymentStatusLabel(payment.status)}</span>
          </td>
        </tr>
        ${descriptionRow}
      </tbody>
    </table>

    <section class="amount-block">
      <span class="amount-label">Montant réglé</span>
      <strong class="amount-value">${amountFormatter.format(payment.amount)} FCFA</strong>
    </section>

    <section class="signatures">
      <div class="signature-box"><span>Cachet de l'organisation</span></div>
      <div class="signature-box"><span>Signature du responsable</span></div>
    </section>

    <footer class="receipt-footer">
      <p>Document généré le ${dateTimeFormatter.format(new Date())} — à conserver sans limitation de durée.</p>
      <p>Merci de votre confiance.</p>
    </footer>
  </main>
</body>
</html>`;
}

/**
 * Ouvre la boîte de dialogue d'impression du navigateur sur le document HTML
 * fourni, via un iframe caché. L'utilisateur peut imprimer physiquement le
 * reçu ou choisir « Enregistrer au format PDF » comme destination.
 */
export function printHtmlDocument(html: string): void {
  const frame = document.createElement("iframe");

  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("title", "Impression du document");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.style.visibility = "hidden";

  frame.addEventListener("load", () => {
    const win = frame.contentWindow;

    if (!win) return;

    // Léger délai : garantit que le document est entièrement rendu avant
    // l'ouverture de la boîte d'impression (fiabilité Safari notamment).
    window.setTimeout(() => {
      win.focus();
      win.print();

      // Nettoyage après fermeture de la boîte d'impression, avec garde-fou.
      win.addEventListener("afterprint", () => frame.remove());
      window.setTimeout(() => frame.remove(), 120_000);
    }, 200);
  });

  frame.srcdoc = html;
  document.body.appendChild(frame);
}
/**
 * Génération des reçus imprimables : règlement étudiant, tranche de procédure
 * voyage (échelonnement) et facturette de caisse (POS).
 *
 * Approche retenue : modèle HTML autonome et stylisé + impression via
 * `window.print()` dans un iframe caché. Ce choix évite d'intégrer une
 * bibliothèque PDF côté serveur (compilation, polices, empreinte mémoire)
 * tout en permettant l'enregistrement en PDF nativement depuis la boîte de
 * dialogue d'impression du navigateur (« Destination : Enregistrer au
 * format PDF »).
 *
 * Les trois documents partagent :
 * - un en-tête d'entreprise sur structure flex à deux colonnes (55 % /
 *   40 %) : à gauche le bloc établissement (logo, nom du centre, adresse
 *   ancrée tout en bas) ; à droite les coordonnées (téléphone, e-mail,
 *   site web) puis le titre du document et son numéro, eux aussi ancrés
 *   tout en bas — les lignes du bas reposent sur la même baseline ;
 * - un pied de page légal discret mais lisible : N° RCCM, N° IFU / NIF,
 *   adresse complète, téléphone et site web ;
 * - une mise en page calibrée pour le format A4 / enregistrement PDF.
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
export function escapeHtml(value: string): string {
  return value
    .replace(new RegExp(AMPERSAND, "g"), `${AMPERSAND}amp;`)
    .replace(new RegExp(LESS_THAN, "g"), `${AMPERSAND}lt;`)
    .replace(new RegExp(GREATER_THAN, "g"), `${AMPERSAND}gt;`)
    .replace(new RegExp(DOUBLE_QUOTE, "g"), `${AMPERSAND}quot;`)
    .replace(new RegExp(SINGLE_QUOTE, "g"), `${AMPERSAND}#39;`);
}

// --------------------------------------
// Blocs partagés : styles, en-tête entreprise et pied de page légal
// --------------------------------------

/**
 * Feuille de style commune aux trois documents : feuille A4, en-tête
 * d'entreprise détaillé, tableaux de détails, blocs de montants, signatures
 * et pied de page légal.
 */
const BASE_STYLES = `
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
  .sheet.narrow { max-width: 560px; }
  @page { size: A4; margin: 12mm; }
  @media print {
    /* Marges @page réduites à l'impression : la zone de marge étant trop
       étroite pour les accueillir, les navigateurs (Chrome, Edge, Safari,
       Firefox) masquent leurs en-têtes/pieds natifs (date du jour, titre de
       la page, URL du document) en haut et en bas de chaque feuille. */
    @page { margin: 8mm; }
    html, body { width: 100%; }
    body { background: #ffffff; }
    .sheet { margin: 0 auto; border: none; border-radius: 0; max-width: none; padding: 0; }
  }

  /* ---- En-tête entreprise : structure flex stricte à deux colonnes
     (bloc établissement à gauche, coordonnées + titre + numéro à droite).
     La structure et les styles sont inline dans buildOrganizationHeader :
     les lignes du bas (adresse / numéro) sont ancrées sur la même
     baseline via justify-content: space-between dans chaque colonne. ---- */

  /* ---- Tableaux de détails (identité, règlement courant) ---- */
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

  /* ---- Tableau historique des versements (échelonnement) ---- */
  .section-title {
    margin: 26px 0 0;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #374151;
  }
  table.history {
    width: 100%;
    margin-top: 10px;
    border-collapse: collapse;
    font-size: 12.5px;
  }
  table.history th {
    text-align: left;
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #6b7280;
    background: #f9fafb;
    border-bottom: 1px solid #111827;
    padding: 7px 8px;
  }
  table.history td {
    padding: 8px;
    border-bottom: 1px solid #f3f4f6;
    vertical-align: top;
  }
  table.history td.num,
  table.history th.num {
    text-align: right;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  table.history td.nowrap { white-space: nowrap; }
  table.history td.empty {
    text-align: center;
    color: #9ca3af;
    padding: 16px 8px;
  }
  .history-caption {
    margin: 6px 0 0;
    font-size: 10.5px;
    color: #9ca3af;
  }

  /* ---- Synthèse financière (totaux du contrat) ---- */
  .summary { width: 100%; margin-top: 20px; border-collapse: collapse; }
  .summary td {
    padding: 9px 0;
    font-size: 13.5px;
    border-bottom: 1px solid #e5e7eb;
  }
  .summary td:last-child {
    text-align: right;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .summary tr.strong td { font-weight: 700; font-size: 14.5px; }
  .summary td small {
    display: block;
    font-size: 10.5px;
    font-weight: 400;
    color: #9ca3af;
  }

  /* ---- Bloc montant mis en avant ---- */
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

  /* ---- Signatures ---- */
  .signatures { display: flex; gap: 20px; margin-top: 34px; }
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

  /* ---- Pied de page légal (mentions officielles) ---- */
  .legal-footer {
    margin-top: 30px;
    padding-top: 10px;
    border-top: 1px solid #d1d5db;
    text-align: center;
  }
  .legal-footer p {
    margin: 2px 0;
    font-size: 10px;
    color: #9ca3af;
  }
  .legal-footer p.legal-line {
    font-size: 10.5px;
    color: #6b7280;
  }

  /* ---- Spécifique facturette POS ---- */
  .meta { width: 100%; margin-top: 16px; border-collapse: collapse; font-size: 12px; }
  .meta th { text-align: left; font-weight: 500; color: #6b7280; padding: 4px 0; width: 130px; }
  .meta td { text-align: left; padding: 4px 0; font-weight: 600; }
  .meta td.mono {
    font-family: Consolas, "Courier New", monospace;
    letter-spacing: 0.02em;
  }
  table.items { width: 100%; margin-top: 18px; border-collapse: collapse; font-size: 13px; }
  table.items th {
    text-align: left;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #6b7280;
    border-bottom: 1px solid #111827;
    padding: 6px 4px;
  }
  table.items td { padding: 8px 4px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
  table.items td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  table.items td.strong { font-weight: 600; }
  table.totals { width: 100%; margin-top: 14px; border-collapse: collapse; font-size: 13px; }
  table.totals td { padding: 6px 4px; }
  table.totals td:last-child { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  table.totals tr.grand td {
    font-weight: 700;
    font-size: 16px;
    border-top: 2px solid #111827;
    padding-top: 10px;
  }
  .thanks { margin-top: 22px; text-align: center; font-size: 12px; color: #6b7280; }
`;

/**
 * Construit l'en-tête d'entreprise détaillé commun à tous les reçus :
 * structure flex stricte à deux colonnes (55 % / 40 %) réparties en
 * `justify-content: space-between` — à gauche le bloc établissement
 * (logo autorisé plus large, nom du centre, adresse ancrée tout en bas) ;
 * à droite les coordonnées (téléphone, e-mail, site web) au-dessus du
 * titre du document et de son numéro, eux aussi ancrés tout en bas.
 *
 * Chaque colonne est elle-même un flex vertical `space-between` : les
 * blocs du bas (adresse à gauche, titre + numéro à droite) reposent ainsi
 * rigoureusement sur la même baseline horizontale, sans aucun décalage,
 * quelle que soit la hauteur du logo ou le nombre de lignes de contact.
 * Un filet plein (2px) clôt l'en-tête avant le corps du document.
 */
export function buildOrganizationHeader(
  organization: OrganizationProfileDTO,
  docKind: string,
  docNumber: string
): string {
  const fallbackInitial =
    organization.name.trim().charAt(0).toUpperCase() || "-";

  // Logo importé : affiché tel quel — il est désormais recadré à la source
  // (cadrage libre) via le rogneur d'images du formulaire d'organisation.
  // Le conteneur occupe pleinement le rectangle supérieur gauche (260px de
  // large max) et l'image s'y cale à gauche, jusqu'à 80px de haut. Sans
  // logo : monogramme de secours.
  const logoMarkup = organization.logoUrl
    ? `<div style="margin-bottom: 8px; width: 100%; max-width: 260px;"><img src="${escapeHtml(organization.logoUrl)}" alt="Logo" style="display: block; width: auto; max-width: 100%; max-height: 80px; object-fit: contain; object-position: left center;" /></div>`
    : `<div style="margin-bottom: 8px; width: 100%; max-width: 260px;"><span style="width: 60px; height: 60px; display: flex; align-items: center; justify-content: center; font-size: 26px; font-weight: 700; color: #3730a3; background: linear-gradient(135deg, #eef2ff, #e0e7ff); border-radius: 12px;">${escapeHtml(fallbackInitial)}</span></div>`;

  // Adresse + ville : ancrées tout en bas de la colonne gauche (sur la
  // même baseline que le numéro de reçu à droite).
  const addressLine = [
    organization.address ? escapeHtml(organization.address) : null,
    organization.city ? escapeHtml(organization.city) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const contactLines = [
    organization.phone
      ? `Tél. : ${escapeHtml(organization.phone)}`
      : null,
    organization.email
      ? `Email : ${escapeHtml(organization.email)}`
      : null,
    organization.website
      ? `Site web : ${escapeHtml(organization.website)}`
      : null,
  ].filter(Boolean);

  return `<header class="header-container" style="display: flex; justify-content: space-between; align-items: stretch; margin-bottom: 16px;">

  <!-- COLONNE GAUCHE -->
  <div style="display: flex; flex-direction: column; justify-content: space-between; width: 55%;">
    <div>
      <!-- Conteneur Logo : occupe pleinement le rectangle supérieur gauche -->
      ${logoMarkup}
      <div style="font-size: 15px; font-weight: bold; color: #111827; text-transform: uppercase; line-height: 1.2;">
        ${escapeHtml(organization.name)}
      </div>
    </div>
    <!-- Adresse ancrée tout en bas -->
    <div style="font-size: 11px; color: #6b7280; margin-top: 6px;">${addressLine}</div>
  </div>

  <!-- COLONNE DROITE -->
  <div style="display: flex; flex-direction: column; justify-content: space-between; align-items: flex-end; text-align: right; width: 40%;">
    <!-- CONTACTS ancrés en haut de la colonne -->
    <div style="font-size: 11px; color: #374151; line-height: 1.4;">${contactLines.join("<br />")}</div>
    <!-- Bloc Titre + Numéro ancré tout en bas pour s'aligner exactement avec l'adresse -->
    <div style="margin-top: 6px;">
      <div style="font-size: 14px; font-weight: 800; letter-spacing: 0.5px; color: #111827; text-transform: uppercase;">
        ${escapeHtml(docKind)}
      </div>
      <div style="font-size: 11px; color: #6b7280;">
        N° ${escapeHtml(docNumber)}
      </div>
    </div>
  </div>

</header>
<div style="width: 100%; border-bottom: 2px solid #111827; margin-bottom: 16px;"></div>`;
}

/**
 * Construit le pied de page légal commun à tous les reçus : mentions RCCM /
 * IFU-NIF, adresse complète, téléphone et site web. Bloc volontairement
 * discret (petits caractères, gris neutre) mais parfaitement lisible une
 * fois imprimé ou exporté en PDF A4.
 */
export function buildLegalFooter(organization: OrganizationProfileDTO): string {
  const legalLine = [
    organization.rccm ? `N° RCCM : ${escapeHtml(organization.rccm)}` : null,
    organization.ifu
      ? `N° IFU / NIF : ${escapeHtml(organization.ifu)}`
      : null,
    organization.address || organization.city
      ? [organization.address, organization.city]
          .filter(Boolean)
          .map((value) => escapeHtml(String(value)))
          .join(", ")
      : null,
  ].filter(Boolean);

  const contactLine = [
    organization.phone
      ? `Tél. : ${escapeHtml(organization.phone)}`
      : null,
    organization.email
      ? `Email : ${escapeHtml(organization.email)}`
      : null,
    organization.website
      ? `Site web : ${escapeHtml(organization.website)}`
      : null,
  ].filter(Boolean);

  return `<footer class="legal-footer">
      ${legalLine.length > 0 ? `<p class="legal-line">${legalLine.join(" · ")}</p>` : ""}
      ${contactLine.length > 0 ? `<p class="legal-line">${contactLine.join(" · ")}</p>` : ""}
      <p>Document généré le ${dateTimeFormatter.format(new Date())} — à conserver sans limitation de durée.</p>
      <p>Ce reçu fait office de document officiel. Merci de votre confiance.</p>
    </footer>`;
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
<style>${BASE_STYLES}</style>
</head>
<body>
  <main class="sheet">
    ${buildOrganizationHeader(organization, "Reçu de paiement", receiptNumber)}

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
          <th scope="row">Date et heure du règlement</th>
          <td class="strong">${dateTimeFormatter.format(payment.paidAt)}</td>
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

    ${buildLegalFooter(organization)}
  </main>
</body>
</html>`;
}

/** Ligne de l'historique des versements affichée sur un reçu échelonné. */
export type InstallmentHistoryEntry = {
  /** Date et heure exactes du versement. */
  paidAt: Date;
  paymentMethod: import("@prisma/client").PaymentMethod;
  /** Référence transaction ou note libre associée au versement. */
  label: string | null;
  amount: number;
};

/** Données nécessaires au reçu d'une tranche de procédure voyage. */
export type TravelInstallmentReceiptInput = {
  candidateName: string;
  /** Code étudiant si candidat inscrit, sinon téléphone saisi. */
  candidateDetail: string | null;
  destination: string;
  workflowTitle: string | null;
  totalCost: number;
  discount: number;
  netAmount: number;
  /** Cumul encaissé toutes tranches confondues (tranche courante incluse). */
  paidAmount: number;
  remainingAmount: number;
  installment: {
    amount: number;
    paymentMethod: import("@prisma/client").PaymentMethod;
    reference: string | null;
    paidAt: Date;
  };
  /**
   * Historique chronologique de tous les versements effectués à ce jour
   * (tranche courante incluse), rendu sous forme de tableau récapitulatif.
   */
  history: InstallmentHistoryEntry[];
};

/**
 * Construit le reçu détaillé d'un règlement par tranche d'une procédure
 * voyage : coût total, réduction, net à payer, tableau récapitulatif de tous
 * les versements effectués à ce jour (date, moyen, référence/note, montant),
 * puis bloc de synthèse Total du contrat / Cumul encaissé / Reste à payer.
 */
export function buildTravelInstallmentReceiptDocument(
  data: TravelInstallmentReceiptInput,
  organization: OrganizationProfileDTO
): string {
  const receiptNumber = `REC-V-${data.installment.paidAt.getFullYear()}-${data.installment.reference ?? data.installment.amount}`;

  const historyRows =
    data.history.length > 0
      ? data.history
          .map(
            (entry) => `<tr>
          <td class="nowrap">${dateTimeFormatter.format(entry.paidAt)}</td>
          <td>${escapeHtml(getPaymentMethodLabel(entry.paymentMethod))}</td>
          <td>${entry.label ? escapeHtml(entry.label) : "-"}</td>
          <td class="num">${amountFormatter.format(entry.amount)} FCFA</td>
        </tr>`
          )
          .join("\n")
      : `<tr><td class="empty" colspan="4">Aucun versement enregistré à ce jour.</td></tr>`;

  const summaryRows = [
    { label: "Coût total de la procédure", value: data.totalCost },
    ...(data.discount > 0
      ? [{ label: "Réduction accordée", value: -data.discount }]
      : []),
    { label: "Total du contrat", value: data.netAmount, strong: true },
    {
      label: "Cumul des paiements effectués",
      note: `Versements listés ci-dessus inclus (au ${dateFormatter.format(data.installment.paidAt)})`,
      value: data.paidAmount,
    },
    { label: "Reste à payer", value: data.remainingAmount, strong: true },
  ];

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Reçu de règlement — ${escapeHtml(data.candidateName)}</title>
<style>${BASE_STYLES}</style>
</head>
<body>
  <main class="sheet">
    ${buildOrganizationHeader(organization, "Reçu — Tranche procédure voyage", receiptNumber)}

    <table class="details">
      <tbody>
        <tr>
          <th scope="row">Candidat</th>
          <td class="strong">${escapeHtml(data.candidateName)}</td>
        </tr>
        ${data.candidateDetail ? `<tr><th scope="row">Référence</th><td class="mono">${escapeHtml(data.candidateDetail)}</td></tr>` : ""}
        <tr>
          <th scope="row">Procédure</th>
          <td>${escapeHtml(data.workflowTitle ?? `Destination ${data.destination}`)}</td>
        </tr>
        <tr>
          <th scope="row">Moyen de règlement</th>
          <td>${escapeHtml(getPaymentMethodLabel(data.installment.paymentMethod))}</td>
        </tr>
        <tr>
          <th scope="row">Date et heure du règlement</th>
          <td class="strong">${dateTimeFormatter.format(data.installment.paidAt)}</td>
        </tr>
        ${data.installment.reference ? `<tr><th scope="row">Transaction</th><td class="mono">${escapeHtml(data.installment.reference)}</td></tr>` : ""}
      </tbody>
    </table>

    <h2 class="section-title">Historique des versements</h2>
    <table class="history">
      <thead>
        <tr>
          <th>Date du paiement</th>
          <th>Moyen de règlement</th>
          <th>Référence / Note</th>
          <th class="num">Montant versé</th>
        </tr>
      </thead>
      <tbody>
        ${historyRows}
      </tbody>
    </table>
    <p class="history-caption">Cumul établi sur la totalité des versements listés ci-dessus.</p>

    <table class="summary">
      <tbody>
        ${summaryRows
          .map(
            (row) => `<tr${"strong" in row && row.strong ? ' class="strong"' : ""}>
          <td>${escapeHtml(row.label)}${"note" in row && row.note ? `<small>${escapeHtml(row.note)}</small>` : ""}</td>
          <td>${amountFormatter.format(row.value)} FCFA</td>
        </tr>`
          )
          .join("\n        ")}
      </tbody>
    </table>

    <section class="amount-block">
      <span class="amount-label">Montant de cette tranche</span>
      <strong class="amount-value">${amountFormatter.format(data.installment.amount)} FCFA</strong>
    </section>

    <section class="signatures">
      <div class="signature-box"><span>Cachet de l'organisation</span></div>
      <div class="signature-box"><span>Signature du responsable</span></div>
    </section>

    ${buildLegalFooter(organization)}
  </main>
</body>
</html>`;
}

const SALE_CATEGORY_LABELS: Record<string, string> = {
  BOOK: "Livre",
  TRANSLATION: "Traduction",
  COPY_SERVICE: "Photocopie",
};

/**
 * Référence lisible d'une vente comptoir (POS), dérivée de son identifiant.
 * Partagée entre la facturette imprimée et le tableau « Historique des
 * ventes » du POS pour garantir une référence identique partout.
 */
export function formatSaleReference(saleId: string): string {
  return `TCK-${saleId.slice(-8).toUpperCase()}`;
}

/** Données nécessaires à la facturette d'une vente comptoir (POS). */
export type SaleReceiptInput = {
  id: string;
  totalAmount: number;
  discount: number;
  netAmount: number;
  paymentMethod: import("@prisma/client").PaymentMethod | null;
  createdAt: Date;
  clientName: string;
  clientDetail: string | null;
  cashierName: string;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
};

/**
 * Construit la facturette / reçu de caisse d'une vente comptoir (POS),
 * avec le détail des lignes vendues, les totaux, la date et l'heure exactes
 * de l'encaissement.
 */
export function buildSaleReceiptDocument(
  sale: SaleReceiptInput,
  organization: OrganizationProfileDTO
): string {
  const receiptNumber = formatSaleReference(sale.id);

  const itemRows = sale.items
    .map(
      (item) => `<tr>
        <td>${escapeHtml(item.name)}<br /><small>${escapeHtml(SALE_CATEGORY_LABELS[item.name] ?? "")}</small></td>
        <td class="num">${item.quantity}</td>
        <td class="num">${amountFormatter.format(item.unitPrice)}</td>
        <td class="num strong">${amountFormatter.format(item.subtotal)}</td>
      </tr>`
    )
    .join("\n");

  // Client de passage (vente anonyme) : « Client de passage : Nom - Téléphone »
  // lorsque des coordonnées ont été saisies au comptoir, sinon « Client de
  // passage » seul. Les clients identifiés (étudiant / candidat) conservent
  // le rendu « Nom — détail ».
  const isWalkInClient = sale.clientName === "Client de passage";
  const clientCell = isWalkInClient
    ? sale.clientDetail
      ? `Client de passage : ${escapeHtml(sale.clientDetail)}`
      : escapeHtml(sale.clientName)
    : `${escapeHtml(sale.clientName)}${sale.clientDetail ? ` — ${escapeHtml(sale.clientDetail)}` : ""}`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Facturette ${escapeHtml(receiptNumber)}</title>
<style>${BASE_STYLES}</style>
</head>
<body>
  <main class="sheet narrow">
    ${buildOrganizationHeader(organization, "Facturette — Vente comptoir", receiptNumber)}

    <table class="meta">
      <tbody>
        <tr><th>N° ticket</th><td class="mono">${escapeHtml(receiptNumber)}</td></tr>
        <tr><th>Date et heure</th><td>${dateTimeFormatter.format(sale.createdAt)}</td></tr>
        <tr><th>Client</th><td>${clientCell}</td></tr>
        <tr><th>Caissier</th><td>${escapeHtml(sale.cashierName)}</td></tr>
        ${sale.paymentMethod ? `<tr><th>Règlement</th><td>${escapeHtml(getPaymentMethodLabel(sale.paymentMethod))}</td></tr>` : ""}
      </tbody>
    </table>

    <table class="items">
      <thead>
        <tr>
          <th>Article / Service</th>
          <th style="text-align:right;">Qté</th>
          <th style="text-align:right;">P.U.</th>
          <th style="text-align:right;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>

    <table class="totals">
      <tbody>
        <tr><td>Sous-total</td><td>${amountFormatter.format(sale.totalAmount)} FCFA</td></tr>
        ${sale.discount > 0 ? `<tr><td>Remise</td><td>- ${amountFormatter.format(sale.discount)} FCFA</td></tr>` : ""}
        <tr class="grand"><td>NET À PAYER</td><td>${amountFormatter.format(sale.netAmount)} FCFA</td></tr>
      </tbody>
    </table>

    <p class="thanks">Merci de votre visite !</p>

    ${buildLegalFooter(organization)}
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
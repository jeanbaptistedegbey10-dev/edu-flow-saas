/**
 * Génération des documents académiques imprimables : bulletin de notes et
 * attestation interne de formation.
 *
 * Approche identique aux reçus (`lib/receipt.ts`) : modèle HTML autonome et
 * stylisé + impression via `window.print()` dans un iframe caché
 * (« Destination : Enregistrer au format PDF » depuis la boîte d'impression).
 *
 * Le bulletin comprend :
 * - un en-tête d'entreprise sur structure flex à deux colonnes (55 % /
 *   40 %) : à gauche le bloc établissement (logo, nom du centre, adresse
 *   ancrée tout en bas) ; à droite les coordonnées, le titre du document
 *   et son numéro, eux aussi ancrés tout en bas — les lignes du bas
 *   reposent sur la même baseline ;
 * - l'identité complète de l'étudiant et sa classe / cohorte ;
 * - un tableau récapitulatif de tous les modules évalués : note obtenue sur
 *   le barème, note normalisée sur 100, seuil de validation et statut
 *   (Validé / Non Validé) ;
 * - la moyenne générale pondérée, le taux de validation des modules et une
 *   appréciation globale de l'enseignant ;
 * - une zone de signature / tampon et le pied de page légal.
 */

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

const numberFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 1,
});

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

// --------------------------------------
// Types publics (données attendues par les générateurs)
// --------------------------------------

import type { OrganizationProfileDTO } from "@/actions/payments";

/** Ligne module d'un bulletin : note d'un étudiant sur un module évalué. */
export type ReportCardModuleRow = {
  /** Intitulé de la session d'examen (ex : « Examen Continu N°1 »). */
  evaluationTitle: string;
  evaluationDate: Date;
  /** Intitulé du module (ex : « Lesen », « Hören »…). */
  moduleName: string;
  /** Note obtenue, ou null si le module n'est pas encore noté. */
  score: number | null;
  maxScore: number;
  passingScore: number;
};

/** Données nécessaires au bulletin de notes d'un étudiant. */
export type ReportCardInput = {
  studentName: string;
  studentCode: string;
  /** Classe / cohorte active (ou dernière connue). */
  className: string | null;
  /** Intitulé du cours porteur de la classe. */
  courseTitle: string | null;
  rows: ReportCardModuleRow[];
  /** Moyenne générale pondérée, normalisée sur 100 (null si aucune note). */
  overallAverage: number | null;
  /** Taux de validation des modules notés, en pourcentage (null si aucune note). */
  validationRate: number | null;
  gradedModuleCount: number;
  validatedModuleCount: number;
  /**
   * Appréciation globale rédigée par l'enseignant. Si absente, une
   * appréciation est générée automatiquement à partir de la moyenne.
   */
  appreciation?: string;
};

/** Données nécessaires à l'attestation interne de formation. */
export type InternalAttestationInput = {
  studentName: string;
  studentCode: string;
  className: string | null;
  courseTitle: string | null;
  /** Moyenne générale pondérée, normalisée sur 100 (null si aucune note). */
  overallAverage: number | null;
  /** Taux de validation des modules notés, en pourcentage (null si aucune note). */
  validationRate: number | null;
  /**
   * Message principal rédigé par l'administration avant impression. Si absent
   * ou vide, le texte par défaut (`buildDefaultAttestationMessage`) est
   * utilisé.
   */
  customMessage?: string;
};

/**
 * Message par défaut du corps de l'attestation de formation : phrase
 * d'attestation d'inscription / de suivi, réutilisable telle quelle dans la
 * zone de texte éditable avant impression.
 */
export function buildDefaultAttestationMessage(
  data: Pick<
    InternalAttestationInput,
    "studentName" | "studentCode" | "className" | "courseTitle"
  >,
  organizationName: string
): string {
  const formation = data.courseTitle
    ? `la formation ${data.courseTitle}`
    : "sa formation de langues";
  const cohort = data.className
    ? ` au sein de la cohorte « ${data.className} »`
    : "";

  return `La direction de ${organizationName} atteste que ${data.studentName} (code étudiant ${data.studentCode}) est inscrit·e et suit ${formation}${cohort} dispensée par l'établissement.`;
}

// --------------------------------------
// Helpers métier : mentions & appréciations
// --------------------------------------

/** Mention attribuée selon la moyenne générale (échelle /100). */
export function getGradeMention(average: number | null): string {
  if (average === null) return "Non évalué";

  if (average >= 90) return "Excellent";
  if (average >= 80) return "Très bien";
  if (average >= 70) return "Bien";
  if (average >= 60) return "Assez bien";
  if (average >= 50) return "Passable";
  return "Insuffisant";
}

/**
 * Appréciation globale générée automatiquement à partir de la moyenne
 * générale, utilisée lorsque l'enseignant n'a pas rédigé de commentaire.
 */
export function buildDefaultAppreciation(
  average: number | null,
  validationRate: number | null
): string {
  if (average === null) {
    return "Aucune note enregistrée à ce jour pour cet étudiant.";
  }

  const validationSentence =
    validationRate !== null
      ? ` Taux de validation des modules : ${numberFormatter.format(validationRate)} %.`
      : "";

  if (average >= 90) {
    return `Résultats excellents. L'étudiant maîtrise l'ensemble des compétences évaluées avec une grande régularité.${validationSentence}`;
  }

  if (average >= 80) {
    return `Très bons résultats. L'étudiant démontre une solide maîtrise des compétences évaluées.${validationSentence}`;
  }

  if (average >= 70) {
    return `Bons résultats dans l'ensemble. Quelques points restent à consolider pour atteindre l'excellence.${validationSentence}`;
  }

  if (average >= 60) {
    return `Résultats satisfaisants. Un travail régulier est encouragé pour renforcer les compétences fragiles.${validationSentence}`;
  }

  if (average >= 50) {
    return `Résultats justes. Un accompagnement renforcé et davantage de pratique sont recommandés.${validationSentence}`;
  }

  return `Résultats insuffisants à ce jour. Un plan de remise à niveau est vivement conseillé.${validationSentence}`;
}

// --------------------------------------
// Blocs partagés : styles, en-tête entreprise et pied de page légal
// --------------------------------------

/**
 * Feuille de style commune aux deux documents : feuille A4, en-tête
 * d'entreprise détaillé, tableaux de notes, synthèse, signatures et pied de
 * page légal.
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
    max-width: 780px;
    margin: 24px auto;
    padding: 36px 40px;
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
  }
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

  /* ---- Tableau d'identité ---- */
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

  /* ---- Titres de section ---- */
  .section-title {
    margin: 26px 0 0;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #374151;
  }

  /* ---- Tableau récapitulatif des notes ---- */
  table.grades {
    width: 100%;
    margin-top: 10px;
    border-collapse: collapse;
    font-size: 12.5px;
  }
  table.grades th {
    text-align: left;
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #6b7280;
    background: #f9fafb;
    border-bottom: 1px solid #111827;
    padding: 7px 8px;
  }
  table.grades td {
    padding: 8px;
    border-bottom: 1px solid #f3f4f6;
    vertical-align: top;
  }
  table.grades td.num,
  table.grades th.num {
    text-align: right;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  table.grades td.center,
  table.grades th.center { text-align: center; }
  table.grades td.empty {
    text-align: center;
    color: #9ca3af;
    padding: 16px 8px;
  }
  table.grades tr.evaluation-row td {
    background: #f8fafc;
    font-weight: 600;
    font-size: 11.5px;
    color: #334155;
  }
  .badge {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
  }
  .badge.passed { background: #d1fae5; color: #065f46; }
  .badge.failed { background: #fee2e2; color: #991b1b; }
  .badge.pending { background: #f3f4f6; color: #6b7280; }

  /* ---- Synthèse (moyenne, taux de validation) ---- */
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

  /* ---- Bloc résultat mis en avant ---- */
  .result-block {
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
  .result-label {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #6b7280;
  }
  .result-value { font-size: 24px; font-variant-numeric: tabular-nums; }

  /* ---- Appréciation ---- */
  .appreciation-box {
    margin-top: 22px;
    padding: 14px 18px;
    border: 1px solid #e5e7eb;
    border-left: 4px solid #3730a3;
    border-radius: 8px;
    background: #fafafa;
  }
  .appreciation-box .appreciation-label {
    margin: 0 0 6px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #6b7280;
  }
  .appreciation-box p {
    margin: 0;
    font-size: 13px;
    line-height: 1.55;
    white-space: pre-wrap;
  }

  /* ---- Attestation : corps du texte ---- */
  .attestation-body {
    margin-top: 26px;
    font-size: 13.5px;
    line-height: 1.75;
    text-align: justify;
  }
  .attestation-body p { margin: 0 0 14px; }
  .attestation-highlight {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-top: 20px;
    padding: 16px 20px;
    border: 1px solid #111827;
    border-radius: 8px;
    background: #f9fafb;
  }

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
`;

/**
 * Construit l'en-tête d'entreprise détaillé commun aux documents
 * académiques : structure flex stricte à deux colonnes (55 % / 40 %)
 * réparties en `justify-content: space-between` — à gauche le bloc
 * établissement (logo autorisé plus large, nom du centre, adresse ancrée
 * tout en bas) ; à droite les coordonnées (téléphone, e-mail, site web)
 * au-dessus du titre du document et de son numéro, eux aussi ancrés tout
 * en bas.
 *
 * Chaque colonne est elle-même un flex vertical `space-between` : les
 * blocs du bas (adresse à gauche, titre + numéro à droite) reposent ainsi
 * rigoureusement sur la même baseline horizontale, sans aucun décalage.
 * Un filet plein (2px) clôt l'en-tête avant le corps du document.
 */
function buildOrganizationHeader(
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
  // même baseline que le numéro du document à droite).
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
 * Construit le pied de page légal commun : mentions RCCM / IFU-NIF, adresse
 * complète, téléphone et site web. Bloc discret mais parfaitement lisible
 * une fois imprimé ou exporté en PDF A4.
 */
function buildLegalFooter(organization: OrganizationProfileDTO): string {
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
      <p>Ce document atteste des évaluations internes réalisées au sein de l'établissement.</p>
    </footer>`;
}

/** Identité étudiante commune aux deux documents. */
function buildStudentDetails(
  data: Pick<
    ReportCardInput,
    "studentName" | "studentCode" | "className" | "courseTitle"
  >
): string {
  return `<table class="details">
      <tbody>
        <tr>
          <th scope="row">Étudiant</th>
          <td class="strong">${escapeHtml(data.studentName)}</td>
        </tr>
        <tr>
          <th scope="row">Code étudiant</th>
          <td class="mono">${escapeHtml(data.studentCode)}</td>
        </tr>
        <tr>
          <th scope="row">Formation</th>
          <td>${data.courseTitle ? escapeHtml(data.courseTitle) : "-"}</td>
        </tr>
        <tr>
          <th scope="row">Classe / Cohorte</th>
          <td>${data.className ? escapeHtml(data.className) : "-"}</td>
        </tr>
      </tbody>
    </table>`;
}

/** Zone de signature / tampon commune. */
function buildSignatureSection(): string {
  return `<section class="signatures">
      <div class="signature-box"><span>Signature de l'enseignant</span></div>
      <div class="signature-box"><span>Cachet et tampon de l'établissement</span></div>
    </section>`;
}

// --------------------------------------
// Générateur : Bulletin de notes
// --------------------------------------

/**
 * Numéro de bulletin lisible et unique par jour : préfixe BUL + code étudiant
 * + date d'émission compacte.
 */
export function formatReportCardNumber(studentCode: string, issuedAt: Date): string {
  const year = issuedAt.getUTCFullYear();
  const month = String(issuedAt.getUTCMonth() + 1).padStart(2, "0");
  const day = String(issuedAt.getUTCDate()).padStart(2, "0");

  return `BUL-${studentCode}-${year}${month}${day}`;
}

/**
 * Construit le document HTML complet et autonome du bulletin de notes :
 * tableau récapitulatif des modules évalués (note sur barème, note /100,
 * seuil, statut), moyenne générale, taux de validation, appréciation
 * globale de l'enseignant et zone de signature / tampon.
 */
export function buildReportCardDocument(
  data: ReportCardInput,
  organization: OrganizationProfileDTO
): string {
  const docNumber = formatReportCardNumber(data.studentCode, new Date());

  // Regroupement des lignes par session d'évaluation (ordre chronologique).
  const byEvaluation = new Map<
    string,
    { title: string; date: Date; rows: ReportCardModuleRow[] }
  >();

  for (const row of data.rows) {
    const key = `${row.evaluationTitle}|${row.evaluationDate.getTime()}`;
    const entry = byEvaluation.get(key);

    if (entry) {
      entry.rows.push(row);
    } else {
      byEvaluation.set(key, {
        title: row.evaluationTitle,
        date: row.evaluationDate,
        rows: [row],
      });
    }
  }

  const gradeRows: string[] = [];

  for (const evaluation of byEvaluation.values()) {
    // Exclusion des examens non notés : une session dont aucun module ne
    // porte de note (examen programmé mais non évalué) n'apparaît pas sur
    // le bulletin et n'impacte pas les moyennes.
    const gradedRows = evaluation.rows.filter((row) => row.score !== null);

    if (gradedRows.length === 0) continue;

    gradeRows.push(`<tr class="evaluation-row">
          <td colspan="6">${escapeHtml(evaluation.title)} — ${dateFormatter.format(evaluation.date)}</td>
        </tr>`);

    for (const row of gradedRows) {
      const normalized =
        row.score === null || row.maxScore <= 0
          ? null
          : Math.round((row.score / row.maxScore) * 1000) / 10;

      let statusBadge: string;

      if (row.score === null) {
        statusBadge = '<span class="badge pending">Non noté</span>';
      } else if (row.score >= row.passingScore) {
        statusBadge = '<span class="badge passed">Validé</span>';
      } else {
        statusBadge = '<span class="badge failed">Non validé</span>';
      }

      gradeRows.push(`<tr>
          <td>${escapeHtml(row.moduleName)}</td>
          <td class="num">${row.score === null ? "-" : `${numberFormatter.format(row.score)} / ${numberFormatter.format(row.maxScore)}`}</td>
          <td class="num">${normalized === null ? "-" : `${numberFormatter.format(normalized)} / 100`}</td>
          <td class="num">${numberFormatter.format(row.passingScore)}</td>
          <td class="center">${statusBadge}</td>
        </tr>`);
    }
  }

  const gradesTableBody =
    gradeRows.length > 0
      ? gradeRows.join("\n")
      : `<tr><td class="empty" colspan="5">Aucune évaluation enregistrée pour cet étudiant.</td></tr>`;

  const appreciation =
    data.appreciation?.trim() ||
    buildDefaultAppreciation(data.overallAverage, data.validationRate);

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Bulletin de notes ${escapeHtml(docNumber)}</title>
<style>${BASE_STYLES}</style>
</head>
<body>
  <main class="sheet">
    ${buildOrganizationHeader(organization, "Bulletin de notes", docNumber)}

    ${buildStudentDetails(data)}

    <h2 class="section-title">Récapitulatif des évaluations internes</h2>
    <table class="grades">
      <thead>
        <tr>
          <th>Module évalué</th>
          <th class="num">Note obtenue</th>
          <th class="num">Note / 100</th>
          <th class="num">Seuil</th>
          <th class="center">Statut</th>
        </tr>
      </thead>
      <tbody>
        ${gradesTableBody}
      </tbody>
    </table>

    <table class="summary">
      <tbody>
        <tr>
          <td>Modules notés</td>
          <td>${data.gradedModuleCount} (dont ${data.validatedModuleCount} validé${data.validatedModuleCount > 1 ? "s" : ""})</td>
        </tr>
        <tr>
          <td>Taux de validation des modules</td>
          <td>${data.validationRate === null ? "-" : `${numberFormatter.format(data.validationRate)} %`}</td>
        </tr>
        <tr class="strong">
          <td>Moyenne générale</td>
          <td>${data.overallAverage === null ? "-" : `${numberFormatter.format(data.overallAverage)} / 100`}</td>
        </tr>
        <tr>
          <td>Mention</td>
          <td>${escapeHtml(getGradeMention(data.overallAverage))}</td>
        </tr>
      </tbody>
    </table>

    <section class="result-block">
      <span class="result-label">Moyenne générale</span>
      <strong class="result-value">${data.overallAverage === null ? "—" : `${numberFormatter.format(data.overallAverage)} / 100`}</strong>
    </section>

    <section class="appreciation-box">
      <p class="appreciation-label">Appréciation globale de l'enseignant</p>
      <p>${escapeHtml(appreciation)}</p>
    </section>

    ${buildSignatureSection()}

    ${buildLegalFooter(organization)}
  </main>
</body>
</html>`;
}

// --------------------------------------
// Générateur : Attestation interne
// --------------------------------------

/**
 * Numéro d'attestation lisible et unique par jour : préfixe ATT + code
 * étudiant + date d'émission compacte.
 */
export function formatAttestationNumber(studentCode: string, issuedAt: Date): string {
  const year = issuedAt.getUTCFullYear();
  const month = String(issuedAt.getUTCMonth() + 1).padStart(2, "0");
  const day = String(issuedAt.getUTCDate()).padStart(2, "0");

  return `ATT-${studentCode}-${year}${month}${day}`;
}

/**
 * Construit le document HTML complet et autonome de l'attestation interne de
 * formation : attestation de suivi de la formation au sein de
 * l'établissement, avec résultats académiques synthétiques (moyenne
 * générale, taux de validation), zone de signature / tampon et mentions
 * légales.
 */
export function buildInternalAttestationDocument(
  data: InternalAttestationInput,
  organization: OrganizationProfileDTO
): string {
  const docNumber = formatAttestationNumber(data.studentCode, new Date());

  // Message principal : texte rédigé par l'administration si fourni, sinon
  // la formulation par défaut. Rendu avec `white-space: pre-wrap` pour
  // conserver les sauts de ligne saisis dans la zone d'édition.
  const mainMessage =
    data.customMessage && data.customMessage.trim().length > 0
      ? data.customMessage.trim()
      : buildDefaultAttestationMessage(data, organization.name);

  const resultsParagraph =
    data.overallAverage !== null
      ? `<p>Au terme des évaluations internes organisées par l'établissement, l'étudiant·e obtient une <strong>moyenne générale de ${numberFormatter.format(data.overallAverage)} / 100</strong>${data.validationRate !== null ? `, avec un taux de validation des modules de <strong>${numberFormatter.format(data.validationRate)} %</strong>` : ""}. Mention : <strong>${escapeHtml(getGradeMention(data.overallAverage))}</strong>.</p>`
      : "<p>Les évaluations internes ne permettent pas encore d'établir un bilan chiffré pour cet·te étudiant·e à ce jour.</p>";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Attestation interne ${escapeHtml(docNumber)}</title>
<style>${BASE_STYLES}</style>
</head>
<body>
  <main class="sheet">
    ${buildOrganizationHeader(organization, "Attestation interne", docNumber)}

    ${buildStudentDetails(data)}

    <div class="attestation-body">
      <p style="white-space: pre-wrap;">${escapeHtml(mainMessage)}</p>
      ${resultsParagraph}
      <p>La présente attestation est délivrée à l'intéressé·e pour servir et valoir ce que de droit, à la demande de celui-ci / celle-ci, afin de justifier de son parcours pédagogique auprès de tout organisme compétent.</p>
    </div>

    <section class="attestation-highlight">
      <span class="result-label">Fait à ${escapeHtml(organization.city ?? "")}${organization.city ? ", le " : ""}${dateFormatter.format(new Date())}</span>
      <strong class="result-value">${data.overallAverage === null ? "—" : `${numberFormatter.format(data.overallAverage)} / 100`}</strong>
    </section>

    ${buildSignatureSection()}

    ${buildLegalFooter(organization)}
  </main>
</body>
</html>`;
}
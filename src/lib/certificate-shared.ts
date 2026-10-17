/**
 * Helpers partagés du moteur de rendu des certificats.
 *
 * Module PUR (client-safe, sans `server-only` ni Prisma) : il prépare les
 * valeurs échappées et les fragments HTML communs aux 4 modèles graphiques
 * (`certificate-html.ts`).
 *
 * ⚠️ SÉCURITÉ (XSS) — Le HTML produit est injecté via `iframe srcDoc` (même
 * origine) puis imprimé. TOUTE valeur issue de la base ou du client est donc
 * échappée AVANT interpolation (texte HTML et attributs) : noms d'étudiants,
 * nom d'organisation, titre de formation, code de vérification, informations
 * légales… Sans échappement, un établissement malveillant pourrait exécuter du
 * JavaScript dans le dashboard d'un collègue (vol de session).
 */

import {
  normalizeCertificateTemplate,
  type CertificateTemplateKey,
} from "@/lib/certificate-template";

// Constantes de caractères construites dynamiquement : évite d'écrire
// littéralement les entités HTML dans la source.
const AMP = String.fromCharCode(38);
const LT = String.fromCharCode(60);
const GT = String.fromCharCode(62);
const DQ = String.fromCharCode(34);

/**
 * Échappe `& < > "` — quartet nécessaire pour interpoler une valeur en
 * sécurité dans du texte HTML **et** dans un attribut entre guillemets
 * doubles.
 */
export function escapeHtml(value: string): string {
  return String(value)
    .replace(new RegExp(AMP, "g"), `${AMP}amp;`)
    .replace(new RegExp(LT, "g"), `${AMP}lt;`)
    .replace(new RegExp(GT, "g"), `${AMP}gt;`)
    .replace(new RegExp(DQ, "g"), `${AMP}quot;`);
}

/** Données brutes reçues par `buildCertificateHtml`. */
export interface CertificateHtmlData {
  studentName: string;
  studentCode: string;
  /**
   * Date de naissance de l'étudiant — accepte un `Date` ou une chaîne
   * (ISO `yyyy-mm-dd`). Alimente la variable `{{birthDate}}` du texte par
   * défaut et des gabarits personnalisés.
   */
  birthDate?: string | Date | null;
  level: string;
  score: number | null;
  issueDate: Date;
  verificationCode: string;
  verificationUrl: string;
  organizationName: string;
  courseTitle?: string | null;
  /** Modèle graphique à appliquer (défaut TEMPLATE_1). */
  template?: CertificateTemplateKey | string | null;
  /** URL du logo de l'organisation (en-tête + filigrane). */
  logoUrl?: string | null;
  // Informations légales (pied de page) — optionnelles pour rétro-compat.
  organizationEmail?: string | null;
  organizationPhone?: string | null;
  organizationAddress?: string | null;
  organizationCity?: string | null;
  organizationWebsite?: string | null;
  organizationRccm?: string | null;
  organizationIfu?: string | null;
  /**
   * Gabarit de texte personnalisé du corps du certificat, défini par
   * l'administration de l'organisation (`Organization.certificateTextTemplate`).
   * Accepte les variables dynamiques `{{studentName}}`, `{{birthDate}}`,
   * `{{matricule}}`, `{{courseName}}`, `{{level}}`, `{{date}}`,
   * `{{organizationName}}`, `{{verificationCode}}` et `{{score}}`.
   * `null`/vide ⇒ texte standard.
   */
  certificateTextTemplate?: string | null;
}

/** Valeurs pré-normalisées et échappées, prêtes à l'interpolation. */
export interface SafeCertificateData {
  studentName: string;
  studentCode: string;
  /** Date de naissance formatée en français long (« 15 avril 2001 »), ou vide. */
  birthDate: string;
  level: string;
  scoreText: string | null;
  formattedDate: string;
  verificationCode: string;
  title: string;
  /** URL du QR code déjà échappée pour un attribut `src`. */
  qrUrl: string;
  courseTitle: string | null;
  organizationName: string;
  monogram: string;
  /** URL du logo échappée, ou `null` si absente (fallback monogramme). */
  logoUrl: string | null;
  organizationEmail: string | null;
  organizationPhone: string | null;
  organizationAddress: string | null;
  organizationCity: string | null;
  organizationWebsite: string | null;
  organizationRccm: string | null;
  organizationIfu: string | null;
  template: CertificateTemplateKey;
  /** Gabarit de texte personnalisé échappé, ou `null` si non défini. */
  certificateTextTemplate: string | null;
}

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Normalise une date de naissance en texte affichable : `Date` ou chaîne ISO
 * `yyyy-mm-dd` → date française longue (« 15 avril 2001 ») ; valeur absente
 * ou invalide → chaîne vide (la variable n'est alors pas enveloppée de
 * `<strong>` pour éviter un gras vide).
 */
function formatBirthDate(value: string | Date | null | undefined): string {
  if (value == null) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return dateFormatter.format(date);
}

/**
 * Prépare et échappe l'ensemble des valeurs du certificat en une seule
 * passe. `template` est réduit à une clé valide (défaut TEMPLATE_1).
 */
export function prepareCertificateData(
  data: CertificateHtmlData
): SafeCertificateData {
  const monogram =
    data.organizationName.trim().charAt(0).toUpperCase() || "C";

  // `level` ne sert qu'à choisir le libellé, mais on l'échappe avant toute
  // comparaison (défense en profondeur).
  const safeLevel = escapeHtml(data.level);
  const title = safeLevel.toUpperCase().includes("ATTESTATION")
    ? "ATTESTATION DE RÉUSSITE"
    : "CERTIFICAT DE COMPÉTENCE LINGUISTIQUE";

  return {
    studentName: escapeHtml(data.studentName),
    studentCode: escapeHtml(data.studentCode),
    birthDate: escapeHtml(formatBirthDate(data.birthDate)),
    level: safeLevel,
    scoreText: data.score !== null ? `${data.score.toFixed(1)} %` : null,
    formattedDate: dateFormatter.format(data.issueDate),
    verificationCode: escapeHtml(data.verificationCode),
    title,
    qrUrl: escapeHtml(
      `https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=0&data=${encodeURIComponent(
        data.verificationUrl
      )}`
    ),
    courseTitle:
      data.courseTitle != null && data.courseTitle !== ""
        ? escapeHtml(data.courseTitle)
        : null,
    organizationName: escapeHtml(data.organizationName),
    monogram: escapeHtml(monogram),
    logoUrl: data.logoUrl ? escapeHtml(data.logoUrl) : null,
    organizationEmail: data.organizationEmail
      ? escapeHtml(data.organizationEmail)
      : null,
    organizationPhone: data.organizationPhone
      ? escapeHtml(data.organizationPhone)
      : null,
    organizationAddress: data.organizationAddress
      ? escapeHtml(data.organizationAddress)
      : null,
    organizationCity: data.organizationCity
      ? escapeHtml(data.organizationCity)
      : null,
    organizationWebsite: data.organizationWebsite
      ? escapeHtml(data.organizationWebsite)
      : null,
    organizationRccm: data.organizationRccm
      ? escapeHtml(data.organizationRccm)
      : null,
    organizationIfu: data.organizationIfu
      ? escapeHtml(data.organizationIfu)
      : null,
    template: normalizeCertificateTemplate(data.template),
    certificateTextTemplate:
      data.certificateTextTemplate != null &&
      data.certificateTextTemplate.trim() !== ""
        ? data.certificateTextTemplate
        : null,
  };
}

/**
 * Filigrane diagonal centré : le LOGO de l'organisation en très grande
 * taille et opacité réduite. Repli sur un monogramme/mot si aucun logo.
 */
export function buildWatermark(
  sd: SafeCertificateData,
  label: string
): string {
  if (sd.logoUrl) {
    return `<div class="watermark" aria-hidden="true"><img src="${sd.logoUrl}" alt="" /></div>`;
  }
  return `<div class="watermark" aria-hidden="true">${escapeHtml(label)}</div>`;
}

/**
 * Pied de page légal complet : numéros officiels (RCCM, IFU/NIF), mention
 * d'agrément, adresse, téléphone, e-mail et site web. Bloc discret (petits
 * caractères) mais parfaitement lisible à l'impression A4.
 */
export function buildLegalFooter(sd: SafeCertificateData): string {
  const officialNumbers = [
    sd.organizationRccm ? `N° RCCM : ${sd.organizationRccm}` : null,
    sd.organizationIfu ? `N° IFU / NIF : ${sd.organizationIfu}` : null,
  ].filter(Boolean);

  const addressLine = [sd.organizationAddress, sd.organizationCity]
    .filter(Boolean)
    .join(", ");

  const contactLine = [
    sd.organizationPhone ? `Tél. : ${sd.organizationPhone}` : null,
    sd.organizationEmail ? `Email : ${sd.organizationEmail}` : null,
    sd.organizationWebsite ? `Site web : ${sd.organizationWebsite}` : null,
  ].filter(Boolean);

  const agreement = `<p class="legal-line"><strong>Organisme de formation agréé</strong>${
    officialNumbers.length > 0 ? " · " : ""
  }${officialNumbers.join(" · ")}</p>`;

  return `<div class="legal-footer">
      ${agreement}
      ${addressLine ? `<p class="legal-line">${addressLine}</p>` : ""}
      ${
        contactLine.length > 0
          ? `<p class="legal-line">${contactLine.join(" · ")}</p>`
          : ""
      }
    </div>`;
}

// ---------------------------------------------------------------------------
// Personnalisation dynamique du corps du certificat
// ---------------------------------------------------------------------------

/**
 * Texte par défaut du corps du certificat, utilisé quand l'organisation n'a
 * pas défini de gabarit personnalisé (`Organization.certificateTextTemplate`
 * vide ou null).
 *
 * Variables dynamiques interprétées à la génération par
 * `interpolateCertificateTemplate` : `{{studentName}}`, `{{matricule}}`,
 * `{{courseName}}` et `{{date}}` — chaque valeur est automatiquement
 * entourée d'une balise `<strong class="cert-var">` pour apparaître en gras
 * dans le document imprimé.
 */
export const DEFAULT_CERTIFICATE_TEXT = `Il est certifié par la présente que l'étudiant(e) {{studentName}}, né(e) le {{birthDate}}, inscrit(e) sous le matricule {{matricule}}, a suivi et achevé avec succès son parcours de formation pour le niveau {{courseName}} au sein de notre établissement.

L'intéressé(e) a validé avec succès l'ensemble des modules d'évaluation prévus au programme. La présente attestation me est délivrée à des fins d'activités internes, de suivi de cursus et de valorisation des acquis pédagogiques de l'école, et ne constitue pas une certification officielle reconnue à l'international. Fait à Abomey-Calavi, le {{date}}.`;

/**
 * Variables dynamiques supportées dans le gabarit `certificateTextTemplate`.
 * Affichées dans l'aide du formulaire d'organisation et substituées à la
 * génération par `interpolateCertificateTemplate`.
 */
export const CERTIFICATE_TEMPLATE_VARIABLES: readonly {
  token: string;
  label: string;
}[] = [
  { token: "studentName", label: "Nom complet de l'étudiant" },
  { token: "birthDate", label: "Date de naissance de l'étudiant" },
  { token: "matricule", label: "Numéro matricule de l'étudiant" },
  { token: "courseName", label: "Intitulé de la formation" },
  { token: "level", label: "Niveau certifié" },
  { token: "date", label: "Date d'émission du certificat" },
  { token: "organizationName", label: "Nom de l'organisation" },
  { token: "verificationCode", label: "Code de vérification unique" },
  { token: "score", label: "Mention / score obtenu" },
];

/**
 * Interprète un gabarit de texte personnalisé en remplaçant les variables
 * dynamiques `{{...}}` par les valeurs échappées du certificat.
 *
 * ✨ RENDU — Chaque valeur injectée est automatiquement entourée d'une balise
 * `<strong class="cert-var">` : nom de l'étudiant, matricule, formation,
 * niveau, date… ressortent donc en **gras** au milieu du paragraphe saisi par
 * l'administration (voir la règle `.cert-var` du CSS commun). Une variable
 * vide (ex. `{{courseName}}` sans cours rattaché) n'enveloppe rien pour
 * éviter une balise `<strong></strong>` vide.
 *
 * ⚠️ SÉCURITÉ (XSS) — Le gabarit provient de la base (saisi par
 * l'administration) et le rendu est injecté via `iframe srcDoc`. On échappe
 * donc d'abord le gabarit ENTIER (neutralisant tout HTML/script saisi), puis
 * on substitue les `{{var}}` — qui ne contiennent aucun caractère spécial —
 * par des valeurs déjà échappées. Les seules balises introduites sont donc
 * celles, statiques, du marquage `<strong>` ci-dessous. Les sauts de ligne
 * deviennent des `<br>`.
 */
export function interpolateCertificateTemplate(
  template: string,
  sd: SafeCertificateData
): string {
  const values: Record<string, string> = {
    studentName: sd.studentName,
    birthDate: sd.birthDate,
    matricule: sd.studentCode,
    // Alias pratiques pour les administrations.
    studentCode: sd.studentCode,
    courseName: sd.courseTitle ?? "",
    courseTitle: sd.courseTitle ?? "",
    level: sd.level,
    date: sd.formattedDate,
    organizationName: sd.organizationName,
    verificationCode: sd.verificationCode,
    score: sd.scoreText ?? "",
  };

  // Marque les informations spécifiques (étudiant, formation, date…) en gras.
  const boldValue = (value: string): string =>
    value === "" ? "" : `<strong class="cert-var">${value}</strong>`;

  // 1. Échapper le gabarit pour neutraliser tout HTML/script saisi.
  // 2. Substituer les variables connues (en gras) ; les tokens inconnus
  //    deviennent vide.
  // 3. Préserver les retours à la ligne.
  return escapeHtml(template)
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) =>
      Object.prototype.hasOwnProperty.call(values, key)
        ? boldValue(values[key])
        : ""
    )
    .replace(/\r\n|\r|\n/g, "<br />");
}

/**
 * Construit le contenu central UNIFIÉ du certificat : un bloc de texte
 * harmonieux, centré et valorisant intégrant le nom de l'étudiant, son
 * matricule et la formation.
 *
 * - Si l'organisation a défini un `certificateTextTemplate`, ce texte
 *   personnalisé (variables interprétées) forme le cœur du bloc.
 * - Sinon, le texte standard par défaut est utilisé (rétro-compatible).
 *
 * NOTE PRODUIT : l'encadré « Niveau certifié » a été retiré de tous les
 * modèles pour ne pas surcharger la page et laisser toute la place au
 * bloc de texte central (le niveau reste disponible via la variable
 * `{{level}}` des gabarits personnalisés).
 */
export function buildCertificateBody(sd: SafeCertificateData): string {
  if (sd.certificateTextTemplate !== null) {
    const custom = interpolateCertificateTemplate(
      sd.certificateTextTemplate,
      sd
    );
    return `<div class="cert-body cert-body--custom">
        <p class="narrative narrative--custom">${custom}</p>
      </div>`;
  }

  // Texte standard par défaut : mêmes variables `{{…}}` que le gabarit
  // personnalisé — chaque valeur injectée est entourée d'un
  // `<strong class="cert-var">` (gras) par `interpolateCertificateTemplate`.
  const standard = interpolateCertificateTemplate(
    DEFAULT_CERTIFICATE_TEXT,
    sd
  );

  return `<div class="cert-body">
      <p class="narrative">${standard}</p>
      ${courseLineBlock(sd)}
      ${scoreBoxBlock(sd)}
    </div>`;
}

/** Ligne « formation » (masquée si aucun cours rattaché). */
function courseLineBlock(sd: SafeCertificateData): string {
  if (sd.courseTitle === null) return "";
  return `<p class="course-line"><span class="course-label">Formation :</span> <strong>${sd.courseTitle}</strong></p>`;
}

/** Ligne « mention / score » (masquée si aucun score). */
function scoreBoxBlock(sd: SafeCertificateData): string {
  if (sd.scoreText === null) return "";
  return `<div class="score-box"><span class="score-label">Mention / Score</span><span class="score-value">${sd.scoreText}</span></div>`;
}


/**
 * CSS d'impression commun — STRICTEMENT une seule page A4 paysage.
 *
 * - `@page { size: A4 landscape; margin: 0 }` : la feuille imprimée = le
 *   certificat, sans marge native du navigateur.
 * - Le conteneur `#certificate` fait EXACTEMENT 297 × 210 mm avec
 *   `overflow: hidden` : aucun débordement sur une 2ème page.
 * - `break-inside/after: avoid` + `print-color-adjust: exact` : pas de
 *   coupure, aplats de couleur conservés.
 * - En `@media print`, le corps perd tout padding/marge (sinon 297 mm +
 *   padding > feuille ⇒ 2ème page) et le bouton d'impression est masqué.
 */
export function buildPrintCss(): string {
  return `@page { size: A4 landscape; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      background: #e9e9ec;
      display: flex; justify-content: center; align-items: flex-start;
      padding: 24px;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    #certificate {
      width: 297mm; height: 210mm; max-width: 297mm; max-height: 210mm;
      position: relative; overflow: hidden;
      /* Contexte d'empilement dédié : le filigrane en z-index -1 passe
         derrière le contenu tout en restant AU-DESSUS du fond du certificat. */
      isolation: isolate;
      page-break-inside: avoid; break-inside: avoid; break-after: avoid;
      page-break-after: avoid;
    }
    .no-print { position: fixed; top: 16px; right: 16px; z-index: 50; }
    .no-print .btn {
      padding: 10px 18px; border: none; border-radius: 6px; cursor: pointer;
      font-weight: bold; color: #fff; background: #1e3a5f; font-size: 13px;
    }
    /* Grand filigrane centré : logo (ou nom de l'organisation) en très
       grande taille, opacité très légère et inclinaison discrète — posé
       DERRIÈRE le texte (z-index -1) pour une touche de sécurité qui ne
       gêne jamais la lecture. */
    .watermark {
      position: absolute; top: 50%; left: 50%;
      transform: translate(-50%, -50%) rotate(-25deg);
      opacity: 0.06; pointer-events: none; z-index: -1;
      display: flex; align-items: center; justify-content: center;
      font-weight: 800; letter-spacing: 10px; white-space: nowrap;
      font-size: 92px; line-height: 1;
    }
    .watermark img { width: 560px; height: auto; }
    /* Palette par défaut du contenu central (surchargeable par modèle). */
    #certificate {
      --cert-accent: #1e3a5f;
      --cert-accent-2: #c9a227;
      --cert-ink: #2d3748;
      --cert-muted: #718096;
      --cert-panel-bg: #fdf6e3;
      --cert-panel-border: #c9a227;
    }
    /* Contenu central UNIFIÉ : bloc de texte harmonieux, centré, valorisant.
       Structure commune à tous les modèles ; seules les couleurs varient
       via les variables CSS ci-dessus. */
    .cert-body {
      flex: 1; width: 100%; max-width: 176mm; margin: 0 auto;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      text-align: center; padding: 6px 8px;
    }
    .cert-body .intro { font-size: 13px; font-style: italic; color: var(--cert-ink); margin: 0 0 10px; }
    .cert-body .student-name { font-size: 30px; font-weight: bold; color: var(--cert-accent); margin: 2px 0 6px; line-height: 1.15; letter-spacing: 0.3px; }
    .cert-body .student-code { font-size: 12px; color: var(--cert-muted); font-family: monospace; margin: 0 0 16px; }
    .cert-body .narrative { font-size: 13.5px; line-height: 1.65; color: var(--cert-ink); margin: 0 auto 16px; max-width: 152mm; }
    .cert-body .narrative--custom { font-size: 15px; line-height: 1.8; }
    /* Variables dynamiques du texte personnalisé ({{studentName}} etc.) :
       toujours en GRAS pour bien distinguer les informations de l'étudiant
       et de la formation au milieu du paragraphe. */
    .cert-var, .cert-body .cert-var { font-weight: 700; }
    .cert-body .course-line { font-size: 13px; color: var(--cert-ink); margin: 10px 0 0; }
    .cert-body .course-label { color: var(--cert-muted); }
    .cert-body .score-box { display: inline-flex; flex-direction: column; margin-top: 12px; }
    .cert-body .score-label { font-size: 10px; color: var(--cert-muted); text-transform: uppercase; letter-spacing: 1px; }
    .cert-body .score-value { font-size: 16px; font-weight: bold; color: var(--cert-ink); font-family: monospace; }
    /* Pied de page légal : mentions parfaitement lisibles à l'impression. */
    .legal-footer { text-align: center; color: #6b7280; font-size: 9px; line-height: 1.6; }
    .legal-footer .legal-line { margin: 0; }
    .legal-footer strong { color: #374151; }
    @media print {
      body { background: #fff; padding: 0; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
      #certificate { box-shadow: none !important; margin: 0 !important; }
    }`;
}

/**
 * Marque du logo dans l'en-tête : image du logo si fournie, sinon monogramme
 * (initiale de l'organisation) dans un disque coloré. `styleClass` permet à
 * chaque modèle d'imposer ses propres dimensions/couleurs via une classe CSS.
 */
export function buildLogoMarkup(
  sd: SafeCertificateData,
  imgClass = "",
  fallbackClass = ""
): string {
  if (sd.logoUrl) {
    return `<img class="${imgClass}" src="${sd.logoUrl}" alt="Logo ${sd.organizationName}" />`;
  }
  return `<div class="${fallbackClass}">${sd.monogram}</div>`;
}

/**
 * Bloc QR code de vérification : image scannable + code unique lisible.
 * Centré ou aligné selon la classe CSS appliquée par le modèle.
 */
export function buildQrBlock(sd: SafeCertificateData): string {
  return `<div class="qr-section">
      <img class="qr-code" src="${sd.qrUrl}" alt="QR de vérification" />
      <p class="qr-label">Scanner pour vérifier</p>
      <p class="qr-code-value">${sd.verificationCode}</p>
    </div>`;
}



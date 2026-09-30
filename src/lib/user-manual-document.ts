/**
 * Génération du Manuel d'Utilisation EduFlow — document HTML autonome A4.
 *
 * APPROCHE RETENUE : modèle HTML autonome et stylisé + impression via
 * `window.print()` dans une iframe caché (`printHtmlDocument`, réutilisé
 * depuis `@/lib/receipt`). Ce choix, déjà retenu pour les reçus, les
 * facturettes et le relevé élève, évite d'embarquer une bibliothèque PDF côté
 * client tout en permettant l'enregistrement en PDF nativement depuis la boîte
 * de dialogue d'impression du navigateur (« Destination : Enregistrer au
 * format PDF »).
 *
 * Le MÊME document sert à l'aperçu à l'écran (iframe `srcdoc` de la page
 * `/dashboard/guide`) et à l'impression : l'aperçu est donc strictement
 * identique au PDF produit, sans duplication à maintenir.
 *
 * L'ordre des chapitres provient de `@/data/user-manual` et suit l'ordre
 * strict des dépendances système (voir l'en-tête de ce module de données).
 */

import {
  MANUAL_CHAPTERS,
  MANUAL_CHAPTER_COUNT,
  MANUAL_TITLE,
  MANUAL_VERSION,
} from "@/data/user-manual";
import { escapeHtml } from "@/lib/receipt";

/**
 * Feuille de style du Manuel d'Utilisation — format A4 PORTRAIT.
 *
 * Deux usages, un seul document (même approche que le certificat et les reçus
 * de `src/lib/certificate-html.ts` / `src/lib/receipt.ts`) :
 * - aperçu à l'écran dans une iframe (`srcdoc`) ;
 * - impression / enregistrement PDF via `printHtmlDocument`.
 *
 * RÈGLES D'IMPRESSION A4, dans cet ordre (l'ordre est significatif : les
 * règles génériques étaient la cause des coupures de texte observées) :
 *
 * 1. `@page { size: A4 portrait; margin: … }` : le document occupe exactement
 *    une feuille A4, marges comprises. Marges volontairement réduites à
 *    l'impression (10 mm) : une zone de marge trop étroite pousse les
 *    navigateurs à afficher leurs en-têtes natifs (date, titre, URL) et à
 *    rogner le contenu.
 * 2. `.chapter + .chapter { break-before: page }` : chaque chapitre démarre sur
 *    une NOUVELLE page. `break-inside: avoid` sur les blocs, titres, encarts et
 *    listes : un paragraphe ou une étape n'est JAMAIS coupé en deux entre deux
 *    pages — c'est la cause n°1 des « textes tronqués » signalés.
 * 3. `orphans` / `widows` à 3 : le navigateur ne laisse jamais une seule ligne
 *    d'un paragraphe isolée en bas ou en haut de page.
 * 4. `-webkit-print-color-adjust: exact` : les aplats de couleur (en-têtes
 *    indigo, encarts, avertissements) sont conservés à l'impression.
 * 5. `.screen-toolbar` (barre de l'aperçu) est masqué à l'impression : elle
 *    n'apparaît jamais sur la feuille.
 * 6. `thead { display: table-header-group }` : l'en-tête du sommaire est
 *    répété si le tableau traverse une frontière de page.
 */
export const MANUAL_STYLES = `
  *, *::before, *::after { box-sizing: border-box; }

  @page { size: A4 portrait; margin: 12mm; }
  @media print {
    @page { margin: 10mm; }
  }

  html { background: #e5e7eb; }
  body {
    margin: 0;
    padding: 24px 12px;
    font-family: "Segoe UI", system-ui, -apple-system, Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.55;
    color: #1f2937;
    background: #e5e7eb;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ---- Feuille A4 à l'écran (fond gris = « papier sur le bureau ») ---- */
  .sheet {
    max-width: 210mm;
    margin: 0 auto;
    padding: 16mm 15mm;
    background: #ffffff;
    box-shadow: 0 2px 16px rgba(15, 23, 42, 0.16);
  }

  /* ---- Page de garde ---- */
  .cover { text-align: center; padding: 12mm 0 10mm; }
  .cover-logo {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 68px;
    height: 68px;
    border-radius: 16px;
    background: linear-gradient(135deg, #4f46e5, #6366f1);
    color: #ffffff;
    font-size: 30px;
    font-weight: 700;
    margin-bottom: 14px;
  }
  .cover-org {
    font-size: 13pt;
    font-weight: 600;
    color: #4338ca;
    margin: 0 0 4px;
  }
  .cover-kicker {
    font-size: 8.5pt;
    text-transform: uppercase;
    letter-spacing: 0.22em;
    color: #6b7280;
    margin: 0 0 18px;
  }
  .cover-title {
    font-size: 30pt;
    line-height: 1.15;
    font-weight: 700;
    color: #111827;
    margin: 0 0 10px;
  }
  .cover-subtitle {
    font-size: 11.5pt;
    color: #4b5563;
    margin: 0 auto 20px;
    max-width: 140mm;
  }
  .cover-rule {
    width: 44mm;
    height: 3px;
    background: #4f46e5;
    margin: 0 auto 20px;
  }
  .cover-meta { font-size: 9.5pt; color: #6b7280; margin: 0; }
  .cover-meta strong { color: #1f2937; }

  /* ---- Sommaire ---- */
  .toc-title {
    font-size: 14pt;
    font-weight: 700;
    color: #111827;
    margin: 0 0 10px;
    padding-bottom: 6px;
    border-bottom: 2px solid #4f46e5;
  }
  .toc { width: 100%; border-collapse: collapse; font-size: 10.5pt; }
  .toc th {
    text-align: left;
    font-size: 8.5pt;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #6b7280;
    background: #f9fafb;
    border-bottom: 1px solid #111827;
    padding: 5px 0;
  }
  .toc th:first-child { padding-left: 8px; }
  .toc td { padding: 6px 0; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  .toc tbody tr:first-child td { padding-top: 8px; }
  .toc .num { width: 30px; color: #4f46e5; font-weight: 700; }
  .toc .label { color: #1f2937; font-weight: 600; }
  .toc .desc {
    display: block;
    font-weight: 400;
    color: #6b7280;
    font-size: 9.5pt;
    margin-top: 2px;
  }


  /* ---- Chapitres : une page chacun ---- */
  .chapter { margin-top: 0; }
  .chapter + .chapter { break-before: page; page-break-before: always; }
  .chapter-head {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding-bottom: 8px;
    margin-bottom: 12px;
    border-bottom: 3px solid #4f46e5;
    break-after: avoid;
    page-break-after: avoid;
  }
  .chapter-num {
    font-size: 22pt;
    font-weight: 700;
    color: #4f46e5;
    line-height: 1;
  }
  .chapter-title { font-size: 16pt; font-weight: 700; color: #111827; margin: 0; }
  .chapter-summary {
    font-size: 10pt;
    color: #4b5563;
    font-style: italic;
    margin: 0 0 14px;
  }

  /* ---- Blocs (sous-sections) : jamais coupés entre deux pages ---- */
  .block {
    margin-bottom: 14px;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .block-title {
    font-size: 12pt;
    font-weight: 700;
    color: #1e293b;
    margin: 0 0 6px;
    padding-left: 9px;
    border-left: 4px solid #4f46e5;
    break-after: avoid;
    page-break-after: avoid;
  }

  /* ---- Étapes : liste ordonnée sans coupure ---- */
  .steps { margin: 0; padding-left: 20px; font-size: 10.5pt; }
  .steps li { margin-bottom: 4px; break-inside: avoid; page-break-inside: avoid; }
  .steps li::marker { color: #4f46e5; font-weight: 700; }

  /* ---- Encarts « à savoir » et « attention » ---- */
  .note, .warning {
    margin-top: 8px;
    padding: 8px 11px;
    border-radius: 6px;
    font-size: 9.8pt;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .note { background: #eef2ff; border-left: 4px solid #4f46e5; color: #312e81; }
  .warning {
    background: #fef2f2;
    border-left: 4px solid #dc2626;
    color: #7f1d1d;
    font-weight: 600;
  }
  .note strong, .warning strong { display: block; margin-bottom: 2px; }

  /* ---- Pied de page ---- */
  .doc-footer {
    margin-top: 18px;
    padding-top: 8px;
    border-top: 1px solid #d1d5db;
    font-size: 8.5pt;
    color: #6b7280;
    text-align: center;
  }

  /* ---- Barre d'outils de l'aperçu : jamais imprimée ---- */
  .screen-toolbar {
    position: sticky;
    top: 0;
    z-index: 5;
    max-width: 210mm;
    margin: 0 auto 12px;
    padding: 10px 14px;
    display: flex;
    align-items: center;
    gap: 12px;
    background: #ffffff;
    border-radius: 10px;
    box-shadow: 0 1px 6px rgba(15, 23, 42, 0.14);
    font-family: "Segoe UI", system-ui, -apple-system, Arial, sans-serif;
  }
  .screen-toolbar span { font-size: 11px; color: #4b5563; }
  .screen-toolbar button {
    font: inherit;
    font-size: 11px;
    font-weight: 600;
    color: #ffffff;
    background: #4f46e5;
    border: 0;
    border-radius: 6px;
    padding: 7px 14px;
    cursor: pointer;
  }
  .screen-toolbar button:hover { background: #4338ca; }

  /* ---- Adaptation à l'impression ---- */
  @media print {
    html, body { background: #ffffff; }
    body { padding: 0; font-size: 10.5pt; }
    .sheet { max-width: none; margin: 0; padding: 0; box-shadow: none; }
    .screen-toolbar { display: none !important; }
    .cover { padding-top: 26mm; }
    thead { display: table-header-group; }
    tfoot { display: table-row-group; }
    tr, td, th { break-inside: avoid; page-break-inside: avoid; }
    /* Aucune ligne de paragraphe isolée en haut / bas de page. */
    p, li { orphans: 3; widows: 3; }
    a { color: inherit; text-decoration: none; }
  }
`;

/**
 * Construit le HTML autonome du Manuel d'Utilisation (document A4 portrait).
 *
 * @param organization Nom de l'établissement (affiché en page de garde et au
 *   pied du document).
 * @param generatedAt Date d'édition. Formatée avec un fuseau UTC figé pour un
 *   rendu déterministe (aucun écart d'hydratation entre serveur et client).
 */
export function buildUserManualHtml(
  organization: string,
  generatedAt: Date
): string {
  const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const orgName = organization.trim() || "Centre de Formation";
  const initial = orgName.charAt(0).toUpperCase();
  const issuedOn = dateFormatter.format(generatedAt);

  // Sommaire : une ligne par chapitre, dans l'ordre des dépendances.
  const toc = MANUAL_CHAPTERS.map(
    (chapter) => `
        <tr>
          <td class="num">${chapter.number}</td>
          <td>
            <span class="label">${escapeHtml(chapter.title)}</span>
            <span class="desc">${escapeHtml(chapter.summary)}</span>
          </td>
        </tr>`
  ).join("");

  // Chapitres : un `<section class="chapter">` par chapitre. La feuille de
  // style impose `break-before: page` à chaque chapitre et `break-inside:
  // avoid` à chaque bloc : aucun texte n'est coupé entre deux pages.
  const chapters = MANUAL_CHAPTERS.map((chapter) => {
    const blocks = chapter.blocks.map((block) => {
      const steps = block.steps
        .map((step) => `          <li>${escapeHtml(step)}</li>`)
        .join("\n");

      const note = block.note
        ? `\n        <p class="note"><strong>A savoir</strong>${escapeHtml(block.note)}</p>`
        : "";

      const warning = block.warning
        ? `\n        <p class="warning"><strong>Attention</strong>${escapeHtml(block.warning)}</p>`
        : "";

      return `
      <section class="block">
        <h3 class="block-title">${escapeHtml(block.title)}</h3>
        <ol class="steps">
${steps}
        </ol>${note}${warning}
      </section>`;
    }).join("");

    return `
    <section class="chapter">
      <header class="chapter-head">
        <span class="chapter-num">${chapter.number}</span>
        <h2 class="chapter-title">${escapeHtml(chapter.title)}</h2>
      </header>
      <p class="chapter-summary">${escapeHtml(chapter.summary)}</p>
${blocks}
    </section>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(MANUAL_TITLE)} — ${escapeHtml(orgName)}</title>
<style>${MANUAL_STYLES}</style>
</head>
<body>
  <div class="screen-toolbar">
    <button type="button" onclick="window.print()">Imprimer / Enregistrer en PDF</button>
    <span>Choisissez « Enregistrer au format PDF » comme destination pour obtenir le fichier A4.</span>
  </div>

  <main class="sheet" id="manual-sheet">
    <section class="cover">
      <div class="cover-logo">${escapeHtml(initial)}</div>
      <p class="cover-org">${escapeHtml(orgName)}</p>
      <p class="cover-kicker">Plateforme de gestion des centres de formation</p>
      <h1 class="cover-title">${escapeHtml(MANUAL_TITLE)}</h1>
      <div class="cover-rule"></div>
      <p class="cover-subtitle">
        Guide complet des huit étapes de prise en main d'EduFlow, classées dans
        l'ordre strict des dépendances système : de la configuration de
        l'établissement jusqu'à la sécurité et la traçabilité.
      </p>
      <p class="cover-meta">
        Version <strong>${escapeHtml(MANUAL_VERSION)}</strong> ·
        ${MANUAL_CHAPTER_COUNT} chapitres ·
        Édité le <strong>${escapeHtml(issuedOn)}</strong>
      </p>
    </section>

    <section class="block">
      <h2 class="toc-title">Sommaire</h2>
      <table class="toc">
        <thead>
          <tr><th class="num">N°</th><th>Chapitre</th></tr>
        </thead>
        <tbody>${toc}
        </tbody>
      </table>
    </section>
${chapters}

    <footer class="doc-footer">
      ${escapeHtml(MANUAL_TITLE)} ${escapeHtml(MANUAL_VERSION)} — ${escapeHtml(orgName)} ·
      Document édité le ${escapeHtml(issuedOn)}. Toute reproduction sans le cachet de
      l'établissement est sans valeur. Document strictement confidentiel.
    </footer>
  </main>
</body>
</html>`;
}


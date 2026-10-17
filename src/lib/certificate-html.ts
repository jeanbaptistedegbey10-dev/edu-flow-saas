/**
 * Moteur de rendu des certificats — 4 modèles graphiques, format **A4 PAYSAGE**
 * (297 × 210 mm), impression STRICTE sur 1 seule page.
 *
 * `buildCertificateHtml` dispatche vers l'un des 4 modèles selon
 * `certificateTemplate` de l'organisation :
 * - TEMPLATE_1 « Bleu & Or »       : cadre géométrique moderne, liserés or+marine.
 * - TEMPLATE_2 « Institutionnel »  : épuré, logo haut, QR centré bas, signatures.
 * - TEMPLATE_3 « Ruban rouge »     : bordures sobres, ruban vertical + badge doré.
 * - TEMPLATE_4 « Vagues violettes »: marges décoratives violettes et dorées.
 *
 * TOUS les modèles partagent (voir `certificate-shared.ts`) :
 * - logo de l'organisation en-tête + filigrane diagonal centré ;
 * - QR code de vérification + code unique ;
 * - pied de page légal complet (agrément, RCCM/IFU, contacts, adresse) ;
 * - CSS d'impression `@page { size: A4 landscape; margin: 0 }` +
 *   `break-inside/after: avoid` + conteneur 297×210 mm `overflow: hidden`.
 *
 * ⚠️ SÉCURITÉ (XSS) — Toute valeur dynamique est pré-échappée par
 * `prepareCertificateData` avant interpolation.
 */

import {
  buildCertificateBody,
  buildLegalFooter,
  buildLogoMarkup,
  buildPrintCss,
  buildQrBlock,
  buildWatermark,
  prepareCertificateData,
  type CertificateHtmlData,
  type SafeCertificateData,
} from "@/lib/certificate-shared";

/** Assemble le document complet autour du contenu spécifique d'un modèle. */
function wrapDocument(
  sd: SafeCertificateData,
  extraCss: string,
  content: string
): string {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${sd.title}</title>
  <style>
  ${buildPrintCss()}
  ${extraCss}
  </style></head><body>
  <div class="no-print"><button class="btn" onclick="window.print()">Imprimer</button></div>
  <div id="certificate">
  ${buildWatermark(sd, sd.organizationName)}
  ${content}
  </div>
  </body></html>`;
}

export function buildCertificateHtml(data: CertificateHtmlData): string {
  const sd = prepareCertificateData(data);

  switch (sd.template) {
    case "TEMPLATE_2":
      return buildTemplate2(sd);
    case "TEMPLATE_3":
      return buildTemplate3(sd);
    case "TEMPLATE_4":
      return buildTemplate4(sd);
    case "TEMPLATE_1":
    default:
      return buildTemplate1(sd);
  }
}

// ---------------------------------------------------------------------------
// Blocs de contenu réutilisables (structure commune, habillage par le CSS).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// MODÈLE 1 — « Bleu & Or » : cadre géométrique moderne, double liseré.
// ---------------------------------------------------------------------------
function buildTemplate1(sd: SafeCertificateData): string {
  const css = `
    #certificate {
      background: #faf8f3; color: #2d3748; padding: 12mm 14mm;
      border: 4px solid #c9a227;
      box-shadow: inset 0 0 0 1px #1e3a5f, inset 0 0 0 8px #faf8f3, inset 0 0 0 9px #1e3a5f;
      display: flex; flex-direction: column;
    }
    .header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 12px; border-bottom: 2px solid #c9a227; }
    .brand { display: flex; align-items: center; gap: 14px; }
    .brand img { height: 54px; width: auto; object-fit: contain; }
    .brand-fallback { width: 54px; height: 54px; border-radius: 50%; background: #1e3a5f; border: 3px solid #c9a227; display: flex; align-items: center; justify-content: center; color: #f5d76e; font-size: 22px; font-weight: bold; }
    .org-name { font-size: 16px; font-weight: bold; color: #1e3a5f; line-height: 1.2; }
    .org-sub { font-size: 10.5px; color: #718096; font-style: italic; margin: 2px 0 0; }
    .verify-chip { text-align: right; }
    .verify-label { font-size: 9px; color: #718096; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 3px; }
    .verify-code { background: #fdf6e3; border: 1px solid #c9a227; padding: 4px 10px; font-size: 11px; font-weight: bold; color: #1e3a5f; font-family: monospace; display: inline-block; }
    .title { text-align: center; margin: 16px 0 8px; }
    .title h1 { font-size: 28px; color: #1e3a5f; letter-spacing: 4px; text-transform: uppercase; margin: 8px 0 6px; }
    .title p { font-size: 11px; color: #c9a227; font-style: italic; margin: 0; }
    .divider { width: 150px; height: 2px; background: #c9a227; margin: 0 auto; }
    .body { flex: 1; display: flex; align-items: center; justify-content: center; padding: 4px 16px; }
    .footer { display: flex; justify-content: space-between; align-items: flex-end; padding-top: 10px; border-top: 1px solid #c9a227; gap: 16px; }
    .signatures { display: flex; gap: 36px; }
    .signature { text-align: center; }
    .sig-line { width: 100px; height: 1px; background: #2d3748; margin-bottom: 4px; }
    .sig-role { font-size: 9px; color: #718096; text-transform: uppercase; margin: 0; }
    .seal { width: 68px; height: 68px; border-radius: 50%; border: 2px dashed #c9a227; display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink: 0; }
    .seal-letter { font-size: 18px; font-weight: bold; color: #c9a227; }
    .seal-text { font-size: 5.5px; text-transform: uppercase; letter-spacing: 1px; color: #1e3a5f; }
    .qr-section { text-align: center; }
    .qr-code { width: 58px; height: 58px; border: 1px solid #718096; }
    .qr-label { font-size: 8px; color: #718096; margin: 3px 0 0; }
    .qr-code-value { font-size: 8.5px; color: #1e3a5f; font-family: monospace; margin: 1px 0 0; }
    .issued { text-align: right; }
    .issued-label { font-size: 9px; color: #718096; text-transform: uppercase; margin: 0 0 2px; }
    .issued-value { font-size: 11px; font-weight: bold; color: #2d3748; margin: 0 0 8px; }
    .legal-footer { margin-top: 10px; padding-top: 8px; border-top: 1px solid #e5e0d3; }`;


  const content = `
    <div class="header">
      <div class="brand">
        ${buildLogoMarkup(sd, "", "brand-fallback")}
        <div>
          <div class="org-name">${sd.organizationName}</div>
          <p class="org-sub">Organisme de formation agréé</p>
        </div>
      </div>
      <div class="verify-chip">
        <p class="verify-label">Code de vérification</p>
        <div class="verify-code">${sd.verificationCode}</div>
      </div>
    </div>
    <div class="title"><div class="divider"></div><h1>${sd.title}</h1><p>Certification de compétence</p></div>
    <div class="body">
      ${buildCertificateBody(sd)}
    </div>
    <div class="footer">
      <div class="signatures">
        <div class="signature"><div class="sig-line"></div><p class="sig-role">Direction</p></div>
        <div class="signature"><div class="sig-line"></div><p class="sig-role">Pédagogique</p></div>
      </div>
      <div class="seal"><span class="seal-letter">${sd.monogram}</span><span class="seal-text">Sceau officiel</span></div>
      <div class="qr-section">
        <img class="qr-code" src="${sd.qrUrl}" alt="QR de vérification" />
        <p class="qr-label">Scanner pour vérifier</p>
        <p class="qr-code-value">${sd.verificationCode}</p>
      </div>
      <div class="issued"><p class="issued-label">Certificat émis le</p><p class="issued-value">${sd.formattedDate}</p></div>
    </div>
    ${buildLegalFooter(sd)}`;

  return wrapDocument(sd, css, content);
}


// ---------------------------------------------------------------------------
// MODÈLE 2 — « Institutionnel » : épuré, logo en haut, QR centré en bas,
// blocs de signature Direction / Pédagogie. Palette bleu nuit + ardoise.
// ---------------------------------------------------------------------------
function buildTemplate2(sd: SafeCertificateData): string {
  const css = `
    #certificate {
      background: #ffffff; color: #1f2937; padding: 11mm 14mm;
      border: 1px solid #1e293b;
      box-shadow: inset 0 0 0 6px #ffffff, inset 0 0 0 7px #94a3b8;
      display: flex; flex-direction: column; align-items: stretch;
    }
    .top-rule { height: 5px; background: #1e293b; width: 100%; margin-bottom: 12px; }
    .header { display: flex; flex-direction: column; align-items: center; text-align: center; padding-bottom: 12px; }
    .brand { display: flex; flex-direction: column; align-items: center; gap: 8px; }
    .brand img { height: 58px; width: auto; object-fit: contain; }
    .brand-fallback { width: 58px; height: 58px; border-radius: 8px; background: #1e293b; display: flex; align-items: center; justify-content: center; color: #ffffff; font-size: 24px; font-weight: bold; }
    .org-name { font-size: 18px; font-weight: bold; color: #1e293b; letter-spacing: 0.5px; text-transform: uppercase; }
    .org-sub { font-size: 10.5px; color: #64748b; font-style: italic; margin: 2px 0 0; }
    .title { text-align: center; margin: 10px 0 4px; }
    .title h1 { font-size: 24px; color: #1e293b; letter-spacing: 2px; text-transform: uppercase; margin: 6px 0; font-weight: 700; }
    .title p { font-size: 10px; color: #475569; margin: 0; }
    .divider { width: 120px; height: 1px; background: #94a3b8; margin: 8px auto; }
    .body { flex: 1; display: flex; align-items: center; justify-content: center; padding: 4px 24px; }
    .qr-center { display: flex; flex-direction: column; align-items: center; margin: 8px 0 4px; }
    .qr-code { width: 62px; height: 62px; }
    .qr-label { font-size: 8px; color: #64748b; margin: 3px 0 0; }
    .qr-code-value { font-size: 9px; color: #1e293b; font-family: monospace; margin: 1px 0 0; }
    .signatures { display: flex; justify-content: space-between; gap: 40px; margin-top: 8px; padding: 0 30px; }
    .signature { text-align: center; flex: 1; }
    .sig-line { width: 130px; height: 1px; background: #334155; margin: 0 auto 4px; }
    .sig-role { font-size: 9px; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; margin: 0; }
    .issued { text-align: center; margin-top: 6px; }
    .issued-label { font-size: 9px; color: #64748b; text-transform: uppercase; margin: 0; }
    .issued-value { font-size: 11px; font-weight: bold; color: #1f2937; margin: 1px 0 0; }
    .legal-footer { margin-top: 10px; padding-top: 8px; border-top: 1px solid #e2e8f0; }`;


  const content = `
    <div class="top-rule"></div>
    <div class="header">
      <div class="brand">
        ${buildLogoMarkup(sd, "", "brand-fallback")}
        <div>
          <div class="org-name">${sd.organizationName}</div>
          <p class="org-sub">Organisme de formation agréé</p>
        </div>
      </div>
    </div>
    <div class="title"><div class="divider"></div><h1>${sd.title}</h1><p>Certification de compétence</p></div>
    <div class="body">
      ${buildCertificateBody(sd)}
    </div>
    ${buildQrBlock(sd).replace('class="qr-section"', 'class="qr-center"')}
    <div class="signatures">
      <div class="signature"><div class="sig-line"></div><p class="sig-role">Direction</p></div>
      <div class="signature"><div class="sig-line"></div><p class="sig-role">Pédagogique</p></div>
    </div>
    <div class="issued"><p class="issued-label">Certificat émis le</p><p class="issued-value">${sd.formattedDate}</p></div>
    ${buildLegalFooter(sd)}`;

  return wrapDocument(sd, css, content);
}


// ---------------------------------------------------------------------------
// MODÈLE 3 — « Ruban rouge » : bordures sobres, ruban vertical rouge sur la
// gauche, badge doré sur le côté droit. Palette blanc crème + bordeaux + or.
// ---------------------------------------------------------------------------
function buildTemplate3(sd: SafeCertificateData): string {
  const css = `
    #certificate {
      background: #fffdf7; color: #292524; padding: 11mm 16mm 11mm 22mm;
      border: 1px solid #d6cfc2;
      box-shadow: inset 0 0 0 5px #fffdf7, inset 0 0 0 6px #b91c1c;
      display: flex; flex-direction: column; position: relative;
    }
    .ribbon {
      position: absolute; top: 0; left: 0; width: 40px; height: 100%;
      background: linear-gradient(180deg, #b91c1c, #7f1d1d);
      display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
      padding-top: 18mm; z-index: 1;
    }
    .ribbon-text {
      writing-mode: vertical-rl; text-orientation: mixed; transform: rotate(180deg);
      color: #fde68a; font-size: 11px; letter-spacing: 5px; text-transform: uppercase; font-weight: bold;
    }
    .ribbon-tail {
      position: absolute; bottom: 0; left: 0; width: 40px; height: 34px;
      background: #7f1d1d;
      clip-path: polygon(0 0, 100% 0, 100% 60%, 50% 100%, 0 60%);
    }
    .content { position: relative; z-index: 2; display: flex; flex-direction: column; flex: 1; }
    .header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 10px; border-bottom: 2px solid #c9a227; }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand img { height: 50px; width: auto; object-fit: contain; }
    .brand-fallback { width: 50px; height: 50px; border-radius: 6px; background: #b91c1c; display: flex; align-items: center; justify-content: center; color: #fde68a; font-size: 22px; font-weight: bold; }
    .org-name { font-size: 15px; font-weight: bold; color: #7f1d1d; line-height: 1.2; }
    .org-sub { font-size: 10px; color: #78716c; font-style: italic; margin: 2px 0 0; }
    .verify-chip { text-align: right; }
    .verify-label { font-size: 9px; color: #78716c; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 3px; }
    .verify-code { border: 1px solid #c9a227; background: #fef9ec; padding: 4px 10px; font-size: 11px; font-weight: bold; color: #7f1d1d; font-family: monospace; display: inline-block; }
    .title { text-align: center; margin: 14px 0 8px; }
    .title h1 { font-size: 26px; color: #7f1d1d; letter-spacing: 3px; text-transform: uppercase; margin: 6px 0; }
    .title p { font-size: 11px; color: #b91c1c; font-style: italic; margin: 0; }
    .divider { width: 140px; height: 2px; background: #c9a227; margin: 0 auto; }
    .body { flex: 1; display: flex; align-items: center; justify-content: center; padding: 4px 0; }
    .footer { display: flex; justify-content: space-between; align-items: flex-end; padding-top: 10px; border-top: 1px solid #c9a227; gap: 16px; }
    .signatures { display: flex; gap: 32px; }
    .signature { text-align: center; }
    .sig-line { width: 96px; height: 1px; background: #44403c; margin-bottom: 4px; }
    .sig-role { font-size: 9px; color: #78716c; text-transform: uppercase; margin: 0; }
    .qr-section { text-align: center; }
    .qr-code { width: 56px; height: 56px; border: 1px solid #c9a227; }
    .qr-label { font-size: 8px; color: #78716c; margin: 3px 0 0; }
    .qr-code-value { font-size: 8.5px; color: #7f1d1d; font-family: monospace; margin: 1px 0 0; }
    .issued { text-align: right; }
    .issued-label { font-size: 9px; color: #78716c; text-transform: uppercase; margin: 0 0 2px; }
    .issued-value { font-size: 11px; font-weight: bold; color: #292524; margin: 0; }
    .legal-footer { margin-top: 10px; padding-top: 8px; border-top: 1px solid #eae4d5; }`;


  const content = `
    <div class="ribbon"><span class="ribbon-text">Certifié · Officiel</span></div>
    <div class="ribbon-tail"></div>
    <div class="content">
      <div class="header">
        <div class="brand">
          ${buildLogoMarkup(sd, "", "brand-fallback")}
          <div>
            <div class="org-name">${sd.organizationName}</div>
            <p class="org-sub">Organisme de formation agréé</p>
          </div>
        </div>
        <div class="verify-chip">
          <p class="verify-label">Code de vérification</p>
          <div class="verify-code">${sd.verificationCode}</div>
        </div>
      </div>
      <div class="title"><div class="divider"></div><h1>${sd.title}</h1><p>Certification de compétence</p></div>
      <div class="body">
        ${buildCertificateBody(sd)}
      </div>
      <div class="footer">
        <div class="signatures">
          <div class="signature"><div class="sig-line"></div><p class="sig-role">Direction</p></div>
          <div class="signature"><div class="sig-line"></div><p class="sig-role">Pédagogique</p></div>
        </div>
        <div class="qr-section">
          <img class="qr-code" src="${sd.qrUrl}" alt="QR de vérification" />
          <p class="qr-label">Scanner pour vérifier</p>
          <p class="qr-code-value">${sd.verificationCode}</p>
        </div>
        <div class="issued"><p class="issued-label">Certificat émis le</p><p class="issued-value">${sd.formattedDate}</p></div>
      </div>
      ${buildLegalFooter(sd)}
    </div>`;

  return wrapDocument(sd, css, content);
}


// ---------------------------------------------------------------------------
// MODÈLE 4 — « Vagues violettes » : marges décoratives en vagues violettes et
// dorées. Palette violet profond + or, rendu contemporain.
// ---------------------------------------------------------------------------
function buildTemplate4(sd: SafeCertificateData): string {
  const css = `
    #certificate {
      background: #ffffff; color: #3b2364; padding: 18mm 16mm;
      position: relative; display: flex; flex-direction: column;
      border: 1px solid #ede9fe;
    }
    /* Marges décoratives ondulées (via masques radial-gradient) */
    .wave {
      position: absolute; left: 0; right: 0; height: 26mm; pointer-events: none; z-index: 0;
    }
    .wave-top {
      top: 0;
      background:
        radial-gradient(120% 100% at 20% 0%, #6d28d9 0 49%, transparent 50%),
        radial-gradient(120% 100% at 70% 0%, #a855f7 0 49%, transparent 50%),
        radial-gradient(120% 100% at 110% 0%, #c9a227 0 49%, transparent 50%);
    }
    .wave-bottom {
      bottom: 0;
      background:
        radial-gradient(120% 100% at 15% 100%, #4c1d95 0 49%, transparent 50%),
        radial-gradient(120% 100% at 60% 100%, #7c3aed 0 49%, transparent 50%),
        radial-gradient(120% 100% at 105% 100%, #c9a227 0 49%, transparent 50%);
    }
    .content { position: relative; z-index: 2; display: flex; flex-direction: column; flex: 1; }
    .header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 12px; border-bottom: 2px solid #c9a227; }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand img { height: 52px; width: auto; object-fit: contain; }
    .brand-fallback { width: 52px; height: 52px; border-radius: 12px; background: linear-gradient(135deg, #6d28d9, #a855f7); display: flex; align-items: center; justify-content: center; color: #ffffff; font-size: 22px; font-weight: bold; }
    .org-name { font-size: 16px; font-weight: bold; color: #4c1d95; line-height: 1.2; }
    .org-sub { font-size: 10.5px; color: #7c6f9c; font-style: italic; margin: 2px 0 0; }
    .verify-chip { text-align: right; }
    .verify-label { font-size: 9px; color: #7c6f9c; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 3px; }
    .verify-code { border: 1px solid #c9a227; background: #fdf6e3; padding: 4px 10px; font-size: 11px; font-weight: bold; color: #4c1d95; font-family: monospace; display: inline-block; }
    .title { text-align: center; margin: 14px 0 8px; }
    .title h1 { font-size: 27px; color: #4c1d95; letter-spacing: 3px; text-transform: uppercase; margin: 6px 0; }
    .title p { font-size: 11px; color: #7c3aed; font-style: italic; margin: 0; }
    .divider { width: 150px; height: 2px; background: linear-gradient(90deg, #a855f7, #c9a227); margin: 0 auto; border-radius: 2px; }
    .body { flex: 1; display: flex; align-items: center; justify-content: center; padding: 4px 0; }
    .footer { display: flex; justify-content: space-between; align-items: flex-end; padding-top: 10px; border-top: 2px solid #c9a227; gap: 16px; }
    .signatures { display: flex; gap: 32px; }
    .signature { text-align: center; }
    .sig-line { width: 100px; height: 1px; background: #4b4560; margin-bottom: 4px; }
    .sig-role { font-size: 9px; color: #7c6f9c; text-transform: uppercase; margin: 0; }
    .qr-section { text-align: center; }
    .qr-code { width: 58px; height: 58px; border: 1px solid #a855f7; }
    .qr-label { font-size: 8px; color: #7c6f9c; margin: 3px 0 0; }
    .qr-code-value { font-size: 8.5px; color: #4c1d95; font-family: monospace; margin: 1px 0 0; }
    .issued { text-align: right; }
    .issued-label { font-size: 9px; color: #7c6f9c; text-transform: uppercase; margin: 0 0 2px; }
    .issued-value { font-size: 11px; font-weight: bold; color: #3b2364; margin: 0; }
    .legal-footer { margin-top: 10px; padding-top: 8px; border-top: 1px solid #ede9fe; }`;


  const content = `
    <div class="wave wave-top"></div>
    <div class="wave wave-bottom"></div>
    <div class="content">
      <div class="header">
        <div class="brand">
          ${buildLogoMarkup(sd, "", "brand-fallback")}
          <div>
            <div class="org-name">${sd.organizationName}</div>
            <p class="org-sub">Organisme de formation agréé</p>
          </div>
        </div>
        <div class="verify-chip">
          <p class="verify-label">Code de vérification</p>
          <div class="verify-code">${sd.verificationCode}</div>
        </div>
      </div>
      <div class="title"><div class="divider"></div><h1>${sd.title}</h1><p>Certification de compétence</p></div>
      <div class="body">
        ${buildCertificateBody(sd)}
      </div>
      <div class="footer">
        <div class="signatures">
          <div class="signature"><div class="sig-line"></div><p class="sig-role">Direction</p></div>
          <div class="signature"><div class="sig-line"></div><p class="sig-role">Pédagogique</p></div>
        </div>
        <div class="qr-section">
          <img class="qr-code" src="${sd.qrUrl}" alt="QR de vérification" />
          <p class="qr-label">Scanner pour vérifier</p>
          <p class="qr-code-value">${sd.verificationCode}</p>
        </div>
        <div class="issued"><p class="issued-label">Certificat émis le</p><p class="issued-value">${sd.formattedDate}</p></div>
      </div>
      ${buildLegalFooter(sd)}
    </div>`;

  return wrapDocument(sd, css, content);
}


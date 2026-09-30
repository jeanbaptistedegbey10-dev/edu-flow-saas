/**
 * Template HTML du certificat — format **A4 PAYSAGE** (297 × 210 mm).
 *
 * Rendu professionnel type Canva : double liseré (or + marine), sceau
 * circulaire, zones de signature et QR code de vérification.
 *
 * CSS d'impression conforme au protocole :
 * - `@page { size: A4 landscape; margin: 0; }`
 * - `-webkit-print-color-adjust: exact` (conserve les aplats de couleur).
 *
 * ⚠️ SÉCURITÉ (XSS) — Ce HTML est injecté via `iframe srcDoc` (même origine)
 * puis imprimé. TOUTE valeur issue de la base ou du client doit donc être
 * échappée avant interpolation : noms d'étudiants, nom d'organisation, titre
 * de formation et code de verification sont saisissables par un
 * utilisateur de l'établissement et pourraient contenir `</style><script>`
 * ou `"` pour s'évader de l'attribut. Sans échappement, un enseignant
 * malveillant pouvait exécuter du JavaScript dans le contexte du
 * dashboard d'un collègue (vol de session).
 */

// Constantes de caractères (même approche que `receipt.ts`) : évite toute
// dépendance à une police de caractères dans ce module client-safe.
const AMP = String.fromCharCode(38);
const LT = String.fromCharCode(60);
const GT = String.fromCharCode(62);
const DQ = String.fromCharCode(34);

/**
 * Échappe `& < > "` — le quartet nécessaire pour interpoler une valeur
 * en toute sécurité dans du texte HTML **et** dans un attribut entre
 * guillemets doubles.
 */
function escapeHtml(value: string): string {
  return String(value)
    .replace(new RegExp(AMP, "g"), `${AMP}amp;`)
    .replace(new RegExp(LT, "g"), `${AMP}lt;`)
    .replace(new RegExp(GT, "g"), `${AMP}gt;`)
    .replace(new RegExp(DQ, "g"), `${AMP}quot;`);
}

export function buildCertificateHtml(data: {
  studentName: string;
  studentCode: string;
  level: string;
  score: number | null;
  issueDate: Date;
  verificationCode: string;
  verificationUrl: string;
  organizationName: string;
  courseTitle?: string | null;
}): string {
  const {
    studentName,
    studentCode,
    level,
    score,
    issueDate,
    verificationCode,
    verificationUrl,
    organizationName,
    courseTitle,
  } = data;

  // ÉCHAPPEMENT SYSTÉMATIQUE — toute valeur dynamique passe par
  // `escapeHtml` AVANT d'être interpolée (texte HTML ou attribut).
  const safeStudentName = escapeHtml(studentName);
  const safeStudentCode = escapeHtml(studentCode);
  const safeLevel = escapeHtml(level);
  const safeOrganizationName = escapeHtml(organizationName);
  const safeVerificationCode = escapeHtml(verificationCode);
  // `level` n'est utilisé que pour choisir le libellé du document, mais on
  // l'échappe quand même avant de le comparer (défense en profondeur).
  const title = level.toUpperCase().includes("ATTESTATION")
    ? "ATTESTATION DE RÉUSSITE"
    : "CERTIFICAT DE COMPÉTENCE LINGUISTIQUE";
  const formattedDate = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(issueDate);
  // L'URL de vérification est encodée puis échappée : elle atterrit dans un
  // attribut `src="..."`.
  const qrUrl = escapeHtml(
    `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(verificationUrl)}`
  );
  const scoreHtml =
    score !== null
      ? `<div style="margin-top:10px"><span style="font-size:9px;color:#718096;text-transform:uppercase;letter-spacing:1px">Mention / Score</span><div style="font-size:14px;font-weight:bold;color:#2d3748;font-family:monospace">${score.toFixed(1)} %</div></div>`
      : "";
  const courseHtml = courseTitle
    ? `<p style="font-size:11px;color:#2d3748;margin:10px 0 0"><span style="color:#718096">Formation :</span> <strong>${escapeHtml(courseTitle)}</strong></p>`
    : "";

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>${title}</title>
  <style>
    @page { size: A4 landscape; margin: 0; }
    @media print {
      body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
    }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; background: #f0f0f0; padding: 20px; }
    .no-print { position: fixed; top: 20px; right: 20px; display: flex; gap: 10px; }
    .btn { padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; color: white; }
    .btn-print { background: #1e3a5f; }
    #certificate {
      width: 297mm; height: 210mm; background: #faf8f3; margin: 0 auto;
      position: relative; padding: 12mm; color: #2d3748;
      border: 4px solid #c9a227; outline: 1px solid #1e3a5f; outline-offset: -10mm;
    }
    .watermark { position: absolute; top: 38%; left: 50%; transform: translate(-50%, -50%) rotate(-18deg); font-size: 90px; color: rgba(30,58,95,0.05); font-weight: bold; letter-spacing: 12px; white-space: nowrap; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 14px; border-bottom: 2px solid #c9a227; }
    .logo { width: 60px; height: 60px; border-radius: 50%; background: #1e3a5f; display: flex; align-items: center; justify-content: center; border: 3px solid #c9a227; }
    .logo span { color: #f5d76e; font-size: 24px; font-weight: bold; }
    .org-name { font-size: 17px; font-weight: bold; color: #1e3a5f; }
    .org-sub { font-size: 10px; color: #718096; font-style: italic; }
    .verify-chip { text-align: right; }
    .verify-code { background: #fdf6e3; border: 1px solid #c9a227; padding: 4px 10px; font-size: 11px; font-weight: bold; color: #1e3a5f; font-family: monospace; display: inline-block; }
    .verify-label { font-size: 8px; color: #718096; text-transform: uppercase; margin: 0 0 3px; }
    .title { text-align: center; margin: 22px 0 16px; }
    .title h1 { font-size: 30px; color: #1e3a5f; letter-spacing: 4px; text-transform: uppercase; margin: 10px 0 6px; }
    .title p { font-size: 12px; color: #c9a227; font-style: italic; margin: 0; }
    .divider { width: 160px; height: 2px; background: #c9a227; margin: 0 auto; }
    .body { display: flex; gap: 30px; padding: 4px 24px 0; }
    .col-main { flex: 1.4; text-align: center; }
    .col-side { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .intro { font-size: 12px; color: #2d3748; font-style: italic; margin: 0 0 10px; }
    .student-name { font-size: 26px; font-weight: bold; color: #1e3a5f; margin: 4px 0 6px; }
    .student-code { font-size: 11px; color: #718096; font-family: monospace; margin: 0 0 14px; }
    .level-box { background: #fdf6e3; border: 2px solid #c9a227; border-radius: 6px; padding: 16px 20px; margin: 0 auto; width: 300px; text-align: center; }
    .level-label { font-size: 9px; color: #718096; text-transform: uppercase; letter-spacing: 1px; margin: 0; }
    .level-value { font-size: 20px; font-weight: bold; color: #1e3a5f; margin: 6px 0; }
    .level-sub { font-size: 9px; color: #059669; font-weight: bold; margin: 0; }
    .footer { position: absolute; left: 12mm; right: 12mm; bottom: 12mm; display: flex; justify-content: space-between; align-items: flex-end; padding-top: 12px; border-top: 1px solid #c9a227; }
    .signatures { display: flex; gap: 40px; }
    .signature { text-align: center; }
    .sig-line { width: 110px; height: 1px; background: #2d3748; margin-bottom: 5px; }
    .sig-role { font-size: 8px; color: #718096; text-transform: uppercase; margin: 0; }
    .seal { width: 74px; height: 74px; border-radius: 50%; border: 2px dashed #c9a227; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .seal-letter { font-size: 20px; font-weight: bold; color: #c9a227; }
    .seal-text { font-size: 6px; text-transform: uppercase; letter-spacing: 1px; color: #1e3a5f; }
    .qr-section { text-align: center; }
    .qr-code { width: 64px; height: 64px; border: 1px solid #718096; margin-bottom: 4px; }
    .qr-label { font-size: 7px; color: #718096; margin: 0; }
    .issued-label { font-size: 8px; color: #718096; text-transform: uppercase; margin: 0 0 2px; }
    .issued-value { font-size: 11px; font-weight: bold; margin: 0; }
  </style></head><body>
  <div class="no-print"><button class="btn btn-print" onclick="window.print()">Imprimer</button></div>
  <div id="certificate"><div class="watermark">CERTIFIÉ</div>
    <div class="header">
      <div style="display:flex;align-items:center;gap:14px">
        <div class="logo"><span>${escapeHtml(organizationName.charAt(0).toUpperCase())}</span></div>
        <div><div class="org-name">${safeOrganizationName}</div><p class="org-sub" style="margin:2px 0 0">Organisme de formation agréé</p></div>
      </div>
      <div class="verify-chip"><p class="verify-label">Code de vérification</p><div class="verify-code">${safeVerificationCode}</div></div>
    </div>
    <div class="title"><div class="divider"></div><h1>${title}</h1><p>Centre de Formation de Langues</p></div>
    <div class="body">
      <div class="col-main">
        <p class="intro">Il est officiellement certifié par la présente que</p>
        <h2 class="student-name">${safeStudentName}</h2>
        <p class="student-code">Matricule : ${safeStudentCode}</p>
        <p style="font-size:12px;color:#2d3748">a validé avec succès la formation de langue et atteint le niveau de compétence suivant.</p>
        ${courseHtml}
        <p style="font-size:10px;color:#2d3748;margin:16px auto 0;max-width:380px">Ce certificat atteste des compétences linguistiques acquises et validées au terme de l'évaluation finale.</p>
      </div>
      <div class="col-side">
        <div class="level-box">
          <p class="level-label">Niveau certifié</p>
          <p class="level-value">${safeLevel}</p>
          <p class="level-sub">Diplôme reconnu internationalement</p>
        </div>
        ${scoreHtml}
      </div>
    </div>
    <div class="footer">
      <div class="signatures">
        <div class="signature"><div class="sig-line"></div><p class="sig-role">Direction</p></div>
        <div class="signature"><div class="sig-line"></div><p class="sig-role">Pédagogique</p></div>
      </div>
      <div class="seal"><span class="seal-letter">${escapeHtml(organizationName.charAt(0).toUpperCase())}</span><span class="seal-text">Sceau officiel</span></div>
      <div class="qr-section"><img src="${qrUrl}" class="qr-code" alt="QR de vérification"><p class="qr-label">Scanner pour vérifier</p></div>
      <div class="issued"><p class="issued-label">Certificat émis le</p><p class="issued-value">${formattedDate}</p></div>
    </div>
  </div>
  </body></html>`;
}
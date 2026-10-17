import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";

import { DEFAULT_CERTIFICATE_TEXT } from "@/lib/certificate-shared";

const C = {
  navy: "#1e3a5f",
  gold: "#c9a227",
  goldLight: "#f5d76e",
  cream: "#faf8f3",
  charcoal: "#2d3748",
  silver: "#718096",
  lightGold: "#fdf6e3",
};

const styles = StyleSheet.create({
  page: { width: 842, height: 595, padding: 0, fontFamily: "Helvetica", backgroundColor: C.cream },
  container: { flex: 1, padding: 36, border: `3px solid ${C.gold}`, margin: 22, borderRadius: 6, backgroundColor: C.cream },
  watermark: { position: "absolute", top: 210, left: 0, right: 0, textAlign: "center", fontSize: 90, color: "rgba(30,58,95,0.05)", fontWeight: "bold", letterSpacing: 10 },
  watermarkImage: { position: "absolute", top: 175, left: 271, width: 300, opacity: 0.06 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, paddingBottom: 12, borderBottomWidth: 2, borderBottomColor: C.gold },
  logoImage: { width: 150, height: 54, objectFit: "contain", objectPosition: "left" },
  logoBadge: { width: 56, height: 56, borderRadius: 50, backgroundColor: C.navy, justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: C.gold },
  logoLetter: { color: C.goldLight, fontSize: 22, fontWeight: "bold" },
  orgName: { fontSize: 15, fontWeight: "bold", color: C.navy },
  orgSubtitle: { fontSize: 9, color: C.silver, fontStyle: "italic", marginTop: 2 },
  titleMain: { fontSize: 28, fontWeight: "bold", color: C.navy, letterSpacing: 4, textTransform: "uppercase", textAlign: "center" },
  titleAccent: { fontSize: 12, color: C.gold, letterSpacing: 2, fontStyle: "italic", textAlign: "center", marginTop: 4 },
  divider: { height: 2, backgroundColor: C.gold, marginHorizontal: 30, marginBottom: 18 },
  body: { flex: 1, paddingHorizontal: 30, justifyContent: "center" },
  introText: { fontSize: 11, color: C.charcoal, textAlign: "center", lineHeight: 1.7, marginBottom: 10, fontStyle: "italic" },
  studentName: { fontSize: 24, fontWeight: "bold", color: C.navy, textAlign: "center", letterSpacing: 1, marginBottom: 6 },
  studentCode: { fontSize: 10, color: C.silver, textAlign: "center", marginBottom: 14, fontFamily: "Courier" },
  bodyText: { fontSize: 11, color: C.charcoal, textAlign: "center", lineHeight: 1.7, marginBottom: 8 },
  customBodyText: { fontSize: 12.5, color: C.charcoal, textAlign: "center", lineHeight: 1.8, marginBottom: 8, paddingHorizontal: 24 },
  /** Variables dynamiques du texte personnalisé : mises en gras. */
  customBodyStrong: { fontWeight: "bold" },
  scoreSection: { alignItems: "center", marginTop: 8 },
  scoreLabel: { fontSize: 9, color: C.silver, textTransform: "uppercase", marginBottom: 2 },
  scoreValue: { fontSize: 14, fontWeight: "bold", color: C.charcoal, fontFamily: "Courier" },
  footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 14, paddingHorizontal: 20, paddingBottom: 8, borderTopWidth: 1, borderTopColor: C.gold, borderTopStyle: "solid" },
  dateLabel: { fontSize: 8, color: C.silver, textTransform: "uppercase", marginBottom: 2 },
  dateValue: { fontSize: 11, fontWeight: "bold", color: C.charcoal },
  signatureColumn: { alignItems: "center", flex: 1 },
  signatureLine: { width: 100, height: 1, backgroundColor: C.charcoal, marginBottom: 4 },
  signatureRole: { fontSize: 8, color: C.silver, textAlign: "center", textTransform: "uppercase" },
  qrBlock: { alignItems: "center", width: 110 },
  qrImage: { width: 72, height: 72, marginBottom: 4, borderWidth: 1, borderColor: C.silver, borderRadius: 2 },
  qrLabel: { fontSize: 7, color: C.silver, textAlign: "center", marginBottom: 2 },
  verificationCode: { fontSize: 10, fontWeight: "bold", color: C.navy, fontFamily: "Courier", backgroundColor: C.lightGold, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 2, borderWidth: 1, borderColor: C.gold },
  legalFooter: { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#e5e0d3", alignItems: "center" },
  legalLine: { fontSize: 7.5, color: C.silver, textAlign: "center", lineHeight: 1.6, marginTop: 1 },
});

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

/**
 * Normalise la date de naissance en texte affichable (« 15 avril 2001 ») —
 * cohérent avec `formatBirthDate` de `certificate-shared.ts`. Valeur absente
 * ou invalide → chaîne vide (la variable est alors simplement omise).
 */
function formatBirthDate(value: string | Date | null | undefined): string {
  if (value == null) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : formatDate(date);
}

/** Segment d'une ligne du gabarit : texte brut ou valeur en gras. */
interface TemplateSegment {
  text: string;
  bold: boolean;
}

/**
 * Interprète le gabarit de texte personnalisé en remplaçant les variables
 * dynamiques par leurs valeurs, chaque valeur étant marquée `bold: true` pour
 * être rendue en **gras** — cohérent avec le rendu HTML
 * (`interpolateCertificateTemplate` de `certificate-shared.ts`).
 * `@react-pdf/renderer` échappe nativement le texte (aucun risque
 * d'injection), les retours à la ligne sont scindés en lignes distinctes.
 *
 * @returns Lignes de segments (1 tableau par ligne du gabarit).
 */
function interpolateCertificateText(
  template: string,
  values: Record<string, string>
): TemplateSegment[][] {
  return template.split(/\r\n|\r|\n/).map((line) => {
    const segments: TemplateSegment[] = [];
    const tokenPattern = /\{\{\s*(\w+)\s*\}\}/g;
    let cursor = 0;
    let match: RegExpExecArray | null;

    while ((match = tokenPattern.exec(line)) !== null) {
      if (match.index > cursor) {
        segments.push({ text: line.slice(cursor, match.index), bold: false });
      }
      const key = match[1];
      if (Object.prototype.hasOwnProperty.call(values, key)) {
        const value = values[key];
        // Une variable vide (ex. aucun cours) ne produit pas de segment.
        if (value !== "") segments.push({ text: value, bold: true });
      }
      cursor = match.index + match[0].length;
    }

    if (cursor < line.length) {
      segments.push({ text: line.slice(cursor), bold: false });
    }
    // Conserve la ligne même si elle est totalement vide.
    if (segments.length === 0) segments.push({ text: "", bold: false });
    return segments;
  });
}

export function generateCertificatePDF(data: {
  studentName: string;
  studentCode: string;
  /**
   * Date de naissance de l'étudiant — `Date` ou chaîne ISO `yyyy-mm-dd`.
   * Alimente la variable `{{birthDate}}` du texte du certificat.
   */
  birthDate?: string | Date | null;
  level: string;
  score: number | null;
  issueDate: Date;
  verificationCode: string;
  verificationUrl: string;
  organizationName: string;
  organizationAddress?: string | null;
  organizationCity?: string | null;
  organizationPhone?: string | null;
  organizationEmail?: string | null;
  organizationWebsite?: string | null;
  organizationRccm?: string | null;
  organizationIfu?: string | null;
  organizationLogoUrl?: string | null;
  /** Intitulé de la formation (facultatif, affiché dans le corps). */
  courseTitle?: string | null;
  /** Gabarit de texte personnalisé (`null` = texte standard). */
  certificateTextTemplate?: string | null;
}) {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(data.verificationUrl)}`;
  const title = data.level.toUpperCase().includes("ATTESTATION") ? "ATTESTATION DE RÉUSSITE" : "CERTIFICAT DE COMPÉTENCE LINGUISTIQUE";

  // Filigrane : logo de l'organisation si fourni, sinon le mot « CERTIFIÉ ».
  const watermark = data.organizationLogoUrl ? (
    <Image src={data.organizationLogoUrl} style={styles.watermarkImage} />
  ) : (
    <Text style={styles.watermark}>CERTIFIÉ</Text>
  );

  // Pied de page légal : agrément, numéros officiels, adresse et contacts.
  const officialNumbers = [
    data.organizationRccm ? `N° RCCM : ${data.organizationRccm}` : null,
    data.organizationIfu ? `N° IFU / NIF : ${data.organizationIfu}` : null,
  ].filter(Boolean);
  const addressLine = [data.organizationAddress, data.organizationCity]
    .filter(Boolean)
    .join(", ");
  const contactLine = [
    data.organizationPhone ? `Tél. : ${data.organizationPhone}` : null,
    data.organizationEmail ? `Email : ${data.organizationEmail}` : null,
    data.organizationWebsite ? `Site web : ${data.organizationWebsite}` : null,
  ].filter(Boolean);

  // Corps du certificat : gabarit personnalisé de l'organisation s'il existe,
  // sinon le texte standard par défaut (`DEFAULT_CERTIFICATE_TEXT`). Dans les
  // deux cas, les variables dynamiques `{{…}}` sont interprétées et chaque
  // valeur est rendue en gras — cohérent avec le rendu HTML
  // (`interpolateCertificateTemplate` de `certificate-shared.ts`).
  const customTemplate =
    data.certificateTextTemplate && data.certificateTextTemplate.trim() !== ""
      ? data.certificateTextTemplate
      : null;
  const bodyLines = interpolateCertificateText(
    customTemplate ?? DEFAULT_CERTIFICATE_TEXT,
    {
      studentName: data.studentName,
      birthDate: formatBirthDate(data.birthDate),
      matricule: data.studentCode,
      studentCode: data.studentCode,
      courseName: data.courseTitle ?? "",
      courseTitle: data.courseTitle ?? "",
      level: data.level,
      date: formatDate(data.issueDate),
      organizationName: data.organizationName,
      verificationCode: data.verificationCode,
      score: data.score !== null ? `${data.score.toFixed(1)} %` : "",
    }
  );

  return (
    <Document>
      <Page size={{ width: 842, height: 595 }} style={styles.page}>
        {watermark}
        <View style={styles.container}>
          <View style={styles.header}>
            {data.organizationLogoUrl ? (
              <Image src={data.organizationLogoUrl} style={styles.logoImage} />
            ) : (
              <View style={styles.logoBadge}>
                <Text style={styles.logoLetter}>{data.organizationName.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View>
              <Text style={styles.orgName}>{data.organizationName}</Text>
              <Text style={styles.orgSubtitle}>Organisme de formation agréé</Text>
              {(data.organizationAddress || data.organizationCity) && (
                <Text style={styles.orgSubtitle}>{[data.organizationAddress, data.organizationCity].filter(Boolean).join(", ")}</Text>
              )}
            </View>
          </View>
          <View style={styles.titleMain}>
            <Text style={styles.titleMain}>{title}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.body}>
            {/* En mode personnalisé, identité de l'étudiant en tête du bloc ;
                le texte par défaut la mentionne déjà dans sa rédaction. */}
            {customTemplate ? (
              <>
                <Text style={styles.studentName}>{data.studentName}</Text>
                <Text style={styles.studentCode}>Matricule : {data.studentCode}</Text>
              </>
            ) : null}
            {bodyLines.map((line, index) => (
              <Text key={index} style={styles.customBodyText}>
                {line.map((segment, segmentIndex) =>
                  segment.bold ? (
                    <Text key={segmentIndex} style={styles.customBodyStrong}>
                      {segment.text}
                    </Text>
                  ) : (
                    segment.text
                  )
                )}
              </Text>
            ))}
            {data.score !== null && (
              <View style={styles.scoreSection}>
                <Text style={styles.scoreLabel}>Mention / Score</Text>
                <Text style={styles.scoreValue}>{data.score.toFixed(1)} %</Text>
              </View>
            )}
          </View>
          <View style={styles.footer}>
            <View>
              <Text style={styles.dateLabel}>Certificat émis le</Text>
              <Text style={styles.dateValue}>{formatDate(data.issueDate)}</Text>
              <View style={styles.signatureColumn}>
                <View style={styles.signatureLine} />
                <Text style={styles.signatureRole}>Direction</Text>
              </View>
              <View style={styles.signatureColumn}>
                <View style={styles.signatureLine} />
                <Text style={styles.signatureRole}>Pédagogique</Text>
              </View>
            </View>
            <View style={styles.qrBlock}>
              <Image src={qrUrl} style={styles.qrImage} />
              <Text style={styles.qrLabel}>Scanner pour vérifier</Text>
              <Text style={styles.verificationCode}>{data.verificationCode}</Text>
            </View>
          </View>
          <View style={styles.legalFooter}>
            <Text style={styles.legalLine}>
              {officialNumbers.length > 0
                ? `Organisme de formation agréé · ${officialNumbers.join(" · ")}`
                : "Organisme de formation agréé"}
            </Text>
            {addressLine ? <Text style={styles.legalLine}>{addressLine}</Text> : null}
            {contactLine.length > 0 ? (
              <Text style={styles.legalLine}>{contactLine.join(" · ")}</Text>
            ) : null}
          </View>
        </View>
      </Page>
    </Document>
  );
}


/**
 * Télécharge le PDF d'un certificat via l'API dédiée.
 * À utiliser côté client (navigateur).
 */
export async function downloadCertificatePdf(
  certificateId: string,
  baseUrl: string = typeof window !== "undefined" ? window.location.origin : ""
): Promise<void> {
  if (!baseUrl) {
    throw new Error("Impossible de déterminer l'URL de base pour le téléchargement du PDF.");
  }

  const response = await fetch(`${baseUrl}/dashboard/certificates/${certificateId}/pdf?format=pdf`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Erreur inconnue" }));
    throw new Error(error.error || "Impossible de télécharger le PDF du certificat");
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `certificat-${certificateId}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

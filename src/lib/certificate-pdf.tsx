import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";

const C = {
  navy: "#1e3a5f",
  gold: "#c9a227",
  goldLight: "#f5d76e",
  cream: "#faf8f3",
  charcoal: "#2d3748",
  silver: "#718096",
  green: "#059669",
  lightGold: "#fdf6e3",
};

const styles = StyleSheet.create({
  page: { width: 842, height: 595, padding: 0, fontFamily: "Helvetica", backgroundColor: C.cream },
  container: { flex: 1, padding: 40, border: `3px solid ${C.gold}`, margin: 25, borderRadius: 6, backgroundColor: C.cream },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 25, paddingBottom: 15, borderBottomWidth: 2, borderBottomColor: C.gold },
  logoBadge: { width: 56, height: 56, borderRadius: 50, backgroundColor: C.navy, justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: C.gold },
  logoLetter: { color: C.goldLight, fontSize: 22, fontWeight: "bold" },
  orgName: { fontSize: 15, fontWeight: "bold", color: C.navy },
  orgSubtitle: { fontSize: 9, color: C.silver, fontStyle: "italic", marginTop: 2 },
  titleMain: { fontSize: 30, fontWeight: "bold", color: C.navy, letterSpacing: 4, textTransform: "uppercase", textAlign: "center" },
  titleAccent: { fontSize: 12, color: C.gold, letterSpacing: 2, fontStyle: "italic", textAlign: "center", marginTop: 4 },
  divider: { height: 2, backgroundColor: C.gold, marginHorizontal: 30, marginBottom: 25 },
  body: { flex: 1, paddingHorizontal: 30, justifyContent: "center" },
  introText: { fontSize: 11, color: C.charcoal, textAlign: "center", lineHeight: 1.7, marginBottom: 12, fontStyle: "italic" },
  studentName: { fontSize: 24, fontWeight: "bold", color: C.navy, textAlign: "center", letterSpacing: 1, marginBottom: 6 },
  studentCode: { fontSize: 10, color: C.silver, textAlign: "center", marginBottom: 18, fontFamily: "Courier" },
  bodyText: { fontSize: 11, color: C.charcoal, textAlign: "center", lineHeight: 1.7, marginBottom: 8 },
  levelBox: { backgroundColor: C.lightGold, borderWidth: 2, borderColor: C.gold, borderRadius: 4, paddingVertical: 14, paddingHorizontal: 25, marginVertical: 16, alignItems: "center", alignSelf: "center", width: 280 },
  levelLabel: { fontSize: 9, color: C.silver, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4 },
  levelValue: { fontSize: 20, fontWeight: "bold", color: C.navy, textAlign: "center", letterSpacing: 1 },
  levelSub: { fontSize: 9, color: C.green, fontWeight: "bold", textAlign: "center", marginTop: 3 },
  scoreSection: { alignItems: "center", marginTop: 8 },
  scoreLabel: { fontSize: 9, color: C.silver, textTransform: "uppercase", marginBottom: 2 },
  scoreValue: { fontSize: 14, fontWeight: "bold", color: C.charcoal, fontFamily: "Courier" },
  footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 20, paddingHorizontal: 20, paddingBottom: 10, borderTopWidth: 1, borderTopColor: C.gold, borderTopStyle: "solid" },
  dateLabel: { fontSize: 8, color: C.silver, textTransform: "uppercase", marginBottom: 2 },
  dateValue: { fontSize: 11, fontWeight: "bold", color: C.charcoal },
  signatureColumn: { alignItems: "center", flex: 1 },
  signatureLine: { width: 100, height: 1, backgroundColor: C.charcoal, marginBottom: 4 },
  signatureRole: { fontSize: 8, color: C.silver, textAlign: "center", textTransform: "uppercase" },
  qrBlock: { alignItems: "center", width: 110 },
  qrImage: { width: 75, height: 75, marginBottom: 4, borderWidth: 1, borderColor: C.silver, borderRadius: 2 },
  qrLabel: { fontSize: 7, color: C.silver, textAlign: "center", marginBottom: 2 },
  verificationCode: { fontSize: 10, fontWeight: "bold", color: C.navy, fontFamily: "Courier", backgroundColor: C.lightGold, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 2, borderWidth: 1, borderColor: C.gold },
  watermark: { position: "absolute", top: "45%", left: "15%", fontSize: 72, color: "rgba(30, 58, 95, 0.025)", transform: "rotate(-25deg)", fontWeight: "bold", zIndex: -1 },
});

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

export function generateCertificatePDF(data: {
  studentName: string;
  studentCode: string;
  level: string;
  score: number | null;
  issueDate: Date;
  verificationCode: string;
  verificationUrl: string;
  organizationName: string;
  organizationAddress?: string | null;
  organizationCity?: string | null;
  organizationPhone?: string | null;
}) {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(data.verificationUrl)}`;
  const title = data.level.toUpperCase().includes("ATTESTATION") ? "ATTESTATION DE RÉUSSITE" : "CERTIFICAT DE COMPÉTENCE LINGUISTIQUE";

  return (
    <Document>
      <Page size={{ width: 842, height: 595 }} style={styles.page}>
        <Text style={styles.watermark}>CERTIFIÉ</Text>
        <View style={styles.container}>
          <View style={styles.header}>
            <View style={styles.logoBadge}>
              <Text style={styles.logoLetter}>{data.organizationName.charAt(0).toUpperCase()}</Text>
            </View>
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
            <Text style={styles.introText}>Il est officiellement certifié par la présente que</Text>
            <Text style={styles.studentName}>{data.studentName}</Text>
            <Text style={styles.studentCode}>Matricule : {data.studentCode}</Text>
            <Text style={styles.bodyText}>a validé avec succès la formation de langue et atteint le niveau de compétence suivant :</Text>
            <View style={styles.levelBox}>
              <Text style={styles.levelLabel}>Niveau certifié</Text>
              <Text style={styles.levelValue}>{data.level}</Text>
              <Text style={styles.levelSub}>Diplôme reconnu internationalement</Text>
            </View>
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

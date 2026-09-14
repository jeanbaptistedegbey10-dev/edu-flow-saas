import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    width: 842,
    height: 595,
    padding: 0,
    fontFamily: "Helvetica",
    backgroundColor: "#ffffff",
  },
  container: {
    flex: 1,
    padding: 50,
    border: "3px solid #1e3a5f",
    margin: 20,
    borderRadius: 8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 30,
  },
  logoSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  logoPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#1e3a5f",
    justifyContent: "center",
    alignItems: "center",
  },
  logoText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "bold",
  },
  orgName: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#1e3a5f",
  },
  orgDetail: {
    fontSize: 8,
    color: "#6b7280",
  },
  titleSection: {
    alignItems: "center",
    marginBottom: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#1e3a5f",
    letterSpacing: 3,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 10,
    color: "#6b7280",
    letterSpacing: 1,
  },
  divider: {
    height: 2,
    backgroundColor: "#1e3a5f",
    marginHorizontal: 60,
    marginBottom: 30,
  },
  body: {
    flex: 1,
    paddingHorizontal: 40,
  },
  certText: {
    fontSize: 12,
    color: "#374151",
    textAlign: "center",
    lineHeight: 1.8,
    marginBottom: 20,
  },
  studentName: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#1e3a5f",
    textAlign: "center",
    marginBottom: 16,
  },
  levelText: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#059669",
    textAlign: "center",
    marginBottom: 8,
  },
  scoreText: {
    fontSize: 11,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 20,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 30,
    paddingHorizontal: 20,
  },
  dateSection: {
    alignItems: "flex-start",
  },
  dateLabel: {
    fontSize: 9,
    color: "#6b7280",
    marginBottom: 2,
  },
  dateValue: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#374151",
  },
  signatureSection: {
    alignItems: "center",
  },
  signatureLine: {
    width: 120,
    height: 1,
    backgroundColor: "#374151",
    marginBottom: 4,
  },
  signatureText: {
    fontSize: 9,
    color: "#6b7280",
  },
  qrSection: {
    alignItems: "center",
  },
  qrImage: {
    width: 70,
    height: 70,
  },
  qrText: {
    fontSize: 7,
    color: "#9ca3af",
    marginTop: 2,
  },
  verificationCode: {
    fontSize: 8,
    color: "#6b7280",
    marginTop: 2,
  },
  watermark: {
    position: "absolute",
    top: "40%",
    left: "20%",
    fontSize: 60,
    color: "rgba(30, 58, 95, 0.03)",
    transform: "rotate(-30deg)",
    fontWeight: "bold",
  },
});

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function generateCertificatePDF(data: {
  studentName: string;
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
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(data.verificationUrl)}`;

  return (
    <Document>
      <Page size={{ width: 842, height: 595 }} style={styles.page}>
        <View style={styles.container}>
          <Text style={styles.watermark}>CERTIFIÉ</Text>

          <View style={styles.header}>
            <View style={styles.logoSection}>
              <View style={styles.logoPlaceholder}>
                <Text style={styles.logoText}>
                  {data.organizationName.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View>
                <Text style={styles.orgName}>{data.organizationName}</Text>
                {data.organizationAddress && (
                  <Text style={styles.orgDetail}>{data.organizationAddress}</Text>
                )}
                {data.organizationCity && (
                  <Text style={styles.orgDetail}>{data.organizationCity}</Text>
                )}
                {data.organizationPhone && (
                  <Text style={styles.orgDetail}>Tél : {data.organizationPhone}</Text>
                )}
              </View>
            </View>
          </View>

          <View style={styles.titleSection}>
            <Text style={styles.title}>CERTIFICAT</Text>
            <Text style={styles.subtitle}>DE COMPÉTENCE PÉDAGOGIQUE</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.body}>
            <Text style={styles.certText}>
              Je soussigné(e), représentant(e) de l&apos;établissement ci-nommé, certifie que
            </Text>
            <Text style={styles.studentName}>{data.studentName}</Text>
            <Text style={styles.certText}>
              a validé avec succès le niveau suivant :
            </Text>
            <Text style={styles.levelText}>{data.level}</Text>
            {data.score !== null && (
              <Text style={styles.scoreText}>
                Score obtenu : {data.score.toFixed(1)}%
              </Text>
            )}
          </View>

          <View style={styles.footer}>
            <View style={styles.dateSection}>
              <Text style={styles.dateLabel}>Délivré le</Text>
              <Text style={styles.dateValue}>{formatDate(data.issueDate)}</Text>
            </View>

            <View style={styles.qrSection}>
              <Image src={qrCodeUrl} style={styles.qrImage} />
              <Text style={styles.qrText}>Vérifier l&apos;authenticité</Text>
              <Text style={styles.verificationCode}>{data.verificationCode}</Text>
            </View>

            <View style={styles.signatureSection}>
              <View style={styles.signatureLine} />
              <Text style={styles.signatureText}>Le Directeur</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}

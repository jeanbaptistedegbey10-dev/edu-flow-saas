/** PDF generator for student reports */
import { Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";

Font.register({
  family: "Helvetica",
  fonts: [{ src: "Helvetica" }, { src: "Helvetica-Bold", fontWeight: "bold" }],
});

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: "Helvetica", fontSize: 10 },
  title: { fontSize: 18, fontWeight: "bold", marginBottom: 8 },
  subtitle: { fontSize: 11, color: "#6b7280", marginBottom: 20 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 12, fontWeight: "bold", marginBottom: 8, borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  label: { color: "#6b7280" },
  value: { fontWeight: "bold" },
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, borderTopWidth: 1, paddingTop: 8, fontSize: 8, color: "#9ca3af" },
});

export function generateStudentReportPDF(data: { studentName: string; studentCode: string; organizationName: string; generatedAt: string }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Rapport Étudiant</Text>
        <Text style={styles.subtitle}>{data.organizationName}</Text>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informations</Text>
          <View style={styles.row}><Text style={styles.label}>Nom</Text><Text style={styles.value}>{data.studentName}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Code</Text><Text style={styles.value}>{data.studentCode}</Text></View>
        </View>
        <Text style={styles.footer}>Généré le {data.generatedAt}</Text>
      </Page>
    </Document>
  );
}


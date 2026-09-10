/** PDF generator for student reports */
import { Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";

Font.register({
  family: "Helvetica",
  fonts: [{ src: "Helvetica" }, { src: "Helvetica-Bold", fontWeight: "bold" }],
});

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: "Helvetica", fontSize: 10 },
  title: { fontSize: 18, fontWeight: "bold", marginBottom: 8 },
  subtitle: { fontSize: 11, color: "#6b7280", marginBottom: 16 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 12, fontWeight: "bold", marginBottom: 8, borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  label: { color: "#6b7280" },
  value: { fontWeight: "bold" },
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, borderTopWidth: 1, paddingTop: 8, fontSize: 8, color: "#9ca3af" },
});
const STATUS_LABELS: Record<string, string> = {
  PROSPECT: "Prospect",
  ENROLLED: "Inscrit",
  IN_PROGRESS: "En cours",
  COMPLETED: "Terminé",
  SUSPENDED: "Suspendu",
  DROPPED_OUT: "Abandonné",
};

const ATTENDANCE_LABELS: Record<string, string> = {
  PRESENT: "Présent",
  LATE: "En retard",
  ABSENT: "Absent",
  EXCUSED: "Excusé",
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("fr-FR").format(amount) + " FCFA";
}
export function generateStudentReportPDF(data: {
  student: {
    lastName: string;
    firstName: string;
    studentCode: string;
    email: string | null;
    phone: string;
    status: string;
    netAmount: number | null;
    isSelfFinanced: boolean;
    parentName: string | null;
    parentRelation: string | null;
    parentPhone1: string | null;
  };
  attendanceSummary: { total: number; present: number; late: number; absent: number; excused: number };
  totalPaid: number;
  balance: number;
  grades: { module: string; score: number | null; maxScore: number }[];
  travelStatus: string | null;
  organizationName: string;
  generatedAt: string;
}) {
  const studentName = `${data.student.firstName} ${data.student.lastName}`;
  const netAmountStr = data.student.netAmount != null ? formatCurrency(data.student.netAmount) : "—";
  const balanceStr = data.balance > 0 ? formatCurrency(data.balance) : "Soldé";
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Rapport Étudiant</Text>
        <Text style={styles.subtitle}>{data.organizationName}</Text>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informations personnelles</Text>
          <View style={styles.row}><Text style={styles.label}>Nom</Text><Text style={styles.value}>{studentName}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Code</Text><Text style={styles.value}>{data.student.studentCode}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Statut</Text><Text style={styles.value}>{STATUS_LABELS[data.student.status] ?? data.student.status}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Téléphone</Text><Text style={styles.value}>{data.student.phone}</Text></View>
          {data.student.email ? <View style={styles.row}><Text style={styles.label}>Email</Text><Text style={styles.value}>{data.student.email}</Text></View> : null}
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Assiduité</Text>
          <View style={styles.row}><Text style={styles.label}>Total</Text><Text style={styles.value}>{data.attendanceSummary.total}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Présent</Text><Text style={[styles.value, {color: "#059669"}]}>{data.attendanceSummary.present}</Text></View>
          <View style={styles.row}><Text style={styles.label}>En retard</Text><Text style={[styles.value, {color: "#d97706"}]}>{data.attendanceSummary.late}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Absent</Text><Text style={[styles.value, {color: "#dc2626"}]}>{data.attendanceSummary.absent}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Excusé</Text><Text style={styles.value}>{data.attendanceSummary.excused}</Text></View>
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Finances</Text>
          <View style={styles.row}><Text style={styles.label}>Coût total</Text><Text style={styles.value}>{netAmountStr}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Payé</Text><Text style={[styles.value, {color: "#059669"}]}>{formatCurrency(data.totalPaid)}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Reste</Text><Text style={[styles.value, data.balance > 0 ? {color: "#dc2626"} : {color: "#059669"}]}>{balanceStr}</Text></View>
        </View>
        <Text style={styles.footer}>Généré le {data.generatedAt}</Text>
      </Page>
    </Document>
  );
}
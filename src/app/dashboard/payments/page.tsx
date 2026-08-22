import {
  getFinancialStats,
  getPayments,
  getStudentOptions,
} from "@/actions/payments";
import { PaymentsView } from "@/components/payments/payments-view";

export const metadata = {
  title: "Paiements | EduFlow",
  description:
    "Gestion financière : encaissements, règlements en attente et dépenses du centre de formation.",
};

export default async function PaymentsPage() {
  const [payments, stats, students] = await Promise.all([
    getPayments(),
    getFinancialStats(),
    getStudentOptions(),
  ]);

  return <PaymentsView payments={payments} stats={stats} students={students} />;
}
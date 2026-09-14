import {
  getCurrentOrganizationProfile,
  getFinancialStats,
  getPayments,
  getStudentOptions,
} from "@/actions/payments";
import { getOverdueSchedules } from "@/lib/actions/schedules";
import { PaymentsView } from "@/components/payments/payments-view";

export const metadata = {
  title: "Paiements | EduFlow",
  description:
    "Gestion financière : encaissements, règlements en attente et dépenses du centre de formation.",
};

export default async function PaymentsPage() {
  const [payments, stats, students, organization, overdueData] =
    await Promise.all([
      getPayments(),
      getFinancialStats(),
      getStudentOptions(),
      getCurrentOrganizationProfile(),
      getOverdueSchedules(),
    ]);

  return (
    <PaymentsView
      payments={payments}
      stats={stats}
      students={students}
      organization={organization}
      overdueSchedules={overdueData.schedules}
      overdueAmount={overdueData.overdueAmount}
    />
  );
}
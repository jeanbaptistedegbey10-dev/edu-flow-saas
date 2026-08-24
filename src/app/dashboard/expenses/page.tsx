import { getExpenses } from "@/actions/expenses";
import { ExpensesView } from "@/components/expenses/expenses-view";

export const metadata = {
  title: "Dépenses | EduFlow",
  description:
    "Suivez et gérez les dépenses de votre organisation : charges, fournitures, salaires.",
};

export default async function ExpensesPage() {
  const expenses = await getExpenses();

  return <ExpensesView expenses={expenses} />;
}
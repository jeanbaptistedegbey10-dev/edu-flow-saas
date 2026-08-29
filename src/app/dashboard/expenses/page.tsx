import { getExpenses, getStaffMembers } from "@/actions/expenses";
import { ExpensesView } from "@/components/expenses/expenses-view";

export const metadata = {
  title: "Dépenses | EduFlow",
  description:
    "Suivez et gérez les dépenses de votre organisation : charges, fournitures, salaires.",
};

export default async function ExpensesPage() {
  // Requêtes indépendantes exécutées en parallèle : les dépenses et les
  // membres actifs (bénéficiaires potentiels des versements de salaire).
  const [expenses, members] = await Promise.all([
    getExpenses(),
    getStaffMembers(),
  ]);

  return <ExpensesView expenses={expenses} members={members} />;
}
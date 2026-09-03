import { redirect } from "next/navigation";
import { connection } from "next/server";

import { auth } from "@/auth";
import { getCashFlowAction } from "@/actions/analytics";
import { TreasuryView } from "@/components/dashboard/treasury-view";

export const metadata = {
  title: "Trésorerie | EduFlow",
  description:
    "Trésorerie du centre : solde initial, encaissements, dépenses et solde total de caisse (Solde initial + Encaissements − Dépenses).",
};

/**
 * Page dédiée « Trésorerie » : les indicateurs de caisse autrefois affichés
 * sur le tableau de bord principal sont regroupés ici. Accès restreint aux
 * rôles administratifs — les enseignants sont redirigés vers /dashboard
 * (l'action sous-jacente applique la même règle en défense en profondeur).
 */
export default async function TreasuryPage() {
  // Rendu dynamique SSR garanti : `connection()` interrompt tout pré-rendu
  // statique de la page (doc locale Next.js 16) — la page dépend de la
  // session (cookies) et des données financières en base.
  await connection();

  const session = await auth();
  const role = session?.user?.role;

  // Les enseignants ne doivent JAMAIS voir de données financières :
  // redirection immédiate vers le tableau de bord pédagogique.
  if (role === "TEACHER" || role === "STUDENT") {
    redirect("/dashboard");
  }

  const cashFlow = await getCashFlowAction();

  return <TreasuryView cashFlow={cashFlow} />;
}

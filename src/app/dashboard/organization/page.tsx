import {
  getOrganizationInfo,
  getOrganizationMembers,
} from "@/actions/organization";
import { OrganizationView } from "@/components/organization/organization-view";

export const metadata = {
  title: "Organisation | EduFlow",
  description:
    "Informations de votre organisation et liste des membres de l'équipe.",
};

export default async function OrganizationPage() {
  // Requêtes indépendantes exécutées en parallèle pour minimiser la latence.
  const [organization, members] = await Promise.all([
    getOrganizationInfo(),
    getOrganizationMembers(),
  ]);

  return <OrganizationView organization={organization} members={members} />;
}
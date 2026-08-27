import { notFound } from "next/navigation";

import { getDocumentsByOwner } from "@/actions/documents";
import { getCurrentOrganizationProfile } from "@/actions/payments";
import { getTravelProcedureDetail } from "@/actions/travels";
import { TravelDetailView } from "@/components/travels/travel-detail-view";

export const metadata = {
  title: "Détail du dossier voyage | EduFlow",
  description:
    "Suivi des étapes de la procédure et échelonnement financier du dossier candidat.",
};

export default async function TravelDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let detail;
  let organization;
  let documents;
  try {
    [detail, organization, documents] = await Promise.all([
      getTravelProcedureDetail(id),
      getCurrentOrganizationProfile(),
      // Pièces jointes rattachées au dossier (isolation multi-tenant).
      getDocumentsByOwner({ travelProcedureId: id }),
    ]);
  } catch {
    notFound();
  }

  return (
    <TravelDetailView
      detail={detail}
      organization={organization}
      documents={documents}
    />
  );
}
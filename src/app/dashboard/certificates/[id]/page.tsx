/**
 * Page de détail d'un certificat
 * 
 * Affiche le certificat avec options d'impression et téléchargement PDF.
 */
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { getCertificateById } from "@/lib/actions/certificates";
import { getCurrentOrganizationProfile } from "@/actions/payments";
import { CertificateViewer } from "@/components/certificates/certificate-viewer";

export const metadata = {
  title: "Détail du certificat | EduFlow",
  description: "Visualisez et imprimez un certificat de compétence linguistique.",
};

export default async function CertificateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();

  const { id } = await params;

  const [certificate, organization] = await Promise.all([
    getCertificateById(id),
    getCurrentOrganizationProfile(),
  ]);

  // `getCertificateById` filtre déjà par organisation active
  // (`getCurrentOrganizationId`) : toute fiche retournée appartient donc à
  // l'organisation de la session. (Ne PAS re-vérifier un champ
  // `organizationId` ici : le DTO ne l'expose pas — cette comparaison
  // impossible produisait un 404 systématique.)
  if (!certificate) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Certificat de Compétence</h1>
        <p className="text-sm text-muted-foreground">
          Visualisez, imprimez ou téléchargez ce certificat au format PDF.
        </p>
      </div>

      <CertificateViewer certificate={certificate} organization={organization} />
    </div>
  );
}
import { connection } from "next/server";

import { getCertificates } from "@/lib/actions/certificates";
import { getStudents } from "@/actions/students";
import { getCourses } from "@/actions/courses";
import { CertificatesView } from "@/components/certificates/certificates-view";
import { getCurrentOrganizationProfile } from "@/actions/payments";

export const metadata = {
  title: "Certificats | EduFlow",
  description: "Gestion des certificats et attestations sécurisés.",
};

export default async function CertificatesPage() {
  await connection();

  const [certificates, students, courses] = await Promise.all([
    getCertificates(),
    getStudents(),
    getCourses(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Certificats</h1>
        <p className="text-sm text-muted-foreground">
          Gérez les certificats et attestations sécurisés par QR Code.
        </p>
      </div>

      <CertificatesView certificates={certificates} students={students} />
    </div>
  );
}

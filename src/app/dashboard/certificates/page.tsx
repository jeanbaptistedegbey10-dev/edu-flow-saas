import { connection } from "next/server";

import { getClasses } from "@/actions/classes";
import { getCourses } from "@/actions/courses";
import { getStudents } from "@/actions/students";
import {
  getCertificateEnrollmentMap,
  getCertificates,
} from "@/lib/actions/certificates";
import { CertificatesView } from "@/components/certificates/certificates-view";

export const metadata = {
  title: "Certificats | EduFlow",
  description: "Gestion des certificats et attestations sécurisés.",
};

export default async function CertificatesPage() {
  await connection();

  const [certificates, students, courses, classes, enrollmentLinks] =
    await Promise.all([
      getCertificates(),
      getStudents(),
      getCourses(),
      getClasses(),
      getCertificateEnrollmentMap(),
    ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Certificats</h1>
        <p className="text-sm text-muted-foreground">
          Gérez les certificats et attestations sécurisés par QR Code.
        </p>
      </div>

      <CertificatesView
        certificates={certificates}
        students={students}
        courses={courses}
        classes={classes}
        enrollmentLinks={enrollmentLinks}
      />
    </div>
  );
}

import { connection } from "next/server";

import { getClassOptions } from "@/actions/classes";
import { getDefaultRegistrationFee } from "@/actions/organization";
import { getStudents } from "@/actions/students";
import { StudentsPageTabs } from "@/components/students/students-page-tabs";

export const metadata = {
  title: "Étudiants | EduFlow",
  description: "Gestion des étudiants et prospects du centre de formation.",
};

export default async function StudentsPage() {
  await connection();

  const [students, classes, registrationFee] = await Promise.all([
    getStudents(),
    getClassOptions(),
    getDefaultRegistrationFee(),
  ]);

  return (
    <StudentsPageTabs
      students={students}
      classes={classes}
      registrationFee={registrationFee}
    />
  );
}
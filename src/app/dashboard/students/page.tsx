import { getClassOptions } from "@/actions/classes";
import { getDefaultRegistrationFee } from "@/actions/organization";
import { getStudents } from "@/actions/students";
import { StudentsView } from "@/components/students/students-view";

export const metadata = {
  title: "Étudiants | EduFlow",
  description: "Gestion des étudiants du centre de formation.",
};

export default async function StudentsPage() {
  const [students, classes, registrationFee] = await Promise.all([
    getStudents(),
    getClassOptions(),
    getDefaultRegistrationFee(),
  ]);

  return (
    <StudentsView
      students={students}
      classes={classes}
      registrationFee={registrationFee}
    />
  );
}

export const dynamic = "force-dynamic";
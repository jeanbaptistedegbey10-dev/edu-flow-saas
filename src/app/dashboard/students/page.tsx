import { connection } from "next/server";

import { getClassOptions } from "@/actions/classes";
import { getDefaultRegistrationFee } from "@/actions/organization";
import { getStudents } from "@/actions/students";
import { StudentsView } from "@/components/students/students-view";

export const metadata = {
  title: "Étudiants | EduFlow",
  description: "Gestion des étudiants du centre de formation.",
};

export default async function StudentsPage() {
  // Rendu dynamique SSR garanti : `connection()` interrompt le pré-rendu
  // statique (doc locale Next.js 16). L'export périmé
  // `export const dynamic = "force-dynamic"` a été supprimé : les données
  // dépendent de la session (auth() → cookies) via les server actions.
  await connection();

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
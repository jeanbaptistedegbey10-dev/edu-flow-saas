import {
  getStudentOptions,
  getTravelProcedures,
  getWorkflows,
} from "@/actions/travels";
import { TravelsView } from "@/components/travels/travels-view";

export const metadata = {
  title: "Module Voyage | EduFlow",
  description:
    "Suivi visuel des dossiers candidats, échelonnement financier et workflows de procédures par pays.",
};

export default async function TravelsPage() {
  const [procedures, students, workflows] = await Promise.all([
    getTravelProcedures(),
    getStudentOptions(),
    getWorkflows(),
  ]);

  return (
    <TravelsView
      procedures={procedures}
      students={students}
      workflows={workflows}
    />
  );
}
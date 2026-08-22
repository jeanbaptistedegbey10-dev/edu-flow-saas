import {
  getStudentOptions,
  getTravelProcedures,
} from "@/actions/travels";
import { TravelsView } from "@/components/travels/travels-view";

export const metadata = {
  title: "Procédures voyage | EduFlow",
  description:
    "Suivi des dossiers de mobilité internationale : admissions, visas et départs.",
};

export default async function TravelsPage() {
  const [procedures, students] = await Promise.all([
    getTravelProcedures(),
    getStudentOptions(),
  ]);

  return <TravelsView procedures={procedures} students={students} />;
}
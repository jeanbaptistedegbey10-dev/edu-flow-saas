import { auth } from "@/auth";
import { getStudentOptions } from "@/actions/payments";
import {
  getStaffMembers,
  getTasks,
} from "@/actions/tasks";
import { TasksView } from "@/components/tasks/tasks-view";

export const metadata = {
  title: "Tâches | EduFlow",
  description:
    "Organisez le travail de votre équipe : tâches internes, assignations et échéances.",
};

export default async function TasksPage() {
  // L'enseignant accède aux tâches en LECTURE SEULE : pas de création,
  // d'édition ni de suppression (boutons masqués côté client).
  const session = await auth();
  const readOnly = session?.user?.role === "TEACHER";

  // Requêtes indépendantes exécutées en parallèle pour minimiser la latence.
  const [tasks, staffMembers, students] = await Promise.all([
    getTasks(),
    getStaffMembers(),
    getStudentOptions(),
  ]);

  return (
    <TasksView
      tasks={tasks}
      staffMembers={staffMembers}
      students={students}
      readOnly={readOnly}
    />
  );
}
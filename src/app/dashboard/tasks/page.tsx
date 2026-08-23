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
    />
  );
}
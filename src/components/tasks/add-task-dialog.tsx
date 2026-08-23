"use client";

import * as React from "react";
import { useActionState } from "react";
import { ClipboardListIcon, Loader2Icon, PlusIcon } from "lucide-react";

import {
  createTaskAction,
  type StaffMemberDTO,
  type TaskFormState,
  type TaskStudentOptionDTO,
} from "@/actions/tasks";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TASK_PRIORITY_OPTIONS,
  getTaskPriorityLabel,
} from "@/lib/task-priority";

const INITIAL_FORM_STATE: TaskFormState = { status: "idle" };

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-xs font-medium text-destructive">
      {message}
    </p>
  );
}

export function AddTaskDialog({
  staffMembers,
  students,
}: {
  staffMembers: StaffMemberDTO[];
  students: TaskStudentOptionDTO[];
}) {
  const [open, setOpen] = React.useState(false);

  // Enveloppe l'action serveur pour fermer la modale dès que la création réussit.
  const [state, formAction, pending] = useActionState(
    async (_prevState: TaskFormState, formData: FormData) => {
      const result = await createTaskAction(_prevState, formData);

      if (result.status === "success") {
        setOpen(false);
      }

      return result;
    },
    INITIAL_FORM_STATE
  );

  const fieldErrors = state.fieldErrors ?? {};

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon data-icon="inline-start" />
          Nouvelle tâche
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Créer une tâche</DialogTitle>
          <DialogDescription>
            Attribuez une tâche à un membre de l’équipe et liez-la
            éventuellement à un étudiant concerné.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4">
          {state.message && state.status === "error" && !state.fieldErrors ? (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {state.message}
            </p>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor="title">Intitulé *</Label>
            <Input
              id="title"
              name="title"
              placeholder="Ex : Préparer les dossiers d'admission"
              maxLength={150}
              required
              aria-invalid={Boolean(fieldErrors.title)}
            />
            <FieldError message={fieldErrors.title} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              name="description"
              placeholder="Ex : Rassembler les documents pour les candidatures"
              maxLength={500}
              aria-invalid={Boolean(fieldErrors.description)}
            />
            <FieldError message={fieldErrors.description} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="priority">Priorité *</Label>
              <Select name="priority" defaultValue="MEDIUM">
                <SelectTrigger
                  id="priority"
                  className="w-full"
                  aria-invalid={Boolean(fieldErrors.priority)}
                >
                  <SelectValue placeholder="Sélectionner une priorité" />
                </SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITY_OPTIONS.map((priority) => (
                    <SelectItem key={priority} value={priority}>
                      {getTaskPriorityLabel(priority)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={fieldErrors.priority} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="dueDate">Date d’échéance</Label>
              <Input
                id="dueDate"
                name="dueDate"
                type="date"
                aria-invalid={Boolean(fieldErrors.dueDate)}
              />
              <FieldError message={fieldErrors.dueDate} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="assigneeId">Membre de l’équipe</Label>
              <Select name="assigneeId">
                <SelectTrigger
                  id="assigneeId"
                  className="w-full"
                  aria-invalid={Boolean(fieldErrors.assigneeId)}
                >
                  <SelectValue placeholder="Non assignée" />
                </SelectTrigger>
                <SelectContent>
                  {staffMembers.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.firstName} {member.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={fieldErrors.assigneeId} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="studentId">Étudiant associé</Label>
              <Select name="studentId">
                <SelectTrigger
                  id="studentId"
                  className="w-full"
                  aria-invalid={Boolean(fieldErrors.studentId)}
                >
                  <SelectValue placeholder="Aucun" />
                </SelectTrigger>
                <SelectContent>
                  {students.map((student) => (
                    <SelectItem key={student.id} value={student.id}>
                      {student.firstName} {student.lastName} (
                      {student.studentCode})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={fieldErrors.studentId} />
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                Annuler
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <Loader2Icon data-icon="inline-start" className="animate-spin" />
              ) : (
                <ClipboardListIcon data-icon="inline-start" />
              )}
              {pending ? "Création..." : "Créer la tâche"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
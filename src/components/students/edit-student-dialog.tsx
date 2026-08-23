"use client";

import * as React from "react";
import { useActionState } from "react";
import { Loader2Icon, SaveIcon } from "lucide-react";

import {
  updateStudentAction,
  type StudentDTO,
  type StudentFormState,
} from "@/actions/students";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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

const STATUS_OPTIONS = [
  { value: "PROSPECT", label: "Prospect" },
  { value: "ENROLLED", label: "Inscrit" },
  { value: "IN_PROGRESS", label: "En cours" },
  { value: "COMPLETED", label: "Terminé" },
  { value: "SUSPENDED", label: "Suspendu" },
  { value: "DROPPED_OUT", label: "Abandon" },
] as const;

const INITIAL_FORM_STATE: StudentFormState = { status: "idle" };

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-xs font-medium text-destructive">
      {message}
    </p>
  );
}

/**
 * Formulaire d'édition isolé par entité (`key={student.id}` côté parent)
 * afin de réinitialiser l'état du formulaire à chaque ouverture.
 */
function EditStudentForm({
  student,
  onSuccess,
}: {
  student: StudentDTO;
  onSuccess: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    async (_prevState: StudentFormState, formData: FormData) => {
      const result = await updateStudentAction(_prevState, formData);

      if (result.status === "success") {
        onSuccess();
      }

      return result;
    },
    INITIAL_FORM_STATE
  );

  const fieldErrors = state.fieldErrors ?? {};

  return (
    <>
      <DialogHeader>
        <DialogTitle>Modifier l’étudiant</DialogTitle>
        <DialogDescription>
          Mettez à jour les informations de {student.firstName}{" "}
          {student.lastName} ({student.studentCode}). Le code étudiant reste
          inchangé.
        </DialogDescription>
      </DialogHeader>

      <form action={formAction} className="grid gap-4">
        <input type="hidden" name="id" value={student.id} />

        {state.message && state.status === "error" && !state.fieldErrors ? (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {state.message}
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="edit-firstName">Prénom *</Label>
            <Input
              id="edit-firstName"
              name="firstName"
              defaultValue={student.firstName}
              autoComplete="given-name"
              required
              aria-invalid={Boolean(fieldErrors.firstName)}
            />
            <FieldError message={fieldErrors.firstName} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="edit-lastName">Nom *</Label>
            <Input
              id="edit-lastName"
              name="lastName"
              defaultValue={student.lastName}
              autoComplete="family-name"
              required
              aria-invalid={Boolean(fieldErrors.lastName)}
            />
            <FieldError message={fieldErrors.lastName} />
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="edit-email">Email</Label>
          <Input
            id="edit-email"
            name="email"
            type="email"
            defaultValue={student.email ?? ""}
            autoComplete="email"
            aria-invalid={Boolean(fieldErrors.email)}
          />
          <FieldError message={fieldErrors.email} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="edit-phone">Téléphone *</Label>
            <Input
              id="edit-phone"
              name="phone"
              type="tel"
              defaultValue={student.phone}
              autoComplete="tel"
              required
              aria-invalid={Boolean(fieldErrors.phone)}
            />
            <FieldError message={fieldErrors.phone} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="edit-status">Statut</Label>
            <Select name="status" defaultValue={student.status}>
              <SelectTrigger id="edit-status" className="w-full">
                <SelectValue placeholder="Sélectionner un statut" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError message={fieldErrors.status} />
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
              <SaveIcon data-icon="inline-start" />
            )}
            {pending ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

/**
 * Modale d'édition pré-remplie d'un étudiant.
 * Contrôlée par la vue parente (`open` + `onOpenChange`) ; le contenu est
 * remonté à chaque changement d'entité grâce à la clé React.
 */
export function EditStudentDialog({
  student,
  open,
  onOpenChange,
}: {
  student: StudentDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {student ? (
          <EditStudentForm
            key={student.id}
            student={student}
            onSuccess={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
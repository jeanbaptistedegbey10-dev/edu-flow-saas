"use client";

import * as React from "react";
import { useActionState } from "react";
import { Loader2Icon, SaveIcon } from "lucide-react";

import {
  updateTravelProcedureAction,
  type StudentOptionDTO,
  type TravelFormState,
  type TravelProcedureDTO,
} from "@/actions/travels";
import { DESTINATION_OPTIONS } from "@/components/travels/add-travel-dialog";
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
import {
  TRAVEL_STATUS_LABELS,
  TRAVEL_STATUS_ORDER,
} from "@/lib/travel-status";

const INITIAL_FORM_STATE: TravelFormState = { status: "idle" };

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-xs font-medium text-destructive">
      {message}
    </p>
  );
}

/**
 * Formulaire d'édition isolé par entité (`key={procedure.id}` côté parent)
 * afin de réinitialiser l'état du formulaire à chaque ouverture.
 */
function EditTravelForm({
  procedure,
  students,
  onSuccess,
}: {
  procedure: TravelProcedureDTO;
  students: StudentOptionDTO[];
  onSuccess: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    async (_prevState: TravelFormState, formData: FormData) => {
      const result = await updateTravelProcedureAction(_prevState, formData);

      if (result.status === "success") {
        onSuccess();
      }

      return result;
    },
    INITIAL_FORM_STATE
  );

  const fieldErrors = state.fieldErrors ?? {};

  // Destinations courantes + destination actuelle du dossier si hors liste.
  const destinationOptions = React.useMemo(() => {
    const options = new Set<string>(DESTINATION_OPTIONS);
    options.add(procedure.destination);

    return Array.from(options);
  }, [procedure.destination]);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Modifier le dossier de voyage</DialogTitle>
        <DialogDescription>
          Mettez à jour le dossier de {procedure.student.firstName}{" "}
          {procedure.student.lastName} ({procedure.student.studentCode}).
        </DialogDescription>
      </DialogHeader>

      <form action={formAction} className="grid gap-4">
        <input type="hidden" name="id" value={procedure.id} />

        {state.message && state.status === "error" && !state.fieldErrors ? (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {state.message}
          </p>
        ) : null}

        <div className="grid gap-2">
          <Label htmlFor="edit-studentId">Étudiant *</Label>
          <Select name="studentId" defaultValue={procedure.student.id}>
            <SelectTrigger
              id="edit-studentId"
              className="w-full"
              aria-invalid={Boolean(fieldErrors.studentId)}
            >
              <SelectValue placeholder="Sélectionner un étudiant" />
            </SelectTrigger>
            <SelectContent>
              {students.map((student) => (
                <SelectItem key={student.id} value={student.id}>
                  {student.firstName} {student.lastName} ({student.studentCode})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError message={fieldErrors.studentId} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="edit-destination">Pays de destination *</Label>
            <Select name="destination" defaultValue={procedure.destination}>
              <SelectTrigger
                id="edit-destination"
                className="w-full"
                aria-invalid={Boolean(fieldErrors.destination)}
              >
                <SelectValue placeholder="Sélectionner un pays" />
              </SelectTrigger>
              <SelectContent>
                {destinationOptions.map((country) => (
                  <SelectItem key={country} value={country}>
                    {country}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError message={fieldErrors.destination} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="edit-status">Statut</Label>
            <Select name="status" defaultValue={procedure.status}>
              <SelectTrigger id="edit-status" className="w-full">
                <SelectValue placeholder="Sélectionner un statut" />
              </SelectTrigger>
              <SelectContent>
                {TRAVEL_STATUS_ORDER.map((status) => (
                  <SelectItem key={status} value={status}>
                    {TRAVEL_STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError message={fieldErrors.status} />
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="edit-targetProgram">Programme visé</Label>
          <Input
            id="edit-targetProgram"
            name="targetProgram"
            defaultValue={procedure.targetProgram ?? ""}
            maxLength={150}
            aria-invalid={Boolean(fieldErrors.targetProgram)}
          />
          <FieldError message={fieldErrors.targetProgram} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="edit-notes">Notes</Label>
          <Input
            id="edit-notes"
            name="notes"
            defaultValue={procedure.notes ?? ""}
            maxLength={500}
            aria-invalid={Boolean(fieldErrors.notes)}
          />
          <FieldError message={fieldErrors.notes} />
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
 * Modale d'édition pré-remplie d'un dossier de voyage.
 * Contrôlée par la vue parente (`open` + `onOpenChange`).
 */
export function EditTravelDialog({
  procedure,
  students,
  open,
  onOpenChange,
}: {
  procedure: TravelProcedureDTO | null;
  students: StudentOptionDTO[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {procedure ? (
          <EditTravelForm
            key={procedure.id}
            procedure={procedure}
            students={students}
            onSuccess={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
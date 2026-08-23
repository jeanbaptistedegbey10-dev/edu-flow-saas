"use client";

import * as React from "react";
import { useActionState } from "react";
import { Loader2Icon, PlaneTakeoffIcon, PlusIcon } from "lucide-react";

import {
  createTravelProcedureAction,
  type StudentOptionDTO,
  type TravelFormState,
} from "@/actions/travels";
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
  TRAVEL_STATUS_LABELS,
  TRAVEL_STATUS_ORDER,
} from "@/lib/travel-status";

/** Destinations courantes proposées dans le formulaire. */
export const DESTINATION_OPTIONS = [
  "Allemagne",
  "Autriche",
  "Belgique",
  "Canada",
  "Émirats arabes unis",
  "Espagne",
  "États-Unis",
  "France",
  "Italie",
  "Pays-Bas",
  "Royaume-Uni",
  "Suisse",
  "Turquie",
] as const;

const INITIAL_FORM_STATE: TravelFormState = { status: "idle" };

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-xs font-medium text-destructive">
      {message}
    </p>
  );
}

export function AddTravelDialog({ students }: { students: StudentOptionDTO[] }) {
  const [open, setOpen] = React.useState(false);

  // Enveloppe l'action serveur pour fermer la modale dès que la création réussit.
  const [state, formAction, pending] = useActionState(
    async (_prevState: TravelFormState, formData: FormData) => {
      const result = await createTravelProcedureAction(_prevState, formData);

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
          Nouveau dossier
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ouvrir un dossier de voyage</DialogTitle>
          <DialogDescription>
            Sélectionnez l’étudiant concerné, la destination et le programme
            visé pour démarrer son accompagnement.
          </DialogDescription>
        </DialogHeader>

        {students.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed px-6 py-8 text-center">
            <PlaneTakeoffIcon className="size-6 text-muted-foreground" />
            <p className="text-sm font-medium">Aucun étudiant disponible</p>
            <p className="text-sm text-muted-foreground">
              Ajoutez d’abord au moins un étudiant avant d’ouvrir un
              dossier de voyage.
            </p>
          </div>
        ) : (
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
              <Label htmlFor="studentId">Étudiant *</Label>
              <Select name="studentId">
                <SelectTrigger
                  id="studentId"
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
                <Label htmlFor="destination">Pays de destination *</Label>
                <Select name="destination">
                  <SelectTrigger
                    id="destination"
                    className="w-full"
                    aria-invalid={Boolean(fieldErrors.destination)}
                  >
                    <SelectValue placeholder="Sélectionner un pays" />
                  </SelectTrigger>
                  <SelectContent>
                    {DESTINATION_OPTIONS.map((country) => (
                      <SelectItem key={country} value={country}>
                        {country}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError message={fieldErrors.destination} />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="status">Statut initial</Label>
                <Select name="status" defaultValue="DOSSIER_PREPARATION">
                  <SelectTrigger id="status" className="w-full">
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
              <Label htmlFor="targetProgram">Programme visé</Label>
              <Input
                id="targetProgram"
                name="targetProgram"
                placeholder="Ex : Ausbildung en soins infirmiers"
                maxLength={150}
                aria-invalid={Boolean(fieldErrors.targetProgram)}
              />
              <FieldError message={fieldErrors.targetProgram} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                name="notes"
                placeholder="Informations complémentaires (optionnel)"
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
                  <PlaneTakeoffIcon data-icon="inline-start" />
                )}
                {pending ? "Création..." : "Créer le dossier"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
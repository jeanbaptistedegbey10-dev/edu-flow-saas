"use client";

import * as React from "react";
import { useActionState } from "react";
import { Loader2Icon, PencilIcon } from "lucide-react";

import {
  updateTravelProcedureAction,
  type StudentOptionDTO,
  type TravelFormState,
  type TravelProcedureDTO,
  type WorkflowDTO,
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
import { cn } from "@/lib/utils";

const INITIAL_FORM_STATE: TravelFormState = { status: "idle" };

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-xs font-medium text-destructive">
      {message}
    </p>
  );
}

/** Convertit une Date en valeur « YYYY-MM-DD » pour un input date. */
function toDateInputValue(date: Date | null): string {
  if (!date) return "";
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function EditTravelDialog({
  procedure,
  students,
  workflows,
  open,
  onOpenChange,
}: {
  procedure: TravelProcedureDTO | null;
  students: StudentOptionDTO[];
  workflows: WorkflowDTO[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // Le type de candidat est dérivé du dossier à l'ouverture ; la clé React
  // (`key={procedure.id}`) sur le formulaire force son remontage quand on
  // passe d'un dossier à un autre, réinitialisant ainsi proprement l'état.
  const [candidateType, setCandidateType] = React.useState<
    "EXISTING_STUDENT" | "EXTERNAL"
  >(() =>
    procedure
      ? procedure.isExternalCandidate
        ? "EXTERNAL"
        : "EXISTING_STUDENT"
      : "EXISTING_STUDENT"
  );

  const [state, formAction, pending] = useActionState(
    async (_prevState: TravelFormState, formData: FormData) => {
      const result = await updateTravelProcedureAction(_prevState, formData);

      if (result.status === "success") {
        onOpenChange(false);
      }

      return result;
    },
    INITIAL_FORM_STATE
  );

  const fieldErrors = state.fieldErrors ?? {};

  if (!procedure) return null;

  const options = [
    {
      value: "EXISTING_STUDENT" as const,
      label: "Candidat inscrit",
      hint: "Étudiant existant",
    },
    {
      value: "EXTERNAL" as const,
      label: "Candidat externe",
      hint: "Sans compte étudiant",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Modifier le dossier</DialogTitle>
          <DialogDescription>
            Mettez à jour le candidat, la destination, le modèle de procédure
            ou les conditions financières du dossier.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} key={procedure.id} className="grid gap-4">
          <input type="hidden" name="id" value={procedure.id} />
          <input type="hidden" name="candidateType" value={candidateType} />

          {state.message && state.status === "error" && !state.fieldErrors ? (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {state.message}
            </p>
          ) : null}

          <div
            role="radiogroup"
            aria-label="Type de candidat"
            className="grid grid-cols-2 gap-2"
          >
            {options.map((option) => {
              const isActive = candidateType === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  onClick={() => setCandidateType(option.value)}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
                    isActive
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-input hover:bg-muted/50"
                  )}
                >
                  <span className="text-sm font-medium">{option.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {option.hint}
                  </span>
                </button>
              );
            })}
          </div>

          {candidateType === "EXISTING_STUDENT" ? (
            <div className="grid gap-2">
              <Label htmlFor={`studentId-${procedure.id}`}>Candidat inscrit *</Label>
              <Select name="studentId" defaultValue={procedure.studentId ?? undefined}>
                <SelectTrigger
                  id={`studentId-${procedure.id}`}
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
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor={`candidateName-${procedure.id}`}>Nom du candidat *</Label>
                <Input
                  id={`candidateName-${procedure.id}`}
                  name="candidateName"
                  defaultValue={procedure.candidateName}
                  maxLength={120}
                  aria-invalid={Boolean(fieldErrors.candidateName)}
                />
                <FieldError message={fieldErrors.candidateName} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`candidatePhone-${procedure.id}`}>Téléphone</Label>
                <Input
                  id={`candidatePhone-${procedure.id}`}
                  name="candidatePhone"
                  defaultValue={procedure.candidatePhone ?? ""}
                  maxLength={40}
                  aria-invalid={Boolean(fieldErrors.candidatePhone)}
                />
                <FieldError message={fieldErrors.candidatePhone} />
              </div>
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor={`workflowId-${procedure.id}`}>Modèle de procédure</Label>
            <Select
              name="workflowId"
              defaultValue={procedure.workflowId ?? "none"}
            >
              <SelectTrigger id={`workflowId-${procedure.id}`} className="w-full">
                <SelectValue placeholder="Sélectionner un modèle" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Aucun modèle (suivi libre)</SelectItem>
                {workflows.map((workflow) => (
                  <SelectItem key={workflow.id} value={workflow.id}>
                    {workflow.country} — {workflow.title} ({workflow.stages.length}{" "}
                    étapes)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError message={fieldErrors.workflowId} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor={`destination-${procedure.id}`}>Pays de destination *</Label>
              <Input
                id={`destination-${procedure.id}`}
                name="destination"
                defaultValue={procedure.destination}
                maxLength={100}
                aria-invalid={Boolean(fieldErrors.destination)}
              />
              <FieldError message={fieldErrors.destination} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor={`targetProgram-${procedure.id}`}>Programme visé</Label>
              <Input
                id={`targetProgram-${procedure.id}`}
                name="targetProgram"
                defaultValue={procedure.targetProgram ?? ""}
                maxLength={150}
                aria-invalid={Boolean(fieldErrors.targetProgram)}
              />
              <FieldError message={fieldErrors.targetProgram} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor={`totalCost-${procedure.id}`}>Coût total (FCFA)</Label>
              <Input
                id={`totalCost-${procedure.id}`}
                name="totalCost"
                type="number"
                min="0"
                step="1"
                defaultValue={procedure.totalCost || ""}
                aria-invalid={Boolean(fieldErrors.totalCost)}
              />
              <FieldError message={fieldErrors.totalCost} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`discount-${procedure.id}`}>Réduction (FCFA)</Label>
              <Input
                id={`discount-${procedure.id}`}
                name="discount"
                type="number"
                min="0"
                step="1"
                defaultValue={procedure.discount || ""}
                aria-invalid={Boolean(fieldErrors.discount)}
              />
              <FieldError message={fieldErrors.discount} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`deadline-${procedure.id}`}>Date limite</Label>
              <Input
                id={`deadline-${procedure.id}`}
                name="deadline"
                type="date"
                defaultValue={toDateInputValue(procedure.currentStageDeadline)}
                aria-invalid={Boolean(fieldErrors.deadline)}
              />
              <FieldError message={fieldErrors.deadline} />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor={`notes-${procedure.id}`}>Notes</Label>
            <Input
              id={`notes-${procedure.id}`}
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
                <PencilIcon data-icon="inline-start" />
              )}
              {pending ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
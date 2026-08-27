"use client";

import * as React from "react";
import { useActionState } from "react";
import {
  Loader2Icon,
  PlaneTakeoffIcon,
  PlusIcon,
  UserRoundIcon,
  UserRoundXIcon,
} from "lucide-react";

import {
  createTravelProcedureAction,
  type StudentOptionDTO,
  type TravelFormState,
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

/**
 * Bascule « Candidat inscrit / Candidat externe ».
 * Les candidats externes n'ont pas de compte étudiant : saisie directe.
 */
function CandidateTypeToggle({
  value,
  onChange,
}: {
  value: "EXISTING_STUDENT" | "EXTERNAL";
  onChange: (value: "EXISTING_STUDENT" | "EXTERNAL") => void;
}) {
  const options = [
    {
      value: "EXISTING_STUDENT" as const,
      label: "Candidat inscrit",
      hint: "Étudiant existant",
      icon: UserRoundIcon,
    },
    {
      value: "EXTERNAL" as const,
      label: "Candidat externe",
      hint: "Sans compte étudiant",
      icon: UserRoundXIcon,
    },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Type de candidat"
      className="grid grid-cols-2 gap-2"
    >
      {options.map((option) => {
        const isActive = value === option.value;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
              isActive
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-input hover:bg-muted/50"
            )}
          >
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <option.icon className="size-4" />
              {option.label}
            </span>
            <span className="text-xs text-muted-foreground">{option.hint}</span>
          </button>
        );
      })}
    </div>
  );
}

export function AddTravelDialog({
  students,
  workflows,
}: {
  students: StudentOptionDTO[];
  workflows: WorkflowDTO[];
}) {
  const [open, setOpen] = React.useState(false);
  const [candidateType, setCandidateType] = React.useState<
    "EXISTING_STUDENT" | "EXTERNAL"
  >("EXISTING_STUDENT");
  const [workflowId, setWorkflowId] = React.useState<string>("none");

  // Dernières valeurs pré-remplies automatiquement depuis le modèle choisi :
  // permet à l'utilisateur de les écraser sans être re-écrasé ensuite.
  const lastAutofillRef = React.useRef<{ destination: string; cost: string }>({
    destination: "",
    cost: "",
  });

  const [state, formAction, pending] = useActionState(
    async (_prevState: TravelFormState, formData: FormData) => {
      const result = await createTravelProcedureAction(_prevState, formData);

      if (result.status === "success") {
        setOpen(false);
        setCandidateType("EXISTING_STUDENT");
        setWorkflowId("none");
      }

      return result;
    },
    INITIAL_FORM_STATE
  );

  const fieldErrors = state.fieldErrors ?? {};

  /** Sélection d'un modèle : pré-remplit destination + coût de base. */
  const handleWorkflowChange = (value: string) => {
    setWorkflowId(value);

    const form = document.querySelector<HTMLFormElement>("#add-travel-form");
    if (!form) return;

    const destinationInput = form.elements.namedItem(
      "destination"
    ) as HTMLInputElement | null;
    const costInput = form.elements.namedItem(
      "totalCost"
    ) as HTMLInputElement | null;

    // Restaure les champs précédemment auto-remplis avant d'appliquer le nouveau.
    if (
      destinationInput &&
      lastAutofillRef.current.destination &&
      destinationInput.value === lastAutofillRef.current.destination
    ) {
      destinationInput.value = "";
    }
    if (
      costInput &&
      lastAutofillRef.current.cost &&
      costInput.value === lastAutofillRef.current.cost
    ) {
      costInput.value = "";
    }

    if (value !== "none") {
      const workflow = workflows.find((w) => w.id === value);
      if (workflow) {
        if (destinationInput && !destinationInput.value) {
          destinationInput.value = workflow.country;
          lastAutofillRef.current.destination = workflow.country;
        }
        if (costInput && !costInput.value && workflow.baseCost > 0) {
          costInput.value = String(workflow.baseCost);
          lastAutofillRef.current.cost = String(workflow.baseCost);
        }
      }
    } else {
      lastAutofillRef.current = { destination: "", cost: "" };
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon data-icon="inline-start" />
          Nouveau dossier
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Ouvrir un dossier de voyage</DialogTitle>
          <DialogDescription>
            Choisissez un candidat inscrit ou saisissez un candidat externe,
            puis associez un modèle de procédure pour suivre sa progression.
          </DialogDescription>
        </DialogHeader>

        <form id="add-travel-form" action={formAction} className="grid gap-4">
          <input type="hidden" name="candidateType" value={candidateType} />

          {state.message && state.status === "error" && !state.fieldErrors ? (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {state.message}
            </p>
          ) : null}

          <div className="grid gap-2">
            <Label>Type de candidat</Label>
            <CandidateTypeToggle value={candidateType} onChange={setCandidateType} />
          </div>

          {candidateType === "EXISTING_STUDENT" ? (
            <div className="grid gap-2">
              <Label htmlFor="studentId">Candidat inscrit *</Label>
              <Select name="studentId">
                <SelectTrigger
                  id="studentId"
                  className="w-full"
                  aria-invalid={Boolean(fieldErrors.studentId)}
                >
                  <SelectValue placeholder="Sélectionner un étudiant" />
                </SelectTrigger>
                <SelectContent>
                  {students.length === 0 ? (
                    <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                      Aucun étudiant éligible au voyage
                    </div>
                  ) : (
                    students.map((student) => (
                      <SelectItem key={student.id} value={student.id}>
                        {student.firstName} {student.lastName} (
                        {student.studentCode})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <FieldError message={fieldErrors.studentId} />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="candidateName">Nom du candidat *</Label>
                <Input
                  id="candidateName"
                  name="candidateName"
                  placeholder="Ex : Ibrahim Bakayoko"
                  maxLength={120}
                  aria-invalid={Boolean(fieldErrors.candidateName)}
                />
                <FieldError message={fieldErrors.candidateName} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="candidatePhone">Téléphone</Label>
                <Input
                  id="candidatePhone"
                  name="candidatePhone"
                  placeholder="+225 07 00 00 00 00"
                  maxLength={40}
                  aria-invalid={Boolean(fieldErrors.candidatePhone)}
                />
                <FieldError message={fieldErrors.candidatePhone} />
              </div>
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="workflowId">Modèle de procédure</Label>
            <Select name="workflowId" value={workflowId} onValueChange={handleWorkflowChange}>
              <SelectTrigger id="workflowId" className="w-full">
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
              <Label htmlFor="destination">Pays de destination *</Label>
              <Input
                id="destination"
                name="destination"
                placeholder="Ex : Allemagne"
                maxLength={100}
                aria-invalid={Boolean(fieldErrors.destination)}
              />
              <FieldError message={fieldErrors.destination} />
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
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="totalCost">Coût de la procédure (FCFA)</Label>
              <Input
                id="totalCost"
                name="totalCost"
                type="number"
                min="0"
                step="1"
                placeholder="850000"
                aria-invalid={Boolean(fieldErrors.totalCost)}
              />
              <FieldError message={fieldErrors.totalCost} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="discount">Réduction (FCFA)</Label>
              <Input
                id="discount"
                name="discount"
                type="number"
                min="0"
                step="1"
                placeholder="0"
                aria-invalid={Boolean(fieldErrors.discount)}
              />
              <FieldError message={fieldErrors.discount} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="deadline">Date limite (étape en cours)</Label>
              <Input
                id="deadline"
                name="deadline"
                type="date"
                aria-invalid={Boolean(fieldErrors.deadline)}
              />
              <FieldError message={fieldErrors.deadline} />
            </div>
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
      </DialogContent>
    </Dialog>
  );
}
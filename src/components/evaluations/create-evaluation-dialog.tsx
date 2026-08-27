"use client";

import * as React from "react";
import { useActionState } from "react";
import {
  CalendarDaysIcon,
  LanguagesIcon,
  Loader2Icon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";

import {
  createEvaluationAction,
  type CreateEvaluationFormState,
  type EvaluationClassDTO,
} from "@/actions/evaluations";
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

const INITIAL_FORM_STATE: CreateEvaluationFormState = { status: "idle" };

/** Ligne de module éditable dans le formulaire de création. */
type ModuleRow = {
  key: string;
  name: string;
  maxScore: string;
  passingScore: string;
};

let rowKeyCounter = 0;

function nextRowKey(): string {
  rowKeyCounter += 1;
  return `row-${rowKeyCounter}-${Date.now()}`;
}

function emptyRow(): ModuleRow {
  return {
    key: nextRowKey(),
    name: "",
    maxScore: "100",
    passingScore: "60",
  };
}

/** Préréglage : compétences évaluées d'un cours de langues (barème /100). */
const LANGUAGE_SKILLS_PRESET: Array<Pick<ModuleRow, "name" | "maxScore" | "passingScore">> =
  [
    { name: "Lesen", maxScore: "100", passingScore: "60" },
    { name: "Hören", maxScore: "100", passingScore: "60" },
    { name: "Schreiben", maxScore: "100", passingScore: "60" },
    { name: "Sprechen", maxScore: "100", passingScore: "60" },
  ];

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-xs font-medium text-destructive">
      {message}
    </p>
  );
}

export function CreateEvaluationDialog({
  classes,
  defaultClassId,
  onCreated,
}: {
  classes: EvaluationClassDTO[];
  /** Classe présélectionnée dans le sélecteur du formulaire. */
  defaultClassId?: string;
  /** Déclenché après une création réussie (rechargement de la liste). */
  onCreated?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [rows, setRows] = React.useState<ModuleRow[]>([emptyRow()]);

  // Réinitialise les lignes de modules à chaque ouverture de la modale.
  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);

    if (nextOpen) {
      setRows([emptyRow()]);
    }
  };

  const [state, formAction, pending] = useActionState(
    async (_prevState: CreateEvaluationFormState, formData: FormData) => {
      const result = await createEvaluationAction(_prevState, formData);

      if (result.status === "success") {
        setOpen(false);
        onCreated?.();
      }

      return result;
    },
    INITIAL_FORM_STATE
  );

  const fieldErrors = state.fieldErrors ?? {};

  /** Applique le préréglage « compétences de langues » aux lignes. */
  const applyLanguagePreset = () => {
    setRows(
      LANGUAGE_SKILLS_PRESET.map((preset) => ({
        ...preset,
        key: nextRowKey(),
      }))
    );
  };

  const updateRow = (key: string, patch: Partial<Omit<ModuleRow, "key">>) => {
    setRows((previous) =>
      previous.map((row) => (row.key === key ? { ...row, ...patch } : row))
    );
  };

  const removeRow = (key: string) => {
    setRows((previous) =>
      previous.length > 1
        ? previous.filter((row) => row.key !== key)
        : previous
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon data-icon="inline-start" />
          Nouvelle session d’évaluation
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nouvelle session d’évaluation</DialogTitle>
          <DialogDescription>
            Créez un examen interne pour une classe et définissez les modules
            évalués avec leur barème et leur seuil de validation.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4">
          {state.message && state.status === "error" ? (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {state.message}
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2 sm:col-span-1">
              <Label htmlFor="evaluation-class">Classe *</Label>
              <Select name="classId" defaultValue={defaultClassId}>
                <SelectTrigger id="evaluation-class" className="w-full">
                  <SelectValue placeholder="Sélectionner une classe" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((klass) => (
                    <SelectItem key={klass.id} value={klass.id}>
                      {klass.name} ({klass.courseCode})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={fieldErrors.classId} />
            </div>

            <div className="grid gap-2 sm:col-span-1">
              <Label htmlFor="evaluation-title">Intitulé de l’examen *</Label>
              <Input
                id="evaluation-title"
                name="title"
                placeholder="Ex : Examen Continu N°1"
                maxLength={200}
                required
                aria-invalid={Boolean(fieldErrors.title)}
              />
              <FieldError message={fieldErrors.title} />
            </div>

            <div className="grid gap-2 sm:col-span-1">
              <Label htmlFor="evaluation-date">Date de l’examen *</Label>
              <Input
                id="evaluation-date"
                name="date"
                type="date"
                required
                aria-invalid={Boolean(fieldErrors.date)}
              />
              <FieldError message={fieldErrors.date} />
            </div>
          </div>

          {/* Modules évalués */}
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>Modules évalués *</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={applyLanguagePreset}
              >
                <LanguagesIcon data-icon="inline-start" />
                Préréglage langues
              </Button>
            </div>
            <FieldError message={fieldErrors.modules} />

            <input
              type="hidden"
              name="moduleCount"
              value={rows.length}
            />

            <div className="grid gap-2">
              {rows.map((row, index) => (
                <div
                  key={row.key}
                  className="grid items-center gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_110px_110px_auto]"
                >
                  <div className="grid gap-1">
                    <Label
                      htmlFor={`module-name-${index}`}
                      className="text-xs text-muted-foreground"
                    >
                      Module {index + 1}
                    </Label>
                    <Input
                      id={`module-name-${index}`}
                      name={`moduleName_${index}`}
                      value={row.name}
                      onChange={(event) =>
                        updateRow(row.key, { name: event.target.value })
                      }
                      placeholder="Ex : Lesen, Hören..."
                      maxLength={100}
                    />
                  </div>

                  <div className="grid gap-1">
                    <Label
                      htmlFor={`module-max-${index}`}
                      className="text-xs text-muted-foreground"
                    >
                      Barème
                    </Label>
                    <Input
                      id={`module-max-${index}`}
                      name={`moduleMax_${index}`}
                      type="number"
                      min="1"
                      max="1000"
                      step="any"
                      value={row.maxScore}
                      onChange={(event) =>
                        updateRow(row.key, { maxScore: event.target.value })
                      }
                    />
                  </div>

                  <div className="grid gap-1">
                    <Label
                      htmlFor={`module-passing-${index}`}
                      className="text-xs text-muted-foreground"
                    >
                      Seuil
                    </Label>
                    <Input
                      id={`module-passing-${index}`}
                      name={`modulePassing_${index}`}
                      type="number"
                      min="0"
                      step="any"
                      value={row.passingScore}
                      onChange={(event) =>
                        updateRow(row.key, {
                          passingScore: event.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="flex justify-end pt-4 sm:pt-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Supprimer le module ${index + 1}`}
                      onClick={() => removeRow(row.key)}
                      disabled={rows.length <= 1}
                    >
                      <Trash2Icon className="size-4 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => setRows((previous) => [...previous, emptyRow()])}
              disabled={rows.length >= 20}
            >
              <PlusIcon data-icon="inline-start" />
              Ajouter un module
            </Button>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                Annuler
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending || classes.length === 0}>
              {pending ? (
                <Loader2Icon data-icon="inline-start" className="animate-spin" />
              ) : (
                <CalendarDaysIcon data-icon="inline-start" />
              )}
              {pending ? "Création..." : "Créer la session"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
"use client";

import * as React from "react";
import { useActionState } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BadgeCheckIcon,
  FileStackIcon,
  LayersIcon,
  Loader2Icon,
  MapPinIcon,
  PencilIcon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
} from "lucide-react";

import {
  createWorkflowAction,
  deleteWorkflowAction,
  saveWorkflowStagesAction,
  updateWorkflowAction,
  type WorkflowDTO,
  type WorkflowFormState,
  type WorkflowStageInput,
} from "@/actions/travels";
import { EntityActionsMenu } from "@/components/shared/entity-actions-menu";
import { WorkflowScheduleButton } from "@/components/travels/workflow-schedule-button";
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
import { Textarea } from "@/components/ui/textarea";

const INITIAL_WORKFLOW_FORM_STATE: WorkflowFormState = { status: "idle" };

const amountFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 0,
});

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-xs font-medium text-destructive">
      {message}
    </p>
  );
}

// --------------------------------------
// Modale formulaire : création / édition des métadonnées d'un modèle
// --------------------------------------

function WorkflowFormDialog({
  workflow,
  open,
  onOpenChange,
  trigger,
}: {
  /** Modèle à éditer ; null = création. */
  workflow?: WorkflowDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: React.ReactNode;
}) {
  const isEdit = Boolean(workflow);

  const [state, formAction, pending] = useActionState(
    async (_prevState: WorkflowFormState, formData: FormData) => {
      const result = isEdit
        ? await updateWorkflowAction(_prevState, formData)
        : await createWorkflowAction(_prevState, formData);

      if (result.status === "success") {
        onOpenChange(false);
      }

      return result;
    },
    INITIAL_WORKFLOW_FORM_STATE
  );

  const fieldErrors = state.fieldErrors ?? {};

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Modifier le modèle" : "Nouveau modèle de procédure"}
          </DialogTitle>
          <DialogDescription>
            Définissez le pays/programme et le coût de base proposé par défaut
            lors de l’ouverture d’un dossier.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4">
          {isEdit && workflow ? (
            <input type="hidden" name="id" value={workflow.id} />
          ) : null}

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
              <Label htmlFor="wf-country">Pays / Programme *</Label>
              <Input
                id="wf-country"
                name="country"
                placeholder="Ex : Espagne"
                defaultValue={workflow?.country ?? ""}
                maxLength={80}
                aria-invalid={Boolean(fieldErrors.country)}
              />
              <FieldError message={fieldErrors.country} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="wf-base-cost">Coût de base (FCFA)</Label>
              <Input
                id="wf-base-cost"
                name="baseCost"
                type="number"
                min="0"
                step="1"
                placeholder="750000"
                defaultValue={
                  workflow && workflow.baseCost > 0 ? workflow.baseCost : ""
                }
                aria-invalid={Boolean(fieldErrors.baseCost)}
              />
              <FieldError message={fieldErrors.baseCost} />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="wf-title">Titre du modèle *</Label>
            <Input
              id="wf-title"
              name="title"
              placeholder="Ex : Procédure Espagne — Visa étudiant"
              defaultValue={workflow?.title ?? ""}
              maxLength={150}
              aria-invalid={Boolean(fieldErrors.title)}
            />
            <FieldError message={fieldErrors.title} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="wf-description">Description</Label>
            <Textarea
              id="wf-description"
              name="description"
              placeholder="Résumé de l'accompagnement proposé…"
              defaultValue={workflow?.description ?? ""}
              rows={3}
              maxLength={500}
              aria-invalid={Boolean(fieldErrors.description)}
            />
            <FieldError message={fieldErrors.description} />
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
      </DialogContent>
    </Dialog>
  );
}

// --------------------------------------
// Éditeur d'étapes : ajout, modification, réordonnancement, suppression
// --------------------------------------

type EditableStage = {
  key: string;
  title: string;
  documentsText: string;
};

let stageKeyCounter = 0;
function nextStageKey(): string {
  stageKeyCounter += 1;
  return `stage-${stageKeyCounter}-${Date.now()}`;
}

function StagesEditorDialog({
  workflow,
  open,
  onOpenChange,
}: {
  workflow: WorkflowDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // Les étapes sont dérivées du modèle à l'ouverture ; la clé React
  // (`key={workflow?.id ?? "new"}`) sur l'élément StagesEditorDialog force
  // le remontage quand on passe d'un modèle à un autre, réinitialisant ainsi
  // proprement l'état local.
  const [stages, setStages] = React.useState<EditableStage[]>(() =>
    workflow
      ? workflow.stages.map((stage) => ({
          key: nextStageKey(),
          title: stage.title,
          documentsText: stage.requiredDocuments.join("\n"),
        }))
      : []
  );
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);

  const updateStage = (key: string, patch: Partial<EditableStage>) => {
    setStages((prev) =>
      prev.map((stage) => (stage.key === key ? { ...stage, ...patch } : stage))
    );
  };

  const moveStage = (index: number, direction: -1 | 1) => {
    setStages((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;

      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const removeStage = (key: string) => {
    setStages((prev) => prev.filter((stage) => stage.key !== key));
  };

  const addStage = () => {
    setStages((prev) => [
      ...prev,
      { key: nextStageKey(), title: "", documentsText: "" },
    ]);
  };

  const handleSave = async () => {
    if (!workflow) return;

    const payload: WorkflowStageInput[] = stages.map((stage) => ({
      title: stage.title.trim(),
      requiredDocuments: stage.documentsText
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
    }));

    setIsSaving(true);
    setError(null);

    try {
      const result = await saveWorkflowStagesAction(workflow.id, payload);

      if (result.ok) {
        setSavedAt(Date.now());
        window.setTimeout(() => onOpenChange(false), 600);
      } else {
        setError(result.message);
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Étapes du modèle — {workflow?.country ?? ""}
          </DialogTitle>
          <DialogDescription>
            Ajoutez, modifiez, réordonnez ou supprimez les étapes de la
            procédure. Chaque étape peut lister ses documents requis (une ligne
            par document).
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
        {savedAt ? (
          <p
            role="status"
            className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400"
          >
            Étapes enregistrées avec succès.
          </p>
        ) : null}

        <div className="flex flex-col gap-3">
          {stages.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1 rounded-md border border-dashed px-6 py-8 text-center">
              <LayersIcon className="size-6 text-muted-foreground" />
              <p className="text-sm font-medium">Aucune étape définie</p>
              <p className="text-sm text-muted-foreground">
                Ajoutez la première étape de cette procédure.
              </p>
            </div>
          ) : (
            stages.map((stage, index) => (
              <article
                key={stage.key}
                className="rounded-lg border bg-muted/30 p-3"
              >
                <div className="flex items-center gap-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold tabular-nums">
                    {index + 1}
                  </span>
                  <Input
                    value={stage.title}
                    onChange={(event) =>
                      updateStage(stage.key, { title: event.target.value })
                    }
                    placeholder={`Titre de l'étape ${index + 1}`}
                    maxLength={150}
                    aria-label={`Titre de l'étape ${index + 1}`}
                    className="h-9"
                  />
                  <div
                    role="group"
                    aria-label={`Déplacer l'étape ${index + 1}`}
                    className="flex shrink-0 items-center gap-0.5"
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      disabled={index === 0}
                      onClick={() => moveStage(index, -1)}
                      aria-label="Monter l'étape"
                    >
                      <ArrowUpIcon className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      disabled={index === stages.length - 1}
                      onClick={() => moveStage(index, 1)}
                      aria-label="Descendre l'étape"
                    >
                      <ArrowDownIcon className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive hover:text-destructive"
                      onClick={() => removeStage(stage.key)}
                      aria-label="Supprimer l'étape"
                    >
                      <Trash2Icon className="size-4" />
                    </Button>
                  </div>
                </div>

                <Textarea
                  value={stage.documentsText}
                  onChange={(event) =>
                    updateStage(stage.key, { documentsText: event.target.value })
                  }
                  placeholder={"Documents requis (un par ligne)\nEx : Passeport\nEx : Certificat de langue"}
                  rows={Math.max(2, Math.min(5, stage.documentsText.split("\n").length + 1))}
                  aria-label={`Documents requis de l'étape ${index + 1}`}
                  className="mt-2 resize-y text-xs"
                />
              </article>
            ))
          )}

          <Button
            type="button"
            variant="outline"
            onClick={addStage}
            disabled={stages.length >= 30}
            className="w-full border-dashed"
          >
            <PlusIcon data-icon="inline-start" />
            Ajouter une étape
          </Button>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isSaving}>
              Fermer
            </Button>
          </DialogClose>
          <Button type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <Loader2Icon data-icon="inline-start" className="animate-spin" />
            ) : (
              <SaveIcon data-icon="inline-start" />
            )}
            {isSaving ? "Sauvegarde..." : "Enregistrer les étapes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --------------------------------------
// Gestionnaire principal
// --------------------------------------

export function WorkflowsManager({ workflows }: { workflows: WorkflowDTO[] }) {
  const [formOpen, setFormOpen] = React.useState(false);
  const [editingWorkflow, setEditingWorkflow] = React.useState<WorkflowDTO | null>(null);
  const [stagesWorkflow, setStagesWorkflow] = React.useState<WorkflowDTO | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const handleDelete = async (workflow: WorkflowDTO) => {
    const result = await deleteWorkflowAction(workflow.id);
    if (!result.ok) {
      setActionError(result.message);
    }
    return { ok: result.ok, message: result.ok ? undefined : result.message };
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted-foreground">
          Les modèles définissent les étapes types d’une procédure par pays.
          Ils pré-remplissent le coût et pilotent la progression visuelle des
          dossiers candidats.
        </p>
        <Button onClick={() => setFormOpen(true)}>
          <PlusIcon data-icon="inline-start" />
          Nouveau modèle
        </Button>
      </div>

      {actionError ? (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {actionError}
        </p>
      ) : null}

      {workflows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center">
          <FileStackIcon className="size-8 text-muted-foreground/50" />
          <p className="font-medium">Aucun modèle de procédure</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Créez votre premier modèle (ex : Espagne, Italie) pour structurer
            vos procédures par étapes.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {workflows.map((workflow) => (
            <article
              key={workflow.id}
              className="group flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm transition-all duration-200 hover:shadow-md"
            >
              <header className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="flex items-center gap-1.5 font-semibold tracking-tight">
                    <MapPinIcon className="size-4 shrink-0 text-primary" />
                    {workflow.country}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {workflow.title}
                  </span>
                </div>

                <EntityActionsMenu
                  entityName={`le modèle « ${workflow.country} »`}
                  onEdit={() => {
                    setEditingWorkflow(workflow);
                    setFormOpen(true);
                  }}
                  onDelete={() => handleDelete(workflow)}
                />
              </header>

              {workflow.description ? (
                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                  {workflow.description}
                </p>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200/60 bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-400">
                  <LayersIcon className="size-3" />
                  {workflow.stages.length} étape{workflow.stages.length > 1 ? "s" : ""}
                </span>
                <span className="rounded-full border border-border bg-muted px-2 py-0.5 font-medium text-foreground tabular-nums">
                  Base : {amountFormatter.format(workflow.baseCost)} FCFA
                </span>
                {workflow.isDefault ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/60 bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400">
                    <BadgeCheckIcon className="size-3" />
                    Par défaut
                  </span>
                ) : null}
              </div>

              {/* Aperçu compact des premières étapes */}
              {workflow.stages.length > 0 ? (
                <ol className="mt-3 space-y-1 border-t pt-3 text-xs text-muted-foreground">
                  {workflow.stages.slice(0, 3).map((stage, index) => (
                    <li key={stage.id} className="flex items-center gap-1.5">
                      <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold tabular-nums">
                        {index + 1}
                      </span>
                      <span className="truncate">{stage.title}</span>
                    </li>
                  ))}
                  {workflow.stages.length > 3 ? (
                    <li className="pl-5.5 italic">
                      + {workflow.stages.length - 3} autre
                      {workflow.stages.length - 3 > 1 ? "s" : ""} étape
                      {workflow.stages.length - 3 > 1 ? "s" : ""}…
                    </li>
                  ) : null}
                </ol>
              ) : null}

              <footer className="mt-auto flex flex-col gap-2 pt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setStagesWorkflow(workflow)}
                >
                  <PencilIcon data-icon="inline-start" />
                  Gérer les étapes
                </Button>
                <WorkflowScheduleButton
                  workflowId={workflow.id}
                  workflowLabel={`${workflow.country} — ${workflow.title}`}
                  baseCost={workflow.baseCost}
                />
              </footer>
            </article>
          ))}
        </div>
      )}

      {/* Modale création / édition des métadonnées */}
      <WorkflowFormDialog
        workflow={editingWorkflow}
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditingWorkflow(null);
        }}
      />

      {/* Éditeur d'étapes */}
      <StagesEditorDialog
        key={stagesWorkflow?.id ?? "new"}
        workflow={stagesWorkflow}
        open={stagesWorkflow !== null}
        onOpenChange={(open) => {
          if (!open) setStagesWorkflow(null);
        }}
      />
    </div>
  );
}
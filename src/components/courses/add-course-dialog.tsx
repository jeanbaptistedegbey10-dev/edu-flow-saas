"use client";

import * as React from "react";
import { useActionState } from "react";
import { BookPlusIcon, Loader2Icon, PlusIcon } from "lucide-react";

import {
  createCourseAction,
  type CourseFormState,
} from "@/actions/courses";
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

const INITIAL_FORM_STATE: CourseFormState = { status: "idle" };

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-xs font-medium text-destructive">
      {message}
    </p>
  );
}

export function AddCourseDialog() {
  const [open, setOpen] = React.useState(false);

  // Enveloppe l'action serveur pour fermer la modale dès que la création réussit.
  const [state, formAction, pending] = useActionState(
    async (_prevState: CourseFormState, formData: FormData) => {
      const result = await createCourseAction(_prevState, formData);

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
          Nouveau cours
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajouter un cours</DialogTitle>
          <DialogDescription>
            Renseignez les informations du nouveau cours. Le code doit être
            unique au sein de votre organisation (ex : GER-A1, DEV-FULL).
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="title">Intitulé *</Label>
              <Input
                id="title"
                name="title"
                placeholder="Ex : Anglais niveau A1"
                maxLength={150}
                required
                aria-invalid={Boolean(fieldErrors.title)}
              />
              <FieldError message={fieldErrors.title} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="code">Code *</Label>
              <Input
                id="code"
                name="code"
                placeholder="Ex : GER-A1 ou DEV-FULL"
                maxLength={20}
                className="uppercase"
                required
                aria-invalid={Boolean(fieldErrors.code)}
              />
              <FieldError message={fieldErrors.code} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="price">Prix (FCFA) *</Label>
              <Input
                id="price"
                name="price"
                type="number"
                inputMode="decimal"
                min="1"
                step="any"
                placeholder="Ex : 150000"
                required
                aria-invalid={Boolean(fieldErrors.price)}
              />
              <FieldError message={fieldErrors.price} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="durationWeeks">Durée (semaines) *</Label>
              <Input
                id="durationWeeks"
                name="durationWeeks"
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                placeholder="Ex : 12"
                required
                aria-invalid={Boolean(fieldErrors.durationWeeks)}
              />
              <FieldError message={fieldErrors.durationWeeks} />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              name="description"
              placeholder="Ex : Formation d'allemand pour débutants (optionnel)"
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
                <BookPlusIcon data-icon="inline-start" />
              )}
              {pending ? "Création..." : "Créer le cours"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
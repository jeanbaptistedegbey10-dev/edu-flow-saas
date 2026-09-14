"use client";

import * as React from "react";
import { useActionState } from "react";
import {
  CalendarIcon,
  Loader2Icon,
  PlusIcon,
} from "lucide-react";

import {
  generatePaymentSchedule,
} from "@/lib/actions/schedules";
import type { StudentOptionDTO } from "@/actions/payments";
import { Button } from "@/components/ui/button";
import {
  Dialog,
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

type FormState = {
  status: "idle" | "success" | "error";
  message?: string;
};

const INITIAL_STATE: FormState = { status: "idle" };

export function CreateScheduleDialog({
  students,
}: {
  students: StudentOptionDTO[];
}) {
  const [open, setOpen] = React.useState(false);

  const [state, formAction, pending] = useActionState<FormState, FormData>(
    async (_prev: FormState, formData: FormData): Promise<FormState> => {
      const studentId = formData.get("studentId") as string;
      const totalAmount = Number(formData.get("totalAmount"));
      const installmentsCount = Number(formData.get("installmentsCount"));
      const startDateRaw = formData.get("startDate") as string;

      if (!studentId) {
        return { status: "error", message: "Veuillez sélectionner un étudiant." };
      }
      if (isNaN(totalAmount) || totalAmount <= 0) {
        return { status: "error", message: "Montant invalide." };
      }
      if (isNaN(installmentsCount) || installmentsCount < 1 || installmentsCount > 12) {
        return { status: "error", message: "Le nombre de tranches doit être entre 1 et 12." };
      }
      if (!startDateRaw) {
        return { status: "error", message: "Veuillez saisir une date de début." };
      }

      const startDate = new Date(startDateRaw + "T00:00:00Z");
      const result = await generatePaymentSchedule(studentId, totalAmount, installmentsCount, startDate);

      if (result.ok) {
        setOpen(false);
        return { status: "success", message: "Échéancier créé avec succès." };
      }
      return { status: "error", message: result.message };
    },
    INITIAL_STATE
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <PlusIcon data-icon="inline-start" />
          Échéancier
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Créer un échéancier de paiement</DialogTitle>
          <DialogDescription>
            Découpez la dette d'un étudiant en plusieurs tranches avec des dates d'échéance.
          </DialogDescription>
        </DialogHeader>
        {students.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Aucun étudiant disponible. Ajoutez d'abord un étudiant.
          </div>
        ) : (
          <form action={formAction} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="schedule-student">Étudiant *</Label>
              <Select name="studentId" required>
                <SelectTrigger id="schedule-student">
                  <SelectValue placeholder="Sélectionner un étudiant" />
                </SelectTrigger>
                <SelectContent>
                  {students.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.firstName} {s.lastName} ({s.studentCode})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="schedule-total">Montant total (FCFA) *</Label>
              <Input
                id="schedule-total"
                name="totalAmount"
                type="number"
                min={1}
                step={1}
                placeholder="Ex : 300000"
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="schedule-count">Nombre de tranches *</Label>
                <Input
                  id="schedule-count"
                  name="installmentsCount"
                  type="number"
                  min={1}
                  max={12}
                  defaultValue={3}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="schedule-start">
                  <CalendarIcon className="inline size-3.5" /> Première échéance *
                </Label>
                <Input id="schedule-start" name="startDate" type="date" required />
              </div>
            </div>
            {state.message && state.status === "error" && (
              <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {state.message}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                Annuler
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : <PlusIcon data-icon="inline-start" />}
                {pending ? "Création..." : "Créer l'échéancier"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

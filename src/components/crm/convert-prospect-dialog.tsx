"use client";

import * as React from "react";
import { useFormState } from "react-dom";
import { Loader2Icon } from "lucide-react";

import type { ClassOptionDTO } from "@/actions/classes";
import { convertProspectToEnrolled } from "@/lib/actions/crm";
import type { StudentDTO } from "@/actions/students";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToastNotification } from "@/components/ui/toast";

type FormState = {
  status: "idle" | "success" | "error";
  message?: string;
};

const INITIAL_STATE: FormState = { status: "idle" };

export function ConvertProspectDialog({
  student,
  classes,
  open,
  onOpenChange,
}: {
  student: StudentDTO | null;
  classes: ClassOptionDTO[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [selectedClassId, setSelectedClassId] = React.useState("");
  const [toast, setToast] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const handleSubmit = async () => {
    if (!student || !selectedClassId) return;
    setPending(true);
    const result = await convertProspectToEnrolled(student.id, selectedClassId);
    setPending(false);
    if (result.ok) {
      setToast("Prospect converti en inscrit !");
      onOpenChange(false);
    } else {
      setToast(result.message);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Convertir en inscrit</DialogTitle>
            <DialogDescription>
              {student
                ? `Inscrire ${student.firstName} ${student.lastName} dans une classe.`
                : "Sélectionnez un prospect."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Classe d&apos;affectation</label>
              <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir une classe…" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((cls) => (
                    <SelectItem key={cls.id} value={cls.id}>
                      {cls.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Annuler
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!selectedClassId || pending}
            >
              {pending && <Loader2Icon className="mr-2 size-4 animate-spin" />}
              Confirmer l&apos;inscription
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ToastNotification message={toast} onClose={() => setToast(null)} />
    </>
  );
}

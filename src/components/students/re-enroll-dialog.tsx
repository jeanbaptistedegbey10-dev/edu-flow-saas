"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, UserPlusIcon } from "lucide-react";

import { reEnrollStudentAction } from "@/actions/students";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToastNotification } from "@/components/ui/toast";

/** Option minimale de classe pour la réinscription. */
export type ReEnrollClassOption = {
  id: string;
  name: string;
  courseTitle: string;
};

/**
 * Bouton + modale « Inscrire dans une nouvelle classe » (réinscription) :
 * l'inscription courante de l'élève est clôturée (statut PROMOTED_MANUALLY,
 * historique conservé) et une nouvelle inscription ACTIVE est créée dans la
 * classe choisie. Les classes archivées ne sont pas proposées.
 */
export function ReEnrollDialog({
  studentId,
  studentName,
  currentClassId,
  classes,
}: {
  studentId: string;
  studentName: string;
  /** Classe courante (présélection exclue de la liste). */
  currentClassId: string | null;
  /** Classes disponibles (hors ARCHIVED). */
  classes: ReEnrollClassOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [selectedClassId, setSelectedClassId] = React.useState<string>("");
  const [toast, setToast] = React.useState<string | null>(null);
  const [toastTone, setToastTone] = React.useState<"success" | "error">(
    "success"
  );

  const availableClasses = classes.filter(
    (klass) => klass.id !== currentClassId
  );

  const handleSubmit = () => {
    if (!selectedClassId) return;

    setPending(true);
    reEnrollStudentAction({ studentId, newClassId: selectedClassId })
      .then((result) => {
        setToastTone(result.ok ? "success" : "error");
        setToast(result.message);
        if (result.ok) {
          setOpen(false);
          setSelectedClassId("");
          router.refresh();
        }
      })
      .catch(() => {
        setToastTone("error");
        setToast("Une erreur est survenue lors de la réinscription.");
      })
      .finally(() => setPending(false));
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <UserPlusIcon data-icon="inline-start" />
            Inscrire dans une nouvelle classe
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Réinscription de {studentName}</DialogTitle>
            <DialogDescription>
              Choisissez la classe d&apos;accueil. L&apos;inscription actuelle
              sera clôturée et conservée dans l&apos;historique de l&apos;élève
              (aucune donnée n&apos;est écrasée).
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Select
              value={selectedClassId}
              onValueChange={setSelectedClassId}
              disabled={pending}
            >
              <SelectTrigger aria-label="Classe cible">
                <SelectValue placeholder="Sélectionner une classe…" />
              </SelectTrigger>
              <SelectContent>
                {availableClasses.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    Aucune autre classe disponible.
                  </div>
                ) : (
                  availableClasses.map((klass) => (
                    <SelectItem key={klass.id} value={klass.id}>
                      {klass.name} — {klass.courseTitle}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Annuler
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={pending || !selectedClassId}
            >
              {pending ? (
                <Loader2Icon data-icon="inline-start" className="animate-spin" />
              ) : (
                <UserPlusIcon data-icon="inline-start" />
              )}
              Confirmer la réinscription
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ToastNotification
        message={toast}
        tone={toastTone}
        onClose={() => setToast(null)}
      />
    </>
  );
}

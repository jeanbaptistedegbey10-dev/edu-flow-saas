"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, RepeatIcon, SearchIcon } from "lucide-react";

import { reEnrollStudentAction } from "@/actions/students";
import type { ClassOptionDTO } from "@/actions/classes";
import type { StudentDTO } from "@/actions/students";
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
import { ToastNotification } from "@/components/ui/toast";

/**
 * Modale « Réinscription » du module Inscription : recherche d'un étudiant
 * existant (nom, prénom, téléphone), réinscription dans une nouvelle classe
 * pour une nouvelle année académique (nouvel `Enrollment` + échéancier dédié).
 */
export function GlobalReEnrollDialog({
  students,
  classes,
  defaultAcademicYear,
}: {
  students: StudentDTO[];
  classes: ClassOptionDTO[];
  defaultAcademicYear: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [selectedStudentId, setSelectedStudentId] = React.useState("");
  const [selectedClassId, setSelectedClassId] = React.useState("");
  const [academicYear, setAcademicYear] = React.useState(defaultAcademicYear);
  const [toast, setToast] = React.useState<string | null>(null);
  const [toastTone, setToastTone] = React.useState<"success" | "error">("success");

  const availableClasses = React.useMemo(
    () => classes.filter((klass) => klass.status !== "ARCHIVED"),
    [classes]
  );

  const normalizedSearch = search.trim().toLowerCase();
  const matches = React.useMemo(() => {
    if (!normalizedSearch) return students.slice(0, 8);
    return students
      .filter((student) =>
        `${student.firstName} ${student.lastName} ${student.phone}`.toLowerCase().includes(normalizedSearch)
      )
      .slice(0, 8);
  }, [students, normalizedSearch]);

  const selectedStudent =
    students.find((student) => student.id === selectedStudentId) ?? null;

  const handleSubmit = () => {
    if (!selectedStudentId || !selectedClassId || pending) return;
    setPending(true);
    reEnrollStudentAction({
      studentId: selectedStudentId,
      newClassId: selectedClassId,
      academicYear: academicYear.trim() || undefined,
    })
      .then((result) => {
        setToastTone(result.ok ? "success" : "error");
        setToast(result.message);
        if (result.ok) {
          setOpen(false);
          setSearch("");
          setSelectedStudentId("");
          setSelectedClassId("");
          setAcademicYear(defaultAcademicYear);
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
          <Button type="button" variant="outline">
            <RepeatIcon data-icon="inline-start" />
            Réinscription
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Réinscription d&apos;un étudiant existant</DialogTitle>
            <DialogDescription>
              Recherchez l’étudiant (nom, prénom, téléphone), choisissez la
              nouvelle classe qui va démarrer et l’année académique. Un nouvel
              échéancier dédié sera généré pour cette classe.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="reEnrollSearch">Rechercher *</Label>
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="reEnrollSearch"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nom, prénom ou téléphone…"
                  className="pl-9"
                  disabled={pending}
                />
              </div>
              <Select value={selectedStudentId} onValueChange={setSelectedStudentId} disabled={pending}>
                <SelectTrigger aria-label="Étudiant à réinscrire">
                  <SelectValue placeholder="Sélectionner un étudiant…" />
                </SelectTrigger>
                <SelectContent>
                  {matches.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">Aucun étudiant trouvé.</div>
                  ) : (
                    matches.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.firstName} {s.lastName} — {s.phone}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="reEnrollClass">Nouvelle classe *</Label>
                <Select value={selectedClassId} onValueChange={setSelectedClassId} disabled={pending}>
                  <SelectTrigger id="reEnrollClass">
                    <SelectValue placeholder="Sélectionner…" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableClasses.map((k) => (
                      <SelectItem key={k.id} value={k.id}>
                        {k.name} — {k.courseTitle}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="reEnrollYear">Année académique *</Label>
                <Input
                  id="reEnrollYear"
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                  maxLength={20}
                  disabled={pending}
                />
              </div>
            </div>
            {selectedStudent?.currentClassName ? (
              <p className="text-xs text-muted-foreground">Classe actuelle : {selectedStudent.currentClassName}.</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Annuler
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={pending || !selectedStudentId || !selectedClassId || academicYear.trim().length === 0}
            >
              {pending ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : <RepeatIcon data-icon="inline-start" />}
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ToastNotification message={toast} tone={toastTone} onClose={() => setToast(null)} />
    </>
  );
}


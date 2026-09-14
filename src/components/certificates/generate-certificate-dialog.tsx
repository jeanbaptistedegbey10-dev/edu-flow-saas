"use client";

import * as React from "react";
import { Loader2Icon } from "lucide-react";

import type { StudentDTO } from "@/actions/students";
import type { CourseDTO } from "@/actions/courses";
import { generateCertificate } from "@/lib/actions/certificates";
import { Button } from "@/components/ui/button";
import {
  Dialog,
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
import { ToastNotification } from "@/components/ui/toast";

export function GenerateCertificateDialog({
  students,
  courses,
  open,
  onOpenChange,
  onGenerated,
}: {
  students: StudentDTO[];
  courses: CourseDTO[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerated?: () => void;
}) {
  const [selectedStudentId, setSelectedStudentId] = React.useState("");
  const [selectedCourseId, setSelectedCourseId] = React.useState("");
  const [level, setLevel] = React.useState("");
  const [score, setScore] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);

  const handleSubmit = async () => {
    if (!selectedStudentId || !level.trim()) {
      setToast("Veuillez remplir tous les champs requis.");
      return;
    }
    setPending(true);
    const scoreValue = score ? Number(score) : undefined;
    const result = await generateCertificate(
      selectedStudentId,
      selectedCourseId || null,
      level,
      scoreValue
    );
    setPending(false);
    if (result.ok) {
      setToast("Certificat généré avec succès !");
      onOpenChange(false);
      onGenerated?.();
      // Reset form
      setSelectedStudentId("");
      setSelectedCourseId("");
      setLevel("");
      setScore("");
    } else {
      setToast(result.message);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Générer un certificat</DialogTitle>
            <DialogDescription>
              Créez un certificat sécurisé avec QR code pour un apprenant.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="student">Apprenant</Label>
              <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
                <SelectTrigger id="student">
                  <SelectValue placeholder="Choisir un apprenant…" />
                </SelectTrigger>
                <SelectContent>
                  {students.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.firstName} {s.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="course">Cours (optionnel)</Label>
              <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
                <SelectTrigger id="course">
                  <SelectValue placeholder="Choisir un cours…" />
                </SelectTrigger>
                <SelectContent>
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="level">Niveau validé</Label>
              <Input
                id="level"
                placeholder="Ex: Allemand B2 - CECRL"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="score">Note (optionnel, 0-100)</Label>
              <Input
                id="score"
                type="number"
                min="0"
                max="100"
                placeholder="Ex: 85"
                value={score}
                onChange={(e) => setScore(e.target.value)}
              />
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
              disabled={!selectedStudentId || !level.trim() || pending}
            >
              {pending && <Loader2Icon className="mr-2 size-4 animate-spin" />}
              Générer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ToastNotification message={toast} onClose={() => setToast(null)} />
    </>
  );
}

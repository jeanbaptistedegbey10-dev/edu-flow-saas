"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  DoorOpenIcon,
  Loader2Icon,
} from "lucide-react";

import {
  getClassClosureReadiness,
  type ClosureMissingRequirement,
} from "@/actions/class-closure";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/**
 * Bouton « Terminer la classe » de l'en-tête de la vue unifiée
 * « Présences & Cahier de texte ».
 *
 * Garde-fou : un clic ne navigue PAS directement vers l'écran de clôture. Le
 * contrôle serveur `getClassClosureReadiness` est d'abord interrogé :
 * - prérequis manquants → une alerte liste explicitement ce qui bloque, et la
 *   navigation est bloquée ;
 * - prérequis satisfaits → navigation vers `/dashboard/classes/[id]/close`.
 *
 * Le même contrôle est réappliqué par `closeClassAction` : ce garde-fou côté
 * client est une aide à l'utilisateur, pas la seule barrière de sécurité.
 */
export function ClassClosureButton({
  classId,
  className,
}: {
  classId: string;
  className: string;
}) {
  const router = useRouter();
  const [checking, setChecking] = React.useState(false);
  const [blockedOpen, setBlockedOpen] = React.useState(false);
  const [missing, setMissing] = React.useState<ClosureMissingRequirement[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const handleClick = async () => {
    setChecking(true);
    setError(null);

    try {
      const readiness = await getClassClosureReadiness(classId);

      if (!readiness.ok) {
        setError(readiness.message);
        return;
      }

      if (!readiness.canClose) {
        setMissing(readiness.missingRequirements);
        setBlockedOpen(true);
        return;
      }

      router.push(`/dashboard/classes/${classId}/close`);
    } catch {
      setError(
        "Impossible de vérifier les prérequis de clôture pour le moment."
      );
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        onClick={handleClick}
        disabled={checking}
        title="Clôturer la classe (décisions de passage)"
      >
        {checking ? (
          <Loader2Icon data-icon="inline-start" className="animate-spin" />
        ) : (
          <DoorOpenIcon data-icon="inline-start" />
        )}
        {checking ? "Vérification..." : "Terminer la classe"}
      </Button>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      <AlertDialog open={blockedOpen} onOpenChange={setBlockedOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangleIcon className="size-5 text-amber-600" />
              Clôture impossible — prérequis manquants
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  La classe « {className} » ne peut pas être clôturée tant que
                  les éléments suivants ne sont pas complétés :
                </p>
                <ul className="list-disc space-y-1.5 pl-5">
                  {missing.map((requirement) => (
                    <li key={requirement.key}>{requirement.label}</li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>
              <CheckCircle2Icon data-icon="inline-start" />
              J&apos;ai compris
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

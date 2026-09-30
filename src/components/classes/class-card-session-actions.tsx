"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, PlayIcon } from "lucide-react";

import { startClassAction } from "@/actions/classes";
import { Button } from "@/components/ui/button";
import { canStartClass } from "@/lib/class-status";
import type { ClassStatus } from "@prisma/client";
import { cn } from "@/lib/utils";

/**
 * Bouton de cycle de vie affiché sur chaque carte de classe :
 * - Classe PLANIFIED : « Démarrer la classe ».
 *
 * Acte de gestion réservé aux rôles administratifs (ADMIN / SUPER_ADMIN) :
 * pour un enseignant (TEACHER) le composant ne rend RIEN — la carte conserve
 * uniquement l'accès direct aux émargements / cahier de texte.
 *
 * Les boutons « Démarrer la séance » / « Terminer la séance » sont supprimés :
 * la séance du jour est créée implicitement par la sauvegarde unifiée
 * « émargement + cahier de texte » (saveClassSessionWithAttendance).
 */
export function ClassCardSessionActions({
  classId,
  status,
  canManageLifecycle = false,
  className = "",
  onChanged,
}: {
  classId: string;
  status: ClassStatus;
  /** Actes de gestion : voir `canManageClassLifecycle` (src/lib/role.ts). */
  canManageLifecycle?: boolean;
  className?: string;
  onChanged?: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Actes de gestion : jamais rendus pour un enseignant (ni pour tout autre
  // rôle non administratif). Aucune lecture de « séance du jour » n'est
  // déclenchée : l'état local lié au démarrage / à la fin de séance est
  // complètement supprimé.
  if (!canManageLifecycle || !canStartClass(status)) return null;

  const handleStartClass = () => {
    setPending(true);
    setError(null);
    startClassAction(classId)
      .then((result) => {
        if (result.ok) {
          onChanged?.();
          router.refresh();
        } else {
          setError(result.message ?? "Impossible de démarrer cette classe.");
        }
      })
      .catch(() => setError("Impossible de démarrer cette classe."))
      .finally(() => setPending(false));
  };

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Button
        size="sm"
        onClick={handleStartClass}
        disabled={pending}
        className="w-full"
      >
        {pending ? (
          <Loader2Icon data-icon="inline-start" className="animate-spin" />
        ) : (
          <PlayIcon data-icon="inline-start" />
        )}
        Démarrer la classe
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

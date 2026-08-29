"use client";

import * as React from "react";
import { useActionState, useEffect } from "react";
import { Loader2Icon, ShieldCheckIcon } from "lucide-react";

import { saveCustomRoleAction } from "@/actions/roles";
import type { CustomRoleDTO, RoleFormState } from "@/types/roles";
import { ROLE_PERMISSIONS } from "@/lib/permissions";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const INITIAL_STATE: RoleFormState = { status: "idle" };

/**
 * Dialogue de création / édition d'un rôle personnalisé avec sa matrice de
 * cases à cocher (une case = une permission du catalogue).
 */
export function RoleFormDialog({
  open,
  onOpenChange,
  role,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: CustomRoleDTO | null;
}) {
  const [state, formAction, pending] = useActionState(
    saveCustomRoleAction,
    INITIAL_STATE
  );
  const [selected, setSelected] = React.useState<Set<string>>(
    new Set(role?.permissions ?? [])
  );

  // Synchronise la sélection avec le rôle édité à chaque ouverture du dialogue.
  useEffect(() => {
    if (open) {
      setSelected(new Set(role?.permissions ?? []));
    }
  }, [open, role]);

  // Referme le dialogue peu après un enregistrement réussi.
  useEffect(() => {
    if (state.status === "success") {
      const timer = setTimeout(() => onOpenChange(false), 800);
      return () => clearTimeout(timer);
    }
  }, [state, onOpenChange]);

  function togglePermission(key: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheckIcon className="size-5 text-indigo-600" />
            {role ? `Modifier « ${role.name} »` : "Nouveau rôle personnalisé"}
          </DialogTitle>
          <DialogDescription>
            Nommez le rôle puis cochez les permissions accordées (ex :
            Secrétaire Adjoint → Inscription + Présences).
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="roleId" value={role?.id ?? ""} />

          {state.status !== "idle" && state.message ? (
            <p
              role="alert"
              className={cn(
                "rounded-lg border px-3 py-2 text-sm",
                state.status === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                  : "border-destructive/30 bg-destructive/10 text-destructive"
              )}
            >
              {state.message}
            </p>
          ) : null}

          <div className="grid gap-1.5">
            <Label htmlFor="role-name">Nom du rôle *</Label>
            <Input
              id="role-name"
              name="name"
              required
              maxLength={60}
              placeholder="Ex : Secrétaire Adjoint"
              defaultValue={role?.name ?? ""}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="role-description">Description</Label>
            <Textarea
              id="role-description"
              name="description"
              rows={2}
              maxLength={200}
              placeholder="À quoi correspond ce rôle ?"
              defaultValue={role?.description ?? ""}
            />
          </div>

          {/* Matrice de cases à cocher des permissions */}
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label>Permissions (matrice)</Label>
              <div className="flex gap-3">
                <button
                  type="button"
                  className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                  onClick={() =>
                    setSelected(new Set(ROLE_PERMISSIONS.map((p) => p.key)))
                  }
                >
                  Tout cocher
                </button>
                <button
                  type="button"
                  className="text-xs font-medium text-muted-foreground hover:underline"
                  onClick={() => setSelected(new Set())}
                >
                  Tout décocher
                </button>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {ROLE_PERMISSIONS.map((permission) => {
                const checked = selected.has(permission.key);
                return (
                  <label
                    key={permission.key}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                      checked
                        ? "border-indigo-300 bg-indigo-50/70 dark:border-indigo-500/40 dark:bg-indigo-500/10"
                        : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-card dark:hover:bg-slate-900"
                    )}
                  >
                    <input
                      type="checkbox"
                      name="permissions"
                      value={permission.key}
                      checked={checked}
                      onChange={() => togglePermission(permission.key)}
                      className="mt-0.5 size-4 shrink-0 accent-indigo-600"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium leading-tight">
                        {permission.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {permission.description}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={pending}
              className="bg-indigo-600 text-white hover:bg-indigo-700"
            >
              {pending ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : null}
              {role ? "Enregistrer les modifications" : "Créer le rôle"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
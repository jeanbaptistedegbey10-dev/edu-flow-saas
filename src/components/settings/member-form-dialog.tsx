"use client";

import * as React from "react";
import { useActionState, useEffect } from "react";
import { Loader2Icon, UserPlusIcon, PencilIcon } from "lucide-react";
import { createMemberAction, updateMemberAction } from "@/actions/roles";
import type { CustomRoleDTO, MemberFormState } from "@/types/roles";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const INITIAL_STATE: MemberFormState = { status: "idle" };
const BASE_ROLE_OPTIONS = [
  { value: "STAFF", label: "Personnel / Secrétaire" },
  { value: "TEACHER", label: "Enseignant" },
  { value: "ADMIN", label: "Administrateur" },
];

interface MemberFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: { id: string; firstName: string; lastName: string; email: string; role: string; customRoleId: string | null } | null;
  roles: CustomRoleDTO[];
}

export function MemberFormDialog({ open, onOpenChange, member, roles }: MemberFormDialogProps) {
  const isEditing = member !== null;
  const [state, formAction, pending] = useActionState(isEditing ? updateMemberAction : createMemberAction, INITIAL_STATE);
  const fieldErrors = state.fieldErrors ?? {};

  useEffect(() => {
    if (state.status === "success") {
      const timer = setTimeout(() => onOpenChange(false), 800);
      return () => clearTimeout(timer);
    }
  }, [state, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEditing ? <PencilIcon className="size-5 text-indigo-600" /> : <UserPlusIcon className="size-5 text-indigo-600" />}
            {isEditing ? "Modifier le membre" : "Ajouter un membre"}
          </DialogTitle>
          <DialogDescription>
            {isEditing ? "Modifiez les informations et le rôle du membre." : "Créez un compte pour un nouveau membre avec un mot de passe initial."}
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          {isEditing && <input type="hidden" name="userId" value={member?.id ?? ""} />}
          {state.status !== "idle" && state.message && (
            <p role="alert" className={cn("rounded-lg border px-3 py-2 text-sm", state.status === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-destructive/30 bg-destructive/10 text-destructive")}>
              {state.message}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="member-firstName">Prénom *</Label>
              <Input id="member-firstName" name="firstName" placeholder="Ex : Claire" defaultValue={member?.firstName ?? ""} required disabled={pending} aria-invalid={Boolean(fieldErrors.firstName)} />
              {fieldErrors.firstName && <p className="text-xs text-destructive">{fieldErrors.firstName}</p>}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="member-lastName">Nom *</Label>
              <Input id="member-lastName" name="lastName" placeholder="Ex : Okou" defaultValue={member?.lastName ?? ""} required disabled={pending} aria-invalid={Boolean(fieldErrors.lastName)} />
              {fieldErrors.lastName && <p className="text-xs text-destructive">{fieldErrors.lastName}</p>}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="member-email">Email *</Label>
            <Input id="member-email" name="email" type="email" placeholder="Ex : claire@example.com" defaultValue={member?.email ?? ""} required disabled={pending} aria-invalid={Boolean(fieldErrors.email)} />
            {fieldErrors.email && <p className="text-xs text-destructive">{fieldErrors.email}</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="member-password">{isEditing ? "Nouveau mot de passe (laisser vide)" : "Mot de passe initial *"}</Label>
            <Input id="member-password" name="password" type="password" placeholder="6 caractères minimum" required={!isEditing} disabled={pending} aria-invalid={Boolean(fieldErrors.password)} />
            {fieldErrors.password && <p className="text-xs text-destructive">{fieldErrors.password}</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="member-role">Rôle de base *</Label>
            <Select name="role" defaultValue={member?.role ?? "STAFF"} required disabled={pending}>
              <SelectTrigger id="member-role"><SelectValue placeholder="Choisir un rôle" /></SelectTrigger>
              <SelectContent>
                {BASE_ROLE_OPTIONS.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
              </SelectContent>
            </Select>
            {fieldErrors.role && <p className="text-xs text-destructive">{fieldErrors.role}</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="member-customRole">Rôle personnalisé (optionnel)</Label>
            <Select name="customRoleId" defaultValue={member?.customRoleId ?? ""} disabled={pending}>
              <SelectTrigger id="member-customRole"><SelectValue placeholder="Aucun" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">Aucun</SelectItem>
                {roles.map((r) => (<SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          {isEditing && (
            <div className="flex items-center gap-2">
              <input id="member-isActive" name="isActive" type="checkbox" defaultChecked disabled={pending} className="size-4 rounded border-input accent-indigo-600" />
              <Label htmlFor="member-isActive" className="cursor-pointer font-normal">Compte actif</Label>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Annuler</Button>
            <Button type="submit" disabled={pending} className="bg-indigo-600 text-white hover:bg-indigo-700">
              {pending && <Loader2Icon className="size-4 animate-spin" />}
              {isEditing ? "Enregistrer" : "Créer le membre"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
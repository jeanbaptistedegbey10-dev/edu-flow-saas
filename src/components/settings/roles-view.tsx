"use client";

import * as React from "react";
import {
  CheckCircle2Icon,
  BanknoteIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  ShieldCheckIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UsersRoundIcon,
  UserPlusIcon,
} from "lucide-react";

import {
  assignCustomRoleAction,
  deleteCustomRoleAction,
  deleteMemberAction,
} from "@/actions/roles";
import type {
  CustomRoleDTO,
  RoleUserDTO,
  RolesOverview,
} from "@/types/roles";
import { getPermissionLabel } from "@/lib/permissions";
import { getRoleLabel } from "@/lib/role";
import { MemberFormDialog } from "@/components/settings/member-form-dialog";
import {
  MemberSalaryHistoryDialog,
  type SalaryHistoryMember,
} from "@/components/settings/member-salary-history-dialog";
import { RoleFormDialog } from "@/components/settings/role-form-dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/** Rôle de base administrateur : toutes les permissions sont déjà accordées. */
function isAdminBaseRole(role: string): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

/**
 * Vue « Rôles & Permissions » : matrice des rôles personnalisés (création,
 * édition, suppression) et attribution de ces rôles aux membres de l'équipe
 * (secrétaires / enseignants). Les administrateurs figurent aussi dans le
 * tableau avec une mention fixe « Tous les accès » — ils ne reçoivent jamais
 * de rôle personnalisé.
 */
export function RolesView({ overview }: { overview: RolesOverview }) {
  const { roles, users } = overview;

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingRole, setEditingRole] = React.useState<CustomRoleDTO | null>(
    null
  );
  const [confirmingId, setConfirmingId] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [isPending, startTransition] = React.useTransition();

  // Member dialog state
  const [memberDialogOpen, setMemberDialogOpen] = React.useState(false);
  const [editingMember, setEditingMember] = React.useState<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    customRoleId: string | null;
  } | null>(null);
  const [confirmingMemberId, setConfirmingMemberId] = React.useState<
    string | null
  >(null);
  const [memberFeedback, setMemberFeedback] = React.useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  // Volet « Historique des versements / Salaires » d'un membre.
  const [salaryHistoryMember, setSalaryHistoryMember] =
    React.useState<SalaryHistoryMember | null>(null);

  function openCreate() {
    setEditingRole(null);
    setFeedback(null);
    setDialogOpen(true);
  }

  function openEdit(role: CustomRoleDTO) {
    setEditingRole(role);
    setFeedback(null);
    setDialogOpen(true);
  }

  function handleDelete(role: CustomRoleDTO) {
    startTransition(async () => {
      const result = await deleteCustomRoleAction(role.id);
      setFeedback(result);
      setConfirmingId(null);
    });
  }

  function handleAssign(user: RoleUserDTO, roleId: string) {
    startTransition(async () => {
      const result = await assignCustomRoleAction(
        user.id,
        roleId === "none" ? null : roleId
      );
      setFeedback(result);
    });
  }

  // Member handlers
  // Nonce : incrémente à chaque ouverture pour que la `key` du dialogue le
  // remonte — l'état contrôlé et le formulaire repartent alors de zéro,
  // même entre deux créations consécutives.
  const [memberFormNonce, setMemberFormNonce] = React.useState(0);

  function openCreateMember() {
    setEditingMember(null);
    setMemberFeedback(null);
    setMemberFormNonce((nonce) => nonce + 1);
    setMemberDialogOpen(true);
  }

  function openEditMember(user: RoleUserDTO) {
    setEditingMember({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      customRoleId: user.customRoleId,
    });
    setMemberFeedback(null);
    setMemberFormNonce((nonce) => nonce + 1);
    setMemberDialogOpen(true);
  }

  function handleDeleteMember(userId: string) {
    startTransition(async () => {
      const result = await deleteMemberAction(userId);
      setMemberFeedback(result);
      setConfirmingMemberId(null);
    });
  }

  const assignedCount = users.filter(
    (user) => user.customRoleId !== null
  ).length;
  const grantedPermissionCount = roles.reduce(
    (total, role) => total + role.permissions.length,
    0
  );

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
      {/* En-tête de page */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Rôles &amp; Permissions
          </h2>
          <p className="text-base text-muted-foreground">
            Créez des rôles sur mesure et cochez les accès accordés à chaque
            équipe.
          </p>
        </div>
        <Button
          onClick={openCreate}
          className="bg-indigo-600 text-white hover:bg-indigo-700"
        >
          <PlusIcon className="size-4" />
          Nouveau rôle
        </Button>
      </div>

      {/* Retour d'expérience des actions (attribution, suppression…) */}
      {feedback ? (
        <p
          role="status"
          className={cn(
            "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
            feedback.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          )}
        >
          {feedback.ok ? (
            <CheckCircle2Icon className="size-4 shrink-0" />
          ) : (
            <TriangleAlertIcon className="size-4 shrink-0" />
          )}
          {feedback.message}
        </p>
      ) : null}

      {/* Indicateurs synthétiques */}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          {
            label: "Rôles personnalisés",
            value: String(roles.length),
            icon: ShieldCheckIcon,
          },
          {
            label: "Permissions accordées (cumul)",
            value: String(grantedPermissionCount),
            icon: CheckCircle2Icon,
          },
          {
            label: "Utilisateurs avec rôle sur mesure",
            value: `${assignedCount} / ${users.length}`,
            icon: UsersRoundIcon,
          },
        ].map(({ label, value, icon: Icon }) => (
          <div
            key={label}
            className="rounded-xl border border-slate-200/80 bg-card p-4 shadow-sm dark:border-slate-800"
          >
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Icon className="size-4 text-indigo-500" />
              {label}
            </div>
            <p className="mt-1.5 text-2xl font-semibold tracking-tight">
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Matrice des rôles existants */}
      {roles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
          <ShieldCheckIcon className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            Aucun rôle personnalisé pour le moment. Créez-en un (ex :
            «&nbsp;Secrétaire Adjoint&nbsp;») et cochez ses permissions.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {roles.map((role) => (
            <div
              key={role.id}
              className="rounded-xl border border-slate-200/80 bg-card p-4 shadow-sm transition-all duration-200 hover:shadow-md dark:border-slate-800"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    <span className="truncate">{role.name}</span>
                    {role.isSystem ? (
                      <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[11px] font-medium text-violet-600 dark:text-violet-400">
                        Système
                      </span>
                    ) : null}
                  </h3>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {role.description ?? "Aucune description."}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => openEdit(role)}
                    aria-label={`Modifier ${role.name}`}
                  >
                    <PencilIcon className="size-4" />
                  </Button>
                  {role.isSystem ? null : confirmingId === role.id ? (
                    <span className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-8 px-2 text-xs"
                        disabled={isPending}
                        onClick={() => handleDelete(role)}
                      >
                        {isPending ? (
                          <Loader2Icon className="size-3.5 animate-spin" />
                        ) : null}
                        Confirmer
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2 text-xs"
                        onClick={() => setConfirmingId(null)}
                      >
                        Annuler
                      </Button>
                    </span>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive hover:text-destructive"
                      onClick={() => setConfirmingId(role.id)}
                      aria-label={`Supprimer ${role.name}`}
                    >
                      <Trash2Icon className="size-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Permissions accordées sous forme de badges */}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {role.permissions.length === 0 ? (
                  <span className="text-xs italic text-muted-foreground">
                    Aucune permission accordée.
                  </span>
                ) : (
                  role.permissions.map((key) => (
                    <span
                      key={key}
                      className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
                    >
                      {getPermissionLabel(key)}
                    </span>
                  ))
                )}
              </div>

              <p className="mt-3 border-t pt-2 text-xs text-muted-foreground dark:border-slate-800">
                {role.userCount} utilisateur{role.userCount > 1 ? "s" : ""}{" "}
                avec ce rôle
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Feedback pour les membres */}
      {memberFeedback ? (
        <div
          role="alert"
          className={cn(
            "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
            memberFeedback.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          )}
        >
          {memberFeedback.ok ? (
            <CheckCircle2Icon className="size-4 shrink-0" />
          ) : (
            <TriangleAlertIcon className="size-4 shrink-0" />
          )}
          <p>{memberFeedback.message}</p>
        </div>
      ) : null}

      {/* Attribution des rôles personnalisés aux membres de l'équipe */}
      <div className="rounded-xl border border-slate-200/80 bg-card shadow-sm dark:border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <UsersRoundIcon className="size-4 text-muted-foreground" />
              Attribution aux utilisateurs
            </h3>
            <p className="text-xs text-muted-foreground">
              Sélectionnez le rôle personnalisé de chaque membre (les
              administrateurs ont déjà tous les accès).
            </p>
          </div>
          <Button
            onClick={openCreateMember}
            size="sm"
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <UserPlusIcon className="size-4" />
            Ajouter un membre
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Membre</TableHead>
              <TableHead>Rôle de base</TableHead>
              <TableHead>Rôle personnalisé</TableHead>
              <TableHead className="w-[150px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="py-6 text-center text-sm text-muted-foreground"
                >
                  Aucun membre dans l&apos;organisation pour le moment.
                  Créez un compte avec «&nbsp;Ajouter un membre&nbsp;».
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <p className="text-sm font-medium">
                      {user.firstName} {user.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {user.email}
                    </p>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {getRoleLabel(user.role as Parameters<typeof getRoleLabel>[0])}
                  </TableCell>
                  <TableCell>
                    {isAdminBaseRole(user.role) ? (
                      // Les administrateurs ont déjà toutes les permissions :
                      // mention fixe au lieu du sélecteur (désactivé).
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200/60 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                        <ShieldCheckIcon className="size-3.5" />
                        Tous les accès (Admin)
                      </span>
                    ) : (
                      /* « none » = sentinelle Radix (valeur vide interdite) */
                      <Select
                        value={user.customRoleId ?? "none"}
                        onValueChange={(value) => handleAssign(user, value)}
                        disabled={isPending}
                      >
                        <SelectTrigger className="w-[220px]">
                          <SelectValue placeholder="Aucun" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">
                            Aucun (rôle de base uniquement)
                          </SelectItem>
                          {roles.map((role) => (
                            <SelectItem key={role.id} value={role.id}>
                              {role.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() =>
                          setSalaryHistoryMember({
                            id: user.id,
                            firstName: user.firstName,
                            lastName: user.lastName,
                          })
                        }
                        title="Historique des versements / Salaires"
                      >
                        <BanknoteIcon className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => openEditMember(user)}
                        disabled={isPending}
                        title="Modifier"
                      >
                        <PencilIcon className="size-3.5" />
                      </Button>
                      {confirmingMemberId === user.id ? (
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteMember(user.id)}
                            disabled={isPending}
                            title="Confirmer la suppression"
                          >
                            {isPending ? (
                              <Loader2Icon className="size-3.5 animate-spin" />
                            ) : (
                              <CheckCircle2Icon className="size-3.5" />
                            )}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => setConfirmingMemberId(null)}
                            disabled={isPending}
                            title="Annuler"
                          >
                            <span className="text-xs">✕</span>
                          </Button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive/70 hover:text-destructive"
                          onClick={() => setConfirmingMemberId(user.id)}
                          disabled={isPending}
                          title="Supprimer"
                        >
                          <Trash2Icon className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Dialogue création / édition — la `key` réinitialise le formulaire */}
      <RoleFormDialog
        key={editingRole?.id ?? "new-role"}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        role={editingRole}
      />

      {/* Dialogue ajout / édition d'un membre — la `key` (nonce + id)
          réinitialise le formulaire à chaque ouverture */}
      <MemberFormDialog
        key={`member-form-${editingMember?.id ?? "new"}-${memberFormNonce}`}
        open={memberDialogOpen}
        onOpenChange={setMemberDialogOpen}
        member={editingMember}
        roles={roles}
      />

      {/* Volet historique des versements / salaires d'un membre */}
      <MemberSalaryHistoryDialog
        member={salaryHistoryMember}
        open={salaryHistoryMember !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setSalaryHistoryMember(null);
        }}
      />
    </div>
  );
}
"use client";

import * as React from "react";
import {
  CheckCircle2Icon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  ShieldCheckIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UsersRoundIcon,
} from "lucide-react";

import {
  assignCustomRoleAction,
  deleteCustomRoleAction,
  type CustomRoleDTO,
  type RoleUserDTO,
  type RolesOverview,
} from "@/actions/roles";
import { getPermissionLabel } from "@/lib/permissions";
import { getRoleLabel } from "@/lib/role";
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

/**
 * Vue « Rôles & Permissions » : matrice des rôles personnalisés (création,
 * édition, suppression) et attribution de ces rôles aux membres de
 * l'équipe (secrétaires / enseignants).
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

      {/* Attribution des rôles personnalisés aux membres de l'équipe */}
      <div className="rounded-xl border border-slate-200/80 bg-card shadow-sm dark:border-slate-800">
        <div className="border-b px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <UsersRoundIcon className="size-4 text-muted-foreground" />
            Attribution aux utilisateurs
          </h3>
          <p className="text-xs text-muted-foreground">
            Sélectionnez le rôle personnalisé de chaque membre (les
            administrateurs ont déjà tous les accès).
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Membre</TableHead>
              <TableHead>Rôle de base</TableHead>
              <TableHead>Rôle personnalisé</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="py-6 text-center text-sm text-muted-foreground"
                >
                  Aucun membre éligible (comptes Secrétaire / Enseignant).
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
                    {/* « none » = sentinelle Radix (valeur vide interdite) */}
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
    </div>
  );
}
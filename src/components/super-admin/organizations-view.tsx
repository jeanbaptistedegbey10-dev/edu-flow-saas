"use client";

import * as React from "react";
import {
  BuildingIcon,
  CheckIcon,
  ClockIcon,
  CopyIcon,
  KeyRoundIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  SearchIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
} from "lucide-react";

import {
  extendTrialAction,
  generateLicenseAction,
  setOrganizationStatusAction,
  type GenerateLicenseFormState,
  type SuperAdminOrganizationRow,
  type SuperAdminStats,
} from "@/actions/super-admin";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  LICENSE_PLAN_TYPES,
  PLAN_STATUS_BADGE_CLASSES,
  PLAN_STATUS_LABELS,
  PLAN_TYPE_BADGE_CLASSES,
  PLAN_TYPE_LABELS,
  type LicensePlanType,
  type PlanStatus,
} from "@/lib/plan-labels";

type Feedback = { type: "success" | "error"; message: string } | null;

const LICENSE_FORM_INITIAL_STATE: GenerateLicenseFormState = {
  status: "idle",
};

const LICENSE_PLAN_TYPE_OPTIONS: { value: LicensePlanType; label: string }[] =
  LICENSE_PLAN_TYPES.map((planType) => ({
    value: planType,
    label: PLAN_TYPE_LABELS[planType],
  }));

/** Durées proposées (0 = sans échéance → expiration « perpétuelle »). */
const LICENSE_DURATION_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "1 mois" },
  { value: 3, label: "3 mois" },
  { value: 6, label: "6 mois" },
  { value: 12, label: "12 mois" },
  { value: 24, label: "24 mois" },
  { value: 36, label: "36 mois" },
  { value: 0, label: "Sans échéance (perpétuelle)" },
];

function formatDate(value: Date | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function getDaysLeft(value: Date | null): number | null {
  if (!value) return null;
  const diff = new Date(value).getTime() - Date.now();
  return Math.ceil(diff / 86_400_000);
}

/** Options de statut proposées dans le menu d'actions. */
const STATUS_ACTIONS: {
  status: PlanStatus;
  label: string;
  description: string;
  destructive?: boolean;
}[] = [
  {
    status: "ACTIVE",
    label: "Réactiver",
    description: "restaure l'accès complet de l'organisation.",
  },
  {
    status: "EXPIRED",
    label: "Marquer expirée",
    description:
      "passe l'organisation en lecture seule (abonnement échu).",
  },
  {
    status: "CANCELLED",
    label: "Bannir / Suspendre",
    description: "bloque totalement l'accès à l'organisation.",
    destructive: true,
  },
];

export function OrganizationsView({
  organizations,
  stats,
}: {
  organizations: SuperAdminOrganizationRow[];
  stats: SuperAdminStats;
}) {
  const [search, setSearch] = React.useState("");
  const [feedback, setFeedback] = React.useState<Feedback>(null);
  const [licenseDialogOrgId, setLicenseDialogOrgId] = React.useState<
    string | null
  >(null);
  const [licenseDialogSession, setLicenseDialogSession] = React.useState(0);
  const [extendTrialPending, startExtendTrial] = React.useTransition();
  const [statusPending, startSetStatus] = React.useTransition();
  const [statusDialog, setStatusDialog] = React.useState<{
    organization: SuperAdminOrganizationRow;
    status: PlanStatus;
  } | null>(null);

  const normalizedSearch = search.trim().toLowerCase();
  const filtered = normalizedSearch
    ? organizations.filter((org) =>
        [org.name, org.slug, org.email ?? "", org.adminEmail ?? ""].some((value) =>
          value.toLowerCase().includes(normalizedSearch)
        )
      )
    : organizations;

  const licenseDialogOrg = licenseDialogOrgId
    ? (organizations.find((org) => org.id === licenseDialogOrgId) ?? null)
    : null;

  const statCards = [
    {
      label: "Organisations",
      value: stats.total,
      icon: BuildingIcon,
      tone: "text-sky-600 dark:text-sky-400",
    },
    {
      label: "Actives",
      value: stats.active,
      icon: ShieldCheckIcon,
      tone: "text-emerald-600 dark:text-emerald-400",
    },
    {
      label: "En essai",
      value: stats.trial,
      icon: ClockIcon,
      tone: "text-slate-600 dark:text-slate-400",
    },
    {
      label: "Expirations ≤ 7 j",
      value: stats.expiringSoon,
      icon: ShieldAlertIcon,
      tone: "text-amber-600 dark:text-amber-400",
    },
  ];

  function openLicenseDialog(organizationId: string) {
    setLicenseDialogOrgId(organizationId);
    setLicenseDialogSession((session) => session + 1);
  }

  function handleExtendTrial(organizationId: string, days: 15 | 30) {
    setFeedback(null);
    startExtendTrial(async () => {
      const result = await extendTrialAction(organizationId, days);
      setFeedback({
        type: result.success ? "success" : "error",
        message: result.message,
      });
    });
  }

  function handleConfirmStatus() {
    if (!statusDialog) return;

    const { organization, status } = statusDialog;
    setFeedback(null);
    startSetStatus(async () => {
      const result = await setOrganizationStatusAction(organization.id, status);
      setFeedback({
        type: result.success ? "success" : "error",
        message: result.message,
      });
      setStatusDialog(null);
    });
  }

  const statusDialogMeta = statusDialog
    ? (STATUS_ACTIONS.find((action) => action.status === statusDialog.status) ??
      null)
    : null;

  return (
    <div className="space-y-4">
      {/* Indicateurs clés */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="flex items-center gap-3 rounded-xl border bg-background p-4 shadow-sm"
          >
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted/50">
              <card.icon className={`size-5 ${card.tone}`} />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {card.label}
              </p>
              <p className="text-xl font-semibold">{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Retour d'action */}
      {feedback ? (
        <div
          role="status"
          className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${
            feedback.type === "success"
              ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
              : "border-red-300 bg-red-50 text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400"
          }`}
        >
          <p>{feedback.message}</p>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs font-medium underline-offset-2 hover:underline"
          >
            Masquer
          </button>
        </div>
      ) : null}

      {/* Liste des organisations */}
      <div className="rounded-xl border bg-background shadow-sm">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold tracking-tight">
              Toutes les organisations
            </h2>
            <p className="text-sm text-muted-foreground">
              {filtered.length} organisation
              {filtered.length > 1 ? "s" : ""} affichée
              {filtered.length > 1 ? "s" : ""}
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher (nom, email, slug…)"
              className="pl-9"
              aria-label="Rechercher une organisation"
            />
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Organisation</TableHead>
              <TableHead>Admin</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Fin d&apos;essai / licence</TableHead>
              <TableHead>Créée le</TableHead>
              <TableHead className="text-right">Étudiants</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-10 text-center text-muted-foreground"
                >
                  Aucune organisation ne correspond à cette recherche.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((org) => {
                const endsAt =
                  org.planType === "TRIAL"
                    ? org.trialEndsAt
                    : org.licenseEndsAt;
                const daysLeft = getDaysLeft(endsAt);

                return (
                  <TableRow key={org.id}>
                    <TableCell>
                      <p className="font-medium">{org.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {org.email ?? "—"}
                      </p>
                    </TableCell>
                    <TableCell>
                      {org.adminEmail ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${PLAN_TYPE_BADGE_CLASSES[org.planType]}`}
                        >
                          {PLAN_TYPE_LABELS[org.planType]}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${PLAN_STATUS_BADGE_CLASSES[org.planStatus]}`}
                        >
                          {PLAN_STATUS_LABELS[org.planStatus]}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{formatDate(endsAt)}</p>
                      {daysLeft !== null ? (
                        <p
                          className={`text-xs ${
                            daysLeft <= 7
                              ? "font-medium text-amber-600 dark:text-amber-400"
                              : "text-muted-foreground"
                          }`}
                        >
                          {daysLeft > 0
                            ? `${daysLeft} jour${daysLeft > 1 ? "s" : ""} restant${daysLeft > 1 ? "s" : ""}`
                            : `Expirée depuis ${Math.abs(daysLeft)} jour${Math.abs(daysLeft) > 1 ? "s" : ""}`}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Sans échéance
                        </p>
                      )}
                    </TableCell>
                    <TableCell>{formatDate(org.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      {org.studentCount}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openLicenseDialog(org.id)}
                        >
                          <KeyRoundIcon className="size-4" />
                          Licence
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={
                            org.planType !== "TRIAL" || extendTrialPending
                          }
                          title={
                            org.planType !== "TRIAL"
                              ? "Réservé aux organisations en essai"
                              : "Prolonger l'essai de 15 jours"
                          }
                          onClick={() => handleExtendTrial(org.id, 15)}
                        >
                          +15 j
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={
                            org.planType !== "TRIAL" || extendTrialPending
                          }
                          title={
                            org.planType !== "TRIAL"
                              ? "Réservé aux organisations en essai"
                              : "Prolonger l'essai de 30 jours"
                          }
                          onClick={() => handleExtendTrial(org.id, 30)}
                        >
                          +30 j
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Actions sur ${org.name}`}
                            >
                              <MoreHorizontalIcon className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>
                              Statut du plan
                            </DropdownMenuLabel>
                            {STATUS_ACTIONS.map((action) => (
                              <DropdownMenuItem
                                key={action.status}
                                disabled={org.planStatus === action.status}
                                className={
                                  action.destructive
                                    ? "text-red-600 focus:text-red-600 dark:text-red-400"
                                    : undefined
                                }
                                onClick={() =>
                                  setStatusDialog({
                                    organization: org,
                                    status: action.status,
                                  })
                                }
                              >
                                {action.label}
                              </DropdownMenuItem>
                            ))}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem disabled>
                              {org.hasLicenseKey
                                ? "Clé de licence enregistrée"
                                : "Aucune clé de licence"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Modale « Générer une licence » (remontée à chaque ouverture) */}
      {licenseDialogOrg ? (
        <GenerateLicenseDialog
          key={`${licenseDialogOrg.id}-${licenseDialogSession}`}
          organization={licenseDialogOrg}
          open={licenseDialogOrgId !== null}
          onOpenChange={(open) => {
            if (!open) setLicenseDialogOrgId(null);
          }}
        />
      ) : null}

      {/* Confirmation de changement de statut */}
      <AlertDialog
        open={statusDialog !== null}
        onOpenChange={(open) => {
          if (!open) setStatusDialog(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {statusDialogMeta?.label ?? "Changer le statut"} —{" "}
              {statusDialog?.organization.name}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {statusDialogMeta?.description ??
                "Cette action modifie le statut du plan de l'organisation."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={statusPending}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              className={
                statusDialog?.status === "CANCELLED"
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : undefined
              }
              disabled={statusPending}
              onClick={(event) => {
                event.preventDefault();
                handleConfirmStatus();
              }}
            >
              {statusPending ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                "Confirmer"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>




    </div>
  );
}

function GenerateLicenseDialog({
  organization,
  open,
  onOpenChange,
}: {
  organization: SuperAdminOrganizationRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [state, formAction, isPending] = React.useActionState(
    generateLicenseAction,
    LICENSE_FORM_INITIAL_STATE
  );
  const [planType, setPlanType] = React.useState<LicensePlanType>("SAAS_YEARLY");
  const [copied, setCopied] = React.useState(false);

  async function handleCopy() {
    if (!state.licenseKey) return;

    try {
      await navigator.clipboard.writeText(state.licenseKey);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Presse-papiers indisponible : la clé reste sélectionnable à la main.
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Générer une licence</DialogTitle>
          <DialogDescription>
            Signe une clé Ed25519 pour « {organization.name} » et active
            immédiatement son plan.
          </DialogDescription>
        </DialogHeader>

        {state.status === "success" && state.licenseKey ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
              <p className="font-semibold">Licence générée</p>
              <p className="mt-1">{state.message}</p>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Clé de licence
              </Label>
              <div className="mt-1 flex items-start gap-2">
                <code className="min-w-0 flex-1 break-all rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs">
                  {state.licenseKey}
                </code>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <CheckIcon className="size-4" />
                  ) : (
                    <CopyIcon className="size-4" />
                  )}
                  {copied ? "Copiée" : "Copier"}
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Transmettez cette clé à l&apos;administrateur de l&apos;école :
                elle s&apos;active depuis son espace « Abonnement &amp;
                licence ». La clé privée de signature ne quitte jamais le
                serveur.
              </p>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Fermer
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="organizationId" value={organization.id} />
            <input type="hidden" name="planType" value={planType} />

            <div className="grid gap-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Organisation
              </Label>
              <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                {organization.name}
                {organization.adminEmail ? (
                  <span className="text-muted-foreground">
                    {" "}
                    — {organization.adminEmail}
                  </span>
                ) : null}
              </p>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="license-plan">Plan</Label>
              <Select
                value={planType}
                onValueChange={(value) => setPlanType(value as LicensePlanType)}
              >
                <SelectTrigger id="license-plan">
                  <SelectValue placeholder="Choisir un plan" />
                </SelectTrigger>
                <SelectContent>
                  {LICENSE_PLAN_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="license-duration">Durée</Label>
              <Select name="durationMonths" defaultValue="12">
                <SelectTrigger id="license-duration">
                  <SelectValue placeholder="Choisir une durée" />
                </SelectTrigger>
                <SelectContent>
                  {LICENSE_DURATION_OPTIONS.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={String(option.value)}
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Détermine la date d&apos;expiration signée dans la clé.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="license-max-students">
                  Étudiants max.{" "}
                  <span className="font-normal text-muted-foreground">
                    (optionnel)
                  </span>
                </Label>
                <Input
                  id="license-max-students"
                  name="maxStudents"
                  type="number"
                  min={1}
                  placeholder="Illimité"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="license-max-users">
                  Utilisateurs max.{" "}
                  <span className="font-normal text-muted-foreground">
                    (optionnel)
                  </span>
                </Label>
                <Input
                  id="license-max-users"
                  name="maxUsers"
                  type="number"
                  min={1}
                  placeholder="Illimité"
                />
              </div>
            </div>

            {state.status === "error" && state.message ? (
              <p
                role="alert"
                className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400"
              >
                {state.message}
              </p>
            ) : null}

            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <KeyRoundIcon className="size-4" />
                )}
                Générer &amp; activer
              </Button>
            </DialogFooter>

          </form>
        )}

      </DialogContent>
    </Dialog>
  );
}



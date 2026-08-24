"use client";

import * as React from "react";
import { useActionState } from "react";
import {
  Building2Icon,
  CalendarIcon,
  Loader2Icon,
  MailIcon,
  MapPinIcon,
  PhoneIcon,
  SaveIcon,
  UsersRoundIcon,
} from "lucide-react";

import {
  updateOrganizationAction,
  type OrganizationFormState,
  type OrganizationInfoDTO,
  type OrganizationMemberDTO,
} from "@/actions/organization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { getRoleBadgeClass, getRoleLabel } from "@/lib/role";

// Formatage déterministe (locale + fuseau fixes) pour éviter tout écart
// d'hydratation.
const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const INITIAL_FORM_STATE: OrganizationFormState = { status: "idle" };

const BADGE_BASE_CLASSES =
  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-xs font-medium text-destructive">
      {message}
    </p>
  );
}

/** Initiales affichées dans l'avatar rond des membres. */
function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

function OrganizationEditForm({ organization }: { organization: OrganizationInfoDTO }) {
  const [state, formAction, pending] = useActionState(
    updateOrganizationAction,
    INITIAL_FORM_STATE
  );

  const fieldErrors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="grid gap-4">
      {state.message ? (
        <p
          role="alert"
          className={cn(
            "rounded-md px-3 py-2 text-sm",
            state.status === "success"
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "bg-destructive/10 text-destructive"
          )}
        >
          {state.message}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="name">Nom de l’organisation *</Label>
          <Input
            id="name"
            name="name"
            defaultValue={organization.name}
            maxLength={120}
            required
            aria-invalid={Boolean(fieldErrors.name)}
          />
          <FieldError message={fieldErrors.name} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={organization.email ?? ""}
            placeholder="contact@exemple.com"
            aria-invalid={Boolean(fieldErrors.email)}
          />
          <FieldError message={fieldErrors.email} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="phone">Téléphone</Label>
          <Input
            id="phone"
            name="phone"
            defaultValue={organization.phone ?? ""}
            placeholder="+229 00 00 00 00"
            aria-invalid={Boolean(fieldErrors.phone)}
          />
          <FieldError message={fieldErrors.phone} />
        </div>

        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="address">Adresse</Label>
          <Input
            id="address"
            name="address"
            defaultValue={organization.address ?? ""}
            placeholder="Ville, quartier, rue..."
            aria-invalid={Boolean(fieldErrors.address)}
          />
          <FieldError message={fieldErrors.address} />
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <Loader2Icon data-icon="inline-start" className="animate-spin" />
          ) : (
            <SaveIcon data-icon="inline-start" />
          )}
          {pending ? "Enregistrement..." : "Enregistrer les modifications"}
        </Button>
      </div>
    </form>
  );
}

export function OrganizationView({
  organization,
  members,
}: {
  organization: OrganizationInfoDTO;
  members: OrganizationMemberDTO[];
}) {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
      {/* En-tête de page */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Organisation</h2>
          <p className="text-sm text-muted-foreground">
            Consultez et gérez les informations de votre organisation et de
            ses membres.
          </p>
        </div>
      </div>

      {/* Carte d'identité de l'organisation */}
      <div className="rounded-xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/40 text-card-foreground shadow-sm transition-all duration-200 hover:shadow-md dark:border-slate-800 dark:from-card dark:to-card">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-sm">
            <Building2Icon className="size-7" />
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="truncate text-lg font-semibold tracking-tight">
              {organization.name}
            </h3>
            <p className="text-sm text-muted-foreground">
              {organization.slug} · membre
              {organization.memberCount > 1 ? "s" : ""} :{" "}
              {organization.memberCount}
            </p>
          </div>

          <div className="grid gap-1.5 text-sm text-muted-foreground sm:text-right">
            {organization.email ? (
              <span className="inline-flex items-center gap-1.5 sm:justify-end">
                <MailIcon className="size-4 shrink-0" aria-hidden="true" />
                {organization.email}
              </span>
            ) : null}
            {organization.phone ? (
              <span className="inline-flex items-center gap-1.5 sm:justify-end">
                <PhoneIcon className="size-4 shrink-0" aria-hidden="true" />
                {organization.phone}
              </span>
            ) : null}
            {organization.address ? (
              <span className="inline-flex items-center gap-1.5 sm:justify-end">
                <MapPinIcon className="size-4 shrink-0" aria-hidden="true" />
                {organization.address}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t px-5 py-3 text-xs text-muted-foreground">
          <CalendarIcon className="size-3.5" aria-hidden="true" />
          Organisation créée le{" "}
          {dateFormatter.format(organization.createdAt)}
        </div>
      </div>

      {/* Édition des informations */}
      <div className="rounded-xl border border-slate-200/80 bg-card text-card-foreground shadow-sm transition-all duration-200 dark:border-slate-800">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Informations générales</h3>
          <p className="text-xs text-muted-foreground">
            Mettez à jour les coordonnées visibles par vos équipes.
          </p>
        </div>
        <div className="p-4 md:p-5">
          <OrganizationEditForm organization={organization} />
        </div>
      </div>

      {/* Liste des membres */}
      <div className="rounded-xl border border-slate-200/80 bg-card text-card-foreground shadow-sm transition-all duration-200 dark:border-slate-800">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold">Membres de l’équipe</h3>
            <p className="text-xs text-muted-foreground">
              {members.length} membre{members.length > 1 ? "s" : ""} rattaché
              {members.length > 1 ? "s" : ""} à l’organisation.
            </p>
          </div>
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <UsersRoundIcon className="size-5" />
          </div>
        </div>

        {members.length > 0 ? (
          <ul className="divide-y">
            {members.map((member) => (
              <li
                key={member.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {getInitials(member.firstName, member.lastName)}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 truncate text-sm font-medium">
                    {member.firstName} {member.lastName}
                    {!member.isActive ? (
                      <span
                        className={cn(
                          BADGE_BASE_CLASSES,
                          "border border-slate-200/60 bg-slate-50 text-slate-700 dark:border-slate-500/20 dark:bg-slate-500/10 dark:text-slate-400"
                        )}
                      >
                        Inactif
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {member.email}
                  </p>
                </div>

                <span
                  className={cn(
                    BADGE_BASE_CLASSES,
                    getRoleBadgeClass(member.role)
                  )}
                >
                  {getRoleLabel(member.role)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-muted">
              <UsersRoundIcon className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">Aucun membre pour le moment</p>
          </div>
        )}
      </div>
    </div>
  );
}
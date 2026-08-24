"use client";

import * as React from "react";
import { useActionState } from "react";
import {
  BellIcon,
  CircleUserRoundIcon,
  Loader2Icon,
  SaveIcon,
} from "lucide-react";

import {
  updateNotificationPreferencesAction,
  updateProfileAction,
  type NotificationPreferenceState,
  type ProfileFormState,
  type UserProfileDTO,
} from "@/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { getRoleLabel } from "@/lib/role";

// Formatage déterministe (locale + fuseau fixes) pour éviter tout écart
// d'hydratation.
const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const INITIAL_PROFILE_STATE: ProfileFormState = { status: "idle" };
const INITIAL_NOTIF_STATE: NotificationPreferenceState = { status: "idle" };

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-xs font-medium text-destructive">
      {message}
    </p>
  );
}

/** Initiales affichées dans l'avatar rond du profil. */
function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

export function SettingsView({
  profile,
  emailNotifications,
  role,
}: {
  profile: UserProfileDTO;
  emailNotifications: boolean;
  role: string;
}) {
  const [profileState, profileFormAction, profilePending] = useActionState(
    updateProfileAction,
    INITIAL_PROFILE_STATE
  );

  const [notifState, notifFormAction, notifPending] = useActionState(
    updateNotificationPreferencesAction,
    INITIAL_NOTIF_STATE
  );

  const profileFieldErrors = profileState.fieldErrors ?? {};

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
      {/* En-tête de page */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Paramètres</h2>
          <p className="text-sm text-muted-foreground">
            Gérez votre profil utilisateur et vos préférences.
          </p>
        </div>
      </div>

      {/* Carte de profil */}
      <div className="rounded-xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/40 text-card-foreground shadow-sm transition-all duration-200 hover:shadow-md dark:border-slate-800 dark:from-card dark:to-card">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
            {getInitials(profile.firstName, profile.lastName)}
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="truncate text-lg font-semibold tracking-tight">
              {profile.firstName} {profile.lastName}
            </h3>
            <p className="text-sm text-muted-foreground">
              {profile.email} · {getRoleLabel(role as Parameters<typeof getRoleLabel>[0])}
            </p>
          </div>

          <p className="text-xs text-muted-foreground sm:text-right">
            Membre depuis le{" "}
            {dateFormatter.format(profile.createdAt)}
          </p>
        </div>
      </div>

      {/* Édition du profil */}
      <div className="rounded-xl border border-slate-200/80 bg-card text-card-foreground shadow-sm transition-all duration-200 dark:border-slate-800">
        <div className="border-b px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <CircleUserRoundIcon className="size-4 text-muted-foreground" />
            Informations personnelles
          </h3>
          <p className="text-xs text-muted-foreground">
            Mettez à jour vos informations personnelles.
          </p>
        </div>
        <div className="p-4 md:p-5">
          <form action={profileFormAction} className="grid gap-4">
            {profileState.message ? (
              <p
                role="alert"
                className={cn(
                  "rounded-md px-3 py-2 text-sm",
                  profileState.status === "success"
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : "bg-destructive/10 text-destructive"
                )}
              >
                {profileState.message}
              </p>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="firstName">Prénom *</Label>
                <Input
                  id="firstName"
                  name="firstName"
                  defaultValue={profile.firstName}
                  maxLength={60}
                  required
                  aria-invalid={Boolean(profileFieldErrors.firstName)}
                />
                <FieldError message={profileFieldErrors.firstName} />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="lastName">Nom *</Label>
                <Input
                  id="lastName"
                  name="lastName"
                  defaultValue={profile.lastName}
                  maxLength={60}
                  required
                  aria-invalid={Boolean(profileFieldErrors.lastName)}
                />
                <FieldError message={profileFieldErrors.lastName} />
              </div>

              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="email">Adresse e-mail *</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  defaultValue={profile.email}
                  required
                  aria-invalid={Boolean(profileFieldErrors.email)}
                />
                <FieldError message={profileFieldErrors.email} />
              </div>

              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="avatarUrl">URL de l’avatar</Label>
                <Input
                  id="avatarUrl"
                  name="avatarUrl"
                  defaultValue={profile.avatarUrl ?? ""}
                  placeholder="https://exemple.com/avatar.jpg"
                  aria-invalid={Boolean(profileFieldErrors.avatarUrl)}
                />
                <FieldError message={profileFieldErrors.avatarUrl} />
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={profilePending}>
                {profilePending ? (
                  <Loader2Icon
                    data-icon="inline-start"
                    className="animate-spin"
                  />
                ) : (
                  <SaveIcon data-icon="inline-start" />
                )}
                {profilePending
                  ? "Enregistrement..."
                  : "Enregistrer le profil"}
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* Préférences de notification */}
      <div className="rounded-xl border border-slate-200/80 bg-card text-card-foreground shadow-sm transition-all duration-200 dark:border-slate-800">
        <div className="border-b px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <BellIcon className="size-4 text-muted-foreground" />
            Préférences de notification
          </h3>
          <p className="text-xs text-muted-foreground">
            Choisissez les notifications que vous souhaitez recevoir.
          </p>
        </div>
        <div className="p-4 md:p-5">
          <form action={notifFormAction} className="grid gap-4">
            {notifState.message ? (
              <p
                role="alert"
                className={cn(
                  "rounded-md px-3 py-2 text-sm",
                  notifState.status === "success"
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : "bg-destructive/10 text-destructive"
                )}
              >
                {notifState.message}
              </p>
            ) : null}

            <label
              htmlFor="emailNotifications"
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200/80 p-3 transition-colors hover:bg-muted/40 dark:border-slate-800"
            >
              <input
                id="emailNotifications"
                name="emailNotifications"
                type="checkbox"
                defaultChecked={emailNotifications}
                className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary"
              />
              <span className="grid gap-0.5">
                <span className="text-sm font-medium">
                  Notifications par e-mail
                </span>
                <span className="text-xs text-muted-foreground">
                  Recevez un e-mail pour les nouveaux paiements, les dépenses
                  et les échéances de tâches.
                </span>
              </span>
            </label>

            <div className="flex justify-end">
              <Button type="submit" disabled={notifPending}>
                {notifPending ? (
                  <Loader2Icon
                    data-icon="inline-start"
                    className="animate-spin"
                  />
                ) : (
                  <SaveIcon data-icon="inline-start" />
                )}
                {notifPending
                  ? "Enregistrement..."
                  : "Enregistrer les préférences"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
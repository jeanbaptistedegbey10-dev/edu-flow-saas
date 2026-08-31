"use client"

import * as React from "react"
import { KeyRoundIcon, Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  activateLicenseWithKeyAction,
  type ActivateLicenseFormState,
} from "@/actions/billing"

const ACTIVATE_LICENSE_INITIAL_STATE: ActivateLicenseFormState = {
  status: "idle",
}

export function LicenseActivationForm() {
  const [state, formAction, isPending] = React.useActionState<
    ActivateLicenseFormState,
    FormData
  >(activateLicenseWithKeyAction, ACTIVATE_LICENSE_INITIAL_STATE)

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-1.5">
        <Label htmlFor="license-key">Clé de licence</Label>
        <Input
          id="license-key"
          name="licenseKey"
          placeholder="EDU-XXXXX-XXXXX-XXXXX-…"
          className="font-mono uppercase"
          autoComplete="off"
          spellCheck={false}
          required
        />
        <p className="text-xs text-muted-foreground">
          Collez la clé reçue de l&apos;équipe EduFlow (format EDU-…). La
          vérification est locale : signature Ed25519 et expiration sont
          contrôlées sans appel réseau.
        </p>
      </div>

      {state.status === "error" && state.message ? (
        <p
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400"
        >
          {state.message}
        </p>
      ) : null}

      {state.status === "success" && state.message ? (
        <p
          role="status"
          className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
        >
          {state.message}
        </p>
      ) : null}

      <Button type="submit" disabled={isPending}>
        {isPending ? (
          <Loader2Icon className="size-4 animate-spin" />
        ) : (
          <KeyRoundIcon className="size-4" />
        )}
        Activer la licence
      </Button>
    </form>
  )
}

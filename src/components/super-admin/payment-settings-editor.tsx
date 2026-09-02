"use client";

import * as React from "react";
import {
  EyeIcon,
  EyeOffIcon,
  Loader2Icon,
  SaveIcon,
  ShieldCheckIcon,
  ShieldAlertIcon,
} from "lucide-react";

import {
  updatePaymentSettingsAction,
  type PaymentSettingsDTO,
  type UpdatePaymentSettingsFormState,
} from "@/actions/super-admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const INITIAL_STATE: UpdatePaymentSettingsFormState = { status: "idle" };

const SUCCESS_ALERT_CLASS =
  "rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300";

const ERROR_ALERT_CLASS =
  "rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400";

const INFO_ALERT_CLASS =
  "rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300";

/**
 * Champ de saisie avec bouton « afficher/masquer » pour les clés secrètes.
 */
function SecretInput({
  id,
  name,
  defaultValue,
  placeholder,
  fromDb,
}: {
  id: string;
  name: string;
  defaultValue: string;
  placeholder?: string;
  fromDb: boolean;
}) {
  const [visible, setVisible] = React.useState(false);

  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{name}</Label>
        {fromDb ? (
          <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
            <ShieldCheckIcon className="size-3" />
            Enregistré en base
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
            <ShieldAlertIcon className="size-3" />
            Variable d&apos;environnement
          </span>
        )}
      </div>
      <div className="relative">
        <Input
          id={id}
          name={id}
          type={visible ? "text" : "password"}
          defaultValue={defaultValue}
          placeholder={placeholder}
          autoComplete="off"
          className="pr-10 font-mono text-xs"
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
          tabIndex={-1}
        >
          {visible ? (
            <EyeOffIcon className="size-4" />
          ) : (
            <EyeIcon className="size-4" />
          )}
        </button>
      </div>
    </div>
  );
}

/**
 * Carte de configuration d'un agrégateur de paiement (KKiaPay ou FedaPay) :
 * clés publiques/privées/secret + switch mode Test/Live.
 */
function PaymentProviderCard({
  provider,
  settings,
}: {
  provider: "kkiapay" | "fedapay";
  settings: PaymentSettingsDTO;
}) {
  const isKkiapay = provider === "kkiapay";
  const title = isKkiapay ? "KKiaPay" : "FedaPay";
  const description = isKkiapay
    ? "Widget Mobile Money / Carte (via cdn.kkiapay.me) — webhook signé par x-kkiapay-secret."
    : "API server-side (POST /v1/transactions) — webhook signé via X-FEDAPAY-SIGNATURE.";

  const publicKey = isKkiapay ? settings.kkiapay.publicKey : settings.fedapay.publicKey;
  const publicKeyFromDb = isKkiapay ? settings.kkiapay.publicKeyFromDb : settings.fedapay.publicKeyFromDb;
  const mode = isKkiapay ? settings.kkiapay.mode : settings.fedapay.mode;

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-background p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold tracking-tight">{title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-medium",
            mode === "live"
              ? "border border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
              : "border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
          )}
        >
          {mode === "live" ? "LIVE" : "TEST"}
        </span>
      </div>

      <div className="grid gap-3">
        {/* Clé publique */}
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor={`${provider}-publicKey`}>Clé publique</Label>
            {publicKeyFromDb ? (
              <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                <ShieldCheckIcon className="size-3" />
                Base
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                <ShieldAlertIcon className="size-3" />
                Env
              </span>
            )}
          </div>
          <Input
            id={`${provider}-publicKey`}
            name={`${provider}PublicKey`}
            defaultValue={publicKey}
            placeholder="pk_xxx..."
            className="font-mono text-xs"
          />
        </div>

        {/* Clé privée / secrète */}
        {isKkiapay ? (
          <>
            <SecretInput
              id="kkiapayPrivateKey"
              name="Clé privée"
              defaultValue={settings.kkiapay.privateKey}
              placeholder="sk_xxx..."
              fromDb={settings.kkiapay.privateKeyFromDb}
            />
            <SecretInput
              id="kkiapaySecret"
              name="Secret (webhook)"
              defaultValue={settings.kkiapay.secret}
              placeholder="whsec_xxx..."
              fromDb={settings.kkiapay.secretFromDb}
            />
          </>
        ) : (
          <SecretInput
            id="fedapaySecretKey"
            name="Clé secrète"
            defaultValue={settings.fedapay.secretKey}
            placeholder="sk_xxx..."
            fromDb={settings.fedapay.secretKeyFromDb}
          />
        )}

        {/* Mode Test / Live */}
        <div className="grid gap-1.5">
          <Label htmlFor={`${provider}-mode`}>Mode</Label>
          <Select defaultValue={mode} name={`${provider}Mode`}>
            <SelectTrigger id={`${provider}-mode`}>
              <SelectValue placeholder="Choisir le mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="test">
                <span className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-amber-500" />
                  Test (sandbox)
                </span>
              </SelectItem>
              <SelectItem value="live">
                <span className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-red-500" />
                  Live (production)
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {mode === "live"
              ? "⚠️ Transactions réelles — les clés de production sont obligatoires."
              : "Mode bac à sable : utilisez les clés de test fournies par le prestataire."}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Éditeur des clés API de paiement (KKiaPay + FedaPay) du back-office
 * Super-Admin. Formulaire unique avec `useActionState` vers la Server Action
 * `updatePaymentSettingsAction`.
 */
export function PaymentSettingsEditor({
  settings,
}: {
  settings: PaymentSettingsDTO;
}) {
  const [state, formAction, isPending] = React.useActionState(
    updatePaymentSettingsAction,
    INITIAL_STATE
  );

  return (
    <form action={formAction} className="space-y-6">
      {state.status === "success" && state.message ? (
        <p role="status" className={SUCCESS_ALERT_CLASS}>
          {state.message}
        </p>
      ) : null}

      {state.status === "error" && state.message ? (
        <p role="alert" className={ERROR_ALERT_CLASS}>
          {state.message}
        </p>
      ) : null}

      <div className={INFO_ALERT_CLASS}>
        <strong>Source des clés :</strong> les valeurs enregistrées en base de
        données priment sur les variables d&apos;environnement. Si une clé
        n&apos;est pas renseignée en base, la variable d&apos;environnement
        correspondante est utilisée automatiquement (repli transparent).
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <PaymentProviderCard provider="kkiapay" settings={settings} />
        <PaymentProviderCard provider="fedapay" settings={settings} />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <SaveIcon className="size-4" />
          )}
          Enregistrer les clés
        </Button>
        <p className="text-xs text-muted-foreground">
          Les champs vides ne sont pas modifiés (conservation des valeurs
          existantes en base).
        </p>
      </div>
    </form>
  );
}



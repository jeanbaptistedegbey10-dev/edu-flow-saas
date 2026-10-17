"use client";

import * as React from "react";
import {
  AlertTriangleIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  ClockIcon,
  Loader2Icon,
  MailIcon,
  MessageCircleIcon,
  SearchIcon,
} from "lucide-react";

import {
  getEcheancesDashboard,
  type EcheanceBucket,
  type EcheanceRowDTO,
  type EcheancesDashboardDTO,
} from "@/lib/actions/schedules";
import { sendScheduleReminderAction } from "@/lib/actions/reminders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// Formatage déterministe (locale + fuseau fixes) pour éviter tout écart d'hydratation.
const amountFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatAmount(value: number): string {
  return `${amountFormatter.format(value)} FCFA`;
}

type ClassOption = { id: string; name: string; courseTitle: string | null };

/** Libellés + styles des regroupements de statut. */
const BUCKET_META: Record<
  EcheanceBucket,
  { label: string; badgeClass: string }
> = {
  awaiting: {
    label: "En attente d'activation",
    badgeClass:
      "border border-border bg-muted text-muted-foreground dark:text-muted-foreground",
  },
  upcoming: {
    label: "À venir",
    badgeClass:
      "border border-sky-200/60 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-400",
  },
  overdue: {
    label: "En retard",
    badgeClass:
      "border border-red-200/60 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400",
  },
  paid: {
    label: "Soldée",
    badgeClass:
      "border border-emerald-200/60 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400",
  },
};

/** Recalcule le regroupement d'une ligne côté client (miroir de `bucketForItem`). */
function bucketOfRow(row: EcheanceRowDTO): EcheanceBucket {
  if (!row.activatedAt) return "awaiting";
  if (row.status === "PAID" || row.paidAmount >= row.amount) return "paid";
  if (row.status === "OVERDUE" || new Date(row.dueDate).getTime() < Date.now()) {
    return "overdue";
  }
  return "upcoming";
}

/**
 * Actions de RELANCE en un clic pour une échéance :
 *   - WhatsApp : ouvre une URL wa.me préremplIE (retournée par l'action serveur) ;
 *   - Email    : envoie effectif via Resend (canal centralisé).
 *
 * Le reliquat exact est calculé serveur dans le message ; l'UI n'expose que le
 * déclenchement. Un retour d'état local signale succès / échec à l'admin.
 */
function ReminderButtons({ row }: { row: EcheanceRowDTO }) {
  const [pendingChannel, setPendingChannel] = React.useState<"email" | "whatsapp" | null>(
    null
  );
  const [error, setError] = React.useState<string | null>(null);

  const remaining = Math.max(row.amount - row.paidAmount, 0);
  const disabled = remaining <= 0;

  async function handleReminder(channel: "email" | "whatsapp") {
    setError(null);
    setPendingChannel(channel);
    try {
      const result = await sendScheduleReminderAction({ itemId: row.itemId, channel });
      if (result.ok) {
        if (result.channel === "whatsapp" && result.whatsappUrl) {
          window.open(result.whatsappUrl, "_blank", "noopener,noreferrer");
        }
        // Email : envoi silencieux côté Resend, rien d'autre à faire.
      } else {
        setError(result.message);
      }
    } finally {
      setPendingChannel(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center justify-end gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Relancer par WhatsApp"
          title={
            disabled
              ? "Échéance soldée"
              : row.studentPhone
                ? "Relancer par WhatsApp"
                : "Aucun numéro de téléphone"
          }
          disabled={disabled || !row.studentPhone || pendingChannel !== null}
          onClick={() => handleReminder("whatsapp")}
        >
          {pendingChannel === "whatsapp" ? (
            <Loader2Icon className="size-3.5 animate-spin text-emerald-600" />
          ) : (
            <MessageCircleIcon className="size-3.5 text-emerald-600" />
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Relancer par Email"
          title={
            disabled
              ? "Échéance soldée"
              : row.studentEmail
                ? "Relancer par Email"
                : "Aucune adresse e-mail"
          }
          disabled={disabled || !row.studentEmail || pendingChannel !== null}
          onClick={() => handleReminder("email")}
        >
          {pendingChannel === "email" ? (
            <Loader2Icon className="size-3.5 animate-spin text-blue-600" />
          ) : (
            <MailIcon className="size-3.5 text-blue-600" />
          )}
        </Button>
      </div>
      {error ? (
        <span role="alert" className="max-w-48 text-right text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </div>
  );
}


/** Carte KPI du bandeau supérieur. */
function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "neutral" | "sky" | "red" | "emerald";
}) {
  const toneClass = {
    neutral: "text-muted-foreground",
    sky: "text-sky-600 dark:text-sky-400",
    red: "text-red-600 dark:text-red-400",
    emerald: "text-emerald-600 dark:text-emerald-400",
  }[tone];
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
      <div className={cn("shrink-0", toneClass)}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("text-lg font-semibold tabular-nums", toneClass)}>{value}</p>
      </div>
    </div>
  );
}

export function EcheancesView({
  data: initialData,
  classes,
}: {
  data: EcheancesDashboardDTO;
  classes: ClassOption[];
}) {
  const [data, setData] = React.useState<EcheancesDashboardDTO>(initialData);
  const [classId, setClassId] = React.useState<string>("all");
  const [bucket, setBucket] = React.useState<EcheanceBucket | "all">("all");
  const [search, setSearch] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  // Recharge le tableau de bord dès qu'un filtre change (les agrégats restent
  // calculés sur l'ensemble côté serveur).
  const reload = React.useCallback(
    async (next: { classId: string; bucket: EcheanceBucket | "all" }) => {
      setLoading(true);
      try {
        const result = await getEcheancesDashboard({
          classId: next.classId,
          bucket: next.bucket,
        });
        setData(result);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const isFirstLoad = React.useRef(true);

  React.useEffect(() => {
    // Le serveur a déjà chargé le jeu initial : on ne recharge qu'à la
    // première mutation de filtre.
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      return;
    }
    void reload({ classId, bucket });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, bucket]);

  const query = search.trim().toLowerCase();
  const rows = data.rows.filter((row) => {
    if (!query) return true;
    return (
      row.studentName.toLowerCase().includes(query) ||
      row.studentCode.toLowerCase().includes(query) ||
      (row.courseTitle ?? "").toLowerCase().includes(query) ||
      (row.className ?? "").toLowerCase().includes(query)
    );
  });

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
      {/* En-tête */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <CalendarClockIcon className="size-6 text-primary" />
            Échéances
          </h2>
          <p className="text-base text-muted-foreground">
            Suivi des tranches de paiement — à venir, dues et en retard — avec
            relances rapides.
          </p>
        </div>
        {loading ? (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" /> Actualisation…
          </span>
        ) : null}
      </div>

      {/* KPI (agrégats globaux, indépendants des filtres) */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<ClockIcon className="size-6" />}
          label="À venir"
          value={`${data.totals.upcomingCount}`}
          tone="sky"
        />
        <StatCard
          icon={<AlertTriangleIcon className="size-6" />}
          label="En retard"
          value={`${data.totals.overdueCount} · ${formatAmount(data.totals.overdueAmount)}`}
          tone="red"
        />
        <StatCard
          icon={<CalendarClockIcon className="size-6" />}
          label="En attente d'activation"
          value={`${data.totals.awaitingCount}`}
          tone="neutral"
        />
        <StatCard
          icon={<CheckCircle2Icon className="size-6" />}
          label="Soldées"
          value={`${data.totals.paidCount}`}
          tone="emerald"
        />
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:max-w-xs">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un étudiant, un cours..."
            aria-label="Rechercher une échéance"
            className="pl-8"
          />
        </div>

        <Select value={classId} onValueChange={setClassId}>
          <SelectTrigger className="w-full sm:w-56" aria-label="Filtrer par classe">
            <SelectValue placeholder="Toutes les classes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les classes</SelectItem>
            {classes.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
                {c.courseTitle ? ` — ${c.courseTitle}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={bucket} onValueChange={(v) => setBucket(v as EcheanceBucket | "all")}>
          <SelectTrigger className="w-full sm:w-52" aria-label="Filtrer par statut">
            <SelectValue placeholder="Tous les statuts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="upcoming">À venir</SelectItem>
            <SelectItem value="overdue">En retard</SelectItem>
            <SelectItem value="awaiting">En attente d'activation</SelectItem>
            <SelectItem value="paid">Soldée</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tableau */}
      <div className="rounded-xl border border-border bg-card shadow-sm">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
            <CalendarClockIcon className="size-8 text-muted-foreground/50" />
            <p className="font-medium">Aucune échéance</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Les échéances apparaissent ici une fois les étudiants inscrits dans
              une classe démarrée (ou via un échéancier manuel).
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Étudiant</th>
                  <th className="px-4 py-3 font-medium">Formation / Classe</th>
                  <th className="px-4 py-3 font-medium text-center">Tranche</th>
                  <th className="px-4 py-3 font-medium text-right">Montant</th>
                  <th className="px-4 py-3 font-medium text-right">Réglé</th>
                  <th className="px-4 py-3 font-medium text-right">Reliquat</th>
                  <th className="px-4 py-3 font-medium">Échéance</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                  <th className="px-4 py-3 font-medium text-right">Relancer</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const meta = BUCKET_META[bucketOfRow(row)];
                  const remaining = Math.max(row.amount - row.paidAmount, 0);
                  return (
                    <tr
                      key={row.itemId}
                      className="border-b border-border/50 last:border-0"
                    >
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-medium">{row.studentName}</span>
                          <span className="text-xs text-muted-foreground">
                            {row.studentCode}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <div className="flex flex-col">
                          <span className="text-foreground">
                            {row.courseTitle ?? "—"}
                          </span>
                          <span className="text-xs">{row.className ?? "Sans classe"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums">
                        n°&nbsp;{row.installmentNumber}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatAmount(row.amount)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {formatAmount(row.paidAmount)}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-3 text-right font-semibold tabular-nums",
                          remaining > 0 ? "text-foreground" : "text-emerald-600"
                        )}
                      >
                        {formatAmount(remaining)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {dateFormatter.format(row.dueDate)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                            meta.badgeClass
                          )}
                        >
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <ReminderButtons row={row} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}


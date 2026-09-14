"use client";

import * as React from "react";
import {
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  FilterIcon,
  SearchIcon,
} from "lucide-react";

import type { AuditLogWithUser } from "@/lib/actions/audit";
import { getDistinctAuditActions, getDistinctAuditEntities, getAuditLogs, getAuditLogUsers } from "@/lib/actions/audit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { exportToCsv, type CsvColumn } from "@/lib/export";
import { cn } from "@/lib/utils";

/** Catégories d'actions pour le badge de criticité. */
type ActionCategory = "creation" | "modification" | "deletion" | "other";

function getActionCategory(action: string): ActionCategory {
  if (action.includes("CREATED") || action.includes("ISSUED") || action.includes("SEEDED")) return "creation";
  if (action.includes("UPDATED") || action.includes("OPENED") || action.includes("RECEIVED")) return "modification";
  if (action.includes("DELETED") || action.includes("REVOKED") || action.includes("CLOSED") || action.includes("RESET") || action.includes("VOIDED")) return "deletion";
  return "other";
}

function getActionBadgeClass(action: string): string {
  const category = getActionCategory(action);
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";
  switch (category) {
    case "creation":
      return `${base} border border-emerald-200/60 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400`;
    case "modification":
      return `${base} border border-sky-200/60 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-400`;
    case "deletion":
      return `${base} border border-red-200/60 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400`;
    default:
      return `${base} border border-slate-200/60 bg-slate-50 text-slate-700 dark:border-slate-500/20 dark:bg-slate-500/10 dark:text-slate-400`;
  }
}

function getActionLabel(action: string): string {
  const labels: Record<string, string> = {
    STUDENT_CREATED: "Étudiant créé",
    STUDENT_UPDATED: "Étudiant modifié",
    STUDENT_DELETED: "Étudiant supprimé",
    STUDENTS_IMPORT: "Import CSV",
    PAYMENT_RECEIVED: "Paiement reçu",
    PAYMENT_UPDATED: "Paiement modifié",
    PAYMENT_DELETED: "Paiement supprimé",
    PAYMENT_VOIDED: "Paiement annulé",
    CASH_OPENED: "Caisse ouverte",
    CASH_CLOSED: "Caisse clôturée",
    CERTIFICATE_ISSUED: "Certificat émis",
    CERTIFICATE_REVOKED: "Certificat révoqué",
    DEMO_RESET: "Démo réinitialisée",
    DEMO_SEEDED: "Démo seedée",
    SETTINGS_UPDATED: "Paramètres modifiés",
    ROLE_CREATED: "Rôle créé",
    ROLE_UPDATED: "Rôle modifié",
    ROLE_DELETED: "Rôle supprimé",
    USER_CREATED: "Utilisateur créé",
    USER_UPDATED: "Utilisateur modifié",
    USER_DELETED: "Utilisateur supprimé",
  };
  return labels[action] ?? action;
}

const AUDIT_CSV_COLUMNS: readonly CsvColumn<AuditLogWithUser & { actionLabel: string }>[] = [
  { header: "Date", value: (row) => new Date(row.createdAt).toLocaleString("fr-FR") },
  { header: "Utilisateur", value: (row) => `${row.user.firstName} ${row.user.lastName}` },
  { header: "Action", value: (row) => row.actionLabel },
  { header: "Entité", value: (row) => row.entity },
  { header: "ID Entité", value: (row) => row.entityId ?? "" },
  { header: "Rôle", value: (row) => row.user.role },
];

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});


export function AuditLogsView({ organizationId }: { organizationId: string }) {
  const [logs, setLogs] = React.useState<AuditLogWithUser[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [loading, setLoading] = React.useState(true);

  const [actionFilter, setActionFilter] = React.useState<string>("all");
  const [entityFilter, setEntityFilter] = React.useState<string>("all");
  const [userFilter, setUserFilter] = React.useState<string>("all");
  const [startDate, setStartDate] = React.useState<string>("");
  const [endDate, setEndDate] = React.useState<string>("");

  const [actions, setActions] = React.useState<string[]>([]);
  const [entities, setEntities] = React.useState<string[]>([]);
  const [users, setUsers] = React.useState<{ id: string; firstName: string; lastName: string }[]>([]);

  const pageSize = 25;

  const loadLogs = React.useCallback(async () => {
    setLoading(true);
    try {
      const result = await getAuditLogs({
        organizationId,
        ...(actionFilter !== "all" ? { action: actionFilter } : {}),
        ...(entityFilter !== "all" ? { entity: entityFilter } : {}),
        ...(userFilter !== "all" ? { userId: userFilter } : {}),
        ...(startDate ? { startDate: new Date(startDate) } : {}),
        ...(endDate ? { endDate: new Date(endDate + "T23:59:59") } : {}),
        page,
        pageSize,
      });
      setLogs(result.logs);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch (error) {
      console.error("[AuditLogsView] Échec de chargement :", error);
    } finally {
      setLoading(false);
    }
  }, [organizationId, actionFilter, entityFilter, userFilter, startDate, endDate, page]);

  React.useEffect(() => {
    async function loadOptions() {
      const [actionsData, entitiesData, usersData] = await Promise.all([
        getDistinctAuditActions(organizationId),
        getDistinctAuditEntities(organizationId),
        getAuditLogUsers(organizationId),
      ]);
      setActions(actionsData);
      setEntities(entitiesData);
      setUsers(usersData);
    }
    loadOptions();
  }, [organizationId]);

  /**
   * Chargement initial des logs + rechargement à chaque changement de filtre
   * ou de page : `loadLogs` est mémoïsé (useCallback), l'effet ne se rejoue
   * que lorsque ses dépendances changent.
   */
  React.useEffect(() => {
    // Chargement différé (microtask/timeout) : la règle lint
    // `react-hooks/set-state-in-effect` interdit un setState synchrone dans un
    // effet. `setLoading(true)` (appelé au début de `loadLogs`) est donc reporté.
    const timer = window.setTimeout(() => {
      void loadLogs();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadLogs]);

  React.useEffect(() => {
    setPage(1);
  }, [actionFilter, entityFilter, userFilter, startDate, endDate]);

  function handleExport() {
    const exportData = logs.map((log) => ({ ...log, actionLabel: getActionLabel(log.action) }));
    exportToCsv(`audit-log-${new Date().toISOString().split("T")[0]}`, exportData, AUDIT_CSV_COLUMNS);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2">
          <FilterIcon className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Filtres</span>
        </div>

        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="h-9 w-44">
            <SelectValue placeholder="Type d'action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les actions</SelectItem>
            {actions.map((action) => (
              <SelectItem key={action} value={action}>
                {getActionLabel(action)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={entityFilter} onValueChange={setEntityFilter}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue placeholder="Entité" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les entités</SelectItem>
            {entities.map((entity) => (
              <SelectItem key={entity} value={entity}>
                {entity}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={userFilter} onValueChange={setUserFilter}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue placeholder="Utilisateur" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les utilisateurs</SelectItem>
            {users.map((user) => (
              <SelectItem key={user.id} value={user.id}>
                {user.firstName} {user.lastName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1">
          <CalendarIcon className="size-4 text-muted-foreground" />
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 w-36" />
          <span className="text-xs text-muted-foreground">→</span>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9 w-36" />
        </div>

        <Button variant="outline" size="sm" onClick={handleExport} disabled={logs.length === 0}>
          <DownloadIcon data-icon="inline-start" />
          Exporter
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Utilisateur</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entité</TableHead>
              <TableHead className="text-right">Détails</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  <SearchIcon className="mx-auto mb-2 size-6 animate-pulse" />
                  Chargement...
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  Aucune entrée d'audit trouvée.
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap text-xs tabular-nums">
                    {dateFormatter.format(log.createdAt)}
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="font-medium">{log.user.firstName} {log.user.lastName}</div>
                    <div className="text-xs text-muted-foreground">{log.user.email}</div>
                  </TableCell>
                  <TableCell>
                    <span className={cn(getActionBadgeClass(log.action))}>
                      {getActionLabel(log.action)}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    <span className="font-mono text-xs">{log.entity}</span>
                    {log.entityId && (
                      <span className="ml-1 text-xs text-muted-foreground">({log.entityId.slice(0, 8)}…)</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {log.details ? (
                      <span className="text-xs text-muted-foreground">
                        {JSON.stringify(log.details).slice(0, 50)}
                        {JSON.stringify(log.details).length > 50 ? "…" : ""}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <span className="text-xs text-muted-foreground">
              {total} entrée(s) • Page {page} sur {totalPages}
            </span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <ChevronLeftIcon className="size-4" />
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                <ChevronRightIcon className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getAuditActionBadgeClass,
  getAuditActionLabel,
  getAuditEntityLabel,
  formatAuditDetails,
  maskInternalId,
  summarizeAuditDetails,
} from "@/lib/audit-labels";
import { exportToCsv, type CsvColumn } from "@/lib/export";
import { cn } from "@/lib/utils";

// La catégorisation des actions ET leurs libellés français sont centralisés
// dans `@/lib/audit-labels` (source de vérité partagée avec l'export CSV et
// la sanitisation) : ce composant ne redéfinit plus aucun dictionnaire local.

const AUDIT_CSV_COLUMNS: readonly CsvColumn<
  AuditLogWithUser & { actionLabel: string; entityLabel: string; detailsSummary: string }
>[] = [
  { header: "Date", value: (row) => new Date(row.createdAt).toLocaleString("fr-FR") },
  { header: "Utilisateur", value: (row) => `${row.user.firstName} ${row.user.lastName}` },
  { header: "Action", value: (row) => row.actionLabel },
  { header: "Entité", value: (row) => row.entityLabel },
  { header: "ID Entité", value: (row) => row.entityId ?? "" },
  { header: "Détails", value: (row) => row.detailsSummary },
  { header: "Rôle", value: (row) => row.user.role },
];

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Cellule « Détails » : résumé textuel en français + modale « Voir détails ».
 *
 * AUCUNE chaîne JSON brute n'est affichée dans le tableau (l'ancien rendu
 * exposait `{"className":"…"}`). Le contenu est désormais formaté par
 * `formatAuditDetails` / `summarizeAuditDetails` (`@/lib/audit-labels`), qui :
 *  - traduisent les CLÉS en libellés métier (« Classe », « Montant », …) ;
 *  - formatent les valeurs (montants en FCFA, booléens, statuts énumérés) ;
 *  - masquent les données sensibles et les identifiants techniques internes.
 *
 * La troncature CSS (`max-w-[16rem] truncate`) empêche la colonne de
 * s'étirer indéfiniment et garantit que le reste du tableau reste visible sans
 * débordement horizontal de la page.
 */
function AuditLogDetailsCell({
  action,
  details,
}: {
  action: string;
  details: unknown;
}) {
  const entries = formatAuditDetails(details, action);

  if (entries.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const summary = summarizeAuditDetails(details, action, 2);

  return (
    <div className="flex items-center justify-end gap-2">
      <span
        className="max-w-[16rem] truncate text-xs text-muted-foreground"
        title={summary}
      >
        {summary}
      </span>
      <Dialog>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" size="xs">
            Voir détails
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Détails de l&apos;opération</DialogTitle>
          </DialogHeader>
          <dl className="max-h-[60vh] space-y-2 overflow-auto pr-1 text-sm">
            {entries.map((entry) => (
              <div
                key={entry.key}
                className="flex items-start justify-between gap-4 border-b pb-2 last:border-b-0"
              >
                <dt className="text-muted-foreground">{entry.label}</dt>
                <dd className="text-right font-medium break-words">
                  {entry.value}
                </dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>
    </div>
  );
}

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

  /**
   * Applique un nouveau filtre ET revient à la page 1.
   *
   * La remise à zéro est faite ICI, dans le gestionnaire d'événement, et non
   * dans un `useEffect` de synchronisation : la règle
   * `react-hooks/set-state-in-effect` interdit un `setState` synchrone dans un
   * effet (renders en cascade inutiles). Le comportement est identique — un
   * filtre modifié affiche toujours la première page de résultats.
   */
  const applyFilter = React.useCallback(
    (setter: React.Dispatch<React.SetStateAction<string>>) =>
      (value: string) => {
        setter(value);
        setPage(1);
      },
    []
  );

  const handleActionFilterChange = React.useMemo(
    () => applyFilter(setActionFilter),
    [applyFilter]
  );
  const handleEntityFilterChange = React.useMemo(
    () => applyFilter(setEntityFilter),
    [applyFilter]
  );
  const handleUserFilterChange = React.useMemo(
    () => applyFilter(setUserFilter),
    [applyFilter]
  );
  const handleStartDateChange = React.useMemo(
    () => applyFilter(setStartDate),
    [applyFilter]
  );
  const handleEndDateChange = React.useMemo(
    () => applyFilter(setEndDate),
    [applyFilter]
  );

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

  function handleExport() {
    const exportData = logs.map((log) => ({
      ...log,
      actionLabel: getAuditActionLabel(log.action),
      entityLabel: getAuditEntityLabel(log.entity),
      detailsSummary: summarizeAuditDetails(log.details, log.action, 3),
    }));
    exportToCsv(`audit-log-${new Date().toISOString().split("T")[0]}`, exportData, AUDIT_CSV_COLUMNS);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2">
          <FilterIcon className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Filtres</span>
        </div>

        <Select value={actionFilter} onValueChange={handleActionFilterChange}>
          <SelectTrigger className="h-9 w-44">
            <SelectValue placeholder="Type d'action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les actions</SelectItem>
            {actions.map((action) => (
              <SelectItem key={action} value={action}>
                {getAuditActionLabel(action)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={entityFilter} onValueChange={handleEntityFilterChange}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue placeholder="Entité" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les entités</SelectItem>
            {entities.map((entity) => (
              <SelectItem key={entity} value={entity}>
                {getAuditEntityLabel(entity)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={userFilter} onValueChange={handleUserFilterChange}>
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
          <Input type="date" value={startDate} onChange={(e) => handleStartDateChange(e.target.value)} className="h-9 w-36" />
          <span className="text-xs text-muted-foreground">→</span>
          <Input type="date" value={endDate} onChange={(e) => handleEndDateChange(e.target.value)} className="h-9 w-36" />
        </div>

        <Button variant="outline" size="sm" onClick={handleExport} disabled={logs.length === 0}>
          <DownloadIcon data-icon="inline-start" />
          Exporter
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Utilisateur</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entité</TableHead>
              <TableHead className="w-[1%] text-right">Détails</TableHead>
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
                  Aucune entrée d&apos;audit trouvée.
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
                    <span className={cn(getAuditActionBadgeClass(log.action))}>
                      {getAuditActionLabel(log.action)}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    <span className="text-xs">{getAuditEntityLabel(log.entity)}</span>
                    {log.entityId && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({maskInternalId(log.entityId)})
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <AuditLogDetailsCell
                      action={log.action}
                      details={log.details}
                    />
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


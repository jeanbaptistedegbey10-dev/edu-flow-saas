"use client";

import * as React from "react";
import { ArchiveIcon, SearchIcon } from "lucide-react";

import {
  getArchivedClassesOverview,
  getArchiveEnrollmentDetail,
  searchArchives,
  type ArchiveEnrollmentDetailDTO,
  type ArchivedClassDTO,
  type ArchiveSearchResultDTO,
} from "@/actions/archives";
import { ArchiveDetailDialog } from "@/components/archives/archive-detail-dialog";
import { SearchResults, YearOverview } from "@/components/archives/archives-blocks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ArchivesView({
  years,
  initialYear,
  initialClasses,
}: {
  years: string[];
  initialYear: string | null;
  initialClasses: ArchivedClassDTO[];
}) {
  const [year, setYear] = React.useState<string | null>(initialYear);
  const [classes, setClasses] = React.useState<ArchivedClassDTO[]>(initialClasses);
  const [loadingYear, setLoadingYear] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [searching, setSearching] = React.useState(false);
  const [results, setResults] = React.useState<ArchiveSearchResultDTO | null>(null);
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<ArchiveEnrollmentDetailDTO | null>(null);
  const [loadingDetail, setLoadingDetail] = React.useState(false);

  const totals = React.useMemo(() => {
    const studentCount = classes.reduce((s, c) => s + c.studentCount, 0);
    const totalDue = classes.reduce((s, c) => s + c.totalDue, 0);
    const totalPaid = classes.reduce((s, c) => s + c.totalPaid, 0);
    return { studentCount, totalDue, totalPaid, remaining: Math.max(0, totalDue - totalPaid) };
  }, [classes]);

  async function handleYearChange(next: string) {
    setYear(next);
    setResults(null);
    setLoadingYear(true);
    try {
      setClasses(await getArchivedClassesOverview(next));
    } finally {
      setLoadingYear(false);
    }
  }

  async function handleSearch(event?: React.FormEvent) {
    event?.preventDefault();
    if (query.trim().length < 2) {
      setResults(null);
      return;
    }
    setSearching(true);
    try {
      setResults(await searchArchives(query.trim(), year ?? undefined));
    } finally {
      setSearching(false);
    }
  }

  async function openDetail(enrollmentId: string) {
    setDetailId(enrollmentId);
    setLoadingDetail(true);
    try {
      setDetail(await getArchiveEnrollmentDetail(enrollmentId));
    } catch {
      setDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-indigo-600/10 text-indigo-600">
            <ArchiveIcon className="size-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Archives</h1>
            <p className="text-sm text-muted-foreground">
              Classes cloturees par annee academique — lecture seule.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Annee academique</span>
          <Select value={year ?? ""} onValueChange={handleYearChange} disabled={years.length === 0}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Selectionner" />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={y}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <form onSubmit={handleSearch} className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher : nom / prenom / code etudiant, classe, formation…"
            className="pl-8"
            aria-label="Recherche globale des archives"
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={searching}>
            {searching ? "Recherche…" : "Rechercher"}
          </Button>
          {results ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setResults(null);
                setQuery("");
              }}
            >
              Reinitialiser
            </Button>
          ) : null}
        </div>
      </form>

      {results ? (
        <SearchResults results={results} onOpen={openDetail} />
      ) : (
        <YearOverview
          years={years}
          year={year}
          classes={classes}
          totals={totals}
          loadingYear={loadingYear}
          onOpen={openDetail}
        />
      )}

      <ArchiveDetailDialog
        open={detailId !== null}
        loading={loadingDetail}
        detail={detail}
        onClose={() => {
          setDetailId(null);
          setDetail(null);
        }}
        onOpen={openDetail}
      />
    </div>
  );
}

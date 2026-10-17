"use client";

import * as React from "react";

import type { ArchivedClassDTO } from "@/actions/archives";
import { formatArchiveAmount } from "@/components/archives/archive-format";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function ArchiveClassCard({
  klass,
  onOpen,
}: {
  klass: ArchivedClassDTO;
  onOpen: (enrollmentId: string) => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-semibold">
            {klass.className}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              — {klass.courseTitle} · {klass.academicYear}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{klass.schedule}</span>
            {klass.teacherName ? <span>· {klass.teacherName}</span> : null}
            <Badge variant="outline">{klass.status === "ARCHIVED" ? "Archivee" : "Cloturee"}</Badge>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
          aria-expanded={expanded}
        >
          {expanded ? "Masquer" : "Details"} · {klass.studentCount} etudiants
        </button>
      </div>
      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
        <p>Total englobe : <strong className="tabular-nums">{formatArchiveAmount(klass.totalDue)}</strong></p>
        <p>Regle : <strong className="tabular-nums">{formatArchiveAmount(klass.totalPaid)}</strong></p>
        <p>Solde restant : <strong className="tabular-nums">{formatArchiveAmount(klass.remainingAmount)}</strong></p>
      </div>
      {expanded ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Etudiant</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Total du</TableHead>
              <TableHead>Regle</TableHead>
              <TableHead>Reste</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {klass.enrollments.map((e) => (
              <TableRow key={e.enrollmentId}>
                <TableCell>
                  <button type="button" onClick={() => onOpen(e.enrollmentId)} className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                    {e.firstName} {e.lastName}
                  </button>
                </TableCell>
                <TableCell>{e.studentCode}</TableCell>
                <TableCell className="tabular-nums">{formatArchiveAmount(e.totalDue)}</TableCell>
                <TableCell className="tabular-nums">{formatArchiveAmount(e.paidAmount)}</TableCell>
                <TableCell className="tabular-nums">{formatArchiveAmount(e.remainingAmount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </div>
  );
}

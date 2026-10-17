"use client";

import type { ArchiveEnrollmentDetailDTO } from "@/actions/archives";
import { formatArchiveAmount } from "@/components/archives/archive-format";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function ArchiveDetailDialog({
  open,
  loading,
  detail,
  onClose,
  onOpen,
}: {
  open: boolean;
  loading: boolean;
  detail: ArchiveEnrollmentDetailDTO | null;
  onClose: () => void;
  onOpen: (enrollmentId: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Fiche d&apos;archive — lecture seule</DialogTitle>
          <DialogDescription>
            Bulletin d&apos;epoque scelle et historique financier scelle.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Chargement…</p>
        ) : !detail ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Impossible de charger cette archive.
          </p>
        ) : (
          <div className="grid gap-4 text-sm">
            <div className="rounded-lg border p-3">
              <p className="font-semibold">
                {detail.student.firstName} {detail.student.lastName}{" "}
                <span className="font-normal text-muted-foreground">({detail.student.studentCode})</span>
              </p>
              <p className="mt-1 text-muted-foreground">
                {detail.class.name} — {detail.class.courseTitle} · {detail.academicYear}
              </p>
              <p className="mt-1 flex flex-wrap gap-2">
                <Badge variant="outline">{detail.enrollmentStatus}</Badge>
                <Badge variant="outline">{detail.class.status}</Badge>
              </p>
              {detail.finalDecisionNote ? (
                <p className="mt-2 italic">« {detail.finalDecisionNote} »</p>
              ) : null}
            </div>
            <div className="rounded-lg border p-3">
              <p className="font-semibold">Bulletin d&apos;epoque</p>
              <p className="text-muted-foreground">
                Moyenne : {detail.bulletin.average !== null ? `${detail.bulletin.average} / 100` : "—"} ·{" "}
                Validation : {detail.bulletin.validationRate !== null ? `${detail.bulletin.validationRate} %` : "—"}
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Evaluation</TableHead>
                    <TableHead>Module</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.bulletin.modules.map((m, i) => (
                    <TableRow key={`${m.evaluationTitle}-${m.moduleName}-${i}`}>
                      <TableCell>{m.evaluationTitle}</TableCell>
                      <TableCell>{m.moduleName}</TableCell>
                      <TableCell className="tabular-nums">
                        {m.score !== null ? `${m.score} / ${m.maxScore}` : "—"}
                      </TableCell>
                      <TableCell>{m.status ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="rounded-lg border p-3">
              <p className="font-semibold">Historique financier scelle</p>
              <p className="text-muted-foreground">
                Total du {formatArchiveAmount(detail.finance.totalDue)} · Regle{" "}
                {formatArchiveAmount(detail.finance.paidAmount)} · Reste{" "}
                {formatArchiveAmount(detail.finance.remainingAmount)}
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Montant</TableHead>
                    <TableHead>Reference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.finance.payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{new Date(p.paidAt).toLocaleDateString("fr-FR")}</TableCell>
                      <TableCell className="tabular-nums">{formatArchiveAmount(p.amount)}</TableCell>
                      <TableCell>{p.reference ?? p.description ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {detail.history.length > 0 ? (
              <div className="rounded-lg border p-3">
                <p className="font-semibold">Autres inscriptions archivees</p>
                <div className="mt-2 grid gap-2">
                  {detail.history.map((h) => (
                    <button
                      key={h.enrollmentId}
                      type="button"
                      onClick={() => onOpen(h.enrollmentId)}
                      className="rounded-lg border px-3 py-2 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-900"
                    >
                      {h.className} — {h.courseTitle} · {h.academicYear}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

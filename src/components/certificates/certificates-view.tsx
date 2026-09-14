"use client";

import * as React from "react";
import {
  AwardIcon,
  EyeIcon,
  Loader2Icon,
  PlusIcon,
  SearchIcon,
  ShieldXIcon,
} from "lucide-react";

import type { StudentDTO } from "@/actions/students";
import { revokeCertificate, type CertificateDTO } from "@/lib/actions/certificates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToastNotification } from "@/components/ui/toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function CertificatesView({
  certificates,
  students,
}: {
  certificates: CertificateDTO[];
  students: StudentDTO[];
}) {
  const [search, setSearch] = React.useState("");
  const [toast, setToast] = React.useState<string | null>(null);
  const [revokingId, setRevokingId] = React.useState<string | null>(null);

  const filtered = certificates.filter((cert) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      cert.studentName.toLowerCase().includes(term) ||
      cert.level.toLowerCase().includes(term) ||
      cert.verificationCode.toLowerCase().includes(term)
    );
  });

  const handleRevoke = async (certId: string) => {
    setRevokingId(certId);
    const result = await revokeCertificate(certId, "Révocation manuelle");
    setRevokingId(null);
    if (result.ok) {
      setToast("Certificat révoqué.");
    } else {
      setToast(result.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher un certificat…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {filtered.length > 0 ? (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Apprenant</TableHead>
                <TableHead>Niveau</TableHead>
                <TableHead>Note</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((cert) => (
                <TableRow key={cert.id} className={cert.revoked ? "opacity-60" : ""}>
                  <TableCell className="font-medium">{cert.studentName}</TableCell>
                  <TableCell>{cert.level}</TableCell>
                  <TableCell>
                    {cert.score !== null ? `${cert.score.toFixed(1)}%` : "—"}
                  </TableCell>
                  <TableCell>{dateFormatter.format(cert.issueDate)}</TableCell>
                  <TableCell>
                    <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-800">
                      {cert.verificationCode}
                    </code>
                  </TableCell>
                  <TableCell>
                    {cert.revoked ? (
                      <span className="inline-flex items-center rounded-full border border-red-200/60 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
                        Révoqué
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-emerald-200/60 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400">
                        Valide
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() =>
                          window.open(`/verify/${cert.verificationCode}`, "_blank")
                        }
                        title="Voir la vérification"
                      >
                        <EyeIcon className="size-4" />
                      </Button>
                      {!cert.revoked && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                          onClick={() => handleRevoke(cert.id)}
                          disabled={revokingId === cert.id}
                          title="Révoquer"
                        >
                          {revokingId === cert.id ? (
                            <Loader2Icon className="size-4 animate-spin" />
                          ) : (
                            <ShieldXIcon className="size-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <AwardIcon className="size-6 text-muted-foreground" />
          </div>
          <p className="font-medium">Aucun certificat pour le moment</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Générez des certificats depuis la page Évaluations ou en cliquant sur le bouton ci-dessus.
          </p>
        </div>
      )}

      <ToastNotification message={toast} onClose={() => setToast(null)} />
    </div>
  );
}

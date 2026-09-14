import { ShieldCheckIcon, ShieldXIcon, AlertTriangleIcon } from "lucide-react";
import { notFound } from "next/navigation";

import { getCertificateVerificationData } from "@/lib/actions/certificates";

export const metadata = {
  title: "Vérification de certificat | EduFlow",
  description: "Vérifiez l'authenticité d'un certificat EduFlow.",
};

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export default async function VerifyCertificatePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const data = await getCertificateVerificationData(code);

  if (!data.valid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-xl border border-red-200 bg-white p-8 text-center shadow-lg">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-red-100">
            <ShieldXIcon className="size-8 text-red-600" />
          </div>
          <h1 className="mb-2 text-xl font-bold text-red-700">
            Certificat non reconnu
          </h1>
          <p className="text-sm text-muted-foreground">
            Le code <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">{code}</code> ne correspond à aucun certificat enregistré dans notre système.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Vérifiez le code ou contactez l&apos;organisme émetteur.
          </p>
        </div>
      </div>
    );
  }

  if (data.revoked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-xl border border-amber-200 bg-white p-8 text-center shadow-lg">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-amber-100">
            <AlertTriangleIcon className="size-8 text-amber-600" />
          </div>
          <h1 className="mb-2 text-xl font-bold text-amber-700">
            Certificat révoqué
          </h1>
          <p className="text-sm text-muted-foreground">
            Ce certificat a été révoqué par l&apos;organisme émetteur et n&apos;est plus considéré comme valide.
          </p>
        </div>
      </div>
    );
  }

  const cert = data.certificate!;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-lg rounded-xl border border-emerald-200 bg-white p-8 shadow-lg">
        {/* Badge authentique */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-emerald-100">
            <ShieldCheckIcon className="size-8 text-emerald-600" />
          </div>
          <h1 className="text-xl font-bold text-emerald-700">
            Certificat Authentique
          </h1>
          <p className="text-sm text-muted-foreground">
            Ce document a été vérifié avec succès.
          </p>
        </div>

        {/* Détails */}
        <div className="space-y-3 rounded-lg bg-slate-50 p-4">
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Apprenant</span>
            <span className="text-sm font-semibold">{cert.studentName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Niveau validé</span>
            <span className="text-sm font-semibold text-emerald-700">{cert.level}</span>
          </div>
          {cert.score !== null && (
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Score</span>
              <span className="text-sm font-semibold">{cert.score.toFixed(1)}%</span>
            </div>
          )}
          {cert.courseTitle && (
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Cours</span>
              <span className="text-sm font-semibold">{cert.courseTitle}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Délivré le</span>
            <span className="text-sm font-semibold">
              {dateFormatter.format(new Date(cert.issueDate))}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Organisme</span>
            <span className="text-sm font-semibold">{cert.organizationName}</span>
          </div>
          <div className="flex justify-between border-t pt-2">
            <span className="text-sm text-muted-foreground">Code de vérification</span>
            <code className="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-xs">
              {code}
            </code>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Vérifié automatiquement via le système EduFlow — {new Date().toLocaleDateString("fr-FR")}
        </p>
      </div>
    </div>
  );
}

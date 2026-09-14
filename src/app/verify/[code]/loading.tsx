import { ShieldCheckIcon } from "lucide-react";

export default function VerifyLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-lg">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-slate-100">
          <ShieldCheckIcon className="size-8 animate-pulse text-slate-400" />
        </div>
        <h1 className="mb-2 text-xl font-bold text-slate-500">
          Vérification en cours…
        </h1>
        <p className="text-sm text-muted-foreground">
          Interrogation du registre des certificats…
        </p>
      </div>
    </div>
  );
}

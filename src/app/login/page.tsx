import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CheckCircle2Icon, GraduationCapIcon } from "lucide-react";

import { LoginForm } from "@/components/auth/login-form";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { getValidatedSessionContext } from "@/lib/session";

export const metadata: Metadata = {
  title: "Connexion - EduFlow SaaS",
  description:
    "Connectez-vous à votre espace de gestion pour centres de formation et agences de mobilité internationale.",
};

function LoginFormFallback() {
  return (
    <div className="grid gap-4">
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-9 w-full" />
    </div>
  );
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ registered?: string }>;
}) {
  const params = await searchParams;

  // --------------------------------------
  // Garde « déjà connecté » validée en base de données
  // --------------------------------------
  // Un JWT décodable ne suffit pas : l'utilisateur ou son organisation peut
  // avoir disparu de la base (cookie obsolète/corrompu). Dans ce cas le
  // contexte vaut `null` (UNAUTHENTICATED) et on ignore simplement la session :
  // le formulaire est affiché, sans aucune redirection vers /dashboard — c'est
  // ce qui casse la boucle /login ↔ /dashboard.
  //
  // Les comptes STUDENT n'ont accès à aucun tableau de bord : ils voient eux
  // aussi le formulaire (le proxy les renvoie ici depuis /dashboard).
  const sessionContext = await getValidatedSessionContext();

  if (sessionContext && sessionContext.role !== "STUDENT") {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-svh flex-1 items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm rounded-xl border bg-background p-6 shadow-sm sm:p-8">
        {/* En-tête */}
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex size-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <GraduationCapIcon className="size-6" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">
            EduFlow SaaS
          </h1>
          <p className="text-sm text-muted-foreground">
            Connectez-vous à votre espace de gestion
          </p>
        </div>

        <Separator className="mb-6" />

        {/* Message de succès après inscription */}
        {params.registered === "1" ? <RegisteredSuccessMessage /> : null}

        {/* Formulaire (Suspense requis : useSearchParams dans le composant client) */}
        <Suspense fallback={<LoginFormFallback />}>
          <LoginForm />
        </Suspense>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Pas encore de compte ?{" "}
          <Link
            href="/register"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Créer un compte
          </Link>
        </p>
      </div>
    </main>
  );
}

function RegisteredSuccessMessage() {
  return (
    <div className="mb-4 flex items-start gap-2 rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
      <CheckCircle2Icon className="mt-0.5 size-4 shrink-0" />
      <p>
        Votre compte a été créé avec succès. Vous pouvez maintenant vous
        connecter.
      </p>
    </div>
  );
}
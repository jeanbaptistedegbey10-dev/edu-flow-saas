import type { Metadata } from "next";
import { Suspense } from "react";
import { GraduationCapIcon } from "lucide-react";

import { LoginForm } from "@/components/auth/login-form";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

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

export default function LoginPage() {
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

        {/* Formulaire (Suspense requis : useSearchParams dans le composant client) */}
        <Suspense fallback={<LoginFormFallback />}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
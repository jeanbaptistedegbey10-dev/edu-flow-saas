import type { Metadata } from "next";
import Link from "next/link";
import { GraduationCapIcon } from "lucide-react";

import { RegisterForm } from "@/components/auth/register-form";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = {
  title: "Inscription - EduFlow SaaS",
  description:
    "Créez votre compte pour gérer votre centre de formation ou agence de mobilité internationale.",
};

export default function RegisterPage() {
  return (
    <main className="flex min-h-svh flex-1 items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md rounded-xl border bg-background p-6 shadow-sm sm:p-8">
        {/* En-tête */}
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex size-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <GraduationCapIcon className="size-6" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">
            Créer un compte
          </h1>
          <p className="text-sm text-muted-foreground">
            Créez votre organisation et votre compte administrateur
          </p>
        </div>

        <Separator className="mb-6" />

        <RegisterForm />

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Vous avez déjà un compte ?{" "}
          <Link
            href="/login"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Se connecter
          </Link>
        </p>
      </div>
    </main>
  );
}
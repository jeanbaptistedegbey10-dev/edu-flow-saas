export default function DashboardPage() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
      <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
        <div className="p-6">
          <h2 className="font-semibold">Bienvenue sur EduFlow 👋</h2>
          <p className="text-sm text-muted-foreground">
            Gérez vos étudiants, cours, paiements, procédures de voyage et bien plus encore depuis ce tableau de bord central.
          </p>
        </div>
      </div>
    </div>
  );
}

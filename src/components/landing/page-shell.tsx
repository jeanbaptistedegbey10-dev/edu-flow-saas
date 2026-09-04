import type { ReactNode } from "react";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";

// ---------------------------------------------------------------------------
// PageShell — coquille commune des pages secondaires du site vitrine
// (mentions légales, politique de confidentialité, conditions d'utilisation,
// contact). Reprend la Navbar et le Footer du landing pour une navigation
// cohérente sur l'ensemble du site.
// ---------------------------------------------------------------------------

export default function PageShell({
  badge,
  title,
  description,
  updated,
  children,
}: {
  /** Libellé court affiché dans la pilule colorée au-dessus du titre. */
  badge: string;
  title: string;
  description: string;
  /** Date de dernière mise à jour, affichée sous le sous-titre. */
  updated?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-ink-900 text-white">
      <Navbar />
      <main className="relative flex-1 pt-28 pb-24">
        {/* Halo décoratif */}
        <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-brand/10 rounded-full blur-3xl" />

        <div className="relative mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          {/* En-tête */}
          <header className="text-center mb-12">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-brand/10 border border-brand/20 text-brand-light mb-4">
              {badge}
            </span>
            <h1 className="text-3xl md:text-4xl font-bold mb-4">{title}</h1>
            <p className="text-lg text-gray-400">{description}</p>
            {updated && (
              <p className="mt-3 text-sm text-gray-500">
                Dernière mise à jour : {updated}
              </p>
            )}
          </header>

          <div className="space-y-6">{children}</div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

/** Bloc de contenu encadré (« glass card ») d'une page légale. */
export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="glass-card p-6 sm:p-8">
      <h2 className="text-lg font-semibold text-white mb-4">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-gray-300">
        {children}
      </div>
    </section>
  );
}

"use client";

import { useState, useEffect, Fragment, type ReactNode } from "react";
import { Check, Sparkles } from "lucide-react";
import { PRICING_DATA, COMPARISON_MATRIX } from "@/data/content";
import type { PricingPlan } from "@/data/content";

/** Périodes de facturation affichées (grille tarifaire dynamique). */
type BillingPeriod = "initial" | "semiAnnual" | "annually";

const BILLING_PERIODS: Array<{ value: BillingPeriod; label: string }> = [
  { value: "initial", label: "1ʳᵉ année" },
  { value: "semiAnnual", label: "Semestriel" },
  { value: "annually", label: "Annuel" },
];

/** Libellé de période affiché à côté du prix. */
const PERIOD_SUFFIXES: Record<BillingPeriod, string> = {
  initial: "/ 1ʳᵉ année",
  semiAnnual: "/ 6 mois",
  annually: "/ an",
};

function formatPrice(price: number): string {
  if (price === 0) return "Gratuit";
  return price.toLocaleString("fr-FR") + " FCFA";
}

function renderCell(value: string | boolean): ReactNode {
  if (value === true) {
    return <Check className="w-5 h-5 text-mint mx-auto" />;
  }
  if (value === false) {
    return <span className="text-gray-600 mx-auto block text-center">—</span>;
  }
  return <span className="text-sm text-gray-300">{value}</span>;
}

export default function Pricing() {
  // Période de facturation sélectionnée : pilotée par la grille tarifaire
  // dynamique (table `PlanPricing`) — 1ʳᵉ année, semestriel ou annuel.
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("annually");
  const [plans, setPlans] = useState<PricingPlan[]>(PRICING_DATA);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const res = await fetch("/api/plans");
        if (res.ok) {
          const data = await res.json();
          if (data.plans && Array.isArray(data.plans) && data.plans.length > 0) {
            setPlans(data.plans);
          }
        }
      } catch {
        // Fallback to local PRICING_DATA
      } finally {
        setLoading(false);
      }
    };
    fetchPlans();
  }, []);

  return (
    <section id="tarifs" className="relative py-24 bg-ink-900">
      {/* Background accents */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-brand/5 rounded-full blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Des tarifs {" "}
            <span className="text-gradient-brand">adaptées à votre centre</span>
          </h2>
          <p className="text-lg text-gray-400">
            Cloud, Self-Hébergé ou Desktop : choisissez la formule qui correspond à votre centre de formation ou agence.
          </p>
        </div>

        {/* Billing Toggle : 1ʳᵉ année / Semestriel (6 mois) / Annuel (12 mois) */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-4">
          {BILLING_PERIODS.map((period) => (
            <button
              key={period.value}
              type="button"
              onClick={() => setBillingPeriod(period.value)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                billingPeriod === period.value
                  ? "bg-brand text-white shadow-lg shadow-brand/25"
                  : "bg-white/10 text-gray-400 hover:bg-white/15 hover:text-white"
              }`}
              aria-pressed={billingPeriod === period.value}
            >
              {period.label}
            </button>
          ))}
        </div>
        <p className="text-center text-xs text-gray-500 mb-12">
          {billingPeriod === "initial"
            ? "Licence + logiciel : prix de la 1ʳᵉ année, réservé aux nouveaux clients."
            : billingPeriod === "semiAnnual"
              ? "Abonnement semestriel : renouvellement tous les 6 mois."
              : "Abonnement annuel : 12 mois, la formule la plus économique."}
        </p>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {plans.map((plan) => {
            const price = plan.price[billingPeriod];
            const checkoutUrl = plan.checkoutUrl[billingPeriod];
            // Économie annuelle : comparer 2 × semestriel à l'annuel.
            const annualSavings =
              billingPeriod === "annually" && plan.price.semiAnnual > 0
                ? plan.price.semiAnnual * 2 - plan.price.annually
                : 0;

            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl p-8 transition-all ${
                  plan.popular
                    ? "bg-gradient-to-b from-brand/10 to-ink-800 border-2 border-brand/40 glow-brand scale-[1.02]"
                    : "glass-card glass-card-hover"
                }`}
              >
                {/* Popular Badge */}
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-gradient-to-r from-brand to-brand-light rounded-full shadow-lg shadow-brand/30">
                      <Sparkles className="w-4 h-4" />
                      Plus populaire
                    </span>
                  </div>
                )}

                {/* Plan Header */}
                <div className="mb-6">
                  <h3 className="text-xl font-bold text-white mb-2">
                    {plan.name}
                  </h3>
                  <p className="text-sm text-gray-400">{plan.description}</p>
                </div>

                {/* Price */}
                <div className="mb-6">
                  <div className="flex items-baseline gap-1">
                    <span
                      className={`text-4xl font-bold text-white ${
                        loading ? "animate-pulse" : ""
                      }`}
                    >
                      {formatPrice(price)}
                    </span>
                    {price > 0 && (
                      <span className="text-gray-400 text-sm">
                        {PERIOD_SUFFIXES[billingPeriod]}
                      </span>
                    )}
                  </div>
                  {annualSavings > 0 && (
                    <p className="text-xs text-mint mt-1">
                      Économisez{" "}
                      {annualSavings.toLocaleString("fr-FR")} FCFA / an par
                      rapport au semestriel
                    </p>
                  )}
                </div>

                {/* Features */}
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <Check className="w-5 h-5 mt-0.5 shrink-0 text-mint" />
                      <span className="text-sm text-gray-300">{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA Button */}
                <a
                  href={loading ? plan.checkoutUrl.annually : checkoutUrl}
                  className={`block w-full text-center py-3.5 rounded-xl font-medium transition-all ${
                    plan.popular
                      ? "bg-brand hover:bg-brand-dark text-white hover:shadow-lg hover:shadow-brand/25"
                      : "bg-white/10 hover:bg-white/15 text-white border border-white/10"
                  }`}
                >
                  {plan.ctaText}
                </a>
              </div>
            );
          })}
        </div>

        {/* Comparison Matrix */}
        <div className="mt-20 max-w-5xl mx-auto">
          <h3 className="text-2xl font-bold text-white text-center mb-8">
            Tableau comparatif détaillé
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="py-4 px-4 text-sm font-semibold text-gray-400">Fonctionnalité</th>
                  <th className="py-4 px-4 text-sm font-semibold text-center text-white">SaaS Cloud</th>
                  <th className="py-4 px-4 text-sm font-semibold text-center text-white">Self-Hosted Docker</th>
                  <th className="py-4 px-4 text-sm font-semibold text-center text-white">Desktop Offline</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_MATRIX.map((row) => (
                  <Fragment key={row.category}>
                    <tr className="border-b border-white/5">
                      <td colSpan={4} className="py-3 px-4 text-sm font-bold text-brand-light bg-brand/5">
                        {row.category}
                      </td>
                    </tr>
                    {row.items.map((item, idx) => (
                      <tr key={`${row.category}-${idx}`} className="border-b border-white/5 hover:bg-white/[0.02]">
                        <td className="py-3 px-4 text-sm text-gray-300">{item.feature}</td>
                        <td className="py-3 px-4 text-center">{renderCell(item.saasCloud)}</td>
                        <td className="py-3 px-4 text-center">{renderCell(item.selfHosted)}</td>
                        <td className="py-3 px-4 text-center">{renderCell(item.desktopOffline)}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
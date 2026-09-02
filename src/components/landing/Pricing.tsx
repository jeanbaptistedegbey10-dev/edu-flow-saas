"use client";

import { useState, useEffect, Fragment, type ReactNode } from "react";
import { Check, Sparkles } from "lucide-react";
import { PRICING_DATA, COMPARISON_MATRIX } from "@/data/content";
import type { PricingPlan } from "@/data/content";

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
  const [isAnnual, setIsAnnual] = useState(false);
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

        {/* Billing Toggle */}
        <div className="flex items-center justify-center gap-4 mb-12">
          <span
            className={`text-sm font-medium ${
              !isAnnual ? "text-white" : "text-gray-400"
            }`}
          >
            Mensuel
          </span>
          <button
            onClick={() => setIsAnnual(!isAnnual)}
            className={`relative w-14 h-7 rounded-full transition-colors ${
              isAnnual ? "bg-brand" : "bg-white/10"
            }`}
            aria-label="Toggle billing period"
          >
            <div
              className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${
                isAnnual ? "translate-x-8" : "translate-x-1"
              }`}
            />
          </button>
          <span
            className={`text-sm font-medium ${
              isAnnual ? "text-white" : "text-gray-400"
            }`}
          >
            Annuel
          </span>
          {isAnnual && (
            <span className="px-2.5 py-1 text-xs font-medium text-gold bg-gold/10 rounded-full border border-gold/20">
              2 mois offerts
            </span>
          )}
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {plans.map((plan) => {
            const price = isAnnual ? plan.price.annually : plan.price.monthly;
            const checkoutUrl = isAnnual
              ? plan.checkoutUrl.annually
              : plan.checkoutUrl.monthly;

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
                    <span className="text-4xl font-bold text-white">
                      {formatPrice(price)}
                    </span>
                    {price > 0 && (
                      <span className="text-gray-400 text-sm">
                        /{isAnnual ? "an" : "mois"}
                      </span>
                    )}
                  </div>
                  {isAnnual && plan.price.monthly > 0 && (
                    <p className="text-xs text-mint mt-1">
                      Économisez{" "}
                      {(
                        plan.price.monthly * 12 -
                        plan.price.annually
                      ).toLocaleString("fr-FR")} FCFA / an
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
                  href={loading ? plan.checkoutUrl.monthly : checkoutUrl}
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
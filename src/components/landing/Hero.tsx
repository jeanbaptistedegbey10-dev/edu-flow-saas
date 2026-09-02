"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import { VISA_TIMELINE_STEPS } from "@/data/content";

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden bg-ink-900">
      {/* Background Gradient Orbs */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-brand/20 rounded-full blur-3xl animate-float" />
        <div className="absolute top-1/3 -right-32 w-80 h-80 bg-mint/10 rounded-full blur-3xl animate-float-delayed" />
        <div className="absolute bottom-1/4 left-1/3 w-72 h-72 bg-brand/10 rounded-full blur-3xl animate-pulse-glow" />
      </div>

      {/* Grid Pattern Overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 md:py-32">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left Content */}
          <div className="space-y-8">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand/10 border border-brand/20 text-brand-light text-sm">
              <Sparkles className="w-4 h-4" />
              <span>Nouveau : Accompagnement Visa 2025</span>
            </div>

            {/* Heading */}
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight">
              Reussissez votre projet d&apos;etudes{" "}
              <span className="text-gradient-brand">a l&apos;international</span>
            </h1>

            {/* Description */}
            <p className="text-lg text-gray-400 max-w-xl leading-relaxed">
              EduFlow vous accompagne de A a Z dans vos demarches de candidature universitaire, demande de visa et recherche de logement. Plus de 2 500 etudiants nous font deja confiance.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href="/auth/signup"
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 text-base font-medium text-white bg-brand hover:bg-brand-dark rounded-xl transition-all hover:shadow-xl hover:shadow-brand/25 hover:-translate-y-0.5"
              >
                Commencer gratuitement
                <ArrowRight className="w-5 h-5" />
              </Link>
              <a
                href="#features"
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 text-base font-medium text-gray-300 bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 rounded-xl transition-all"
              >
                Decouvrir les fonctionnalites
              </a>
            </div>

            {/* Trust Signals */}
            <div className="flex items-center gap-6 pt-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-mint" />
                <span className="text-sm text-gray-400">100% gratuit pour demarrer</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-mint" />
                <span className="text-sm text-gray-400">Sans engagement</span>
              </div>
            </div>
          </div>

          {/* Right Content - Visa Timeline Preview */}
          <div className="relative">
            <div className="relative glass-card p-6 lg:p-8 glow-brand">
              {/* Card Header */}
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-white">Suivi Visa</h3>
                <span className="px-2.5 py-1 text-xs font-medium text-mint bg-mint/10 rounded-full border border-mint/20">
                  En cours
                </span>
              </div>

              {/* Timeline */}
              <div className="space-y-4">
                {VISA_TIMELINE_STEPS.map((step, index) => (
                  <div key={step.step} className="flex items-center gap-4">
                    {/* Step Indicator */}
                    <div className="relative">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all ${
                          step.status === "completed"
                            ? "bg-mint/20 border-mint text-mint"
                            : step.status === "current"
                            ? "bg-brand/20 border-brand text-brand-light animate-timeline-pulse"
                            : "bg-white/5 border-white/20 text-gray-500"
                        }`}
                      >
                        {step.status === "completed" ? (
                          <CheckCircle2 className="w-5 h-5" />
                        ) : (
                          step.step
                        )}
                      </div>
                      {index < VISA_TIMELINE_STEPS.length - 1 && (
                        <div
                          className={`absolute top-10 left-1/2 -translate-x-1/2 w-0.5 h-6 ${
                            step.status === "completed" ? "bg-mint/40" : "bg-white/10"
                          }`}
                        />
                      )}
                    </div>

                    {/* Step Content */}
                    <div className="flex-1">
                      <p
                        className={`text-sm font-medium ${
                          step.status === "upcoming" ? "text-gray-500" : "text-white"
                        }`}
                      >
                        {step.title}
                      </p>
                      <p className="text-xs text-gray-500">
                        {step.status === "completed" && "Termine"}
                        {step.status === "current" && "En cours de traitement"}
                        {step.status === "upcoming" && "A venir"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Progress Bar */}
              <div className="mt-6 pt-4 border-t border-white/10">
                <div className="flex justify-between text-xs text-gray-400 mb-2">
                  <span>Progression</span>
                  <span>60%</span>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-brand to-mint rounded-full transition-all duration-1000"
                    style={{ width: "60%" }}
                  />
                </div>
              </div>
            </div>

            {/* Floating Badge */}
            <div className="absolute -bottom-4 -left-4 glass-card px-4 py-2 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-mint animate-pulse" />
              <span className="text-sm text-gray-300">98% taux de reussite</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

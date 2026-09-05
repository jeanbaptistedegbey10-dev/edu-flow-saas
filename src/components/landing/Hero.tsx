"use client";

import * as React from "react";
import Link from "next/link";
import { DotLottieReact, setWasmUrl } from "@lottiefiles/dotlottie-react";
import {
  ArrowRight,
  CheckCircle2,
  CreditCard,
  GraduationCap,
  IdCard,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Hero — bannière animée du landing.
// ---------------------------------------------------------------------------
// Colonne droite : la maquette « Tableau de bord » (structure originale
// conservée) est rejouée en boucle toutes les 8 s via un état React
// séquentiel :
//   1. la barre d'assiduité monte de 0 % à 85 % ;
//   2. « Passeport valide » puis « Lettre d'acceptation » se cochent en vert ;
//   3. « Preuve financière » se coche avec un effet scale-pop ;
//   4. le pipeline visa passe de « Etape 2/4 » à « Etape 3/4 ».
// Colonne gauche : animation principale Lottie « globe terrestre & avion »
// (mobilité internationale / procédures de visa, WASM servi en local),
// badges de destinations (France, Allemagne, Canada, États-Unis) sous le
// titre et animation « parcours étudiant » (langues → départs à
// l'international) près des CTA.
// ---------------------------------------------------------------------------

// Renderer dotLottie : le WASM est servi depuis /public (fonctionne hors-ligne).
setWasmUrl("/lottie/dotlottie-player.wasm");

/** Durée complète d'un cycle d'animation. */
const HERO_CYCLE_MS = 8000;
/** Pause initiale avant la première boucle (état terminé au premier paint). */
const HERO_START_DELAY_MS = 1800;

/** État de la démo animée de la colonne droite. */
type HeroDemoStep = {
  /** Barre « Assiduité » : 0 → 85. */
  progress: number;
  passportChecked: boolean;
  acceptanceChecked: boolean;
  financialChecked: boolean;
  /** Étape courante du pipeline (affichée « Etape X/4 »). */
  pipelineStep: number;
};

/** État « terminé » — rendu au premier paint (et entre deux boucles). */
const COMPLETED_STEP: HeroDemoStep = {
  progress: 85,
  passportChecked: true,
  acceptanceChecked: true,
  financialChecked: true,
  pipelineStep: 3,
};

const PIPELINE_SEGMENTS = [0, 1, 2, 3];

/** Destinations phares mises en avant sous le titre (badges drapeaux). */
const DESTINATIONS = [
  { flag: "🇫🇷", name: "France" },
  { flag: "🇩🇪", name: "Allemagne" },
  { flag: "🇨🇦", name: "Canada" },
  { flag: "🇺🇸", name: "États-Unis" },
] as const;

export default function Hero() {
  const [step, setStep] = React.useState<HeroDemoStep>(COMPLETED_STEP);

  React.useEffect(() => {
    let active = true;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const clearTimers = () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.length = 0;
    };

    const runCycle = () => {
      clearTimers();

      // t = 0 — remise à zéro de la maquette.
      setStep({
        progress: 0,
        passportChecked: false,
        acceptanceChecked: false,
        financialChecked: false,
        pipelineStep: 2,
      });

      const at = (delay: number, patch: Partial<HeroDemoStep>) => {
        timers.push(
          setTimeout(() => {
            if (active) setStep((prev) => ({ ...prev, ...patch }));
          }, delay)
        );
      };

      // Étape 1 — barre d'assiduité 0 % → 85 % (transition CSS 700 ms).
      at(1000, { progress: 85 });
      // Étape 2 — « Passeport valide » puis « Lettre d'acceptation » se cochent.
      at(2400, { passportChecked: true });
      at(3200, { acceptanceChecked: true });
      // Étape 3 — « Preuve financière » se coche (scale-pop).
      at(4400, { financialChecked: true });
      // Étape 4 — le pipeline avance de « Etape 2/4 » à « Etape 3/4 ».
      at(5600, { pipelineStep: 3 });

      // Fin du cycle — relance propre toutes les 8 secondes.
      timers.push(
        setTimeout(() => {
          if (active) runCycle();
        }, HERO_CYCLE_MS)
      );
    };

    timers.push(setTimeout(() => runCycle(), HERO_START_DELAY_MS));

    return () => {
      active = false;
      clearTimers();
    };
  }, []);

  const assistedSessions = Math.round((step.progress / 100) * 40);

  return (
    <section className="relative min-h-screen flex items-center overflow-hidden bg-ink-900">
      {/* Background Gradient Orbs */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-0 w-64 sm:w-96 h-64 sm:h-96 bg-brand/20 rounded-full blur-3xl animate-float" />
        <div className="absolute top-1/3 right-0 w-56 sm:w-80 h-56 sm:h-80 bg-mint/10 rounded-full blur-3xl animate-float-delayed" />
        <div className="absolute bottom-1/4 left-1/3 w-48 sm:w-72 h-48 sm:h-72 bg-brand/10 rounded-full blur-3xl animate-pulse-glow" />
      </div>

      {/* Grid Pattern Overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 md:py-32">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left Content */}
          <div className="relative space-y-8">
            {/* Animation principale Lottie — globe & avion (mobilité internationale) */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-28 right-0 hidden h-32 w-32 opacity-95 animate-float sm:h-40 sm:w-40 lg:block xl:h-48 xl:w-48"
            >
              <DotLottieReact
                src="/lottie/globe-airplane.json"
                loop
                autoplay
                aria-hidden="true"
                style={{ width: "100%", height: "100%" }}
              />
            </div>

            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand/10 border border-brand/20 text-brand-light text-sm">
              <GraduationCap className="w-4 h-4" />
              <span>Nouveau : Pipeline Visa intégré</span>
            </div>

            {/* Heading */}
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight">
              Pilotez vos cours de langues &amp; procédures d&apos;immigration{" "}
              <span className="text-gradient-brand">en toute simplicité</span>
            </h1>

            {/* Badges destinations — principaux pays d'expatriation */}
            <div className="flex flex-wrap items-center gap-2">
              {DESTINATIONS.map((destination) => (
                <span
                  key={destination.name}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm text-gray-300 transition-colors hover:border-brand/30 hover:bg-brand/10"
                >
                  <span aria-hidden="true">{destination.flag}</span>
                  <span>{destination.name}</span>
                </span>
              ))}
            </div>

            {/* Description */}
            <p className="text-lg text-gray-400 max-w-xl leading-relaxed">
              Gérez vos étudiants, sessions de cours, dossiers de voyage et caisse POS depuis une seule plateforme moderne. Disponible en ligne ou hors-ligne.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href="/register"
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 text-base font-medium text-white bg-brand hover:bg-brand-dark rounded-xl transition-all hover:shadow-xl hover:shadow-brand/25 hover:-translate-y-0.5"
              >
                Essai Gratuit 30 jours
                <ArrowRight className="w-5 h-5" />
              </Link>
              <a
                href="#tarifs"
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 text-base font-medium text-gray-300 bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 rounded-xl transition-all"
              >
                Voir les Tarifs
              </a>
            </div>

            {/* Proof Text */}
            <div className="flex items-center gap-2 pt-4">
              <div className="flex -space-x-2">
                <div className="w-8 h-8 rounded-full bg-brand/30 border-2 border-ink-900 flex items-center justify-center text-xs text-white font-bold">A</div>
                <div className="w-8 h-8 rounded-full bg-mint/30 border-2 border-ink-900 flex items-center justify-center text-xs text-white font-bold">M</div>
                <div className="w-8 h-8 rounded-full bg-gold/30 border-2 border-ink-900 flex items-center justify-center text-xs text-white font-bold">S</div>
              </div>
              <span className="text-sm text-gray-400 font-medium">+50 centres nous font confiance</span>
            </div>
          </div>

          {/* Right Content - Dashboard Preview */}
          <div className="relative">
            <div className="glass-card p-6 glow-brand space-y-5">
              {/* Dashboard Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-brand/20 border border-brand/30 flex items-center justify-center">
                    <GraduationCap className="w-5 h-5 text-brand-light" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">Tableau de bord</h3>
                    <p className="text-xs text-gray-400">EduFlow Centre</p>
                  </div>
                </div>
                <span className="px-2.5 py-1 text-xs font-medium text-mint bg-mint/10 rounded-full border border-mint/20">En ligne</span>
              </div>

              {/* Student Tracking Card */}
              <div className="flex items-center gap-4 p-3 rounded-xl bg-white/5 border border-white/5">
                <div className="w-11 h-11 rounded-full bg-brand/20 border border-brand/30 flex items-center justify-center shrink-0">
                  <GraduationCap className="w-5 h-5 text-brand-light" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">Koffi Adjoua</p>
                  <p className="text-xs text-gray-400">German B2</p>
                </div>
                <span className="px-2 py-0.5 text-xs font-medium text-mint bg-mint/10 rounded-full border border-mint/20">Actif</span>
              </div>

              {/* Course Status — barre animée 0 % → 85 % (étape 1) */}
              <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="w-4 h-4 text-brand-light" />
                    <span className="text-sm font-medium text-white">Assiduite aux cours</span>
                  </div>
                  <span className="text-sm font-bold text-mint">{step.progress}%</span>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-brand to-mint rounded-full transition-[width] duration-700 ease-out"
                    style={{ width: `${step.progress}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2">{assistedSessions}/40 sessions assistees ce mois</p>
              </div>

              {/* Visa Pipeline — « Etape 2/4 » → « Etape 3/4 » (étape 4) */}
              <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <IdCard className="w-4 h-4 text-brand-light" />
                    <span className="text-sm font-medium text-white">Pipeline Visa</span>
                  </div>
                  <span className="text-xs text-gray-400">Etape {step.pipelineStep}/4</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center gap-1">
                    {PIPELINE_SEGMENTS.map((segment) => {
                      const index = segment + 1;
                      const isDone = index < step.pipelineStep;
                      const isCurrent = index === step.pipelineStep;
                      return (
                        <div
                          key={segment}
                          className={`h-2 flex-1 rounded-full transition-colors duration-500 ${
                            isDone ? "bg-mint" : isCurrent ? "bg-brand animate-pulse" : "bg-white/10"
                          }`}
                        />
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-gray-500">Consulat RDV</span>
                  <span className="text-xs font-medium text-brand-light">En cours</span>
                </div>
              </div>

              {/* Checklist documents — coches séquentielles (étapes 2 & 3) */}
              <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                <div className="flex items-center gap-2 mb-3">
                  <CreditCard className="w-4 h-4 text-gold" />
                  <span className="text-sm font-medium text-white">Checklist documents</span>
                </div>
                <div className="space-y-2">
                  {/* Passeport valide — coche verte (étape 2) */}
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-4 w-4 items-center justify-center">
                      <CheckCircle2
                        className={`absolute h-4 w-4 text-mint transition-all duration-500 ${
                          step.passportChecked ? "opacity-100 scale-100" : "opacity-0 scale-50"
                        }`}
                      />
                      <span
                        className={`absolute h-4 w-4 rounded-full border-2 transition-all duration-500 ${
                          step.passportChecked ? "scale-75 border-mint opacity-0" : "border-white/20"
                        }`}
                      />
                    </span>
                    <span className={`text-xs transition-colors duration-500 ${step.passportChecked ? "text-gray-300" : "text-gray-500"}`}>
                      Passeport valide
                    </span>
                  </div>

                  {/* Lettre d'acceptation — coche verte (étape 2) */}
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-4 w-4 items-center justify-center">
                      <CheckCircle2
                        className={`absolute h-4 w-4 text-mint transition-all duration-500 ${
                          step.acceptanceChecked ? "opacity-100 scale-100" : "opacity-0 scale-50"
                        }`}
                      />
                      <span
                        className={`absolute h-4 w-4 rounded-full border-2 transition-all duration-500 ${
                          step.acceptanceChecked ? "scale-75 border-mint opacity-0" : "border-white/20"
                        }`}
                      />
                    </span>
                    <span className={`text-xs transition-colors duration-500 ${step.acceptanceChecked ? "text-gray-300" : "text-gray-500"}`}>
                      Lettre d&apos;acceptation
                    </span>
                  </div>

                  {/* Preuve financiere — coche verte avec scale-pop (étape 3) */}
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-4 w-4 items-center justify-center">
                      <CheckCircle2
                        className={`absolute h-4 w-4 text-mint transition-all duration-500 ${
                          step.financialChecked ? "animate-check-pop opacity-100" : "opacity-0 scale-50"
                        }`}
                      />
                      <span
                        className={`absolute h-4 w-4 rounded-full border-2 transition-all duration-500 ${
                          step.financialChecked ? "scale-75 border-mint opacity-0" : "border-white/20"
                        }`}
                      />
                    </span>
                    <span className={`text-xs transition-colors duration-500 ${step.financialChecked ? "text-gray-300" : "text-gray-500"}`}>
                      Preuve financiere
                    </span>
                  </div>

                  {/* Formulaire consulaire (reste en attente) */}
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full border-2 border-white/20" />
                    <span className="text-xs text-gray-500">Formulaire consulaire</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Floating Badge */}
            <div className="absolute -bottom-4 left-0 sm:-left-4 glass-card px-3 sm:px-4 py-2 flex items-center gap-2 max-w-[200px]">
              <div className="w-3 h-3 rounded-full bg-mint animate-pulse shrink-0" />
              <span className="text-xs sm:text-sm text-gray-300 truncate">5+ annees d&apos;experience</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
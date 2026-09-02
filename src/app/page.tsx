"use client";

import { useState } from "react";
import Link from "next/link";
import {
  GraduationCapIcon,
  Users,
  FileTextIcon,
  BanknoteIcon,
  FolderOpenIcon,
  CloudIcon,
  ServerIcon,
  MonitorIcon,
  CheckCircleIcon,
  ShieldCheckIcon,
  ZapIcon,
  ArrowRightIcon,
  PhoneIcon,
  MailIcon,
  MapPinIcon,
  QrCodeIcon,
  BellIcon,
  BarChart3Icon,
  CreditCardIcon,
  ReceiptIcon,
  TrendingUpIcon,
  PieChartIcon,
  UserCheckIcon,
  FileSpreadsheetIcon,
  MessageSquareIcon,
  GlobeIcon,
  LockIcon,
  SparklesIcon,
  StarIcon,
  ChevronRightIcon,
  PlayIcon,
  XIcon,
  HeadphonesIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
/* ------------------------------------------------------------------ */
/*  Données statiques                                                   */
/* ------------------------------------------------------------------ */

const metrics = [
  { value: "50+", label: "Établissements partenaires", icon: GraduationCapIcon },
  { value: "99.8%", label: "Satisfaction client", icon: StarIcon },
  { value: "100%", label: "Conformité RGPD", icon: ShieldCheckIcon },
  { value: "24/7", label: "Support dédié", icon: HeadphonesIcon },
];

const features = [
  {
    id: "attendance",
    title: "Marquage & Suivi des Présences",
    description:
      "Appel par QR Code, suivi des absences et retards en temps réel, notifications automatiques aux parents.",
    icon: QrCodeIcon,
    color: "from-violet-500 to-purple-600",
    bgColor: "bg-violet-500/10",
    items: [
      { icon: QrCodeIcon, text: "Appel QR Code instantané" },
      { icon: BellIcon, text: "Alertes parents automatiques" },
      { icon: UserCheckIcon, text: "Suivi retards & absences" },
    ],
  },
  {
    id: "payments",
    title: "Gestion des Écolages & Paiements",
    description:
      "Intégration KKiaPay, FedaPay, Mobile Money. Reçus automatiques et suivi complet des transactions.",
    icon: BanknoteIcon,
    color: "from-emerald-500 to-teal-600",
    bgColor: "bg-emerald-500/10",
    items: [
      { icon: CreditCardIcon, text: "KKiaPay, FedaPay, Mobile Money" },
      { icon: ReceiptIcon, text: "Reçus automatiques" },
      { icon: FileSpreadsheetIcon, text: "Suivi comptable intégré" },
    ],
  },
  {
    id: "kpi",
    title: "Indicateurs de Performance & KPI",
    description:
      "Tableaux de bord interactifs, graphiques de réussite, suivi des notes et analyses prédictives.",
    icon: BarChart3Icon,
    color: "from-blue-500 to-cyan-600",
    bgColor: "bg-blue-500/10",
    items: [
      { icon: TrendingUpIcon, text: "Graphiques de réussite" },
      { icon: PieChartIcon, text: "Tableaux de bord interactifs" },
      { icon: BarChart3Icon, text: "Analyses prédictives" },
    ],
  },
  {
    id: "hr",
    title: "Paie & Ressources Humaines",
    description:
      "Bulletins de paie du personnel, contrats, suivi des heures d\'enseignement et gestion des congés.",
    icon: Users,
    color: "from-orange-500 to-amber-600",
    bgColor: "bg-orange-500/10",
    items: [
      { icon: FileTextIcon, text: "Bulletins de paie automatisés" },
      { icon: FileSpreadsheetIcon, text: "Gestion des contrats" },
      { icon: UserCheckIcon, text: "Suivi heures d\'enseignement" },
    ],
  },
  {
    id: "communication",
    title: "Communication & Portail Parents",
    description:
      "Portail dédié parents/élèves, messagerie intégrée, partage de documents et circulaires numériques.",
    icon: MessageSquareIcon,
    color: "from-pink-500 to-rose-600",
    bgColor: "bg-pink-500/10",
    items: [
      { icon: GlobeIcon, text: "Portail parents/élèves" },
      { icon: MessageSquareIcon, text: "Messagerie intégrée" },
      { icon: FolderOpenIcon, text: "Partage de documents" },
    ],
  },
];
const pricingPlans = [
  {
    name: "Starter",
    description: "Idéal pour les petits établissements",
    monthlyPrice: 29,
    annualPrice: 24,
    features: [
      "Jusqu\'à 200 élèves",
      "Gestion des présences",
      "Suivi des notes",
      "Portail parents basique",
      "Support email",
    ],
    highlighted: false,
    cta: "Commencer l\'essai",
  },
  {
    name: "Pro",
    description: "Pour les établissements en croissance",
    monthlyPrice: 79,
    annualPrice: 66,
    features: [
      "Élèves illimités",
      "Paiements intégrés (KKiaPay, FedaPay)",
      "Tableaux de bord avancés",
      "Paie & RH complets",
      "Notifications SMS",
      "Support prioritaire",
    ],
    highlighted: true,
    cta: "Démarrer maintenant",
  },
  {
    name: "Enterprise",
    description: "Solutions sur mesure pour grands groupes",
    monthlyPrice: 199,
    annualPrice: 166,
    features: [
      "Tout de Pro +",
      "Multi-établissements",
      "API dédiée",
      "Formation sur site",
      "Account manager dédié",
      "SLA garanti 99.9%",
    ],
    highlighted: false,
    cta: "Contacter les ventes",
  },
];

const faqItems = [
  {
    question: "Combien de temps prend l\'implémentation d\'EduFlow ?",
    answer:
      "L\'implémentation standard prend entre 2 et 4 semaines. Notre équipe vous accompagne à chaque étape : import des données, configuration, formation du personnel et mise en ligne.",
  },
  {
    question: "Mes données sont-elles sécurisées ?",
    answer:
      "Absolument. Nous utilisons un chiffrement de bout en bout (AES-256) pour toutes vos données. La version Cloud bénéficie de sauvegardes automatiques quotidiennes et d\'une infrastructure hébergée en Europe conforme RGPD.",
  },
  {
    question: "Puis-je migrer d\'une formule à une autre ?",
    answer:
      "Oui, vous pouvez migrer à tout moment. Si vous passez de Desktop Offline à SaaS Cloud, nous vous aidons à importer vos données existantes sans aucune perte.",
  },
  {
    question: "Quels moyens de paiement acceptez-vous ?",
    answer:
      "Nous acceptons les virements bancaires, Mobile Money (Orange Money, MTN Mobile Money, Wave), les cartes de crédit (Visa, Mastercard) ainsi que les chèques pour les établissements.",
  },
  {
    question: "Proposez-vous une période d\'essai gratuite ?",
    answer:
      "Oui ! Chaque plan inclut 14 jours d\'essai gratuit sans engagement. Aucune carte bancaire n\'est requise pour démarrer votre essai.",
  },
  {
    question: "Le support technique est-il inclus ?",
    answer:
      "Le support est inclus dans toutes nos offres. Le plan Starter inclut le support email, le Pro ajoute le support prioritaire par chat, et l\'Enterprise bénéficie d\'un account manager dédié avec SLA garanti.",
  },
];
/* ------------------------------------------------------------------ */
/*  Composants                                                         */
/* ------------------------------------------------------------------ */

function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 border-b border-border/40 bg-background/70 backdrop-blur-xl">
      <div className="container-1080p flex h-16 items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-indigo-600 shadow-lg shadow-primary/25">
            <GraduationCapIcon className="size-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight">EduFlow</span>
        </div>

        <div className="hidden items-center gap-8 md:flex">
          <a
            href="#features"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Fonctionnalités
          </a>
          <a
            href="#pricing"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Tarifs
          </a>
          <a
            href="#faq"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            FAQ
          </a>
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/login">Se connecter</Link>
          </Button>
          <Button size="sm" className="shadow-sm shadow-primary/20" asChild>
            <Link href="#pricing">
              Essai gratuit
              <ArrowRightIcon className="ml-1.5 size-3.5" />
            </Link>
          </Button>
        </div>

        <button
          className="flex size-9 items-center justify-center rounded-lg md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Menu"
        >
          {mobileOpen ? (
            <XIcon className="size-5" />
          ) : (
            <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-border/40 bg-background/95 backdrop-blur-xl md:hidden">
          <div className="container-1080p flex flex-col gap-1 py-4">
            <a href="#features" className="rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setMobileOpen(false)}>
              Fonctionnalités
            </a>
            <a href="#pricing" className="rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setMobileOpen(false)}>
              Tarifs
            </a>
            <a href="#faq" className="rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setMobileOpen(false)}>
              FAQ
            </a>
            <div className="mt-2 flex flex-col gap-2 border-t border-border/40 pt-4">
              <Button variant="outline" size="sm" asChild>
                <Link href="/login">Se connecter</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="#pricing">Essai gratuit</Link>
              </Button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[600px] w-[800px] rounded-full bg-gradient-to-br from-primary/15 via-indigo-500/10 to-transparent blur-3xl" />
        <div className="absolute top-20 right-0 h-[400px] w-[400px] rounded-full bg-gradient-to-bl from-emerald-500/10 to-transparent blur-3xl" />
        <div className="absolute bottom-0 left-0 h-[300px] w-[300px] rounded-full bg-gradient-to-tr from-violet-500/10 to-transparent blur-3xl" />
      </div>

      <div className="container-1080p py-20 md:py-28 lg:py-36">
        <div className="mx-auto max-w-4xl text-center">
          {/* Badge */}
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-5 py-2 text-sm font-medium text-primary shadow-sm shadow-primary/10">
            <SparklesIcon className="size-4" />
            <span>La gestion scolaire nouvelle génération</span>
            <ChevronRightIcon className="size-3.5 opacity-60" />
          </div>

          {/* Title */}
          <h1 className="text-4xl font-extrabold tracking-tight md:text-5xl lg:text-6xl xl:text-7xl">
            <span className="block">Transformez votre</span>
            <span className="mt-2 block bg-gradient-to-r from-primary via-indigo-500 to-violet-500 bg-clip-text text-transparent">
              établissement scolaire
            </span>
          </h1>

          {/* Subtitle */}
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl lg:text-[1.35rem] leading-relaxed">
            EduFlow centralise la gestion des élèves, la paie du personnel, les bulletins de notes,
            le suivi des écolages et la communication avec les parents \u2014 le tout sur une plateforme unique.
          </p>

          {/* CTAs */}
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button size="lg" className="h-12 px-8 text-base shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-shadow" asChild>
              <Link href="/create-organisation">
                Commencer un essai gratuit
                <ArrowRightIcon className="ml-2 size-4" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" className="h-12 px-8 text-base" asChild>
              <a href="#demo">
                <PlayIcon className="mr-2 size-4" />
                Demander une démo
              </a>
            </Button>
          </div>

          {/* Trust indicators */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <CheckCircleIcon className="size-4 text-emerald-500" />
              14 jours gratuits
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircleIcon className="size-4 text-emerald-500" />
              Sans carte bancaire
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircleIcon className="size-4 text-emerald-500" />
              Support inclus
            </span>
          </div>
        </div>
        {/* Dashboard Preview */}
        <div className="relative mx-auto mt-16 max-w-5xl">
          <div className="absolute -inset-4 rounded-3xl bg-gradient-to-b from-primary/10 via-transparent to-transparent blur-2xl" />
          <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/80 shadow-2xl shadow-primary/5 backdrop-blur-sm">
            {/* Window chrome */}
            <div className="flex items-center gap-2 border-b border-border/40 px-4 py-3">
              <div className="flex gap-1.5">
                <div className="size-3 rounded-full bg-red-400/80" />
                <div className="size-3 rounded-full bg-amber-400/80" />
                <div className="size-3 rounded-full bg-emerald-400/80" />
              </div>
              <div className="ml-4 flex-1 rounded-md bg-muted/60 px-3 py-1 text-xs text-muted-foreground">
                app.eduflow.com/dashboard
              </div>
            </div>
            {/* Dashboard content mockup */}
            <div className="grid grid-cols-12 gap-4 p-6">
              {/* Sidebar */}
              <div className="col-span-3 hidden space-y-3 md:block">
                <div className="h-8 w-full rounded-lg bg-primary/10" />
                <div className="h-6 w-3/4 rounded bg-muted" />
                <div className="h-6 w-full rounded bg-muted" />
                <div className="h-6 w-5/6 rounded bg-muted" />
                <div className="h-6 w-2/3 rounded bg-muted" />
                <div className="mt-4 h-6 w-full rounded bg-muted" />
                <div className="h-6 w-4/5 rounded bg-muted" />
              </div>
              {/* Main content */}
              <div className="col-span-12 space-y-4 md:col-span-9">
                {/* Stats row */}
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {[
                    { label: "Élèves", value: "1,247", color: "from-violet-500 to-purple-600" },
                    { label: "Présences", value: "98.2%", color: "from-emerald-500 to-teal-600" },
                    { label: "Revenus", value: "12.4M", color: "from-blue-500 to-cyan-600" },
                    { label: "Personnel", value: "86", color: "from-orange-500 to-amber-600" },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-xl border border-border/40 bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">{stat.label}</p>
                      <p className={`mt-1 text-lg font-bold bg-gradient-to-r ${stat.color} bg-clip-text text-transparent`}>
                        {stat.value}
                      </p>
                    </div>
                  ))}
                </div>
                {/* Chart area */}
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                  <div className="col-span-2 h-32 rounded-xl border border-border/40 bg-gradient-to-br from-primary/5 to-transparent p-4">
                    <div className="flex h-full items-end gap-1.5">
                      {[40, 65, 45, 80, 55, 90, 70, 85, 60, 95, 75, 88].map((h, i) => (
                        <div
                          key={i}
                          className="flex-1 rounded-t bg-gradient-to-t from-primary/60 to-primary/20 transition-all"
                          style={{ height: `${h}%` }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-3">
                    <div className="flex-1 rounded-xl border border-border/40 bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">Taux de réussite</p>
                      <p className="mt-1 text-2xl font-bold text-emerald-500">94.7%</p>
                    </div>
                    <div className="flex-1 rounded-xl border border-border/40 bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">Paiements du mois</p>
                      <p className="mt-1 text-2xl font-bold text-primary">89%</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
function SocialProofBar() {
  return (
    <section className="border-y border-border/40 bg-muted/20 py-10">
      <div className="container-1080p">
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          {metrics.map((metric) => (
            <div key={metric.label} className="flex flex-col items-center gap-2 text-center">
              <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <metric.icon className="size-5" />
              </div>
              <p className="text-2xl font-bold tracking-tight md:text-3xl">{metric.value}</p>
              <p className="text-sm text-muted-foreground">{metric.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
function FeaturesSection() {
  const [activeTab, setActiveTab] = useState("attendance");
  const activeFeature = features.find((f) => f.id === activeTab) ?? features[0];

  return (
    <section id="features" className="py-20 md:py-28">
      <div className="container-1080p">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
            <ZapIcon className="size-3.5" />
            Fonctionnalités métier
          </div>
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl lg:text-5xl">
            Tout ce dont votre établissement a{" "}
            <span className="bg-gradient-to-r from-primary to-indigo-500 bg-clip-text text-transparent">
              besoin
            </span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Une suite complète d\'outils conçus pour simplifier la gestion quotidienne de votre école.
          </p>
        </div>

        {/* Tabs */}
        <div className="mt-12 flex flex-wrap justify-center gap-2">
          {features.map((feature) => (
            <button
              key={feature.id}
              onClick={() => setActiveTab(feature.id)}
              className={`flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition-all ${
                activeTab === feature.id
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <feature.icon className="size-4" />
              <span className="hidden sm:inline">{feature.title.split(" ").slice(0, 2).join(" ")}</span>
              <span className="sm:hidden">{feature.title.split(" ")[0]}</span>
            </button>
          ))}
        </div>

        {/* Active feature content */}
        <div className="mt-10 grid items-center gap-10 lg:grid-cols-2">
          {/* Left: Description */}
          <div className="space-y-6">
            <div className={`inline-flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br ${activeFeature.color} shadow-lg`}>
              <activeFeature.icon className="size-7 text-white" />
            </div>
            <h3 className="text-2xl font-bold md:text-3xl">{activeFeature.title}</h3>
            <p className="text-lg text-muted-foreground leading-relaxed">
              {activeFeature.description}
            </p>
            <ul className="space-y-3">
              {activeFeature.items.map((item) => (
                <li key={item.text} className="flex items-center gap-3">
                  <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${activeFeature.bgColor}`}>
                    <item.icon className="size-4 text-foreground" />
                  </div>
                  <span className="text-sm font-medium">{item.text}</span>
                </li>
              ))}
            </ul>
            <Button className="mt-4 shadow-sm shadow-primary/20" asChild>
              <Link href="#pricing">
                Découvrir cette fonctionnalité
                <ArrowRightIcon className="ml-2 size-4" />
              </Link>
            </Button>
          </div>
          {/* Right: Visual mockup */}
          <div className="relative">
            <div className={`absolute -inset-4 rounded-3xl bg-gradient-to-br ${activeFeature.color} opacity-10 blur-2xl`} />
            <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/90 p-6 shadow-xl backdrop-blur-sm">
              <div className="space-y-4">
                {/* Mockup header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <activeFeature.icon className="size-5" style={{ color: "var(--primary)" }} />
                    <span className="text-sm font-semibold">{activeFeature.title}</span>
                  </div>
                  <div className="flex gap-1">
                    <div className="size-2 rounded-full bg-muted" />
                    <div className="size-2 rounded-full bg-muted" />
                    <div className="size-2 rounded-full bg-muted" />
                  </div>
                </div>
                {/* Mockup content */}
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex items-center gap-3 rounded-xl border border-border/30 bg-muted/20 p-3">
                      <div className={`size-10 rounded-lg bg-gradient-to-br ${activeFeature.color} opacity-80`} />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-3/4 rounded bg-muted" />
                        <div className="h-2 w-1/2 rounded bg-muted/60" />
                      </div>
                      <div className="h-6 w-16 rounded-full bg-muted" />
                    </div>
                  ))}
                </div>
                {/* Mockup chart */}
                <div className="flex h-20 items-end gap-1 rounded-lg bg-muted/20 p-3">
                  {[30, 50, 40, 70, 55, 80, 65, 90].map((h, i) => (
                    <div
                      key={i}
                      className={`flex-1 rounded-t bg-gradient-to-t ${activeFeature.color} opacity-70`}
                      style={{ height: `${h}%` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
function PricingSection() {
  const [isAnnual, setIsAnnual] = useState(false);

  return (
    <section id="pricing" className="border-t border-border/40 bg-muted/20 py-20 md:py-28">
      <div className="container-1080p">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
            <BanknoteIcon className="size-3.5" />
            Tarifs & Souscription
          </div>
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl lg:text-5xl">
            Un plan adapté à chaque{" "}
            <span className="bg-gradient-to-r from-primary to-indigo-500 bg-clip-text text-transparent">
              établissement
            </span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Commencez gratuitement, évoluez quand vous êtes prêt.
          </p>
        </div>

        {/* Toggle */}
        <div className="mt-10 flex items-center justify-center gap-3">
          <span className={`text-sm font-medium ${!isAnnual ? "text-foreground" : "text-muted-foreground"}`}>
            Mensuel
          </span>
          <button
            onClick={() => setIsAnnual(!isAnnual)}
            className={`relative h-7 w-12 rounded-full transition-colors ${
              isAnnual ? "bg-primary" : "bg-muted-foreground/30"
            }`}
            aria-label="Basculer entre mensuel et annuel"
          >
            <div
              className={`absolute top-0.5 size-6 rounded-full bg-white shadow-sm transition-transform ${
                isAnnual ? "translate-x-5.5" : "translate-x-0.5"
              }`}
            />
          </button>
          <span className={`text-sm font-medium ${isAnnual ? "text-foreground" : "text-muted-foreground"}`}>
            Annuel
          </span>
          {isAnnual && (
            <span className="ml-2 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600">
              -17%
            </span>
          )}
        </div>

        {/* Plans */}
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {pricingPlans.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-2xl border p-6 transition-all ${
                plan.highlighted
                  ? "border-primary/60 bg-card shadow-xl shadow-primary/10 scale-[1.02]"
                  : "border-border/40 bg-card/60 hover:border-border hover:shadow-lg"
              }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-primary to-indigo-500 px-4 py-1 text-xs font-semibold text-white shadow-md">
                  Le plus populaire
                </div>
              )}

              <div className="space-y-1">
                <h3 className="text-xl font-bold">{plan.name}</h3>
                <p className="text-sm text-muted-foreground">{plan.description}</p>
              </div>

              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold tracking-tight">
                  {isAnnual ? plan.annualPrice : plan.monthlyPrice}€
                </span>
                <span className="text-sm text-muted-foreground">/mois</span>
              </div>
              {isAnnual && (
                <p className="mt-1 text-xs text-emerald-600">
                  Facturé {plan.annualPrice * 12}€/an
                </p>
              )}

              <Button
                className="mt-6 w-full"
                variant={plan.highlighted ? "default" : "outline"}
                size="lg"
                asChild
              >
                <Link href={plan.name === "Enterprise" ? "/contact" : "/create-organisation"}>
                  {plan.cta}
                  <ArrowRightIcon className="ml-2 size-4" />
                </Link>
              </Button>

              <ul className="mt-6 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5">
                    <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                    <span className="text-sm text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
function FAQSection() {
  return (
    <section id="faq" className="py-20 md:py-28">
      <div className="container-1080p">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
            <MessageSquareIcon className="size-3.5" />
            Questions fréquentes
          </div>
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl lg:text-5xl">
            Tout ce que vous devez{" "}
            <span className="bg-gradient-to-r from-primary to-indigo-500 bg-clip-text text-transparent">
              savoir
            </span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Vous avez des questions ? Trouvez vos réponses ci-dessous.
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-3xl">
          <Accordion type="single" collapsible className="space-y-3">
            {faqItems.map((item, index) => (
              <AccordionItem
                key={index}
                value={`item-${index}`}
                className="rounded-xl border border-border/40 bg-card/60 px-2 backdrop-blur-sm transition-colors hover:border-border"
              >
                <AccordionTrigger className="px-4 text-left text-base font-medium hover:no-underline">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="px-4 text-muted-foreground leading-relaxed">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section className="border-t border-border/40 bg-gradient-to-br from-primary/5 via-background to-indigo-500/5 py-20">
      <div className="container-1080p">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            Prêt à digitaliser votre établissement ?
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Rejoignez plus de 50 établissements qui font confiance à EduFlow pour leur gestion quotidienne.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button size="lg" className="h-12 px-8 text-base shadow-lg shadow-primary/25" asChild>
              <Link href="/create-organisation">
                Commencer gratuitement
                <ArrowRightIcon className="ml-2 size-4" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" className="h-12 px-8 text-base" asChild>
              <Link href="/contact">
                <PhoneIcon className="mr-2 size-4" />
                Parler à un expert
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
function Footer() {
  return (
    <footer className="border-t border-border/40 bg-card/50">
      <div className="container-1080p py-12">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-indigo-600 shadow-lg shadow-primary/25">
                <GraduationCapIcon className="size-5 text-white" />
              </div>
              <span className="text-xl font-bold tracking-tight">EduFlow</span>
            </div>
            <p className="mt-4 max-w-xs text-sm text-muted-foreground leading-relaxed">
              La plateforme tout-en-un pour la gestion numérique de votre établissement scolaire.
            </p>
            <div className="mt-4 flex gap-3">
              {[
                { label: "Twitter", icon: GlobeIcon },
                { label: "LinkedIn", icon: GlobeIcon },
                { label: "Facebook", icon: GlobeIcon },
              ].map((social) => (
                <a
                  key={social.label}
                  href="#"
                  aria-label={social.label}
                  className="flex size-9 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                >
                  <social.icon className="size-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Product */}
          <div>
            <h4 className="mb-4 text-sm font-semibold uppercase tracking-wide text-foreground">
              Produit
            </h4>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li>
                <a href="#features" className="transition-colors hover:text-foreground">
                  Fonctionnalités
                </a>
              </li>
              <li>
                <a href="#pricing" className="transition-colors hover:text-foreground">
                  Tarifs
                </a>
              </li>
              <li>
                <a href="#faq" className="transition-colors hover:text-foreground">
                  FAQ
                </a>
              </li>
              <li>
                <Link href="/login" className="transition-colors hover:text-foreground">
                  Connexion
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="mb-4 text-sm font-semibold uppercase tracking-wide text-foreground">
              Légal
            </h4>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li>
                <a href="#" className="transition-colors hover:text-foreground">
                  Conditions d\'utilisation
                </a>
              </li>
              <li>
                <a href="#" className="transition-colors hover:text-foreground">
                  Politique de confidentialité
                </a>
              </li>
              <li>
                <a href="#" className="transition-colors hover:text-foreground">
                  Mentions légales
                </a>
              </li>
              <li>
                <a href="#" className="transition-colors hover:text-foreground">
                  RGPD
                </a>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="mb-4 text-sm font-semibold uppercase tracking-wide text-foreground">
              Contact
            </h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex items-center gap-2.5">
                <PhoneIcon className="size-4 shrink-0 text-primary" />
                <span>+229 00 00 00 00</span>
              </li>
              <li className="flex items-center gap-2.5">
                <MailIcon className="size-4 shrink-0 text-primary" />
                <span>contact@eduflow.com</span>
              </li>
              <li className="flex items-start gap-2.5">
                <MapPinIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>Cotonou, Bénin</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-border/40 pt-6 md:flex-row">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} EduFlow par Digital Infotech. Tous droits réservés.
          </p>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <LockIcon className="size-3.5" />
              Paiement sécurisé
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheckIcon className="size-3.5" />
              RGPD
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ */
/*  Page principale                                                    */
/* ------------------------------------------------------------------ */

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <HeroSection />
      <SocialProofBar />
      <FeaturesSection />
      <PricingSection />
      <FAQSection />
      <CTASection />
      <Footer />
    </div>
  );
}

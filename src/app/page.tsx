import Link from "next/link";
import {
  GraduationCapIcon,
  UsersIcon,
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
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="container-1080p flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary shadow-sm">
              <GraduationCapIcon className="size-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold tracking-tight">EduFlow</span>
          </div>
          <div className="hidden items-center gap-8 md:flex">
            <a href="#features" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">Fonctionnalites</a>
            <a href="#pricing" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">Tarifs</a>
            <a href="#faq" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">FAQ</a>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" asChild>
              <Link href="/login">Se connecter</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="#pricing">Voir les offres</Link>
            </Button>
          </div>
        </div>
      </nav>
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-border/40">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-background" />
        <div className="container-1080p relative py-20 md:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
              <ZapIcon className="size-3.5" />
              La gestion scolaire digitalisee
            </div>
            <h1 className="text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">
              Simplifiez la gestion de votre
              <span className="bg-gradient-to-r from-primary to-indigo-500 bg-clip-text text-transparent"> etablissement scolaire</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground md:text-xl">
              EduFlow centralise la gestion des eleves, la paie du personnel, les bulletins de notes et le suivi des ecolages.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button size="lg" className="h-12 px-8 text-base" asChild>
                <a href="#pricing">
                  Voir les offres
                  <ArrowRightIcon className="ml-2 size-4" />
                </a>
              </Button>
              <Button variant="outline" size="lg" className="h-12 px-8 text-base" asChild>
                <Link href="/login">Se connecter</Link>
              </Button>
            </div>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <CheckCircleIcon className="size-4 text-emerald-500" />
                Cloud & Offline
              </div>
              <div className="flex items-center gap-2">
                <CheckCircleIcon className="size-4 text-emerald-500" />
                Bulletins automatises
              </div>
              <div className="flex items-center gap-2">
                <CheckCircleIcon className="size-4 text-emerald-500" />
                Paie simplifiee
              </div>
            </div>
          </div>
        </div>
      </section>
      {/* Hosting Plans Overview */}
      <section className="border-b border-border/40 py-20">
        <div className="container-1080p">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">3 formules d hebergement</h2>
            <p className="mt-4 text-muted-foreground">Choisissez le mode d hebergement adapte a votre infrastructure et a votre budget.</p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            <div className="group relative rounded-2xl border border-border bg-card p-6 shadow-sm transition-all hover:shadow-md">
              <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-blue-500/10">
                <CloudIcon className="size-6 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold">SaaS Cloud</h3>
              <p className="mt-2 text-sm text-muted-foreground">Accessible depuis n importe ou. Nous gerons l infrastructure pour vous.</p>
              <div className="mt-4 border-t border-border pt-4">
                <span className="text-2xl font-bold">80 000</span>
                <span className="text-sm text-muted-foreground"> FCFA/an</span>
              </div>
            </div>
            <div className="group relative rounded-2xl border border-border bg-card p-6 shadow-sm transition-all hover:shadow-md">
              <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-purple-500/10">
                <ServerIcon className="size-6 text-purple-600" />
              </div>
              <h3 className="text-lg font-semibold">Self-Hosted Docker</h3>
              <p className="mt-2 text-sm text-muted-foreground">Deployez sur votre propre serveur via Docker. Controle total des donnees.</p>
              <div className="mt-4 border-t border-border pt-4">
                <span className="text-2xl font-bold">160 000</span>
                <span className="text-sm text-muted-foreground"> FCFA</span>
              </div>
            </div>
            <div className="group relative rounded-2xl border border-border bg-card p-6 shadow-sm transition-all hover:shadow-md">
              <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-emerald-500/10">
                <MonitorIcon className="size-6 text-emerald-600" />
              </div>
              <h3 className="text-lg font-semibold">Desktop Offline</h3>
              <p className="mt-2 text-sm text-muted-foreground">Application .exe fonctionnant sans connexion Internet. Ideal pour les zones isolees.</p>
              <div className="mt-4 border-t border-border pt-4">
                <span className="text-2xl font-bold">160 000</span>
                <span className="text-sm text-muted-foreground"> FCFA</span>
              </div>
            </div>
          </div>
        </div>
      </section>
      {/* Features Grid */}
      <section id="features" className="border-b border-border/40 bg-muted/30 py-20">
        <div className="container-1080p">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Fonctionnalites metier completes</h2>
            <p className="mt-4 text-muted-foreground">Tous les outils pour gerer efficacement votre etablissement au quotidien.</p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm transition-all hover:shadow-md">
              <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-indigo-500/10">
                <UsersIcon className="size-6 text-indigo-600" />
              </div>
              <h3 className="text-lg font-semibold">Gestion des Eleves & Classes</h3>
              <p className="mt-2 text-sm text-muted-foreground">Inscriptions, affectations, listes de classe, transferts et suivi administratif complet.</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm transition-all hover:shadow-md">
              <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-amber-500/10">
                <FileTextIcon className="size-6 text-amber-600" />
              </div>
              <h3 className="text-lg font-semibold">Bulletins & Notes</h3>
              <p className="mt-2 text-sm text-muted-foreground">Saisie des notes, calcul automatique des moyennes, generation et impression des bulletins.</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm transition-all hover:shadow-md">
              <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-emerald-500/10">
                <BanknoteIcon className="size-6 text-emerald-600" />
              </div>
              <h3 className="text-lg font-semibold">Suivi des Ecolages</h3>
              <p className="mt-2 text-sm text-muted-foreground">Gestion des frais de scolarite, echeanciers, relances et historique des paiements.</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm transition-all hover:shadow-md">
              <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-rose-500/10">
                <ShieldCheckIcon className="size-6 text-rose-600" />
              </div>
              <h3 className="text-lg font-semibold">Paie du Personnel</h3>
              <p className="mt-2 text-sm text-muted-foreground">Calcul des salaires, primes, bulletins de paie et declarations sociales du personnel.</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm transition-all hover:shadow-md">
              <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-sky-500/10">
                <FolderOpenIcon className="size-6 text-sky-600" />
              </div>
              <h3 className="text-lg font-semibold">Procedures & Documents</h3>
              <p className="mt-2 text-sm text-muted-foreground">Archivage numerique, generation de documents officiels et suivi des procedures administratives.</p>
            </div>
          </div>
        </div>
      </section>
      {/* Pricing Section */}
      <section id="pricing" className="border-b border-border/40 py-20">
        <div className="container-1080p">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Tarifs & Souscription</h2>
            <p className="mt-4 text-muted-foreground">Choisissez votre formule et commencez des aujourd hui.</p>
          </div>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            <div className="relative flex flex-col rounded-2xl border border-border bg-card p-8 shadow-sm transition-all hover:shadow-lg">
              <div className="mb-4">
                <h3 className="text-xl font-semibold">SaaS Cloud</h3>
                <p className="mt-1 text-sm text-muted-foreground">Abonnement annuel</p>
              </div>
              <div className="mb-6">
                <span className="text-4xl font-bold">80 000</span>
                <span className="text-muted-foreground"> FCFA/an</span>
              </div>
              <ul className="mb-8 flex-1 space-y-3 text-sm">
                <li className="flex items-start gap-2">
                  <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                  <span>Hebergement cloud securise</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                  <span>Mises a jour automatiques</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                  <span>Sauvegarde automatique</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                  <span>Support technique inclus</span>
                </li>
              </ul>
              <Button className="w-full" asChild>
                <Link href="/login">Souscrire</Link>
              </Button>
            </div>
            <div className="relative flex flex-col rounded-2xl border-2 border-primary bg-card p-8 shadow-lg transition-all hover:shadow-xl">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">Populaire</div>
              <div className="mb-4">
                <h3 className="text-xl font-semibold">Self-Hosted Docker</h3>
                <p className="mt-1 text-sm text-muted-foreground">Licence unique</p>
              </div>
              <div className="mb-6">
                <span className="text-4xl font-bold">160 000</span>
                <span className="text-muted-foreground"> FCFA</span>
              </div>
              <ul className="mb-8 flex-1 space-y-3 text-sm">
                <li className="flex items-start gap-2">
                  <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                  <span>Deploiement sur votre serveur</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                  <span>Controle total des donnees</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                  <span>Docker Compose inclus</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                  <span>1 an de support & mises a jour</span>
                </li>
              </ul>
              <Button className="w-full" asChild>
                <Link href="/login">Souscrire</Link>
              </Button>
            </div>
            <div className="relative flex flex-col rounded-2xl border border-border bg-card p-8 shadow-sm transition-all hover:shadow-lg">
              <div className="mb-4">
                <h3 className="text-xl font-semibold">Desktop Offline</h3>
                <p className="mt-1 text-sm text-muted-foreground">Licence unique</p>
              </div>
              <div className="mb-6">
                <span className="text-4xl font-bold">160 000</span>
                <span className="text-muted-foreground"> FCFA</span>
              </div>
              <ul className="mb-8 flex-1 space-y-3 text-sm">
                <li className="flex items-start gap-2">
                  <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                  <span>Application Windows .exe</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                  <span>Aucune connexion Internet requise</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                  <span>Base de donnees locale</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                  <span>1 an de support & mises a jour</span>
                </li>
              </ul>
              <Button className="w-full" asChild>
                <Link href="/login">Souscrire</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
      {/* FAQ Section */}
      <section id="faq" className="border-b border-border/40 bg-muted/30 py-20">
        <div className="container-1080p">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Questions frequentes</h2>
            <p className="mt-4 text-muted-foreground">Tout ce que vous devez savoir avant de demarrer avec EduFlow.</p>
          </div>
          <div className="mx-auto mt-12 max-w-3xl">
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="item-1">
                <AccordionTrigger>Que se passe-t-il si je n ai pas Internet ?</AccordionTrigger>
                <AccordionContent>EduFlow propose une version Desktop Offline (.exe) qui fonctionne entierement sans connexion Internet. Vos donnees sont stockees localement sur votre machine.</AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-2">
                <AccordionTrigger>Comment activer ma licence ?</AccordionTrigger>
                <AccordionContent>Apres votre souscription, vous recevez une cle de licence par email. Pour la version Cloud, il suffit de creer votre compte et d entrer la cle dans la section Abonnement du tableau de bord.</AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-3">
                <AccordionTrigger>Mes donnees sont-elles en securite ?</AccordionTrigger>
                <AccordionContent>Absolument. Nous utilisons un chiffrement de bout en bout (AES-256) pour toutes vos donnees. La version Cloud beneficie de sauvegardes automatiques quotidiennes.</AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-4">
                <AccordionTrigger>Puis-je migrer d une formule a une autre ?</AccordionTrigger>
                <AccordionContent>Oui, vous pouvez migrer a tout moment. Si vous passez de Desktop Offline a SaaS Cloud, nous vous aidons a importer vos donnees existantes.</AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-5">
                <AccordionTrigger>Quels moyens de paiement acceptez-vous ?</AccordionTrigger>
                <AccordionContent>Nous acceptons les virements bancaires, Mobile Money (Orange Money, MTN Mobile Money, Wave), les cartes de credit (Visa, Mastercard) ainsi que les cheques.</AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </section>
      {/* Footer */}
      <footer className="bg-card">
        <div className="container-1080p py-12">
          <div className="grid gap-8 md:grid-cols-4">
            <div className="md:col-span-2">
              <div className="flex items-center gap-2">
                <div className="flex size-9 items-center justify-center rounded-xl bg-primary shadow-sm">
                  <GraduationCapIcon className="size-5 text-primary-foreground" />
                </div>
                <span className="text-xl font-bold tracking-tight">EduFlow</span>
              </div>
              <p className="mt-4 max-w-sm text-sm text-muted-foreground">La plateforme tout-en-un pour la gestion numerique de votre etablissement scolaire.</p>
            </div>
            <div>
              <h4 className="mb-4 text-sm font-semibold uppercase tracking-wide text-foreground">Produit</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#features" className="transition-colors hover:text-foreground">Fonctionnalites</a></li>
                <li><a href="#pricing" className="transition-colors hover:text-foreground">Tarifs</a></li>
                <li><a href="#faq" className="transition-colors hover:text-foreground">FAQ</a></li>
                <li><Link href="/login" className="transition-colors hover:text-foreground">Connexion</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="mb-4 text-sm font-semibold uppercase tracking-wide text-foreground">Contact</h4>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <PhoneIcon className="size-4 shrink-0" />
                  <span>+229 00 00 00 00</span>
                </li>
                <li className="flex items-center gap-2">
                  <MailIcon className="size-4 shrink-0" />
                  <span>contact@eduflow.com</span>
                </li>
                <li className="flex items-center gap-2">
                  <MapPinIcon className="size-4 shrink-0" />
                  <span>Cotonou, Benin</span>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-10 border-t border-border pt-6">
            <p className="text-center text-sm text-muted-foreground">&copy; {new Date().getFullYear()} EduFlow par Digital Infotech. Tous droits reserves.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}


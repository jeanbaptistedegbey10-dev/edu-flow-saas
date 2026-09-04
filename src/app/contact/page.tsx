import type { Metadata } from "next";
import Link from "next/link";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import PageShell from "@/components/landing/page-shell";
import ContactForm from "@/components/landing/contact-form";

export const metadata: Metadata = {
  title: "Contact - EduFlow",
  description:
    "Contactez l'équipe EduFlow : démonstration, tarifs, support technique. Réponse sous 24 h ouvrées.",
};

/** Canaux de contact affichés à gauche du formulaire. */
const CONTACT_CHANNELS: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  href?: string;
  detail: string;
}[] = [
  {
    icon: Mail,
    label: "Email",
    value: "contact@eduflow.com",
    href: "mailto:contact@eduflow.com",
    detail: "Réponse sous 24 h ouvrées",
  },
  {
    icon: Phone,
    label: "Téléphone",
    value: "+229 00 00 00 00",
    href: "tel:+22900000000",
    detail: "Lundi – Vendredi, 8 h – 18 h",
  },
  {
    icon: MapPin,
    label: "Adresse",
    value: "Cotonou, Bénin",
    detail: "Sur rendez-vous uniquement",
  },
];

export default function ContactPage() {
  return (
    <PageShell
      badge="Nous contacter"
      title="Parlons de votre centre"
      description="Une question sur EduFlow, une demande de démonstration ou un besoin d'assistance ? Notre équipe vous répond sous 24 h ouvrées."
    >
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Coordonnées */}
        <div className="lg:col-span-2 space-y-4">
          {CONTACT_CHANNELS.map((channel) => {
            const Icon = channel.icon;
            const content = (
              <>
                <p className="text-sm font-medium text-white">
                  {channel.label}
                </p>
                <p className="text-sm text-brand-light break-all">
                  {channel.value}
                </p>
                <p className="text-xs text-gray-500">{channel.detail}</p>
              </>
            );
            return (
              <div
                key={channel.label}
                className="glass-card p-5 flex items-start gap-4"
              >
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-brand/10 border border-brand/20 shrink-0">
                  <Icon className="w-5 h-5 text-brand-light" />
                </div>
                {channel.href ? (
                  <a href={channel.href} className="space-y-0.5">
                    {content}
                  </a>
                ) : (
                  <div className="space-y-0.5">{content}</div>
                )}
              </div>
            );
          })}

          {/* Renvoi vers la FAQ du landing */}
          <div className="glass-card p-5 flex items-start gap-4">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-mint/10 border border-mint/20 shrink-0">
              <MessageCircle className="w-5 h-5 text-mint" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">
                Questions fréquentes
              </p>
              <p className="text-sm text-gray-400">
                La réponse à votre question se trouve peut-être déjà dans{" "}
                <Link
                  href="/#faq"
                  className="text-brand-light hover:underline"
                >
                  la FAQ
                </Link>
                .
              </p>
            </div>
          </div>
        </div>

        {/* Formulaire */}
        <div className="lg:col-span-3">
          <div className="glass-card p-6 sm:p-8">
            <h2 className="text-lg font-semibold text-white mb-1">
              Envoyez-nous un message
            </h2>
            <p className="text-sm text-gray-400 mb-6">
              Les champs marqués d&apos;un astérisque (*) sont obligatoires.
            </p>
            <ContactForm />
          </div>
        </div>
      </div>
    </PageShell>
  );
}

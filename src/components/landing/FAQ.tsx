"use client";

import { useState } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";
import { FAQ_DATA } from "@/data/content";

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section id="faq" className="relative py-24 bg-ink-800">
      {/* Background accent */}
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-brand/5 rounded-full blur-3xl" />

      <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand/10 border border-brand/20 mb-6">
            <HelpCircle className="w-7 h-7 text-brand-light" />
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Questions {" "}
            <span className="text-gradient-brand">fréquemment posées</span>
          </h2>
          <p className="text-lg text-gray-400">
            Tout ce que vous devez savoir sur EduFlow pour votre centre de formation.
          </p>
        </div>

        {/* Accordion */}
        <div className="space-y-4">
          {FAQ_DATA.map((item, index) => {
            const isOpen = openIndex === index;
            return (
              <div
                key={index}
                className={`glass-card overflow-hidden transition-all ${
                  isOpen ? "border-brand/30 glow-brand" : ""
                }`}
              >
                <button
                  onClick={() => toggle(index)}
                  className="w-full flex items-center justify-between p-6 text-left group"
                  aria-expanded={isOpen}
                >
                  <span className="text-base font-medium text-white pr-4 group-hover:text-brand-light transition-colors">
                    {item.question}
                  </span>
                  <ChevronDown
                    className={`w-5 h-5 shrink-0 text-gray-400 transition-transform duration-300 ${
                      isOpen ? "rotate-180 text-brand-light" : ""
                    }`}
                  />
                </button>
                <div
                  className={`overflow-hidden transition-all duration-300 ${
                    isOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
                  }`}
                >
                  <div className="px-6 pb-6">
                    <p className="text-gray-400 leading-relaxed">
                      {item.answer}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

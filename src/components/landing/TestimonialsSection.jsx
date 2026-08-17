import React from "react";
import { motion } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";

function TestimonialCard({ t }) {
  const initials = t.author ? t.author.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() : "?";
  return (
    <div
      className="flex-shrink-0 w-80 md:w-96 rounded-3xl p-7 flex flex-col justify-between gap-6 mx-3"
      style={{
        background: "rgba(255,255,255,0.55)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: "1px solid rgba(255,255,255,0.35)",
        boxShadow: "0 4px 32px rgba(93,63,211,0.06), 0 1px 2px rgba(0,0,0,0.04)",
      }}
    >
      <p className="text-sm font-heading text-foreground leading-relaxed">"{t.quote}"</p>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-mono font-bold text-primary">{initials}</span>
          </div>
          <div>
            <div className="text-sm font-heading font-semibold text-foreground leading-tight">{t.author}</div>
            <div className="text-[11px] font-mono text-muted-foreground mt-0.5">{t.role} · {t.company}</div>
          </div>
        </div>
        {t.metric && (
          <div className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-primary/5 border border-primary/10">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-primary whitespace-nowrap">
              {t.metric}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TestimonialsSection() {
  const { data: testimonials = [] } = useQuery({
    queryKey: ["Testimonial"],
    queryFn: () => base44.entities.Testimonial.list(),
  });

  const allCards = [...testimonials, ...testimonials];

  return (
    <section className="py-32 overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 mb-14">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-primary">
            Client Voices
          </span>
          <h2 className="font-heading font-black text-4xl md:text-6xl text-foreground mt-3 tracking-tight">
            <span className="flux-skew">Trusted by Leaders</span>
          </h2>
        </motion.div>
      </div>

      {allCards.length > 0 && (
        <>
          <div className="relative mb-4">
            <div className="absolute left-0 top-0 bottom-0 w-24 z-10 pointer-events-none"
              style={{ background: "linear-gradient(to right, hsl(var(--background)), transparent)" }} />
            <div className="absolute right-0 top-0 bottom-0 w-24 z-10 pointer-events-none"
              style={{ background: "linear-gradient(to left, hsl(var(--background)), transparent)" }} />
            <div className="flex" style={{ animation: "marqueeLeft 40s linear infinite" }}>
              {allCards.map((t, i) => <TestimonialCard key={`r1-${i}`} t={t} />)}
            </div>
          </div>
          <div className="relative">
            <div className="absolute left-0 top-0 bottom-0 w-24 z-10 pointer-events-none"
              style={{ background: "linear-gradient(to right, hsl(var(--background)), transparent)" }} />
            <div className="absolute right-0 top-0 bottom-0 w-24 z-10 pointer-events-none"
              style={{ background: "linear-gradient(to left, hsl(var(--background)), transparent)" }} />
            <div className="flex" style={{ animation: "marqueeRight 48s linear infinite" }}>
              {[...allCards].reverse().map((t, i) => <TestimonialCard key={`r2-${i}`} t={t} />)}
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes marqueeLeft { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        @keyframes marqueeRight { 0% { transform: translateX(-50%); } 100% { transform: translateX(0); } }
      `}</style>
    </section>
  );
}
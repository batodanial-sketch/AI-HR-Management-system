import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";

function FAQItem({ faq, index, isOpen, onToggle }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.55, delay: index * 0.07, ease: [0.16, 1, 0.3, 1] }}
      className="border-b border-border last:border-0"
    >
      <motion.button
        onClick={onToggle}
        whileHover={{ x: 4 }}
        transition={{ duration: 0.2 }}
        className="w-full flex items-center justify-between gap-6 py-6 text-left group"
      >
        <span className="font-heading font-semibold text-base md:text-lg text-foreground group-hover:text-primary transition-colors duration-200">
          {faq.question}
        </span>

        <motion.div
          animate={{ rotate: isOpen ? 45 : 0, backgroundColor: isOpen ? "hsl(var(--primary))" : "hsl(var(--secondary))" }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
        >
          <Plus
            size={16}
            className={`transition-colors duration-300 ${isOpen ? "text-primary-foreground" : "text-foreground"}`}
          />
        </motion.div>
      </motion.button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="answer"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <motion.p
              initial={{ y: -8 }}
              animate={{ y: 0 }}
              exit={{ y: -8 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="pb-6 text-sm md:text-base font-heading text-muted-foreground leading-relaxed max-w-3xl"
            >
              {faq.answer}
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function FAQSection() {
  const [openIndex, setOpenIndex] = useState(null);

  const { data: faqs = [] } = useQuery({
    queryKey: ["FAQ"],
    queryFn: () => base44.entities.FAQ.list("order", 50),
  });

  const toggle = (i) => setOpenIndex(openIndex === i ? null : i);

  return (
    <section id="faq" className="py-32 px-6">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="text-center mb-16"
        >
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-primary">
            Got Questions?
          </span>
          <h2 className="font-heading font-black text-4xl md:text-6xl text-foreground mt-3 tracking-tight">
            <span className="flux-skew">FAQ</span>
          </h2>
          <p className="mt-4 text-base font-heading text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Everything you need to know about working with Fluxentra. Can't find your answer?{" "}
            <button
              onClick={() => document.querySelector("#contact")?.scrollIntoView({ behavior: "smooth" })}
              className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
            >
              Ask us directly.
            </button>
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="rounded-3xl border border-border bg-card px-6 md:px-10"
        >
          {faqs.map((faq, i) => (
            <FAQItem
              key={faq.id}
              faq={faq}
              index={i}
              isOpen={openIndex === i}
              onToggle={() => toggle(i)}
            />
          ))}
        </motion.div>
      </div>
    </section>
  );
}
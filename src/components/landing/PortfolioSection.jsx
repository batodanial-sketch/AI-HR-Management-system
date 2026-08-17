import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUpRight, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";

function ProjectModal({ project, onClose }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.4 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-card rounded-3xl border border-border overflow-hidden max-w-2xl w-full shadow-2xl"
      >
        <div className="relative h-56">
          <img src={project.image} alt={project.title} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-foreground/40 to-transparent" />
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-xl bg-background/80 backdrop-blur-sm hover:bg-background transition-colors"
          >
            <X size={18} />
          </button>
          <div className="absolute bottom-4 left-6">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/90">
              {project.tag}
            </span>
          </div>
        </div>
        <div className="p-8">
          <div className="text-xs font-mono font-bold uppercase tracking-widest text-primary mb-2">
            {project.category}
          </div>
          <h3 className="font-heading font-black text-2xl text-foreground mb-3">{project.title}</h3>
          <p className="text-sm font-heading text-muted-foreground leading-relaxed mb-6">{project.description}</p>
          <div className="flex flex-wrap gap-2">
            {project.metrics.map((m) => (
              <span key={m} className="px-3 py-1.5 rounded-lg bg-primary/5 border border-primary/10 text-[11px] font-mono font-bold uppercase tracking-widest text-primary">
                {m}
              </span>
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function PortfolioSection() {
  const [selected, setSelected] = useState(null);

  const { data: projects = [] } = useQuery({
    queryKey: ["Project"],
    queryFn: () => base44.entities.Project.list("order", 50),
  });

  return (
    <section id="portfolio" className="py-32 px-6">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-16"
        >
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-primary">Portfolio</span>
          <h2 className="font-heading font-black text-4xl md:text-6xl text-foreground mt-3 tracking-tight">
            <span className="flux-skew">Our Work</span>
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {projects.map((project, i) => {
            const metrics = Array.isArray(project.metrics)
              ? project.metrics
              : (project.metrics || "").split(",").map(m => m.trim()).filter(Boolean);
            const p = { ...project, metrics };
            return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              onClick={() => setSelected(p)}
              className="group relative rounded-3xl overflow-hidden cursor-pointer border border-border hover:border-primary/30 transition-all"
            >
              <div className="relative h-56">
                <img
                  src={p.image}
                  alt={p.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 via-foreground/10 to-transparent" />
                <div className="absolute top-4 left-4">
                  <span className="px-3 py-1 rounded-lg bg-background/70 backdrop-blur-sm text-[10px] font-mono font-bold uppercase tracking-widest text-primary">
                    {p.tag}
                  </span>
                </div>
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="p-2 rounded-xl bg-primary text-primary-foreground">
                    <ArrowUpRight size={16} />
                  </div>
                </div>
              </div>
              <div className="p-6 bg-card">
                <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-primary mb-2">
                  {p.category}
                </div>
                <h3 className="font-heading font-bold text-lg text-foreground">{p.title}</h3>
                <div className="flex flex-wrap gap-2 mt-3">
                  {p.metrics.slice(0, 2).map((m) => (
                    <span key={m} className="text-[10px] font-mono text-muted-foreground">{m}</span>
                  ))}
                </div>
              </div>
            </motion.div>
            );
          })}
        </div>
      </div>

      <AnimatePresence>
        {selected && <ProjectModal project={selected} onClose={() => setSelected(null)} />}
      </AnimatePresence>
    </section>
  );
}
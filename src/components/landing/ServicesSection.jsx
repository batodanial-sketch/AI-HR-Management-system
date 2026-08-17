import React, { useRef, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import ServiceCard from "./ServiceCard";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";

export default function ServicesSection() {
  const scrollRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const { data: services = [] } = useQuery({
    queryKey: ["Service"],
    queryFn: () => base44.entities.Service.list("order", 50),
  });

  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 10);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkScroll, { passive: true });
    checkScroll();
    return () => el.removeEventListener("scroll", checkScroll);
  }, []);

  const scroll = (dir) => {
    scrollRef.current?.scrollBy({ left: dir * 420, behavior: "smooth" });
  };

  // Drag-to-scroll
  const onMouseDown = (e) => {
    setIsDragging(true);
    setStartX(e.pageX - scrollRef.current.offsetLeft);
    setScrollLeft(scrollRef.current.scrollLeft);
    scrollRef.current.style.cursor = "grabbing";
  };
  const onMouseUp = () => {
    setIsDragging(false);
    if (scrollRef.current) scrollRef.current.style.cursor = "grab";
  };
  const onMouseMove = (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX) * 1.5;
    scrollRef.current.scrollLeft = scrollLeft - walk;
  };

  return (
    <section id="services" className="py-32 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 mb-12">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col md:flex-row md:items-end md:justify-between gap-6"
        >
          <div>
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-primary">
              The Automation Lab
            </span>
            <h2 className="font-heading font-black text-4xl md:text-6xl text-foreground mt-3 tracking-tight">
              <span className="flux-skew">Our Services</span>
            </h2>
          </div>
          <div className="flex gap-2">
            <motion.button
              onClick={() => scroll(-1)}
              whileHover={{ scale: 1.08, backgroundColor: "hsl(var(--secondary)/0.8)" }}
              whileTap={{ scale: 0.93 }}
              animate={{ opacity: canScrollLeft ? 1 : 0.35 }}
              className="p-3 rounded-xl border border-border transition-colors"
            >
              <ChevronLeft size={20} />
            </motion.button>
            <motion.button
              onClick={() => scroll(1)}
              whileHover={{ scale: 1.08, backgroundColor: "hsl(var(--secondary)/0.8)" }}
              whileTap={{ scale: 0.93 }}
              animate={{ opacity: canScrollRight ? 1 : 0.35 }}
              className="p-3 rounded-xl border border-border transition-colors"
            >
              <ChevronRight size={20} />
            </motion.button>
          </div>
        </motion.div>
      </div>

      {/* Drag hint */}
      <motion.div
        className="text-center mb-4"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ delay: 0.5 }}
      >
        <span className="text-[10px] font-mono text-muted-foreground/50 uppercase tracking-widest">
          ← drag to explore →
        </span>
      </motion.div>

      <div
        ref={scrollRef}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onMouseMove={onMouseMove}
        className="flex gap-6 overflow-x-auto px-6 pb-6 snap-x snap-mandatory select-none"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none", cursor: "grab" }}
      >
        <div className="w-[calc((100vw-80rem)/2)] flex-shrink-0 hidden xl:block" />
        {services.map((service, i) => (
          <div key={i} className="snap-start">
            <ServiceCard service={service} index={i} />
          </div>
        ))}
        <div className="w-6 flex-shrink-0" />
      </div>
    </section>
  );
}
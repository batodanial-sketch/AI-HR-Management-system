import React, { useRef, useState } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { ArrowUpRight } from "lucide-react";

export default function ServiceCard({ service, index }) {
  const ref = useRef(null);
  const [hovered, setHovered] = useState(false);

  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const springX = useSpring(mx, { stiffness: 120, damping: 20 });
  const springY = useSpring(my, { stiffness: 120, damping: 20 });
  const rotateY = useTransform(springX, [-1, 1], [-10, 10]);
  const rotateX = useTransform(springY, [-1, 1], [7, -7]);

  const handleMouseMove = (e) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    mx.set(((e.clientX - rect.left) / rect.width - 0.5) * 2);
    my.set(((e.clientY - rect.top) / rect.height - 0.5) * 2);
  };

  const handleMouseLeave = () => {
    mx.set(0);
    my.set(0);
    setHovered(false);
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={handleMouseLeave}
      initial={{ opacity: 0, y: 60, scale: 0.94 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.7, delay: index * 0.1, ease: [0.16, 1, 0.3, 1] }}
      style={{ rotateY, rotateX, transformPerspective: 800 }}
      className="group relative flex-shrink-0 w-80 md:w-96 h-[500px] rounded-3xl overflow-hidden cursor-pointer"
    >
      {/* Background image */}
      <motion.img
        src={service.image}
        alt={service.title}
        className="absolute inset-0 w-full h-full object-cover"
        animate={{
          scale: hovered ? 1.08 : 1.0,
          opacity: hovered ? 1 : 0.3,
        }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Overlay */}
      <motion.div
        className="absolute inset-0"
        animate={{
          background: hovered
            ? "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.2) 100%)"
            : "rgba(255,255,255,0.6)",
          backdropFilter: hovered ? "blur(0px)" : "blur(24px)",
        }}
        transition={{ duration: 0.5 }}
      />

      {/* Shimmer border on hover */}
      <motion.div
        className="absolute inset-0 rounded-3xl pointer-events-none"
        animate={{
          boxShadow: hovered
            ? "inset 0 0 0 1.5px rgba(93,63,211,0.6), 0 20px 60px rgba(93,63,211,0.2)"
            : "inset 0 0 0 1px rgba(255,255,255,0.3)",
        }}
        transition={{ duration: 0.4 }}
      />

      {/* Content */}
      <div className="relative h-full flex flex-col justify-between p-8 z-10">
        <div>
          <div className="flex items-center justify-between mb-6">
            <motion.span
              className="text-[10px] font-mono font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg"
              animate={{
                backgroundColor: hovered ? "rgba(93,63,211,0.25)" : "rgba(93,63,211,0.08)",
                color: "hsl(var(--primary))",
              }}
            >
              {service.tag}
            </motion.span>
            <span className={`text-[10px] font-mono font-bold uppercase tracking-widest transition-colors duration-300 ${hovered ? "text-white/60" : "text-muted-foreground"}`}>
              0{index + 1}
            </span>
          </div>
          <motion.h3
            className="font-heading font-bold text-2xl leading-tight"
            animate={{ color: hovered ? "#ffffff" : "hsl(var(--foreground))" }}
            transition={{ duration: 0.3 }}
          >
            {service.title}
          </motion.h3>
        </div>

        <motion.div
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: hovered ? 0 : 12, opacity: hovered ? 1 : 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="text-sm font-heading leading-relaxed mb-6 text-white/80">
            {service.description}
          </p>
          <motion.div
            className="inline-flex items-center gap-2 text-sm font-heading font-semibold text-white bg-primary/80 px-4 py-2 rounded-xl"
            whileHover={{ scale: 1.05, backgroundColor: "hsl(var(--primary))" }}
            whileTap={{ scale: 0.97 }}
          >
            Learn more
            <motion.div
              animate={{ x: [0, 3, 0], y: [0, -3, 0] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
            >
              <ArrowUpRight size={16} />
            </motion.div>
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
}
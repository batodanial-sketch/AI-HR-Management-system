import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, ArrowRight, Calendar, Tag } from "lucide-react";
import { Link } from "react-router-dom";
import Navbar from "../components/landing/Navbar";
import Footer from "../components/landing/Footer";

function ArticleModal({ article, onClose }) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-start justify-center overflow-y-auto py-12 px-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.96 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="bg-card border border-border rounded-3xl max-w-3xl w-full p-8 md:p-12 relative"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            className="absolute top-6 right-6 p-2 rounded-xl bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={16} />
          </button>

          {article.cover_image && (
            <img
              src={article.cover_image}
              alt={article.title}
              className="w-full h-64 object-cover rounded-2xl mb-8"
            />
          )}

          <div className="flex items-center gap-3 mb-4">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-primary bg-primary/10 px-3 py-1.5 rounded-lg">
              {article.category}
            </span>
            <span className="text-[11px] font-mono text-muted-foreground">
              {new Date(article.created_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
          </div>

          <h2 className="font-heading font-black text-2xl md:text-3xl text-foreground mb-4 tracking-tight">
            {article.title}
          </h2>
          <p className="text-base font-heading text-muted-foreground leading-relaxed mb-6">{article.excerpt}</p>

          {article.content && (
            <div className="prose prose-sm max-w-none font-heading text-foreground/80 leading-relaxed whitespace-pre-wrap">
              {article.content}
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function ArticleCard({ article, onClick, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      onClick={onClick}
      whileHover={{ y: -4, boxShadow: "0 16px 48px rgba(93,63,211,0.12)" }}
      className="group bg-card border border-border rounded-3xl overflow-hidden cursor-pointer transition-colors duration-300 hover:border-primary/30"
    >
      {article.cover_image ? (
        <div className="h-48 overflow-hidden">
          <img
            src={article.cover_image}
            alt={article.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        </div>
      ) : (
        <div className="h-48 bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
          <span className="font-heading font-black text-4xl text-primary/20">FX</span>
        </div>
      )}

      <div className="p-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-primary bg-primary/8 px-2.5 py-1 rounded-lg">
            {article.category}
          </span>
          <span className="text-[10px] font-mono text-muted-foreground">
            {new Date(article.created_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
        </div>
        <h3 className="font-heading font-bold text-lg text-foreground mb-2 group-hover:text-primary transition-colors line-clamp-2">
          {article.title}
        </h3>
        <p className="text-sm font-heading text-muted-foreground leading-relaxed line-clamp-3">{article.excerpt}</p>
        <div className="mt-4 flex items-center gap-1 text-primary text-xs font-mono font-bold uppercase tracking-widest">
          Read More <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
        </div>
      </div>
    </motion.div>
  );
}

const CATEGORIES = ["All", "AI Insights", "Case Study", "News", "Tutorial", "Opinion"];

export default function Blog() {
  const [selected, setSelected] = useState(null);
  const [activeCategory, setActiveCategory] = useState("All");

  const { data: articles = [] } = useQuery({
    queryKey: ["Article"],
    queryFn: () => base44.entities.Article.filter({ published: true }, "order", 50),
  });

  const filtered = activeCategory === "All"
    ? articles
    : articles.filter((a) => a.category === activeCategory);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <section className="pt-36 pb-20 px-6">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="mb-12"
          >
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-primary">
              Intelligence Dispatch
            </span>
            <h1 className="font-heading font-black text-5xl md:text-7xl text-foreground mt-3 tracking-tight">
              Blog & News
            </h1>
            <p className="mt-4 text-lg font-heading text-muted-foreground max-w-xl leading-relaxed">
              Insights, case studies, and updates from the frontier of enterprise AI automation.
            </p>
          </motion.div>

          {/* Category filters */}
          <div className="flex flex-wrap gap-2 mb-10">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-4 py-2 rounded-xl text-sm font-mono font-bold uppercase tracking-widest transition-all ${
                  activeCategory === cat
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary/60 text-muted-foreground hover:text-foreground"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-24 text-muted-foreground font-heading">
              No articles yet. Check back soon.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.map((article, i) => (
                <ArticleCard
                  key={article.id}
                  article={article}
                  index={i}
                  onClick={() => setSelected(article)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <Footer />

      {selected && <ArticleModal article={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
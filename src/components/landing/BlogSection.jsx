import React from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

function BlogCard({ article, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -4, boxShadow: "0 16px 48px rgba(93,63,211,0.12)" }}
      className="group bg-card border border-border rounded-3xl overflow-hidden cursor-pointer transition-colors duration-300 hover:border-primary/30"
    >
      {article.cover_image ? (
        <div className="h-44 overflow-hidden">
          <img src={article.cover_image} alt={article.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        </div>
      ) : (
        <div className="h-44 bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
          <span className="font-heading font-black text-4xl text-primary/20">FX</span>
        </div>
      )}
      <div className="p-6">
        <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-primary bg-primary/8 px-2.5 py-1 rounded-lg">
          {article.category}
        </span>
        <h3 className="font-heading font-bold text-lg text-foreground mt-3 mb-2 group-hover:text-primary transition-colors line-clamp-2">
          {article.title}
        </h3>
        <p className="text-sm font-heading text-muted-foreground line-clamp-2">{article.excerpt}</p>
      </div>
    </motion.div>
  );
}

export default function BlogSection() {
  const { data: articles = [] } = useQuery({
    queryKey: ["Article"],
    queryFn: () => base44.entities.Article.filter({ published: true }, "order", 3),
  });

  if (articles.length === 0) return null;

  return (
    <section id="blog" className="py-32 px-6">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col md:flex-row md:items-end justify-between mb-14 gap-6"
        >
          <div>
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-primary">
              Intelligence Dispatch
            </span>
            <h2 className="font-heading font-black text-4xl md:text-6xl text-foreground mt-3 tracking-tight">
              Latest Insights
            </h2>
          </div>
          <Link
            to="/blog"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl border border-border font-heading font-semibold text-sm text-foreground hover:border-primary/40 hover:text-primary transition-colors"
          >
            View All Articles <ArrowRight size={15} />
          </Link>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {articles.slice(0, 3).map((article, i) => (
            <BlogCard key={article.id} article={article} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
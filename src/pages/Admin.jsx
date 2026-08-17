import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Save, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

function EntityManager({ entityKey, fields, label }) {
  const qc = useQueryClient();
  const entity = base44.entities[entityKey];

  const { data: items = [], isLoading } = useQuery({
    queryKey: [entityKey],
    queryFn: () => entity.list("order", 100),
  });

  const [form, setForm] = useState({});
  const [editingId, setEditingId] = useState(null);

  const saveMutation = useMutation({
    mutationFn: (data) => editingId ? entity.update(editingId, data) : entity.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [entityKey] });
      setForm({});
      setEditingId(null);
      toast.success("Saved!");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => entity.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [entityKey] });
      toast.success("Deleted.");
    },
  });

  const startEdit = (item) => {
    setEditingId(item.id);
    setForm({ ...item });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({});
  };

  return (
    <div className="space-y-8">
      {/* Form */}
      <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <h3 className="font-heading font-bold text-lg text-foreground">
          {editingId ? `Edit ${label}` : `Add ${label}`}
        </h3>
        {fields.map((field) => (
          <div key={field.key}>
            <label className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground mb-1.5 block">
              {field.label}
            </label>
            {field.type === "textarea" ? (
              <Textarea
                value={form[field.key] || ""}
                onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                className="rounded-xl font-heading"
                rows={3}
              />
            ) : field.type === "select" ? (
              <Select
                value={form[field.key] || ""}
                onValueChange={(v) => setForm({ ...form, [field.key]: v })}
              >
                <SelectTrigger className="rounded-xl font-heading">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {field.options.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                type={field.type || "text"}
                value={form[field.key] || ""}
                onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                className="rounded-xl h-11 font-heading"
              />
            )}
          </div>
        ))}
        <div className="flex gap-3 pt-2">
          <Button
            onClick={() => saveMutation.mutate(form)}
            disabled={saveMutation.isPending}
            className="rounded-xl bg-primary text-primary-foreground font-heading font-semibold"
          >
            <Save size={15} className="mr-2" />
            {saveMutation.isPending ? "Saving..." : "Save"}
          </Button>
          {editingId && (
            <Button variant="outline" onClick={cancelEdit} className="rounded-xl font-heading">
              Cancel
            </Button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground font-heading">Loading...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground font-heading">No {label.toLowerCase()}s yet. Add one above.</p>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="flex items-start justify-between bg-card border border-border rounded-xl p-4 gap-4"
            >
              <div className="min-w-0">
                <div className="font-heading font-semibold text-foreground text-sm truncate">
                  {item.title || item.company || item.question || item.author || "—"}
                </div>
                <div className="text-xs text-muted-foreground font-heading mt-0.5 line-clamp-2">
                  {item.description || item.quote || item.answer || item.tag || ""}
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => startEdit(item)}
                  className="rounded-lg text-xs font-heading"
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => deleteMutation.mutate(item.id)}
                  className="rounded-lg text-destructive hover:text-destructive"
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const SERVICE_FIELDS = [
  { key: "tag", label: "Tag", type: "text" },
  { key: "title", label: "Title", type: "text" },
  { key: "description", label: "Description", type: "textarea" },
  { key: "image", label: "Image URL", type: "text" },
  { key: "order", label: "Order (number)", type: "number" },
];

const TESTIMONIAL_FIELDS = [
  { key: "author", label: "Author Name", type: "text" },
  { key: "role", label: "Role", type: "text" },
  { key: "company", label: "Company", type: "text" },
  { key: "quote", label: "Quote", type: "textarea" },
  { key: "metric", label: "Metric (e.g. 400%)", type: "text" },
  { key: "metricLabel", label: "Metric Label", type: "text" },
];

const FAQ_FIELDS = [
  { key: "question", label: "Question", type: "text" },
  { key: "answer", label: "Answer", type: "textarea" },
  { key: "order", label: "Order (number)", type: "number" },
];

const CASE_STUDY_FIELDS = [
  { key: "company", label: "Company", type: "text" },
  { key: "industry", label: "Industry", type: "text" },
  { key: "metric", label: "Metric (e.g. $2.4M)", type: "text" },
  { key: "metricLabel", label: "Metric Label", type: "text" },
  { key: "description", label: "Description", type: "textarea" },
  { key: "size", label: "Card Size", type: "select", options: ["small", "large"] },
  { key: "order", label: "Order (number)", type: "number" },
];

const PROJECT_FIELDS = [
  { key: "title", label: "Title", type: "text" },
  { key: "category", label: "Category", type: "text" },
  { key: "tag", label: "Tag (e.g. FINANCE)", type: "text" },
  { key: "description", label: "Description", type: "textarea" },
  { key: "metrics", label: "Metrics (comma-separated)", type: "text" },
  { key: "image", label: "Image URL", type: "text" },
  { key: "order", label: "Order (number)", type: "number" },
];

const ARTICLE_FIELDS = [
  { key: "title", label: "Title", type: "text" },
  { key: "excerpt", label: "Excerpt", type: "textarea" },
  { key: "content", label: "Full Content", type: "textarea" },
  { key: "category", label: "Category", type: "select", options: ["AI Insights", "Case Study", "News", "Tutorial", "Opinion"] },
  { key: "cover_image", label: "Cover Image URL", type: "text" },
  { key: "published", label: "Published (true/false)", type: "text" },
  { key: "order", label: "Order (number)", type: "number" },
];

export default function Admin() {
  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Link to="/">
            <Button variant="ghost" size="icon" className="rounded-xl">
              <ArrowLeft size={18} />
            </Button>
          </Link>
          <div>
            <h1 className="font-heading font-black text-3xl text-foreground tracking-tight">
              FLUX<span className="text-primary">ENTIQ</span> Admin
            </h1>
            <p className="text-sm text-muted-foreground font-heading mt-0.5">Manage your website content</p>
          </div>
        </div>

        <Tabs defaultValue="services">
          <TabsList className="mb-8 rounded-xl bg-secondary/50 p-1 flex-wrap h-auto gap-1">
            <TabsTrigger value="services" className="rounded-lg font-heading font-medium">Services</TabsTrigger>
            <TabsTrigger value="testimonials" className="rounded-lg font-heading font-medium">Testimonials</TabsTrigger>
            <TabsTrigger value="faqs" className="rounded-lg font-heading font-medium">FAQs</TabsTrigger>
            <TabsTrigger value="cases" className="rounded-lg font-heading font-medium">Case Studies</TabsTrigger>
            <TabsTrigger value="articles" className="rounded-lg font-heading font-medium">Articles</TabsTrigger>
            <TabsTrigger value="projects" className="rounded-lg font-heading font-medium">Projects</TabsTrigger>
          </TabsList>

          <TabsContent value="services">
            <EntityManager entityKey="Service" fields={SERVICE_FIELDS} label="Service" />
          </TabsContent>
          <TabsContent value="testimonials">
            <EntityManager entityKey="Testimonial" fields={TESTIMONIAL_FIELDS} label="Testimonial" />
          </TabsContent>
          <TabsContent value="faqs">
            <EntityManager entityKey="FAQ" fields={FAQ_FIELDS} label="FAQ" />
          </TabsContent>
          <TabsContent value="cases">
            <EntityManager entityKey="CaseStudy" fields={CASE_STUDY_FIELDS} label="Case Study" />
          </TabsContent>
          <TabsContent value="articles">
            <EntityManager entityKey="Article" fields={ARTICLE_FIELDS} label="Article" />
          </TabsContent>
          <TabsContent value="projects">
            <EntityManager entityKey="Project" fields={PROJECT_FIELDS} label="Project" />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Save, Sparkles, Upload } from "lucide-react";
import { createCandidate } from "@/lib/actions";
import { postAiFile } from "@/lib/ai-client";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface ResumeParseResult {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  current_role?: string | null;
  experience_years?: number | null;
  skills?: string[];
  education?: string[];
  summary?: string | null;
}

const EMPTY = { firstName: "", lastName: "", email: "", role: "", source: "Direct" };

export function CandidateForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [form, setForm] = React.useState(EMPTY);
  const [skills, setSkills] = React.useState<string[]>([]);
  const [summary, setSummary] = React.useState<string | null>(null);
  const [parsing, setParsing] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const setField = (key: keyof typeof EMPTY, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleResumeUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setParsing(true);
    setError(null);
    try {
      const result = await postAiFile<ResumeParseResult>("/api/ai/parse-resume", file);
      const fullName = result.full_name ?? "";
      const [first = "", last = ""] = fullName.split(/\s+/);
      setForm((prev) => ({
        ...prev,
        firstName: prev.firstName || first,
        lastName: prev.lastName || last,
        email: prev.email || result.email || "",
        role: prev.role || result.current_role || "",
      }));
      setSkills(result.skills ?? []);
      setSummary(result.summary ?? null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Resume parsing failed — is the AI bridge running?",
      );
    } finally {
      setParsing(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
      setError("Name and email are required.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await createCandidate({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        role: form.role || "Unspecified",
        source: form.source,
        matchScore: skills.length > 0 ? Math.min(95, 60 + skills.length * 2) : 0,
      });
      toast({
        title: "Candidate added",
        description: `${form.firstName} ${form.lastName} is now in the pipeline.`,
        variant: "success",
      });
      router.push("/recruitment");
      router.refresh();
      void result;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Resume parsing */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <div>
              <p className="text-sm font-semibold">AI resume parsing</p>
              <p className="text-xs text-muted-foreground">
                Upload a resume to auto-fill the candidate profile.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="resume-upload-button"
            disabled={parsing}
            onClick={() => fileInputRef.current?.click()}
          >
            {parsing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Upload resume
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.md,application/pdf,text/plain"
            className="hidden"
            onChange={(event) => void handleResumeUpload(event)}
          />
        </div>

        {(skills.length > 0 || summary) && (
          <div className="mt-3 space-y-2">
            {summary && (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {summary}
              </p>
            )}
            {skills.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {skills.map((skill) => (
                  <Badge key={skill} variant="secondary">
                    {skill}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="cand-first">First name</Label>
          <Input
            id="cand-first"
            data-testid="candidate-form-first-name"
            value={form.firstName}
            onChange={(event) => setField("firstName", event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cand-last">Last name</Label>
          <Input
            id="cand-last"
            data-testid="candidate-form-last-name"
            value={form.lastName}
            onChange={(event) => setField("lastName", event.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="cand-email">Email</Label>
        <Input
          id="cand-email"
          type="email"
          data-testid="candidate-form-email"
          value={form.email}
          onChange={(event) => setField("email", event.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="cand-role">Role</Label>
          <Input
            id="cand-role"
            value={form.role}
            onChange={(event) => setField("role", event.target.value)}
            placeholder="Backend Engineer"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cand-source">Source</Label>
          <Select value={form.source} onValueChange={(value) => setField("source", value)}>
            <SelectTrigger id="cand-source">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Direct">Direct</SelectItem>
              <SelectItem value="LinkedIn">LinkedIn</SelectItem>
              <SelectItem value="Referral">Referral</SelectItem>
              <SelectItem value="Careers page">Careers page</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" data-testid="candidate-form-submit" disabled={submitting}>
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Add candidate
        </Button>
      </div>
    </form>
  );
}

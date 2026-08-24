import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Database,
  GitBranch,
  KeyRound,
  LayoutDashboard,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SparklesBadge } from "@/components/marketing/site-shell";
import { HeroVisual } from "@/components/three/hero-visual";

const FEATURES = [
  {
    icon: Users,
    title: "HR + Lead Intelligence",
    description:
      "Employees, recruitment, leave, payroll and a full CRM pipeline in one self-hosted platform.",
  },
  {
    icon: Bot,
    title: "AI Copilot that acts",
    description:
      "Screen candidates, write interview reports, auto-approve leave and surface analytics insights.",
  },
  {
    icon: KeyRound,
    title: "Bring your own key",
    description:
      "OpenAI, Claude, Gemini, Groq, or any custom endpoint (Ollama, vLLM, LM Studio). No vendor lock-in.",
  },
  {
    icon: Database,
    title: "Pluggable memory",
    description:
      "Supabase by default — or PostgreSQL, Xata, SQLite, a custom endpoint, even local on-device storage.",
  },
  {
    icon: Workflow,
    title: "Visual automation",
    description:
      "Drag-and-drop workflows with triggers, conditions, actions and webhooks — no code.",
  },
  {
    icon: ShieldCheck,
    title: "Offline licensing",
    description:
      "Cryptographically signed license keys. No license server, no phone-home. You own the software.",
  },
];

const PROVIDERS = ["Groq", "OpenAI", "Claude", "Gemini", "Ollama", "vLLM", "LM Studio", "Azure"];

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-4 pb-20 pt-24 text-center md:px-6">
          <div className="mx-auto mb-6 flex justify-center">
            <SparklesBadge>Enterprise HR platform · self-hosted</SparklesBadge>
          </div>
          <h1 className="mx-auto max-w-3xl text-balance text-4xl font-extrabold tracking-tight md:text-6xl">
            Own your HR and AI platform
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted-foreground">
            Fluxentiq is a turn-key, white-label HR + lead-intelligence suite with
            universal bring-your-own-key AI. Deploy it anywhere, brand it as your
            own, and license it to your customers.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" asChild className="btn-shimmer">
              <Link href="/auth/license">
                Start 15-day free trial <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/pricing">View pricing</Link>
            </Button>
          </div>

          {/* 3D hero visual — theme-reactive liquid glass (WebGL, graceful fallback) */}
          <div className="mx-auto mt-14 max-w-4xl">
            <HeroVisual />
          </div>

          {/* Provider chips */}
          <div className="mx-auto mt-14 max-w-3xl">
            <p className="label-xs mb-4">Works with every AI provider</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {PROVIDERS.map((provider) => (
                <span
                  key={provider}
                  className="rounded-full border border-border bg-card/50 px-3.5 py-1.5 text-sm text-muted-foreground"
                >
                  {provider}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-border/70 py-20">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold tracking-tight">
              Everything a modern HR team needs
            </h2>
            <p className="mt-3 text-muted-foreground">
              From onboarding to payroll to the AI copilot — one platform.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="glass card-glow rounded-xl p-6"
                >
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-semibold">{feature.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* BYOK highlight */}
      <section id="byok" className="border-t border-border/70 py-20">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 md:grid-cols-2 md:px-6">
          <div>
            <SparklesBadge>Bring-your-own-key AI</SparklesBadge>
            <h2 className="mt-4 text-3xl font-bold tracking-tight">
              No AI vendor lock-in, ever
            </h2>
            <p className="mt-4 text-muted-foreground">
              Your customers plug in whichever provider they already use — or
              point it at their own self-hosted endpoint. All AI features work
              identically across every provider, because the transport layer is
              fully pluggable.
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              {[
                "OpenAI · Claude · Gemini · Groq out of the box",
                "Custom OpenAI-compatible endpoints (Ollama, vLLM, LM Studio)",
                "Candidate screening, resume parsing, ranking, reports & insights",
                "Copilot with tool-calling that performs real actions",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="glass-strong rounded-2xl p-8">
            <div className="mb-4 flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              <span className="text-sm font-semibold">AI Copilot</span>
            </div>
            <div className="space-y-3">
              <div className="rounded-xl border border-border bg-card p-4 text-sm">
                <p className="font-medium">You</p>
                <p className="text-muted-foreground">Approve Miguel Torres&apos; leave</p>
              </div>
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
                <p className="font-medium">Copilot</p>
                <p className="text-muted-foreground">
                  I&apos;ve approved Miguel&apos;s PTO request and notified his manager. ✓
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4 text-sm">
                <p className="font-medium">Action cards</p>
                <p className="text-muted-foreground">
                  View approval queue · Open payroll · Rank candidates
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Licensing */}
      <section className="border-t border-border/70 py-20">
        <div className="mx-auto max-w-6xl px-4 text-center md:px-6">
          <SparklesBadge>3-tier licensing</SparklesBadge>
          <h2 className="mt-4 text-3xl font-bold tracking-tight">
            Sell it as a trial, a subscription, or source code
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
            Cryptographically signed license keys unlock each tier — verified
            offline, no license server required.
          </p>
          <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
            <LicenseCard
              name="Free Trial"
              highlight="15 days"
              points={["Full featured demo", "Groq AI route", "10 employees", "Branded banner"]}
            />
            <LicenseCard
              name="Pro"
              highlight="Subscription"
              points={["All features unlocked", "Custom BYOK AI", "Unlimited records", "White-label branding"]}
              featured
            />
            <LicenseCard
              name="Enterprise"
              highlight="Source code"
              points={["Full repository access", "Modify & self-host", "Perpetual license", "Priority support"]}
            />
          </div>
          <div className="mt-10">
            <Button size="lg" asChild>
              <Link href="/pricing">
                Compare all tiers <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-border/70 py-20">
        <div className="mx-auto max-w-4xl px-4 text-center md:px-6">
          <div className="glass-strong ring-hairline rounded-2xl p-10">
            <div className="mx-auto mb-4 flex justify-center">
              <LayoutDashboard className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-3xl font-bold tracking-tight">
              Deploy in minutes. Own it forever.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              One Docker Compose stack. Your AI keys. Your branding. Your license
              model. Start the free trial and see the full product.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button size="lg" asChild>
                <Link href="/auth/license">
                  Start 15-day free trial <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/docs">Read the docs</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function LicenseCard({
  name,
  highlight,
  points,
  featured,
}: {
  name: string;
  highlight: string;
  points: string[];
  featured?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-6 text-left ${
        featured
          ? "ring-hairline border-primary/40 bg-primary/5"
          : "border-border bg-card/50"
      }`}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{name}</h3>
        <span className="text-xs font-medium text-primary">{highlight}</span>
      </div>
      <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
        {points.map((point) => (
          <li key={point} className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

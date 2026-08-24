import { Terminal } from "lucide-react";
import { SparklesBadge } from "@/components/marketing/site-shell";

const SECTIONS = [
  {
    id: "quickstart",
    title: "Quickstart (Docker)",
    body: (
      <>
        <p>
          Deploy the full stack — web app, AI bridge, and PostgreSQL — with one
          command:
        </p>
        <CodeBlock
          code={`cp .env.example .env\nbash install.sh\n# or: docker compose up -d --build`}
        />
      </>
    ),
  },
  {
    id: "byok",
    title: "Bring-your-own-key AI",
    body: (
      <>
        <p>
          Configure any provider from <strong>Settings → AI Provider</strong>, or
          via environment variables:
        </p>
        <CodeBlock
          code={`# Groq\nLLM_PROVIDER=groq\nLLM_API_KEY=gsk_...\n\n# Ollama (local)\nLLM_PROVIDER=custom\nLLM_BASE_URL=http://localhost:11434/v1\nLLM_MODEL=llama3`}
        />
        <p>
          Supported: <code>openai</code>, <code>groq</code>, <code>gemini</code>,{" "}
          <code>anthropic</code>, and <code>custom</code> (any OpenAI-compatible
          endpoint).
        </p>
      </>
    ),
  },
  {
    id: "memory",
    title: "Memory (storage backend)",
    body: (
      <>
        <p>
          Choose where data lives from <strong>Settings → Memory</strong>:
        </p>
        <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
          <li><strong>Supabase</strong> (default) — multi-tenant Postgres + auth</li>
          <li><strong>PostgreSQL / Xata</strong> — direct Postgres connection</li>
          <li><strong>SQLite</strong> — single-file storage</li>
          <li><strong>Custom</strong> — any PostgREST-compatible endpoint</li>
          <li><strong>Local</strong> — on-device SQLite</li>
        </ul>
      </>
    ),
  },
  {
    id: "license",
    title: "License keys",
    body: (
      <>
        <p>
          Licenses are Ed25519-signed and verified offline. The seller issues
          keys with <code>scripts/license-tool.mjs</code>:
        </p>
        <CodeBlock
          code={`node scripts/license-tool.mjs keypair\nnode scripts/license-tool.mjs issue \\\n  --tier enterprise --email owner@acme.com \\\n  --org "Acme Corp" --users 500`}
        />
        <p>
          Key format: <code>FLUX-PRO-…</code> / <code>FLUX-ENT-…</code>. The
          public key ships with the product; the private key stays with the
          seller.
        </p>
      </>
    ),
  },
  {
    id: "ai-endpoints",
    title: "AI API endpoints",
    body: (
      <>
        <p>The Python bridge exposes these endpoints (proxied via Next.js):</p>
        <CodeBlock
          code={`POST /api/ai/evaluate-candidate   # SSE match scoring\nPOST /api/ai/copilot              # SSE assistant + tools\nPOST /api/ai/evaluate-pto         # leave decision\nPOST /api/ai/parse-resume         # resume → fields\nPOST /api/ai/rank-candidates      # JD → ranked list\nPOST /api/ai/interview-report     # notes → report\nPOST /api/ai/insights             # analytics anomalies\nPOST /api/workflows/trigger       # run a workflow`}
        />
      </>
    ),
  },
  {
    id: "scheduler",
    title: "Scheduler (cron)",
    body: (
      <>
        <p>
          Point any cron at the scheduler endpoint to run due jobs (trial-expiry
          notices, payroll reminders):
        </p>
        <CodeBlock
          code={`# .env\nCRON_SECRET=change-me\n\n# crontab (every 10 min)\n*/10 * * * * curl -H "x-cron-secret: change-me" \\\n  http://localhost:3000/api/system/cron`}
        />
      </>
    ),
  },
];

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-20 md:px-6">
      <div className="mb-12">
        <div className="mb-4">
          <SparklesBadge>Documentation</SparklesBadge>
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight">Self-hosting guide</h1>
        <p className="mt-3 text-muted-foreground">
          Everything a buyer needs to deploy, configure and run Fluxentiq.
        </p>
      </div>

      <div className="space-y-10">
        {SECTIONS.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-24">
            <h2 className="mb-3 text-xl font-semibold">{section.title}</h2>
            <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
              {section.body}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card/60 p-4">
      <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Terminal className="h-3.5 w-3.5" /> bash
      </div>
      <pre className="font-mono text-xs leading-relaxed text-foreground">{code}</pre>
    </div>
  );
}

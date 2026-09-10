"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Search, UserRound, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface PaletteResult {
  source: "employees" | "candidates" | "documents" | "knowledge";
  id: string;
  title: string;
  subtitle: string;
  href: string | null;
  excerpt?: string;
  score: number;
}

interface SearchResponse {
  ok: boolean;
  data?: PaletteResult[];
  error?: string;
}

const SOURCE_META: Record<PaletteResult["source"], { label: string; Icon: typeof Search }> = {
  employees: { label: "Employees", Icon: Users },
  candidates: { label: "Candidates", Icon: UserRound },
  documents: { label: "Documents", Icon: FileText },
  knowledge: { label: "Knowledge", Icon: Search },
};

const DEBOUNCE_MS = 200;
const MIN_QUERY = 2;

/**
 * Command palette: global search across employees, candidates, documents
 * and company knowledge. Queries GET /api/search, which inherits each
 * entity's RBAC visibility — the palette only ever renders what the API
 * returned for this caller.
 */
export function CommandPalette() {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [results, setResults] = React.useState<PaletteResult[]>([]);
  const [active, setActive] = React.useState(0);

  // Cmd/Ctrl+K focuses the palette from anywhere.
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Debounced search with in-flight cancellation.
  React.useEffect(() => {
    const needle = query.trim();
    if (needle.length < MIN_QUERY) {
      setResults([]);
      setLoading(false);
      setOpen(false);
      return;
    }
    setLoading(true);
    setOpen(true);
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(needle)}&limit=12`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const payload = (await response.json()) as SearchResponse;
        if (!controller.signal.aborted) {
          setResults(payload.ok && Array.isArray(payload.data) ? payload.data : []);
          setActive(0);
        }
      } catch {
        if (!controller.signal.aborted) setResults([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const close = React.useCallback(() => {
    setOpen(false);
    setActive(0);
  }, []);

  const goToActive = React.useCallback(() => {
    const item = results[active];
    if (item?.href) {
      close();
      router.push(item.href);
    }
  }, [results, active, close, router]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      close();
      inputRef.current?.blur();
    } else if (event.key === "ArrowDown" && results.length > 0) {
      event.preventDefault();
      setActive((index) => (index + 1) % results.length);
    } else if (event.key === "ArrowUp" && results.length > 0) {
      event.preventDefault();
      setActive((index) => (index - 1 + results.length) % results.length);
    } else if (event.key === "Enter" && open) {
      event.preventDefault();
      goToActive();
    }
  };

  const showPanel = open && query.trim().length >= MIN_QUERY;

  return (
    <div data-testid="command-palette" className="relative hidden w-full max-w-sm sm:block electron-no-drag">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        data-testid="topnav-search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => query.trim().length >= MIN_QUERY && setOpen(true)}
        placeholder="Search employees, candidates…"
        className="h-9 bg-card/60 pl-9"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls="command-palette-results"
        aria-label="Global search"
      />
      {showPanel && (
        <>
          <button
            type="button"
            aria-label="Close search results"
            className="fixed inset-0 z-30 cursor-default bg-transparent"
            onClick={close}
          />
          <div
            id="command-palette-results"
            data-testid="command-palette-results"
            role="listbox"
            className="absolute left-0 right-0 top-11 z-40 max-h-96 overflow-y-auto rounded-lg border border-border bg-popover p-1.5 shadow-xl"
          >
            {loading && results.length === 0 && (
              <p className="px-3 py-4 text-center text-sm text-muted-foreground">Searching…</p>
            )}
            {!loading && results.length === 0 && (
              <p data-testid="command-palette-empty" className="px-3 py-4 text-center text-sm text-muted-foreground">
                No results for &ldquo;{query.trim()}&rdquo;.
              </p>
            )}
            {results.map((item, index) => {
              const meta = SOURCE_META[item.source];
              const MetaIcon = meta.Icon;
              const content = (
                <>
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
                    <MetaIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium">{item.title}</span>
                      <span className="shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">
                        {meta.label}
                      </span>
                    </span>
                    {item.subtitle && (
                      <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span>
                    )}
                    {item.source === "knowledge" && item.excerpt && (
                      <span className="mt-0.5 block text-xs text-muted-foreground">{item.excerpt}</span>
                    )}
                  </span>
                </>
              );
              const classes = cn(
                "flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left",
                index === active ? "bg-accent" : "bg-transparent",
              );
              return item.href ? (
                <Link
                  key={`${item.source}:${item.id}`}
                  href={item.href}
                  role="option"
                  aria-selected={index === active}
                  className={classes}
                  onMouseEnter={() => setActive(index)}
                  onClick={close}
                >
                  {content}
                </Link>
              ) : (
                <div key={`${item.source}:${item.id}`} role="option" aria-selected={index === active} className={classes}>
                  {content}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

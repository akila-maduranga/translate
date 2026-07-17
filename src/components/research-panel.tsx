"use client";

import { useState, useCallback, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sparkles,
  Loader2,
  AlertCircle,
  RefreshCw,
  Database,
  CheckCircle2,
} from "lucide-react";
import type { TranslationContextBundle } from "@/lib/tmdb";
import type { ResearchBrief } from "@/lib/translate-context";

interface ResearchPanelProps {
  context: TranslationContextBundle | null;
  tmdbId: number | null;
  tmdbMediaType: "movie" | "tv" | null;
  onBriefReady: (brief: ResearchBrief) => void;
  onBriefVersionChange?: (version: number) => void;
}

type Phase = "idle" | "cache-check" | "step1" | "step2" | "done" | "error";

interface Step1Result {
  summary: string;
  tone: string;
  register: string;
  setting: string;
  characters: {
    name: string;
    sinhala_name: string;
    description: string;
    speech_style: string;
  }[];
  locations: { name: string; sinhala_name: string }[];
  proper_nouns: { english: string; sinhala: string; note?: string }[];
  cultural_notes: string;
}

export function ResearchPanel({
  context,
  tmdbId,
  tmdbMediaType,
  onBriefReady,
  onBriefVersionChange,
}: ResearchPanelProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cacheHit, setCacheHit] = useState(false);
  const [rawMarkdown, setRawMarkdown] = useState("");
  const [step1Result, setStep1Result] = useState<Step1Result | null>(null);
  const { toast } = useToast();

  // When the selected movie changes, try to load any cached brief.
  const loadFromCache = useCallback(async () => {
    if (!tmdbId || !tmdbMediaType) {
      setPhase("idle");
      setRawMarkdown("");
      setCacheHit(false);
      setStep1Result(null);
      return;
    }
    try {
      const res = await fetch(
        `/api/brief/get?tmdb_id=${tmdbId}&tmdb_media_type=${tmdbMediaType}`
      );
      if (res.status === 404) {
        setPhase("idle");
        setRawMarkdown("");
        setCacheHit(false);
        setStep1Result(null);
        return;
      }
      const data = await res.json();
      if (data.cached && data.brief) {
        setPhase("done");
        setCacheHit(true);
        setRawMarkdown(
          `[CACHE HIT] Loaded cached research brief for ${data.title}.\n` +
          `Last updated: ${new Date(data.updatedAt).toLocaleString()}\n` +
          `Click "Refresh" to re-run with AI.\n\n` +
          `(Cached — open the Glossary tab to view locked terms.)`
        );
        onBriefReady(data.brief);
        onBriefVersionChange?.(Date.now());
      }
    } catch (err) {
      console.error("Failed to load cached brief:", err);
    }
  }, [tmdbId, tmdbMediaType, onBriefReady, onBriefVersionChange]);

  useEffect(() => {
    loadFromCache();
  }, [loadFromCache]);

  const run = useCallback(
    async (forceRefresh: boolean = false) => {
      if (!context) return;
      if (!tmdbId || !tmdbMediaType) {
        toast({ title: "Pick a movie first", variant: "destructive" });
        return;
      }

      setError(null);
      setCacheHit(false);
      setRawMarkdown("");
      setStep1Result(null);

      // ── Step 1: context analysis ──
      setPhase("step1");
      setProgress("Step 1 of 2: Analyzing movie context, tone, characters...");

      try {
        const res1 = await fetch("/api/research/step1", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            context,
            tmdb_id: tmdbId,
            tmdb_media_type: tmdbMediaType,
            force_refresh: forceRefresh,
          }),
        });

        if (!res1.ok) {
          const data = await res1.json().catch(() => ({}));
          throw new Error(data.error || `Step 1 failed: ${res1.status}`);
        }

        const data1 = await res1.json();

        // If cache hit, we're done.
        if (data1.cached) {
          setPhase("done");
          setCacheHit(true);
          setRawMarkdown(data1.rawMarkdown || "");
          if (data1.brief) {
            onBriefReady(data1.brief);
            onBriefVersionChange?.(Date.now());
          }
          toast({
            title: "Loaded from cache",
            description: "No AI call needed.",
          });
          return;
        }

        // Got step 1 — show partial progress + move to step 2.
        setStep1Result(data1.step1);
        setPhase("step2");
        setProgress("Step 2 of 2: Generating glossary in natural Sinhala...");

        const res2 = await fetch("/api/research/step2", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            context,
            step1: data1.step1,
            tmdb_id: tmdbId,
            tmdb_media_type: tmdbMediaType,
          }),
        });

        if (!res2.ok) {
          const data = await res2.json().catch(() => ({}));
          throw new Error(data.error || `Step 2 failed: ${res2.status}`);
        }

        const data2 = await res2.json();
        setPhase("done");
        setRawMarkdown(data2.rawMarkdown || "");
        if (data2.brief) {
          onBriefReady(data2.brief);
          onBriefVersionChange?.(Date.now());
        }
        toast({
          title: "Research complete",
          description: "Translation context is ready.",
        });
      } catch (err: any) {
        setPhase("error");
        setError(err.message);
        toast({
          title: "Research failed",
          description: err.message,
          variant: "destructive",
        });
      }
    },
    [context, tmdbId, tmdbMediaType, onBriefReady, onBriefVersionChange, toast]
  );

  const isBusy = phase === "step1" || phase === "step2";

  return (
    <Card className="flex flex-col p-4 gap-3 h-full">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Research</h3>
          {isBusy && (
            <Badge variant="secondary" className="gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              {phase === "step1" ? "Analyzing" : "Generating glossary"}
            </Badge>
          )}
          {phase === "done" && cacheHit && (
            <Badge variant="outline" className="gap-1">
              <Database className="h-3 w-3" />
              Cached
            </Badge>
          )}
          {phase === "done" && !cacheHit && (
            <Badge variant="outline" className="gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Ready
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {phase === "done" && cacheHit && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => run(true)}
              disabled={!context || isBusy}
              className="gap-1"
              title="Re-run research and overwrite the cached brief"
            >
              <RefreshCw className="h-3 w-3" />
              Refresh
            </Button>
          )}
          {!isBusy ? (
            <Button
              size="sm"
              onClick={() => run(false)}
              disabled={!context || isBusy}
              className="gap-1"
            >
              <Sparkles className="h-3 w-3" />
              {phase === "done" ? "Re-run" : "Run Research"}
            </Button>
          ) : null}
        </div>
      </div>

      {/* Progress indicator */}
      {isBusy && (
        <div className="rounded-md border bg-muted/30 p-3">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span>{progress}</span>
          </div>
          <div className="mt-2 flex gap-1">
            <div
              className={`h-1 flex-1 rounded-full ${
                phase === "step1" ? "bg-primary animate-pulse" : "bg-primary"
              }`}
            />
            <div
              className={`h-1 flex-1 rounded-full ${
                phase === "step2" ? "bg-primary animate-pulse" : "bg-muted"
              }`}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Two-step process: context analysis → glossary generation.
            Each step takes 10-15 seconds.
          </p>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <ScrollArea className="flex-1 min-h-0 rounded-md border bg-muted/30">
        <div className="p-3">
          {rawMarkdown ? (
            <pre className="whitespace-pre-wrap sinhala-serif text-sm leading-relaxed" lang="si">
              {rawMarkdown}
            </pre>
          ) : (
            <div className="text-sm text-muted-foreground italic">
              {context
                ? "Click \"Run Research\" to analyse this movie."
                : "Pick a movie first to enable research."}
            </div>
          )}
        </div>
      </ScrollArea>
    </Card>
  );
}

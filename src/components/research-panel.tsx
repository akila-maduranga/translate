"use client";

import { useState, useRef, useCallback, useEffect } from "react";
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
} from "lucide-react";
import type { TranslationContextBundle } from "@/lib/tmdb";
import { loadSettings } from "@/lib/settings";
import type { ResearchBrief } from "@/lib/translate-context";

interface ResearchPanelProps {
  context: TranslationContextBundle | null;
  tmdbId: number | null;
  tmdbMediaType: "movie" | "tv" | null;
  onBriefReady: (brief: ResearchBrief) => void;
  onBriefVersionChange?: (version: number) => void;
}

export function ResearchPanel({
  context,
  tmdbId,
  tmdbMediaType,
  onBriefReady,
  onBriefVersionChange,
}: ResearchPanelProps) {
  const [streaming, setStreaming] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cacheHit, setCacheHit] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const { toast } = useToast();

  // When the selected movie changes, try to load any cached brief
  // immediately (no DeepSeek call needed). If none is cached, the
  // user can click "Run Research" to generate one.
  const loadFromCache = useCallback(async () => {
    if (!tmdbId || !tmdbMediaType) {
      setText("");
      setCacheHit(false);
      return;
    }
    try {
      const res = await fetch(
        `/api/brief/get?tmdb_id=${tmdbId}&tmdb_media_type=${tmdbMediaType}`
      );
      if (res.status === 404) {
        // No cache — clear the panel so user knows they need to run research.
        setText("");
        setCacheHit(false);
        return;
      }
      const data = await res.json();
      if (data.cached && data.brief) {
        const header =
          `[CACHE HIT] Loaded cached research brief for ${data.title}.\n` +
          `Last updated: ${new Date(data.updatedAt).toLocaleString()}\n` +
          `Click "Refresh" to re-run DeepSeek and overwrite.\n\n`;
        setText(header + "(Cached — open the Glossary Editor to view locked terms.)");
        setCacheHit(true);
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
        toast({
          title: "Pick a movie first",
          description: "Research is keyed by the TMDB id.",
          variant: "destructive",
        });
        return;
      }
      const settings = loadSettings();
      if (!settings.deepseekApiKey) {
        toast({
          title: "DeepSeek API key required",
          description: "Open Settings and paste your DeepSeek API key.",
          variant: "destructive",
        });
        return;
      }
      setStreaming(true);
      setText("");
      setError(null);
      setCacheHit(false);
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      try {
        const res = await fetch("/api/research", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            context,
            tmdb_id: tmdbId,
            tmdb_media_type: tmdbMediaType,
            deepseek_api_key: settings.deepseekApiKey,
            force_refresh: forceRefresh,
          }),
          signal: ac.signal,
        });

        if (!res.ok || !res.body) {
          const errText = await res.text();
          throw new Error(errText || `Request failed: ${res.status}`);
        }

        // Check cache-hit header for display.
        const wasCacheHit = res.headers.get("x-cache-hit") === "true";
        setCacheHit(wasCacheHit);

        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let full = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          full += chunk;
          setText(full);
        }

        if (full.includes("[ERROR]")) {
          throw new Error(full.split("[ERROR]")[1]?.trim() || "Research failed");
        }

        // After streaming finishes, the server has cached the structured
        // brief. Fetch it now so the glossary editor + workspace have
        // the real ResearchBrief object (not just the markdown stream).
        const briefRes = await fetch(
          `/api/brief/get?tmdb_id=${tmdbId}&tmdb_media_type=${tmdbMediaType}`
        );
        if (briefRes.ok) {
          const briefData = await briefRes.json();
          if (briefData.brief) {
            onBriefReady(briefData.brief);
            onBriefVersionChange?.(Date.now());
          }
        }

        toast({
          title: wasCacheHit
            ? "Loaded from cache"
            : "Research brief complete",
          description: wasCacheHit
            ? "No DeepSeek call needed. Click Refresh to re-run."
            : "Translation context locked and cached. Re-translations of this movie are now free.",
        });
      } catch (err: any) {
        if (err.name !== "AbortError") {
          setError(err.message);
          toast({
            title: "Research failed",
            description: err.message,
            variant: "destructive",
          });
        }
      } finally {
        setStreaming(false);
      }
    },
    [context, tmdbId, tmdbMediaType, onBriefReady, onBriefVersionChange, toast]
  );

  function stop() {
    abortRef.current?.abort();
    setStreaming(false);
  }

  return (
    <Card className="flex flex-col p-4 gap-3 h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Research Brief</h3>
          {streaming && (
            <Badge variant="secondary" className="gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Researching
            </Badge>
          )}
          {!streaming && cacheHit && (
            <Badge variant="outline" className="gap-1">
              <Database className="h-3 w-3" />
              Cached
            </Badge>
          )}
          {!streaming && text && !cacheHit && (
            <Badge variant="outline" className="gap-1">
              Ready
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!streaming && cacheHit && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => run(true)}
              disabled={!context || streaming}
              className="gap-1"
              title="Re-run DeepSeek and overwrite the cached brief"
            >
              <RefreshCw className="h-3 w-3" />
              Refresh
            </Button>
          )}
          {!streaming ? (
            <Button
              size="sm"
              onClick={() => run(false)}
              disabled={!context || streaming}
              className="gap-1"
            >
              <Sparkles className="h-3 w-3" />
              {text ? "Reload" : "Run Research"}
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={stop}>
              Stop
            </Button>
          )}
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        DeepSeek analyses the movie&apos;s plot, characters, tone, and culture
        — locking consistent Sinhala terminology. Briefs are{" "}
        <span className="font-medium">cached server-side</span>, so
        re-translating the same movie later is free.
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <ScrollArea className="flex-1 min-h-0 rounded-md border bg-muted/30">
        <div className="p-3">
          {text ? (
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
              {text}
            </pre>
          ) : (
            <div className="text-sm text-muted-foreground italic">
              {context
                ? "Click \"Run Research\" to let DeepSeek analyse this title."
                : "Pick a movie first to enable research."}
            </div>
          )}
        </div>
      </ScrollArea>
    </Card>
  );
}

"use client";

import { useState, useCallback, useRef } from "react";
import Image from "next/image";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Star, Film, Tv, Sparkles, AlertCircle } from "lucide-react";
import {
  posterUrl,
  type TmdbSearchResult,
  type TranslationContextBundle,
} from "@/lib/tmdb";
import { loadSettings } from "@/lib/settings";

interface MovieSearchProps {
  onPick: (
    result: TmdbSearchResult | AiSearchResult,
    ctx: TranslationContextBundle,
    source: "tmdb" | "ai"
  ) => void;
  selected?: { id: number; media_type: string } | null;
}

/**
 * AI-search result shape. Same as TmdbSearchResult but with an extra
 * `confidence` field and no `id`/`poster_path`/`backdrop_path`.
 */
export interface AiSearchResult {
  id: number;            // always 0 for AI results
  media_type: "movie" | "tv";
  title: string;
  original_title?: string;
  release_date?: string;
  overview: string;
  poster_path: string | null;   // always null for AI results
  backdrop_path: string | null; // always null for AI results
  vote_average: number;         // 0 for AI results
  confidence?: "high" | "medium" | "low";
}

export function MovieSearch({ onPick, selected }: MovieSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    Array<{ result: TmdbSearchResult | AiSearchResult; source: "tmdb" | "ai" }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [source, setSource] = useState<"tmdb" | "ai" | null>(null);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const { toast } = useToast();
  const abortRef = useRef<AbortController | null>(null);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    const settings = loadSettings();
    setLoading(true);
    setResults([]);
    setSource(null);
    setFallbackReason(null);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    // --- Step 1: try TMDB if a key is configured ---
    if (settings.tmdbApiKey) {
      try {
        const res = await fetch(
          `/api/tmdb/search?query=${encodeURIComponent(q)}&api_key=${encodeURIComponent(settings.tmdbApiKey)}`,
          { signal: ac.signal }
        );
        const data = await res.json();
        if (res.ok && (data.results ?? []).length > 0) {
          setResults(
            (data.results as TmdbSearchResult[]).map((r) => ({
              result: r,
              source: "tmdb" as const,
            }))
          );
          setSource("tmdb");
          setLoading(false);
          return;
        }
        // TMDB returned no results — fall through to AI.
        setFallbackReason(
          data.error
            ? `TMDB error: ${data.error}. Falling back to AI search.`
            : "TMDB returned no results. Falling back to AI search."
        );
      } catch (err: any) {
        if (err.name === "AbortError") {
          setLoading(false);
          return;
        }
        setFallbackReason(
          `TMDB request failed: ${err.message}. Falling back to AI search.`
        );
      }
    } else {
      setFallbackReason(
        "No TMDB API key set — using AI search directly. Add a TMDB key in Settings for poster images and richer metadata."
      );
    }

    // --- Step 2: fall back to AI search ---
    if (!settings.deepseekApiKey) {
      setLoading(false);
      toast({
        title: "Need an API key to search",
        description:
          fallbackReason ||
          "Set either a TMDB or DeepSeek API key in Settings to search for movies.",
        variant: "destructive",
      });
      return;
    }

    try {
      const res = await fetch("/api/ai-search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query: q,
          deepseek_api_key: settings.deepseekApiKey,
        }),
        signal: ac.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI search failed");
      const aiResults: AiSearchResult[] = (data.results ?? []).map(
        (r: TranslationContextBundle & { confidence?: string }) => ({
          id: 0,
          media_type: r.media_type,
          title: r.title,
          original_title: r.original_title,
          release_date: r.release_year ? `${r.release_year}-01-01` : undefined,
          overview: r.overview,
          poster_path: null,
          backdrop_path: null,
          vote_average: 0,
          confidence: r.confidence as "high" | "medium" | "low" | undefined,
        })
      );
      setResults(
        aiResults.map((r) => ({ result: r, source: "ai" as const }))
      );
      setSource("ai");
      if (aiResults.length === 0) {
        toast({
          title: "AI couldn't identify the title",
          description:
            "Try adding more detail — a quote, an actor, the release year.",
        });
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        toast({
          title: "AI search failed",
          description: err.message,
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  }, [query, toast]);

  async function pickResult(
    r: TmdbSearchResult | AiSearchResult,
    src: "tmdb" | "ai"
  ) {
    const settings = loadSettings();
    setLoadingId(r.id);

    if (src === "ai") {
      // AI results already have the context bundle shape — fetch it
      // again from /api/ai-search is wasteful. Instead, ask the AI
      // endpoint to give us the full TranslationContextBundle for
      // this specific title (it may have been truncated for the
      // list view).
      try {
        const res = await fetch("/api/ai-search", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            query: `${r.title} ${r.release_date ?? ""} ${r.overview.slice(0, 200)}`,
            deepseek_api_key: settings.deepseekApiKey,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "AI lookup failed");
        const ctx: TranslationContextBundle | undefined =
          data.results?.[0];
        if (!ctx) {
          throw new Error("AI could not produce a context bundle.");
        }
        onPick(r, ctx, "ai");
      } catch (err: any) {
        toast({
          title: "Failed to load AI context",
          description: err.message,
          variant: "destructive",
        });
      } finally {
        setLoadingId(null);
      }
      return;
    }

    // TMDB path — fetch full details.
    try {
      const res = await fetch(
        `/api/tmdb/details?id=${r.id}&type=${r.media_type}&api_key=${encodeURIComponent(settings.tmdbApiKey)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Details failed");
      onPick(r, data.context_bundle, "tmdb");
    } catch (err: any) {
      toast({
        title: "Failed to load details",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          placeholder="Search by title, or describe the movie (e.g. '2010 dream heist movie')..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") runSearch();
          }}
        />
        <Button onClick={runSearch} disabled={loading} className="gap-2">
          <Search className="h-4 w-4" />
          Search
        </Button>
      </div>

      {fallbackReason && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300/50 bg-amber-50 dark:bg-amber-950/30 p-2 text-xs text-amber-900 dark:text-amber-100">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{fallbackReason}</span>
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-md" />
          ))}
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[28rem] overflow-y-auto pr-1">
          {results.map(({ result: r, source: src }, idx) => {
            const isSel =
              selected &&
              selected.id === r.id &&
              selected.media_type === r.media_type &&
              r.id !== 0; // AI results have id=0, never show as "selected"
            const aiConfidence =
              src === "ai"
                ? (r as AiSearchResult).confidence
                : undefined;
            return (
              <Card
                key={`${src}-${r.id || "ai"}-${idx}`}
                role="button"
                tabIndex={0}
                onClick={() => pickResult(r, src)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    pickResult(r, src);
                  }
                }}
                className={`group cursor-pointer overflow-hidden p-0 transition-all hover:ring-2 hover:ring-primary ${
                  isSel ? "ring-2 ring-primary" : ""
                }`}
              >
                <div className="relative aspect-[2/3] bg-muted">
                  {r.poster_path ? (
                    <Image
                      src={posterUrl(r.poster_path, "w342")}
                      alt={r.title}
                      fill
                      sizes="(max-width: 640px) 50vw, 33vw"
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center text-muted-foreground">
                      {src === "ai" ? (
                        <Sparkles className="h-8 w-8" />
                      ) : (
                        <Film className="h-8 w-8" />
                      )}
                      <div className="text-xs line-clamp-3">
                        {r.overview.slice(0, 120)}
                      </div>
                    </div>
                  )}
                  {loadingId === r.id && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white text-xs">
                      Loading...
                    </div>
                  )}
                  <div className="absolute left-2 top-2 flex gap-1">
                    <Badge variant="secondary" className="gap-1">
                      {r.media_type === "tv" ? (
                        <Tv className="h-3 w-3" />
                      ) : (
                        <Film className="h-3 w-3" />
                      )}
                      {r.media_type === "tv" ? "TV" : "Movie"}
                    </Badge>
                    {src === "ai" && (
                      <Badge
                        variant="outline"
                        className="gap-1 bg-purple-50 dark:bg-purple-950/50"
                      >
                        <Sparkles className="h-3 w-3" />
                        AI
                      </Badge>
                    )}
                    {aiConfidence && (
                      <Badge
                        variant="outline"
                        className={
                          aiConfidence === "high"
                            ? "bg-emerald-50 dark:bg-emerald-950/50"
                            : aiConfidence === "medium"
                            ? "bg-amber-50 dark:bg-amber-950/50"
                            : "bg-red-50 dark:bg-red-950/50"
                        }
                      >
                        {aiConfidence}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="p-2 space-y-1">
                  <div className="line-clamp-2 text-sm font-medium leading-tight">
                    {r.title}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {r.release_date && (
                      <span>{r.release_date.slice(0, 4)}</span>
                    )}
                    {r.vote_average > 0 && (
                      <span className="flex items-center gap-0.5">
                        <Star className="h-3 w-3 fill-current" />
                        {r.vote_average.toFixed(1)}
                      </span>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Github,
  Languages,
  Sparkles,
  FileText,
  Film,
  BookOpen,
} from "lucide-react";
import { SettingsDialog } from "@/components/settings-dialog";
import { MovieSearch } from "@/components/movie-search";
import type { AiSearchResult } from "@/components/movie-search";
import { MovieContextCard } from "@/components/movie-context-card";
import { ResearchPanel } from "@/components/research-panel";
import { GlossaryEditor } from "@/components/glossary-editor";
import { SubtitleWorkspace } from "@/components/subtitle-workspace";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { TmdbSearchResult, TranslationContextBundle } from "@/lib/tmdb";
import type { ResearchBrief } from "@/lib/translate-context";

/**
 * For AI-identified movies (no real TMDB id), we synthesise a stable
 * negative id by hashing the title+year. Negative ids never collide
 * with real TMDB ids (which are always positive). The cache uses
 * `${mediaType}-${id}` as the key, so AI-sourced briefs get their own
 * namespace: e.g. `movie--1995463123`.
 */
function synthIdForAi(title: string, year: string): number {
  let h = 0;
  const s = `${title}|${year}`.toLowerCase();
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return -Math.abs(h) - 1; // always negative, never 0
}

export default function Home() {
  const [selected, setSelected] = useState<{
    id: number;
    media_type: "movie" | "tv";
    source: "tmdb" | "ai";
  } | null>(null);
  const [context, setContext] = useState<TranslationContextBundle | null>(null);
  const [brief, setBrief] = useState<ResearchBrief | null>(null);
  // Bumped whenever a new brief becomes available — tells the glossary
  // editor to re-fetch user overrides for the newly-selected movie.
  const [briefVersion, setBriefVersion] = useState(0);

  function handlePick(
    r: TmdbSearchResult | AiSearchResult,
    ctx: TranslationContextBundle,
    source: "tmdb" | "ai"
  ) {
    const id =
      source === "ai"
        ? synthIdForAi(ctx.title, ctx.release_year)
        : r.id;
    setSelected({ id, media_type: r.media_type, source });
    setContext(ctx);
    setBrief(null);
    setBriefVersion((v) => v + 1);
  }

  function clearMovie() {
    setSelected(null);
    setContext(null);
    setBrief(null);
    setBriefVersion((v) => v + 1);
  }

  function handleBriefReady(b: ResearchBrief) {
    setBrief(b);
    setBriefVersion((v) => v + 1);
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto max-w-7xl px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Languages className="h-4 w-4" />
            </div>
            <div>
              <div className="font-semibold leading-tight">SubSinhala</div>
              <div className="text-[10px] text-muted-foreground leading-tight">
                Context-aware EN → සිංහල subtitle translator
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="gap-1">
              <Link href="#how-it-works">
                <Sparkles className="h-4 w-4" />
                How it works
              </Link>
            </Button>
            <SettingsDialog />
            <Button asChild variant="outline" size="sm" className="gap-1">
              <Link
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Github className="h-4 w-4" />
                GitHub
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="border-b bg-gradient-to-b from-muted/40 to-background">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:py-14 text-center">
          <h1 className="mx-auto max-w-3xl text-3xl sm:text-4xl font-bold tracking-tight">
            Better than Google Translate.{" "}
            <span className="text-primary">
              Sinhala subtitles that actually fit the movie.
            </span>
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground text-sm sm:text-base">
            SubSinhala researches the movie&apos;s plot, characters, locations,
            tone, and cultural context with DeepSeek — then locks a Sinhala
            glossary so every subtitle stays consistent from opening scene to
            closing credits. Powered by TMDB for metadata and UI.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <Badge>1. Pick the movie</Badge>
            <Arrow />
            <Badge>2. Run research</Badge>
            <Arrow />
            <Badge>3. Tune glossary</Badge>
            <Arrow />
            <Badge>4. Translate &amp; export</Badge>
          </div>
        </div>
      </section>

      {/* Workspace */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-6 space-y-6">
        {/* Step 1: pick movie */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-3">
            <SectionLabel num={1} icon={<Film className="h-4 w-4" />}>
              Find the movie or TV show
            </SectionLabel>
            <MovieSearch onPick={handlePick} selected={selected} />
          </div>
          <div className="space-y-3">
            <SectionLabel num={2} icon={<FileText className="h-4 w-4" />}>
              Selected context
            </SectionLabel>
            {context ? (
              <MovieContextCard
                ctx={context}
                onClear={clearMovie}
                source={selected?.source}
              />
            ) : (
              <Card className="p-6 text-sm text-muted-foreground text-center">
                Pick a title to lock the translation context.
              </Card>
            )}
          </div>
        </section>

        {/* Step 2: research */}
        <section className="space-y-3">
          <SectionLabel num={3} icon={<Sparkles className="h-4 w-4" />}>
            Research brief (locked terminology — cached per movie)
          </SectionLabel>
          <div className="h-[24rem]">
            <ResearchPanel
              context={context}
              tmdbId={selected?.id ?? null}
              tmdbMediaType={selected?.media_type ?? null}
              onBriefReady={handleBriefReady}
              onBriefVersionChange={setBriefVersion}
            />
          </div>
        </section>

        {/* Step 3: glossary editor */}
        <section className="space-y-3">
          <SectionLabel num={4} icon={<BookOpen className="h-4 w-4" />}>
            Glossary editor (override locked terms)
          </SectionLabel>
          <div className="h-[24rem]">
            <GlossaryEditor
              context={context}
              brief={brief}
              tmdbId={selected?.id ?? null}
              tmdbMediaType={selected?.media_type ?? null}
              briefVersion={briefVersion}
            />
          </div>
        </section>

        {/* Step 4: subtitles */}
        <section className="space-y-3">
          <SectionLabel num={5} icon={<FileText className="h-4 w-4" />}>
            Subtitles (translate, fine-tune per cue, export)
          </SectionLabel>
          <div className="h-[28rem]">
            <SubtitleWorkspace
              context={context}
              brief={brief}
              tmdbId={selected?.id ?? null}
              tmdbMediaType={selected?.media_type ?? null}
            />
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="scroll-mt-20">
          <Card className="p-6">
            <h3 className="font-semibold mb-3">How it works</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <div className="font-medium mb-1">1. Movie lookup (TMDB or AI)</div>
                <p className="text-muted-foreground">
                  We search TMDB for plot, cast (with character names), genres,
                  keywords, production countries, spoken languages, runtime and
                  tagline — the richest free movie database. If no TMDB key is
                  configured or TMDB returns nothing, we automatically fall
                  back to DeepSeek to identify the movie from a free-text
                  description and produce the same context bundle shape.
                </p>
              </div>
              <div>
                <div className="font-medium mb-1">2. DeepSeek research</div>
                <p className="text-muted-foreground">
                  DeepSeek reads that metadata and writes a translation brief:
                  character name transliterations, location names, recurring
                  phrases, tone, register, and cultural notes. This becomes the
                  locked glossary. Briefs are cached in SQLite so re-translating
                  the same movie is free.
                </p>
              </div>
              <div>
                <div className="font-medium mb-1">3. Glossary overrides</div>
                <p className="text-muted-foreground">
                  Review the locked glossary and add your own overrides for any
                  term — character names, slang, technical jargon, anything you
                  want locked to a specific Sinhala wording. Overrides always win
                  during translation and are persisted per-movie in the cache.
                </p>
              </div>
              <div>
                <div className="font-medium mb-1">4. Batched translation + fine-tune</div>
                <p className="text-muted-foreground">
                  Your .srt/.vtt file is split into batches. Each batch is
                  sent to DeepSeek as a TOON (Token-Oriented Object Notation)
                  payload — ~30% smaller than JSON, saving tokens on every
                  call. The (override-merged) glossary plus the previous few
                  cues ride along as rolling context. After translation, click
                  any cue to manually edit it or re-translate with an optional
                  instruction like &quot;make it shorter&quot; or &quot;use
                  formal register&quot;.
                </p>
              </div>
            </div>
          </Card>
        </section>
      </main>

      <footer className="mt-auto border-t bg-background">
        <div className="mx-auto max-w-7xl px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <div>
            Built with Next.js · TMDB · DeepSeek · Deploy to{" "}
            <Link
              href="https://netlify.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Netlify
            </Link>
            .
          </div>
          <div>
            This product uses the TMDB API but is not endorsed or certified by
            TMDB.
          </div>
        </div>
      </footer>
    </div>
  );
}

function SectionLabel({
  num,
  icon,
  children,
}: {
  num: number;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
        {num}
      </span>
      <span className="flex items-center gap-1 text-sm font-semibold">
        {icon}
        {children}
      </span>
    </div>
  );
}

function Arrow() {
  return <span className="text-muted-foreground text-sm">→</span>;
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border bg-background px-3 py-1 text-xs font-medium">
      {children}
    </span>
  );
}

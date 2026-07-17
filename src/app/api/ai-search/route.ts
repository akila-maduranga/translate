import { NextRequest, NextResponse } from "next/server";
import { callDeepSeek } from "@/lib/deepseek";
import type { TranslationContextBundle } from "@/lib/tmdb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/ai-search
 *
 * AI fallback for movie lookup. Used when:
 *   - TMDB API key is not configured
 *   - TMDB returns no results for a query
 *   - The user explicitly types a description rather than a title
 *
 * Body: {
 *   query: string,                  // free-text: "inception", "the 2010 dream heist movie", etc.
 *   deepseek_api_key?: string
 * }
 *
 * Returns: {
 *   results: TranslationContextBundle[]  // 1-3 candidate matches
 * }
 *
 * Each result is shaped exactly like a TMDB-derived context bundle, so
 * the rest of the pipeline (research, glossary editor, translate)
 * works unchanged. The `tmdb_id` field is set to 0 to signal "AI-
 * generated, not from TMDB" — the cache will still key off the title.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    query?: string;
    deepseek_api_key?: string;
  };

  if (!body.query?.trim()) {
    return NextResponse.json({ error: "Missing 'query'" }, { status: 400 });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY || body.deepseek_api_key || "";
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Both TMDB and DeepSeek API keys are missing. Set at least one to enable movie lookup.",
      },
      { status: 401 }
    );
  }

  const systemPrompt = `You are a movie & TV identification assistant for a Sinhala subtitle translation tool.

The user will give you a free-text query (a title, a description, a quote, a partial plot, etc.). Your job is to identify the most likely movie or TV show and return enough metadata to drive a translation brief.

Return JSON ONLY — no prose. Schema:
{
  "results": [
    {
      "title": string,
      "media_type": "movie" | "tv",
      "release_year": string,           // "2010" or "" if unknown
      "runtime_minutes": number | null,
      "genres": string[],
      "tagline": string,
      "overview": string,                // 3-5 sentence plot summary
      "cast": [{ "actor": string, "character": string }],  // up to 10 main cast
      "directors": string[],
      "writers": string[],
      "keywords": string[],
      "production_countries": string[],
      "spoken_languages": string[],
      "confidence": "high" | "medium" | "low"   // how sure you are this is the right title
    }
  ]
}

Rules:
  1. Return 1-3 results, most-likely first.
  2. If you genuinely cannot identify the title, return an empty results array.
  3. Do NOT invent cast, plot, or characters you are not confident about. Better to leave a field empty than to hallucinate.
  4. Keep overviews focused on translation-relevant facts (period, setting, character dynamics, cultural context).`;

  const userPrompt = `Identify this movie/TV show and return its metadata as JSON:

"${body.query}"

Return JSON now.`;

  try {
    const result = await callDeepSeek({
      apiKey,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
      responseFormat: "json_object",
      maxTokens: 2500,
    });

    let parsed: {
      results?: Array<{
        title: string;
        media_type: "movie" | "tv";
        release_year?: string;
        runtime_minutes?: number | null;
        genres?: string[];
        tagline?: string;
        overview?: string;
        cast?: { actor: string; character: string }[];
        directors?: string[];
        writers?: string[];
        keywords?: string[];
        production_countries?: string[];
        spoken_languages?: string[];
        confidence?: string;
      }>;
    };
    try {
      parsed = JSON.parse(result.content);
    } catch {
      return NextResponse.json(
        {
          error: "DeepSeek returned invalid JSON for AI search.",
          raw: result.content.slice(0, 500),
        },
        { status: 502 }
      );
    }

    const results: Array<
      TranslationContextBundle & { confidence?: string }
    > = (parsed.results ?? []).map((r) => ({
      media_type: r.media_type === "tv" ? "tv" : "movie",
      title: r.title || "Unknown",
      original_title: r.title,
      release_year: r.release_year ?? "",
      runtime_minutes: r.runtime_minutes ?? null,
      genres: r.genres ?? [],
      tagline: r.tagline ?? "",
      overview: r.overview ?? "",
      cast: (r.cast ?? []).slice(0, 10).map((c) => ({
        actor: c.actor,
        character: c.character,
      })),
      directors: r.directors ?? [],
      writers: r.writers ?? [],
      keywords: r.keywords ?? [],
      production_countries: r.production_countries ?? [],
      spoken_languages: r.spoken_languages ?? [],
      poster_url: "",
      backdrop_url: "",
      confidence: r.confidence,
    }));

    return NextResponse.json({ results, source: "ai" });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 502 }
    );
  }
}

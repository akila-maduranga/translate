import { NextRequest, NextResponse } from "next/server";
import { translateBatch } from "@/lib/translate-context";
import type { ResearchBrief } from "@/lib/translate-context";
import type { SubtitleCue } from "@/lib/subtitle";
import { getCachedBrief, applyOverrides } from "@/lib/brief-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/translate
 * Body: {
 *   cues: SubtitleCue[],       // current batch, untranslated
 *   previous_cues: SubtitleCue[],  // rolling context, already translated
 *   brief: ResearchBrief,      // from /api/research cache or live
 *   tmdb_id?: number,          // if provided, user overrides are loaded
 *   tmdb_media_type?: "movie" | "tv",
 *   deepseek_api_key?: string
 * }
 *
 * Returns: { translations: string[] }
 *
 * If tmdb_id + tmdb_media_type are provided AND a cached brief exists
 * for that title, the cached user overrides are applied to the brief's
 * glossary BEFORE translation. User overrides always win — if the same
 * English term appears in both, the override replaces the locked entry.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    cues?: SubtitleCue[];
    previous_cues?: SubtitleCue[];
    brief?: ResearchBrief;
    tmdb_id?: number;
    tmdb_media_type?: "movie" | "tv";
    deepseek_api_key?: string;
  };

  if (!body.cues || !Array.isArray(body.cues) || body.cues.length === 0) {
    return NextResponse.json({ error: "Missing 'cues'" }, { status: 400 });
  }
  if (!body.brief) {
    return NextResponse.json({ error: "Missing 'brief'" }, { status: 400 });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY || body.deepseek_api_key || "";
  if (!apiKey) {
    return NextResponse.json(
      { error: "DeepSeek API key missing." },
      { status: 401 }
    );
  }

  // Apply user overrides if a cached brief exists for this title.
  let effectiveBrief = body.brief;
  if (body.tmdb_id && body.tmdb_media_type) {
    try {
      const cached = await getCachedBrief(body.tmdb_id, body.tmdb_media_type);
      if (cached) {
        effectiveBrief = applyOverrides(body.brief, cached.userOverrides);
      }
    } catch (err) {
      // Non-fatal — fall back to the brief as supplied.
      console.error("[translate] failed to load overrides:", err);
    }
  }

  try {
    const translations = await translateBatch(
      {
        brief: effectiveBrief,
        previousCues: body.previous_cues ?? [],
        currentCues: body.cues,
      },
      apiKey
    );
    return NextResponse.json({
      translations,
      done: body.cues.length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}

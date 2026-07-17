import { NextRequest, NextResponse } from "next/server";
import { translateBatch } from "@/lib/translate-context";
import type { ResearchBrief } from "@/lib/translate-context";
import type { SubtitleCue } from "@/lib/subtitle";
import { getCachedBrief, applyOverrides } from "@/lib/brief-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/translate-cue
 *
 * Re-translate a SINGLE cue. Used by the per-cue "re-translate" button
 * in the workspace UI for fine-tuning.
 *
 * Body: {
 *   cue: SubtitleCue,                // the cue to re-translate
 *   previous_cues: SubtitleCue[],    // rolling context (already translated)
 *   brief: ResearchBrief,
 *   tmdb_id?: number,
 *   tmdb_media_type?: "movie" | "tv",
 *   instruction?: string,            // optional user note, e.g. "make it shorter"
 *   deepseek_api_key?: string
 * }
 *
 * Returns: { translation: string }
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    cue?: SubtitleCue;
    previous_cues?: SubtitleCue[];
    brief?: ResearchBrief;
    tmdb_id?: number;
    tmdb_media_type?: "movie" | "tv";
    instruction?: string;
    deepseek_api_key?: string;
  };

  if (!body.cue) {
    return NextResponse.json({ error: "Missing 'cue'" }, { status: 400 });
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

  let effectiveBrief = body.brief;
  if (body.tmdb_id && body.tmdb_media_type) {
    try {
      const cached = await getCachedBrief(body.tmdb_id, body.tmdb_media_type);
      if (cached) {
        effectiveBrief = applyOverrides(body.brief, cached.userOverrides);
      }
    } catch {
      // ignore — fall back to supplied brief
    }
  }

  // If user gave an instruction, append it to the brief's cultural_notes
  // so the model sees it as a directive for this cue only.
  if (body.instruction?.trim()) {
    effectiveBrief = {
      ...effectiveBrief,
      cultural_notes:
        (effectiveBrief.cultural_notes || "") +
        `\n\n[USER INSTRUCTION FOR THIS CUE] ${body.instruction.trim()}`,
    };
  }

  try {
    const translations = await translateBatch(
      {
        brief: effectiveBrief,
        previousCues: body.previous_cues ?? [],
        currentCues: [body.cue],
      },
      apiKey
    );
    return NextResponse.json({
      translation: translations[0] ?? "",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}

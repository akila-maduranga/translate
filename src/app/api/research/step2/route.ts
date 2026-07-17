import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  buildResearchStep2,
  combineBriefSteps,
  briefToMarkdown,
  type ResearchBriefStep1,
} from "@/lib/translate-context";
import { upsertCachedBrief } from "@/lib/brief-cache";
import type { TranslationContextBundle } from "@/lib/tmdb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/research/step2
 * Body: { context, step1, tmdb_id, tmdb_media_type }
 *
 * Runs Step 2 of research: glossary generation. Takes 10-15s.
 * Combines with step1, caches the final brief, and returns it.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Please log in." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    context?: TranslationContextBundle;
    step1?: ResearchBriefStep1;
    tmdb_id?: number;
    tmdb_media_type?: "movie" | "tv";
  };

  if (!body.context || !body.step1 || !body.tmdb_id || !body.tmdb_media_type) {
    return NextResponse.json(
      { error: "Missing context, step1, tmdb_id, or tmdb_media_type" },
      { status: 400 }
    );
  }

  const apiKey = process.env.DEEPSEEK_API_KEY || "";
  if (!apiKey) {
    return NextResponse.json(
      { error: "Translation service is not configured." },
      { status: 503 }
    );
  }

  try {
    const step2 = await buildResearchStep2(body.context, body.step1, apiKey);
    const brief = combineBriefSteps(body.step1, step2);
    const rawMarkdown = briefToMarkdown(brief);

    // Cache the final brief.
    try {
      await upsertCachedBrief({
        tmdbId: body.tmdb_id,
        tmdbMediaType: body.tmdb_media_type,
        title: body.context.title,
        rawMarkdown,
        brief,
      });
    } catch (cacheErr: any) {
      console.error("[research/step2] cache write failed:", cacheErr);
    }

    return NextResponse.json({
      brief,
      rawMarkdown,
      title: body.context.title,
    });
  } catch (err: any) {
    const msg = err.message || "";
    let friendly = msg;
    if (msg.includes("401") || msg.includes("Authentication Fails")) {
      friendly = "Translation service authentication failed.";
    } else if (msg.includes("429")) {
      friendly = "Translation service is busy. Please try again in a moment.";
    } else if (msg.includes("timed out") || msg.includes("timeout")) {
      friendly = "Research step 2 timed out. Please try again.";
    }
    return NextResponse.json({ error: friendly }, { status: 502 });
  }
}

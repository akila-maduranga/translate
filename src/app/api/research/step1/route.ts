import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { buildResearchStep1 } from "@/lib/translate-context";
import { getCachedBrief } from "@/lib/brief-cache";
import type { TranslationContextBundle } from "@/lib/tmdb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel free tier streaming limit

/**
 * POST /api/research/step1
 * Body: { context, tmdb_id, tmdb_media_type, force_refresh? }
 *
 * Runs Step 1 of research: context analysis (tone, characters, locations).
 * Takes 10-15s — well within Netlify's 26s free-tier limit.
 *
 * If a cached brief exists AND force_refresh is false, returns it immediately
 * (no DeepSeek call). The client then skips step 2.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Please log in." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    context?: TranslationContextBundle;
    tmdb_id?: number;
    tmdb_media_type?: "movie" | "tv";
    force_refresh?: boolean;
  };

  if (!body.context || !body.tmdb_id || !body.tmdb_media_type) {
    return NextResponse.json(
      { error: "Missing context, tmdb_id, or tmdb_media_type" },
      { status: 400 }
    );
  }

  // Check cache first.
  if (!body.force_refresh) {
    try {
      const cached = await getCachedBrief(body.tmdb_id, body.tmdb_media_type);
      if (cached) {
        return NextResponse.json({
          cached: true,
          brief: cached.brief,
          rawMarkdown: cached.rawMarkdown,
          title: cached.title,
        });
      }
    } catch (err) {
      console.error("[research/step1] cache read failed:", err);
    }
  }

  const apiKey = process.env.DEEPSEEK_API_KEY || "";
  if (!apiKey) {
    return NextResponse.json(
      { error: "Translation service is not configured. Please contact the site admin." },
      { status: 503 }
    );
  }

  try {
    const step1 = await buildResearchStep1(body.context, apiKey);
    return NextResponse.json({
      cached: false,
      step1,
      title: body.context.title,
    });
  } catch (err: any) {
    const msg = err.message || "";
    let friendly = msg;
    if (msg.includes("401") || msg.includes("Authentication Fails")) {
      friendly = "Translation service authentication failed. Please contact the site admin.";
    } else if (msg.includes("429")) {
      friendly = "Translation service is busy. Please try again in a moment.";
    } else if (msg.includes("timed out") || msg.includes("timeout")) {
      friendly = "Research step 1 timed out. Please try again.";
    }
    return NextResponse.json({ error: friendly }, { status: 502 });
  }
}

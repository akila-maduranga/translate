import { NextRequest, NextResponse } from "next/server";
import { getCachedBrief, setUserOverrides } from "@/lib/brief-cache";
import type { GlossaryEntry } from "@/lib/translate-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/brief/overrides?tmdb_id=...&tmdb_media_type=...
 *   → { overrides: GlossaryEntry[] }
 *
 * POST /api/brief/overrides
 *   body: { tmdb_id, tmdb_media_type, overrides: GlossaryEntry[] }
 *   → { ok: true, overrides: GlossaryEntry[] }
 *
 * User-supplied overrides are persisted server-side so they survive
 * across sessions and devices. They are applied AFTER the locked
 * glossary, so they always win.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const tmdbId = parseInt(url.searchParams.get("tmdb_id") ?? "0", 10);
  const tmdbMediaType = (url.searchParams.get("tmdb_media_type") ?? "") as
    | "movie"
    | "tv";
  if (!tmdbId || !tmdbMediaType) {
    return NextResponse.json(
      { error: "Missing tmdb_id or tmdb_media_type" },
      { status: 400 }
    );
  }
  const cached = await getCachedBrief(tmdbId, tmdbMediaType);
  if (!cached) {
    return NextResponse.json({ overrides: [] });
  }
  return NextResponse.json({ overrides: cached.userOverrides });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    tmdb_id?: number;
    tmdb_media_type?: "movie" | "tv";
    overrides?: GlossaryEntry[];
  };
  if (!body.tmdb_id || !body.tmdb_media_type || !Array.isArray(body.overrides)) {
    return NextResponse.json(
      { error: "Missing tmdb_id, tmdb_media_type, or overrides" },
      { status: 400 }
    );
  }
  // Strip entries with empty fields.
  const clean = body.overrides.filter(
    (o) => o.english?.trim() && o.sinhala?.trim()
  );
  try {
    const row = await setUserOverrides(
      body.tmdb_id,
      body.tmdb_media_type,
      clean
    );
    return NextResponse.json({ ok: true, overrides: row.userOverrides });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

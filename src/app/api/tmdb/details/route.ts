import { NextRequest, NextResponse } from "next/server";
import { getMovieDetails, getTvDetails, buildContextBundle } from "@/lib/tmdb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/tmdb/details?id=...&type=movie|tv
 *
 * Returns a TMDB details payload augmented with a `context_bundle`
 * field that has already been trimmed to just the fields DeepSeek
 * needs to build a translation brief.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const id = parseInt(url.searchParams.get("id") ?? "0", 10);
  const type = (url.searchParams.get("type") ?? "movie") as "movie" | "tv";
  const apiKey =
    process.env.TMDB_API_KEY ||
    process.env.TMDB_READ_ACCESS_TOKEN ||
    url.searchParams.get("api_key") ||
    "";

  if (!id) {
    return NextResponse.json({ error: "Missing 'id'" }, { status: 400 });
  }
  if (!apiKey) {
    return NextResponse.json(
      { error: "TMDB API key missing." },
      { status: 401 }
    );
  }

  try {
    const details =
      type === "movie"
        ? await getMovieDetails(id, apiKey)
        : await getTvDetails(id, apiKey);
    const context_bundle = buildContextBundle(details, type);
    return NextResponse.json({ details, context_bundle });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}

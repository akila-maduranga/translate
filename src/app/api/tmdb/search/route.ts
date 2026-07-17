import { NextRequest, NextResponse } from "next/server";
import { searchMulti } from "@/lib/tmdb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/tmdb/search?query=...&page=1
 *
 * Searches TMDB for movies and TV shows. The API key is read from
 * the server env (TMDB_API_KEY) — falls back to a query-string key
 * for local development without server env.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const query = url.searchParams.get("query")?.trim() ?? "";
  const page = parseInt(url.searchParams.get("page") ?? "1", 10) || 1;
  const apiKey =
    process.env.TMDB_API_KEY ||
    process.env.TMDB_READ_ACCESS_TOKEN ||
    url.searchParams.get("api_key") ||
    "";

  if (!query) {
    return NextResponse.json(
      { error: "Missing 'query' parameter" },
      { status: 400 }
    );
  }
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "TMDB API key missing. Set TMDB_API_KEY (v4 read access token) on the server, or pass api_key in the query string.",
      },
      { status: 401 }
    );
  }

  try {
    const result = await searchMulti(query, apiKey, page);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}

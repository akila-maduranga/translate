import { NextRequest } from "next/server";
import { streamResearchBrief, buildResearchBrief } from "@/lib/translate-context";
import type { TranslationContextBundle } from "@/lib/tmdb";
import { getCachedBrief, upsertCachedBrief } from "@/lib/brief-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/research
 * Body: {
 *   context: TranslationContextBundle,
 *   tmdb_id: number,
 *   tmdb_media_type: "movie" | "tv",
 *   deepseek_api_key?: string,
 *   force_refresh?: boolean  // ignore cache and re-run DeepSeek
 * }
 *
 * Streams the research brief as plain-text chunks. Behaviour:
 *
 *   1. If a cached brief exists AND force_refresh is false → emit a
 *      "served from cache" notice followed by the cached markdown,
 *      then [DONE]. No DeepSeek call is made.
 *
 *   2. Otherwise → stream the brief live. After streaming finishes,
 *      we ALSO call buildResearchBrief() to get the structured JSON
 *      (the streamed version is markdown, not JSON), then upsert the
 *      cache. The structured brief is what /api/translate needs.
 *
 * This way users only pay for research once per movie — subsequent
 * loads of the same movie (or re-translations) read from the cache.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    context?: TranslationContextBundle;
    tmdb_id?: number;
    tmdb_media_type?: "movie" | "tv";
    deepseek_api_key?: string;
    force_refresh?: boolean;
  };

  if (!body.context) {
    return new Response(JSON.stringify({ error: "Missing 'context'" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  if (!body.tmdb_id || !body.tmdb_media_type) {
    return new Response(
      JSON.stringify({ error: "Missing 'tmdb_id' or 'tmdb_media_type'" }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  // 1. Try cache first.
  if (!body.force_refresh) {
    try {
      const cached = await getCachedBrief(body.tmdb_id, body.tmdb_media_type);
      if (cached) {
        const header =
          `[CACHE HIT] Loaded cached research brief for ${cached.title}.\n` +
          `Last updated: ${cached.updatedAt.toISOString()}\n` +
          `To re-run research with DeepSeek, click "Re-run" instead.\n\n`;
        const stream = new ReadableStream({
          start(controller) {
            const enc = new TextEncoder();
            const send = (s: string) => controller.enqueue(enc.encode(s));
            send(header);
            send(cached.rawMarkdown);
            send("\n\n[DONE]");
            controller.close();
          },
        });
        return new Response(stream, {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "no-cache, no-transform",
            "x-accel-buffering": "no",
            "x-cache-hit": "true",
          },
        });
      }
    } catch (err) {
      // Cache failures are non-fatal — fall through to live research.
      console.error("[research] cache read failed:", err);
    }
  }

  // 2. Live research — requires DeepSeek API key.
  const apiKey = process.env.DEEPSEEK_API_KEY || body.deepseek_api_key || "";
  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error:
          "DeepSeek API key missing. Set DEEPSEEK_API_KEY on the server or include deepseek_api_key in the request body.",
      }),
      { status: 401, headers: { "content-type": "application/json" } }
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (s: string) => controller.enqueue(encoder.encode(s + "\n"));
      try {
        send("[LIVE] Running DeepSeek research...");
        let full = "";
        for await (const chunk of streamResearchBrief(body.context!, apiKey)) {
          full += chunk;
          send(chunk);
        }

        // Now derive the structured JSON brief and cache it.
        send("\n[INFO] Building structured brief and saving to cache...");
        try {
          const brief = await buildResearchBrief(body.context!, apiKey);
          await upsertCachedBrief({
            tmdbId: body.tmdb_id!,
            tmdbMediaType: body.tmdb_media_type!,
            title: body.context!.title,
            rawMarkdown: full,
            brief,
          });
          send("[INFO] Brief cached. Future translations of this title will reuse it.");
        } catch (cacheErr: any) {
          // Caching failure is non-fatal — translation can still use the live brief.
          send(`[WARN] Failed to cache brief: ${cacheErr.message}`);
        }

        send("[DONE]");
      } catch (err: any) {
        send(`\n\n[ERROR] ${err.message}`);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
      "x-cache-hit": "false",
    },
  });
}

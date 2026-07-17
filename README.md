# SubSinhala — Context-aware English → Sinhala Subtitle Translator

Built with **Next.js 16**, **TMDB**, **DeepSeek**, and **TOON**. Deploy to **Netlify** in a few clicks.

## Why this is better than Google Translate

Google Translate treats every sentence in isolation — so a character named
"Skyler" might come out as "ආකාශ ලෝකය" in one scene and "ස්කයිලර්" in another.
SubSinhala fixes this with a two-phase pipeline:

1. **Research phase.** We pull plot, cast, characters, genres, keywords,
   and cultural metadata from TMDB (or, if TMDB isn't configured, DeepSeek
   identifies the movie from a free-text description). Then DeepSeek
   produces a **translation brief** — locked Sinhala transliterations for
   every proper noun, the movie's tone/register, cultural notes, and a
   glossary of recurring phrases.
2. **Translation phase.** Your .srt / .vtt is split into batches. Each
   batch is sent to DeepSeek as a **TOON** (Token-Oriented Object Notation)
   payload — ~30% smaller than JSON — together with the locked glossary
   plus the last few translated cues as rolling context — so wording
   stays consistent from the opening scene to the closing credits.

## Features

- **Movie lookup via TMDB** with poster grid, or **AI fallback** when TMDB
  isn't configured or returns no results. The AI can identify a movie from
  a description like "the 2010 dream heist movie".
- **Research brief** with locked glossary, character names, locations, and
  cultural notes. Briefs are **cached in SQLite** so re-translating the
  same movie is free.
- **Glossary editor** to override any locked term. User overrides always
  win during translation and persist per-movie.
- **Per-cue re-translate** with optional instruction ("make it shorter",
  "use formal register"). Plus manual editing of any cue.
- **TOON payload encoding** saves ~30% of input tokens vs JSON on every
  DeepSeek call. See `src/lib/toon.ts`.
- **Export** translated subtitles as `.si.srt` / `.si.vtt` (and `.en.srt`
  for the original).
- **Netlify-ready** via `netlify.toml` + `@netlify/plugin-nextjs`.

## Setup

### 1. Get API keys

- **TMDB** (free, optional but recommended): create a v4 read access token at
  https://www.themoviedb.org/settings/api
- **DeepSeek** (required for translation; can also serve as movie lookup
  fallback): create an API key at https://platform.deepseek.com/api_keys

### 2. Configure environment

For Netlify, set these in your site's **Settings → Environment variables**:

```
TMDB_API_KEY=eyJhbGciOiJIUzI1NiJ9...        # optional but recommended
DEEPSEEK_API_KEY=sk-...                       # required
DATABASE_URL=file:./db/custom.db              # SQLite (or Postgres URL)
```

For local dev, either set the same env vars in `.env.local` **or** paste the
keys into the in-app **Settings** dialog (stored in browser localStorage).

### 3. Install & run locally

```bash
bun install
bun run dev
```

Open http://localhost:3000, search a movie (or describe it if no TMDB key),
click **Run Research**, then upload your `.srt` / `.vtt` file and click
**Translate All**.

### 4. Deploy to Netlify

This repo includes a `netlify.toml` configured for the official
`@netlify/plugin-nextjs` runtime. Just connect the repo on Netlify and it
will build & deploy automatically.

## How the research brief works

The brief is a JSON document DeepSeek produces once per movie, containing:

- `summary` — short plot summary focused on translation-relevant facts
- `setting`, `tone`, `register` — to match style across the whole file
- `characters[]` — name → locked Sinhala transliteration + description
- `locations[]` — locked Sinhala place names
- `recurring_phrases[]` — idioms, slogans, running gags
- `proper_nouns[]` — ships, weapons, spells, fictional org names
- `cultural_notes` — anything a Sinhala viewer needs (taboo softening,
  cultural equivalents, untranslatable jokes)
- `glossary[]` — consolidated `{english, sinhala, note?}` triples the
  translator agent must honor

Every batch translation call receives this brief in its system prompt — so
when "Skyler" appears in cue 1 and cue 412, both come out as the same
locked Sinhala form.

## TOON — Token-Oriented Object Notation

TOON is a compact serialization format we use to send the brief + cues +
rolling context to DeepSeek. It's ~30% smaller than JSON on typical
subtitle payloads, saving input tokens on every translation call.

Example:
```
brief:
  title: Inception
  tone: Sci-fi thriller
  glossary:
    @
      en: extraction
      si: නිස්කාශනය
    @
      en: inception
      si: ආරම්භය
batch:
  @
    idx: 1
    start: 00:00:02,000
    en: What is your name?
```

Grammar:
- `key: value` — inline scalar
- `key:` — nested object/array starts on next indented line
- `@` — array item (object if next lines indented, else inline scalar)
- `[]` / `{}` — explicit empty array/object
- `true` / `false` — booleans
- `\n` inside a value = literal newline
- Lines starting with `#` are comments

See `src/lib/toon.ts` for the full implementation and `scripts/test-toon.ts`
for round-trip tests.

## AI movie-search fallback

If no TMDB API key is configured, or TMDB returns no results for a query,
the app automatically falls back to DeepSeek to identify the movie from a
free-text description. The AI returns the same `TranslationContextBundle`
shape as TMDB, so the rest of the pipeline (research, glossary, translate)
works unchanged.

AI-identified movies get a synthetic negative TMDB id (so the cache key
namespace stays separate from real TMDB ids). They're also marked with an
"AI-identified" badge in the UI and a `confidence` rating (high/medium/low).

## File structure

```
src/
├─ app/
│  ├─ page.tsx                         # main UI
│  └─ api/
│     ├─ tmdb/search/route.ts          # movie/TV search (TMDB)
│     ├─ tmdb/details/route.ts         # movie/TV details (TMDB)
│     ├─ ai-search/route.ts            # AI fallback for movie lookup
│     ├─ research/route.ts             # streams DeepSeek research brief (with cache)
│     ├─ translate/route.ts            # translates one batch (TOON payload)
│     ├─ translate-cue/route.ts        # re-translates a single cue
│     └─ brief/
│        ├─ get/route.ts               # fetches cached brief + overrides
│        └─ overrides/route.ts         # GET/POST user glossary overrides
├─ components/
│  ├─ settings-dialog.tsx              # API key + options dialog
│  ├─ movie-search.tsx                 # TMDB + AI fallback search UI
│  ├─ movie-context-card.tsx           # selected movie context card
│  ├─ research-panel.tsx               # live-streaming research brief UI
│  ├─ glossary-editor.tsx              # add/edit/delete glossary overrides
│  └─ subtitle-workspace.tsx           # upload + viewer + per-cue re-translate + export
└─ lib/
   ├─ tmdb.ts                          # TMDB client + context bundle builder
   ├─ deepseek.ts                      # DeepSeek client (sync + streaming)
   ├─ subtitle.ts                      # SRT/VTT parser + serializer
   ├─ translate-context.ts             # research brief + TOON-based batched translation
   ├─ brief-cache.ts                   # Prisma cache helpers + override merging
   ├─ toon.ts                          # TOON encoder/decoder
   └─ settings.ts                      # localStorage settings
```

## Credits

This product uses the TMDB API but is not endorsed or certified by TMDB.
Translation quality depends on the DeepSeek model — `deepseek-chat` by
default, swap to `deepseek-reasoner` in `src/lib/translate-context.ts` for
harder titles.

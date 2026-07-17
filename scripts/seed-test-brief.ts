// Seeds a fake cached brief for TMDB id 27205 (Inception) so the UI can
// be tested end-to-end without paying for DeepSeek.
// Run with: bun /home/z/my-project/scripts/seed-test-brief.ts

import { upsertCachedBrief, setUserOverrides } from "../src/lib/brief-cache";

const brief = {
  summary:
    "Dom Cobb is a skilled thief who steals secrets from the subconscious during sleep. He is offered a chance to clear his criminal record by planting an idea into a CEO's mind.",
  setting: "Modern day, multiple countries (USA, Japan, France, etc.)",
  tone: "Sci-fi thriller, mind-bending",
  register: "Colloquial, occasionally technical",
  characters: [
    { name: "Dom Cobb", description: "The protagonist, extractor", sinhala_name: "ඩොම් කොබ්" },
    { name: "Arthur", description: "Cobb's point man", sinhala_name: "ආතර්" },
    { name: "Ariadne", description: "The architect", sinhala_name: "අරියඩ්නී" },
    { name: "Eames", description: "The forger", sinhala_name: "ඊම්ස්" },
    { name: "Mal", description: "Cobb's deceased wife", sinhala_name: "මාල්" },
    { name: "Saito", description: "The tourist / businessman", sinhala_name: "සයිටෝ" },
  ],
  locations: [
    { name: "Paris", sinhala_name: "පැරිස්" },
    { name: "Mombasa", sinhala_name: "මොම්බාසා" },
  ],
  recurring_phrases: [
    { english: "a leap of faith", sinhala: "විශ්වාසයේ පිම්මක්" },
    { english: "extraction", sinhala: "නිස්කාශනය" },
  ],
  proper_nouns: [
    { english: "PASIV", sinhala: "PASIV", note: "Keep in English (acronym)" },
    { english: "limbo", sinhala: "ලිම්බෝ" },
  ],
  cultural_notes:
    "Dream-within-a-dream concept needs careful explanation. Use සිතුවිලි (thoughts) for ideas, සිහින (dreams) for dreams.",
  glossary: [
    { english: "extraction", sinhala: "නිස්කාශනය" },
    { english: "inception", sinhala: "ආරම්භය" },
    { english: "limbo", sinhala: "ලිම්බෝ" },
    { english: "totem", sinhala: "ටෝටමය" },
    { english: "kicker", sinhala: "කිකර්" },
    { english: "architect", sinhala: "ගෘහ නිර්මාණ ශිල්පියා" },
    { english: "forger", sinhala: "ව්‍යාජ නිර්මාතෘ" },
    { english: "mark", sinhala: "ඉලක්කය" },
    { english: "PASIV", sinhala: "PASIV", note: "Keep in English" },
    { english: "a leap of faith", sinhala: "විශ්වාසයේ පිම්මක්" },
  ],
};

const row = await upsertCachedBrief({
  tmdbId: 27205,
  tmdbMediaType: "movie",
  title: "Inception",
  rawMarkdown:
    "# Inception — Translation Brief\n\n" +
    "## Summary\n" + brief.summary + "\n\n" +
    "## Setting & Period\n" + brief.setting + "\n\n" +
    "## Tone & Register\n" + brief.tone + " / " + brief.register + "\n\n" +
    "## Characters\n" +
    brief.characters.map((c) => `- ${c.name} → ${c.sinhala_name} (${c.description})`).join("\n") + "\n\n" +
    "## Locations\n" +
    brief.locations.map((l) => `- ${l.name} → ${l.sinhala_name}`).join("\n") + "\n\n" +
    "## Glossary\n" +
    brief.glossary.map((g) => `- ${g.english} → ${g.sinhala}${g.note ? " // " + g.note : ""}`).join("\n"),
  brief: brief as any,
});

console.log("✓ Seeded brief for", row.title, "(cacheKey:", row.cacheKey + ")");

// Also seed a couple of user overrides to demonstrate the editor.
const overrides = [
  { english: "inception", sinhala: "ඉන්සෙප්ෂන්", note: "User prefers transliteration (movie title)" },
  { english: "kick", sinhala: "කඩින් අවදි වීම" },
];
const updated = await setUserOverrides(27205, "movie", overrides);
console.log("✓ Seeded", updated.userOverrides.length, "user overrides");

console.log("\nNow visit the UI, search 'inception', pick the first result, and you'll see the cached brief load.");

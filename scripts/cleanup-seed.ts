import { db } from "../src/lib/db";
await db.researchBriefCache.deleteMany({ where: { cacheKey: "movie-27205" } });
console.log("✓ Cleaned up seed data");

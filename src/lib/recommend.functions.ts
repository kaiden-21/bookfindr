import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const BookInput = z.object({
  title: z.string().min(1),
  author: z.string().optional().default(""),
  rating: z.number().min(1).max(5),
});

const InputSchema = z.object({
  books: z.array(BookInput).min(1).max(10),
});

export type ReaderIdentity = {
  title: string;
  emoji: string;
  description: string;
  traits: { label: string; pct: number }[];
};

export type Recommendation = {
  title: string;
  author: string;
  reason: string;
  amazonUrl: string;
};

export type RecommendationResult = {
  identity: ReaderIdentity;
  recommendations: Recommendation[];
};

const AFFILIATE_TAG = "findr0b3-20";

function amazonLink(title: string, author: string) {
  const q = encodeURIComponent(`${title} ${author}`).replace(/%20/g, "+");
  return `https://www.amazon.com/s?k=${q}&tag=${AFFILIATE_TAG}`;
}

export const getRecommendations = createServerFn({ method: "POST" })
  .validator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }): Promise<RecommendationResult> => {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("Missing ANTHROPIC_API_KEY");

    const bookList = data.books
      .map((b, i) => `${i + 1}. "${b.title}"${b.author ? ` by ${b.author}` : ""} — ${b.rating}/5 stars`)
      .join("\n");

    const prompt = `You are a warm, well-read literary expert.

A reader has shared their recent reads and ratings:

${bookList}

Do two things:

1. Define their reader identity — a creative archetype based on their taste
2. Recommend 5 books they will love but likely haven't read

Return ONLY valid JSON (no markdown, no prose, no code fences) in this exact shape:
{
  "identity": {
    "title": "A creative 3-4 word reader archetype e.g. The Midnight Escapist",
    "emoji": "One perfect emoji that captures them",
    "description": "2-3 warm sentences capturing their reading personality",
    "traits": [
      { "label": "Dark & atmospheric", "pct": 85 },
      { "label": "Character-driven", "pct": 90 },
      { "label": "Literary fiction", "pct": 70 },
      { "label": "Emotional depth", "pct": 95 },
      { "label": "Plot-driven", "pct": 40 }
    ]
  },
  "recommendations": [
    {
      "title": "Book title",
      "author": "Author full name",
      "reason": "One warm sentence on why they'll love it, referencing their specific taste"
    }
  ]
}

Make traits reflect actual taste from ratings. Highly rated books in a style = higher pct for that trait.
Return exactly 5 recommendations.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 429) throw new Error("Too many requests — please wait a moment.");
      if (res.status === 402) throw new Error("API credits exhausted.");
      throw new Error(`AI request failed: ${text}`);
    }

    const json = await res.json();
    const content: string = json.content?.[0]?.text ?? "";

    const cleaned = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();

    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("Could not parse response.");

    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
      identity: ReaderIdentity;
      recommendations: Array<{ title: string; author: string; reason: string }>;
    };

    return {
      identity: parsed.identity,
      recommendations: parsed.recommendations.slice(0, 5).map((r) => ({
        title: r.title,
        author: r.author,
        reason: r.reason,
        amazonUrl: amazonLink(r.title, r.author),
      })),
    };
  });
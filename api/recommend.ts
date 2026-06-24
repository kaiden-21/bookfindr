import type { VercelRequest, VercelResponse } from "@vercel/node";

const AFFILIATE_TAG = "findr0b3-20";

function amazonLink(title: string, author: string) {
  const q = encodeURIComponent(`${title} ${author}`).replace(/%20/g, "+");
  return `https://www.amazon.com/s?k=${q}&tag=${AFFILIATE_TAG}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { books } = req.body;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: "Missing API key" });

  const bookList = books
    .map((b: any, i: number) => `${i + 1}. "${b.title}"${b.author ? ` by ${b.author}` : ""} — ${b.rating}/5 stars`)
    .join("\n");

  const prompt = `You are a warm, well-read literary expert.

A reader has shared their recent reads and ratings:

${bookList}

Do two things:
1. Define their reader identity — a creative archetype based on their taste
2. Recommend 5 books they will love but likely haven't read

Return ONLY valid JSON (no markdown) in this exact shape:
{
  "identity": {
    "title": "A creative 3-4 word reader archetype e.g. The Midnight Escapist",
    "emoji": "One perfect emoji",
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
      "reason": "One warm sentence on why they'll love it"
    }
  ]
}

Return exactly 5 recommendations.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
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

  const json = await response.json();
  const content = json.content?.[0]?.text ?? "";
  const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const parsed = JSON.parse(cleaned.slice(start, end + 1));

  return res.json({
    identity: parsed.identity,
    recommendations: parsed.recommendations.slice(0, 5).map((r: any) => ({
      ...r,
      amazonUrl: amazonLink(r.title, r.author),
    })),
  });
}
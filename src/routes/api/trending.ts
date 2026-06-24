import { createAPIFileRoute } from "@tanstack/react-start/api";

export const APIRoute = createAPIFileRoute("/api/trending")({
  GET: async () => {
    const key = "HN6GlTJ3dZyfoWojzSXbYNtCVP25KDG9UD3T3brzihTAV5rI";

    const nytRes = await fetch(
      `https://api.nytimes.com/svc/books/v3/lists/current/combined-print-and-e-book-fiction.json?api-key=${key}`
    );

    if (!nytRes.ok) return Response.json([]);

    const nytData = await nytRes.json();
    const books = nytData.results?.books ?? [];

    const enriched = await Promise.all(
      books.slice(0, 15).map(async (b: any) => {
        try {
          const olRes = await fetch(
            `https://openlibrary.org/search.json?q=${encodeURIComponent(
              `${b.title} ${b.author}`
            )}&limit=1`
          );
          const olData = await olRes.json();
          const coverId = olData.docs?.[0]?.cover_i;
          return coverId ? {
            key: `nyt-${b.rank}`,
            title: b.title,
            author: b.author,
            coverId,
          } : null;
        } catch {
          return null;
        }
      })
    );

    return Response.json(enriched.filter(Boolean));
  },
});
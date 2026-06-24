import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Star,
  BookOpen,
  Sparkles,
  ExternalLink,
  Loader2,
  Search,
  Check,
  ChevronLeft,
  ChevronRight,
  X,
  RotateCcw,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BookFindr — Your next favourite book, hand-picked" },
      {
        name: "description",
        content: "Pick books you've read, rate them, and let BookFindr find five you're going to love.",
      },
      { property: "og:title", content: "BookFindr" },
      { property: "og:description", content: "A cozy little engine that learns your reading taste." },
    ],
  }),
  component: Index,
});

type OLBook = {
  key: string;
  title: string;
  author: string;
  coverId: number | null;
  year?: number;
};

type SelectedBook = OLBook & { rating: number };

type ReaderIdentity = {
  title: string;
  emoji: string;
  description: string;
  traits: { label: string; pct: number }[];
};

type Recommendation = {
  title: string;
  author: string;
  reason: string;
  amazonUrl: string;
  coverUrl?: string;
};

type ApiResult = {
  identity: ReaderIdentity;
  recommendations: Recommendation[];
};

const NYT_KEY = "HN6GlTJ3dZyfoWojzSXbYNtCVP25KDG9UD3T3brzihTAV5rI";

function coverUrl(id: number | null | undefined, size: "S" | "M" | "L" = "M") {
  if (!id) return null;
  return `https://covers.openlibrary.org/b/id/${id}-${size}.jpg`;
}

function parseDocs(docs: any[]): OLBook[] {
  return docs
    .map((d) => ({
      key: d.key ?? `${d.title}-${d.author_name?.[0] ?? ""}`,
      title: d.title ?? "Untitled",
      author: d.author_name?.[0] ?? "Unknown",
      coverId: d.cover_i ?? null,
      year: d.first_publish_year,
    }))
    .filter((b) => b.coverId);
}

async function enrichWithCovers(recommendations: Recommendation[]) {
  return Promise.all(
    recommendations.map(async (r) => {
      try {
        const res = await fetch(
          `https://openlibrary.org/search.json?q=${encodeURIComponent(`${r.title} ${r.author}`)}&limit=1`
        );
        const json = await res.json();
        const id = json.docs?.[0]?.cover_i;
        return { ...r, coverUrl: coverUrl(id, "M") ?? undefined };
      } catch {
        return r;
      }
    })
  );
}

function Index() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<OLBook[]>([]);
  const [trending, setTrending] = useState<OLBook[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<SelectedBook[]>([]);

  // Load NYT trending on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const nytRes = await fetch(
          `https://api.nytimes.com/svc/books/v3/lists/current/combined-print-and-e-book-fiction.json?api-key=${NYT_KEY}`
        );
        const nytData = await nytRes.json();
        const books = nytData.results?.books ?? [];

        const enriched = await Promise.all(
          books.slice(0, 15).map(async (b: any) => {
            try {
              const olRes = await fetch(
                `https://openlibrary.org/search.json?q=${encodeURIComponent(`${b.title} ${b.author}`)}&limit=1`
              );
              const olData = await olRes.json();
              const coverId = olData.docs?.[0]?.cover_i;
              return coverId ? { key: `nyt-${b.rank}`, title: b.title, author: b.author, coverId } : null;
            } catch { return null; }
          })
        );

        if (!cancelled) setTrending(enriched.filter(Boolean) as OLBook[]);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Search OpenLibrary debounced
  useEffect(() => {
    if (!query.trim()) { setSearchResults([]); return; }
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=12`);
        const json = await res.json();
        setSearchResults(parseDocs(json.docs ?? []).slice(0, 12));
      } catch { setSearchResults([]); }
      finally { setSearching(false); }
    }, 350);
    return () => clearTimeout(handle);
  }, [query]);

  function toggleSelect(book: OLBook) {
    setSelected((prev) => {
      const exists = prev.find((b) => b.key === book.key);
      if (exists) return prev.filter((b) => b.key !== book.key);
      if (prev.length >= 10) return prev;
      return [...prev, { ...book, rating: 0 }];
    });
  }

  const isSelected = (key: string) => selected.some((b) => b.key === key);

  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-3xl px-4 pb-32 pt-8 sm:pt-12">
        <Header step={step} />

        {step === 1 && (
          <SelectStep
            query={query}
            setQuery={setQuery}
            results={searchResults}
            trending={trending}
            searching={searching}
            selected={selected}
            isSelected={isSelected}
            onToggle={toggleSelect}
            onContinue={() => setStep(2)}
            onRemove={(key) => setSelected((s) => s.filter((b) => b.key !== key))}
          />
        )}

        {step === 2 && (
          <RateStep
            selected={selected}
            setSelected={setSelected}
            onBack={() => setStep(1)}
            onFinish={() => setStep(3)}
          />
        )}

        {step === 3 && (
          <ResultsStep
            selected={selected}
            onRestart={() => { setSelected([]); setQuery(""); setStep(1); }}
          />
        )}
      </main>
    </div>
  );
}

function Header({ step }: { step: 1 | 2 | 3 }) {
  const labels = ["Pick", "Rate", "Discover"];
  return (
    <header className="mb-8 text-center">
      <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
        <BookOpen className="h-3.5 w-3.5" />
        <span>A cozy book-matching ritual</span>
      </div>
      <h1 className="text-5xl font-semibold tracking-tight text-foreground sm:text-6xl">
        Book<span className="italic text-primary">Findr</span>
      </h1>
      <div className="mx-auto mt-6 flex max-w-sm items-center justify-between gap-2 text-xs">
        {labels.map((label, i) => {
          const n = (i + 1) as 1 | 2 | 3;
          const active = step === n;
          const done = step > n;
          return (
            <div key={label} className="flex flex-1 items-center gap-2">
              <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold transition ${
                active ? "border-primary bg-primary text-primary-foreground"
                : done ? "border-accent bg-accent text-accent-foreground"
                : "border-border bg-card/60 text-muted-foreground"
              }`}>
                {done ? <Check className="h-3 w-3" /> : n}
              </div>
              <span className={`font-medium uppercase tracking-wider ${active ? "text-foreground" : "text-muted-foreground"}`}>
                {label}
              </span>
              {i < 2 && <div className="ml-1 h-px flex-1 bg-border" />}
            </div>
          );
        })}
      </div>
    </header>
  );
}

/* ------------ Step 1: Select ------------ */

function SelectStep({ query, setQuery, results, trending, searching, selected, isSelected, onToggle, onContinue, onRemove }: {
  query: string; setQuery: (v: string) => void; results: OLBook[]; trending: OLBook[];
  searching: boolean; selected: SelectedBook[]; isSelected: (key: string) => boolean;
  onToggle: (b: OLBook) => void; onContinue: () => void; onRemove: (key: string) => void;
}) {
  const canContinue = selected.length >= 3;
  return (
    <div className="space-y-8">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for books you've read…"
          className="w-full rounded-full border border-border bg-card/70 py-3.5 pl-11 pr-11 text-sm text-foreground placeholder:text-muted-foreground/70 shadow-sm backdrop-blur focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        {query && (
          <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted" aria-label="Clear">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {query.trim() ? (
        <section>
          <h2 className="mb-3 px-1 text-sm font-medium uppercase tracking-wider text-muted-foreground">
            {searching ? "Searching…" : `Results for "${query}"`}
          </h2>
          {!searching && results.length === 0 ? (
            <p className="px-1 text-sm text-muted-foreground">No books found.</p>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4">
              {results.map((b) => (
                <BookCover key={b.key} book={b} selected={isSelected(b.key)} onClick={() => onToggle(b)} disabled={!isSelected(b.key) && selected.length >= 10} />
              ))}
            </div>
          )}
        </section>
      ) : (
        <section>
          <h2 className="mb-3 px-1 text-sm font-medium uppercase tracking-wider text-muted-foreground">Trending on the shelf</h2>
          {trending.length === 0 ? (
            <div className="flex gap-3 overflow-hidden">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="aspect-[2/3] w-28 shrink-0 animate-pulse rounded-lg bg-card/60" />
              ))}
            </div>
          ) : (
            <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-3 [scrollbar-width:thin]">
              {trending.map((b) => (
                <div key={b.key} className="w-28 shrink-0 sm:w-32">
                  <BookCover book={b} selected={isSelected(b.key)} onClick={() => onToggle(b)} disabled={!isSelected(b.key) && selected.length >= 10} />
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="h-24" />

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 px-4 py-3 backdrop-blur-md shadow-[0_-10px_30px_-15px_oklch(0.3_0.05_45/0.25)]">
        <div className="mx-auto max-w-3xl">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-baseline gap-2">
              <h3 className="font-serif text-base font-semibold text-foreground">Your picks</h3>
              <span className="text-xs text-muted-foreground">{selected.length} / 10</span>
            </div>
            <button onClick={onContinue} disabled={!canContinue}
              className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-md shadow-primary/20 transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50">
              Rate them <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          {selected.length === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">Tap covers above to add at least 3 books.</p>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
              {selected.map((b) => (
                <div key={b.key} className="relative shrink-0">
                  <div className="h-16 w-11 overflow-hidden rounded-md bg-muted shadow">
                    {b.coverId ? <img src={coverUrl(b.coverId, "S") ?? ""} alt={b.title} className="h-full w-full object-cover" loading="lazy" /> : null}
                  </div>
                  <button onClick={() => onRemove(b.key)} aria-label={`Remove ${b.title}`}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background shadow">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BookCover({ book, selected, onClick, disabled }: { book: OLBook; selected: boolean; onClick: () => void; disabled?: boolean }) {
  const url = coverUrl(book.coverId, "M");
  return (
    <button onClick={onClick} disabled={disabled}
      className={`group relative block w-full overflow-hidden rounded-lg shadow-md transition-all duration-200 ${
        selected ? "ring-2 ring-primary ring-offset-2 ring-offset-background scale-[0.97]" : "hover:-translate-y-1 hover:shadow-xl"
      } ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}>
      <div className="aspect-[2/3] w-full bg-muted">
        {url ? <img src={url} alt={book.title} className="h-full w-full object-cover" loading="lazy" />
          : <div className="flex h-full items-center justify-center p-2 text-center font-serif text-xs text-muted-foreground">{book.title}</div>}
      </div>
      {selected && (
        <div className="absolute inset-0 flex items-center justify-center bg-primary/30">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
            <Check className="h-5 w-5" strokeWidth={3} />
          </div>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 transition group-hover:opacity-100">
        <p className="line-clamp-2 text-left text-[11px] font-medium leading-tight text-white">{book.title}</p>
      </div>
    </button>
  );
}

/* ------------ Step 2: Rate ------------ */

function RateStep({ selected, setSelected, onBack, onFinish }: {
  selected: SelectedBook[];
  setSelected: (updater: (prev: SelectedBook[]) => SelectedBook[]) => void;
  onBack: () => void;
  onFinish: () => void;
}) {
  const [index, setIndex] = useState(0);
  const startX = useRef<number | null>(null);
  const [dragX, setDragX] = useState(0);
  const current = selected[index];
  const rated = selected.filter((b) => b.rating > 0).length;
  const allRated = rated === selected.length;

  function setRating(r: number) {
    setSelected((prev) => prev.map((b, i) => (i === index ? { ...b, rating: r } : b)));
    setTimeout(() => { if (index < selected.length - 1) setIndex((i) => i + 1); }, 250);
  }

  function go(delta: number) {
    const next = index + delta;
    if (next >= 0 && next < selected.length) setIndex(next);
  }

  function onTouchStart(e: React.TouchEvent) { startX.current = e.touches[0].clientX; }
  function onTouchMove(e: React.TouchEvent) { if (startX.current === null) return; setDragX(e.touches[0].clientX - startX.current); }
  function onTouchEnd() { if (Math.abs(dragX) > 80) go(dragX < 0 ? 1 : -1); setDragX(0); startX.current = null; }

  if (!current) return null;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <button onClick={onBack} className="flex items-center gap-1 hover:text-foreground">
            <ChevronLeft className="h-3.5 w-3.5" /> Edit picks
          </button>
          <span>{rated} / {selected.length} rated</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-card">
          <div className="h-full bg-primary transition-all duration-300" style={{ width: `${(rated / selected.length) * 100}%` }} />
        </div>
      </div>

      <div className="relative mx-auto h-[440px] w-full max-w-xs sm:h-[500px]">
        {selected.slice(index, index + 3).reverse().map((b, i, arr) => {
          const depth = arr.length - 1 - i;
          const isTop = depth === 0;
          return (
            <div key={b.key}
              onTouchStart={isTop ? onTouchStart : undefined}
              onTouchMove={isTop ? onTouchMove : undefined}
              onTouchEnd={isTop ? onTouchEnd : undefined}
              className="absolute inset-0 origin-bottom rounded-2xl bg-card shadow-[0_20px_50px_-20px_oklch(0.3_0.05_45/0.4)] transition-transform duration-300"
              style={{
                transform: isTop ? `translateX(${dragX}px) rotate(${dragX * 0.05}deg)` : `translateY(${depth * 8}px) scale(${1 - depth * 0.04})`,
                zIndex: 10 - depth, opacity: isTop ? 1 : 0.7,
              }}>
              <div className="flex h-full flex-col items-center justify-between p-5">
                <div className="aspect-[2/3] w-full max-w-[220px] overflow-hidden rounded-lg bg-muted shadow-xl">
                  {b.coverId ? <img src={coverUrl(b.coverId, "L") ?? ""} alt={b.title} className="h-full w-full object-cover" /> : null}
                </div>
                <div className="mt-3 px-2 text-center">
                  <h3 className="line-clamp-2 font-serif text-lg font-semibold leading-tight text-foreground">{b.title}</h3>
                  <p className="mt-1 text-xs italic text-muted-foreground">by {b.author}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-3">
        <p className="text-center text-sm text-muted-foreground">How did you like it?</p>
        <div className="flex items-center justify-center gap-1">
          <BigStars value={current.rating} onChange={setRating} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <button onClick={() => go(-1)} disabled={index === 0}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-foreground transition hover:bg-muted disabled:opacity-30" aria-label="Previous">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="text-xs text-muted-foreground">Book {index + 1} of {selected.length}</div>
        {index < selected.length - 1 ? (
          <button onClick={() => go(1)} className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-foreground transition hover:bg-muted" aria-label="Next">
            <ChevronRight className="h-5 w-5" />
          </button>
        ) : (
          <button onClick={onFinish} disabled={!allRated}
            className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-md transition hover:brightness-110 disabled:opacity-50">
            <Sparkles className="h-4 w-4" /> Find my books
          </button>
        )}
      </div>
    </div>
  );
}

function BigStars({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="flex items-center gap-1.5" onMouseLeave={() => setHover(0)} role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => {
        const active = n <= shown;
        return (
          <button key={n} type="button" onClick={() => onChange(n)} onMouseEnter={() => setHover(n)} className="p-1.5 transition active:scale-90" aria-label={`${n} star${n > 1 ? "s" : ""}`}>
            <Star className={`h-9 w-9 transition ${active ? "fill-gold text-gold drop-shadow-sm" : "fill-transparent text-muted-foreground/40"}`} />
          </button>
        );
      })}
    </div>
  );
}

/* ------------ Step 3: Results + Identity ------------ */

function ResultsStep({ selected, onRestart }: { selected: SelectedBook[]; onRestart: () => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ identity: ReaderIdentity; recs: Recommendation[] } | null>(null);
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    (async () => {
      try {
        const data: ApiResult = await fetch("/api/recommend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            books: selected.map((b) => ({ title: b.title, author: b.author, rating: b.rating })),
          }),
        }).then((r) => r.json());

        const recs = await enrichWithCovers(data.recommendations);
        setResult({ identity: data.identity, recs });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="py-12 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 font-serif text-lg text-foreground">Reading your taste…</p>
        <p className="mt-1 text-sm text-muted-foreground">Pulling five books off the shelf for you.</p>
        <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className="aspect-[2/3] animate-pulse rounded-lg bg-card/60" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4 py-10 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <button onClick={onRestart} className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          <RotateCcw className="h-4 w-4" /> Start over
        </button>
      </div>
    );
  }

  return (
    <section className="space-y-8">

      {/* Reader Identity Card */}
      {result?.identity && (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-[0_10px_40px_-15px_oklch(0.3_0.05_45/0.2)]">
          <div className="mb-3 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-accent">
            <span className="h-px w-8 bg-accent/40" />
            Your reader identity
            <span className="h-px w-8 bg-accent/40" />
          </div>
          <div className="flex items-start gap-4">
            <span className="text-4xl">{result.identity.emoji}</span>
            <div className="flex-1">
              <h2 className="font-serif text-2xl font-semibold text-foreground">{result.identity.title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{result.identity.description}</p>
            </div>
          </div>
          <div className="mt-5 space-y-2.5">
            {result.identity.traits.map((t) => (
              <div key={t.label}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs text-foreground/70">{t.label}</span>
                  <span className="text-xs text-muted-foreground">{t.pct}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${t.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      <div className="text-center">
        <div className="mb-2 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-accent">
          <span className="h-px w-8 bg-accent/40" />
          Hand-picked for you
          <span className="h-px w-8 bg-accent/40" />
        </div>
        <h2 className="font-serif text-3xl font-semibold text-foreground">Five for your shelf</h2>
      </div>

      <ol className="space-y-5">
        {result?.recs.map((r, i) => (
          <li key={i} className="flex gap-4 rounded-2xl border border-border bg-card p-4 shadow-[0_10px_30px_-15px_oklch(0.3_0.05_45/0.2)] transition hover:border-primary/40 sm:p-5">
            <div className="h-36 w-24 shrink-0 overflow-hidden rounded-md bg-muted shadow-md sm:h-40 sm:w-28">
              {r.coverUrl
                ? <img src={r.coverUrl} alt={r.title} className="h-full w-full object-cover" loading="lazy" />
                : <div className="flex h-full items-center justify-center p-2 text-center font-serif text-xs text-muted-foreground">{r.title}</div>}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-serif text-lg font-semibold leading-tight text-foreground sm:text-xl">{r.title}</h3>
              <p className="mt-0.5 text-sm italic text-muted-foreground">by {r.author}</p>
              <p className="mt-2 text-sm leading-relaxed text-foreground/85">{r.reason}</p>
              <a href={r.amazonUrl} target="_blank" rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                Find on Amazon <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </li>
        ))}
      </ol>

      <div className="flex flex-col items-center gap-3 pt-4">
        <button onClick={onRestart} className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground hover:bg-muted">
          <RotateCcw className="h-4 w-4" /> Start a new shelf
        </button>
        <p className="text-xs text-muted-foreground">Happy reading. ☕</p>
      </div>
    </section>
  );
}

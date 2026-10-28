// ui/public/PublicGallery.jsx — the public model gallery (ADR-025).
//
// The gallery is the acquisition surface. It is browsable WITHOUT an account,
// which is the whole point: a signed-out visitor must be able to see that
// Flow publishes models at all, and what a published model looks like.
//
// It lists PUBLISHED models — a separate act from the community gallery of
// models whose visibility is set to public (see the model's "listing" in the
// community). The two are different things and are kept apart.
import { useCallback, useEffect, useState } from "react";
import { fetchPublishedModelList, PUBLISH_CATEGORIES } from "../../db/published.js";
import { Btn } from "../shared/components.jsx";
import { useTheme } from "../shared/ThemeContext.jsx";
import { PublicShell } from "./publicChrome.jsx";

const SANS = "Inter,'Segoe UI',Arial,sans-serif";
const PAGE_SIZE = 24;

export function PublicGallery({ onBack, onOpenModel }) {
  const { C, FONT } = useTheme();
  const [status, setStatus] = useState("loading");
  const [items, setItems] = useState([]);
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const rows = await fetchPublishedModelList({
        category: category || null,
        search: query || null,
        limit: limit + 1, // one extra tells us whether there is a next page
      });
      setItems(rows.slice(0, limit));
      setStatus("ready");
    } catch (err) {
      setStatus("error");
    }
  }, [category, query, limit]);

  useEffect(() => { load(); }, [load]);

  const hasMore = items.length > limit;

  return (
    <PublicShell onBack={onBack}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, fontFamily: SANS, margin: 0 }}>
            Published models
          </h1>
          <p style={{ fontSize: 13, color: C.muted, fontFamily: SANS, lineHeight: 1.6, margin: "6px 0 0" }}>
            Models their authors have published — with their assumptions and the sources behind their
            numbers, so you can see what you are trusting.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <form
            onSubmit={e => { e.preventDefault(); setQuery(search.trim()); setLimit(PAGE_SIZE); }}
            style={{ display: "flex", gap: 8, flex: "1 1 260px", minWidth: 220 }}
          >
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search published models…"
              aria-label="Search published models"
              style={{
                flex: 1, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6,
                color: C.text, fontFamily: SANS, fontSize: 13, padding: "9px 11px",
              }}
            />
            <Btn type="submit" variant="ghost">Search</Btn>
          </form>
          <select
            value={category}
            onChange={e => { setCategory(e.target.value); setLimit(PAGE_SIZE); }}
            aria-label="Filter by category"
            style={{
              background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6,
              color: C.text, fontFamily: SANS, fontSize: 13, padding: "9px 11px",
            }}
          >
            <option value="">All categories</option>
            {PUBLISH_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          {query && (
            <Btn small variant="ghost" onClick={() => { setQuery(""); setSearch(""); }}>Clear search</Btn>
          )}
        </div>

        {status === "loading" && (
          <div style={{ fontSize: 13, color: C.muted, fontFamily: SANS }}>Loading…</div>
        )}

        {status === "error" && (
          <div style={{ fontSize: 13, color: C.red, fontFamily: SANS }}>
            Couldn&apos;t load the gallery. Try again in a moment.
          </div>
        )}

        {status === "ready" && items.length === 0 && (
          <div style={{
            background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10,
            padding: "36px 24px", textAlign: "center",
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, fontFamily: SANS, marginBottom: 6 }}>
              Nothing published here yet
            </div>
            <div style={{ fontSize: 13, color: C.muted, fontFamily: SANS, lineHeight: 1.6 }}>
              {query || category
                ? "No published models match that search."
                : "No models have been published yet. Be the first."}
            </div>
          </div>
        )}

        {items.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
            {items.map(m => (
              <button
                key={m.modelId}
                type="button"
                onClick={() => onOpenModel?.(m.modelId)}
                style={{
                  textAlign: "left", background: C.panel, border: `1px solid ${C.border}`,
                  borderRadius: 10, padding: 14, cursor: "pointer", color: "inherit",
                  display: "flex", flexDirection: "column", gap: 8,
                }}
              >
                {m.coverImageUrl && (
                  <img
                    src={m.coverImageUrl}
                    alt=""
                    style={{ width: "100%", height: 110, objectFit: "cover", borderRadius: 6 }}
                  />
                )}
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, fontFamily: SANS, lineHeight: 1.35 }}>
                  {m.title}
                </div>
                {m.summary && (
                  <div style={{
                    fontSize: 12, color: C.muted, fontFamily: SANS, lineHeight: 1.55,
                    display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
                  }}>
                    {m.summary}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: "auto", paddingTop: 4 }}>
                  {m.category && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, color: C.accent, fontFamily: SANS,
                      border: `1px solid ${C.accent}44`, borderRadius: 3, padding: "1px 6px",
                    }}>
                      {PUBLISH_CATEGORIES.find(c => c.value === m.category)?.label || m.category}
                    </span>
                  )}
                  {m.author && (
                    <span style={{ fontSize: 10, color: C.muted, fontFamily: SANS }}>by {m.author}</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {hasMore && (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <Btn variant="ghost" onClick={() => setLimit(l => l + PAGE_SIZE)}>Show more</Btn>
          </div>
        )}
      </div>
    </PublicShell>
  );
}

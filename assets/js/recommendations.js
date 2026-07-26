/* HGS Filmempfehlungen — schlägt neue Filme vor, basierend auf der Filmliste.
 * Fragt für jeden eingetragenen Film TMDB nach ähnlichen/empfohlenen Filmen,
 * zählt Überschneidungen (ein Kandidat, der von mehreren gelisteten Filmen
 * empfohlen wird, rankt höher) und blendet Filme aus, die schon auf der Liste stehen.
 * Braucht window.HGS_CONFIG.tmdb.apiKey — ohne Schlüssel bleibt der Block versteckt.
 */
(function () {
  "use strict";

  const TMDB = (window.HGS_CONFIG || {}).tmdb || {};
  const API_KEY = TMDB.apiKey;
  const BASE = "https://api.themoviedb.org/3";
  const IMG_BASE = "https://image.tmdb.org/t/p/w342";
  const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 1 Woche
  const MAX_RESULTS = 8;

  function el(tag, attrs, text) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach((key) => {
        const value = attrs[key];
        if (key === "class") node.className = value;
        else if (value !== undefined && value !== null && value !== false) node.setAttribute(key, value === true ? "" : value);
      });
    }
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function normalizeTitle(t) {
    return String(t || "").trim().toLowerCase();
  }

  async function tmdbGet(path, params) {
    const url = new URL(BASE + path);
    url.searchParams.set("api_key", API_KEY);
    url.searchParams.set("language", "de-DE");
    Object.keys(params || {}).forEach((k) => url.searchParams.set(k, params[k]));
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error("tmdb-" + res.status);
    return res.json();
  }

  async function findMovie(title) {
    const data = await tmdbGet("/search/movie", { query: title, include_adult: "false" });
    const results = (data && data.results) || [];
    return results[0] || null;
  }

  async function recommendationsFor(id) {
    const data = await tmdbGet("/movie/" + id + "/recommendations", {});
    let results = (data && data.results) || [];
    if (results.length === 0) {
      const alt = await tmdbGet("/movie/" + id + "/similar", {});
      results = (alt && alt.results) || [];
    }
    return results;
  }

  function cacheKeyFor(titles) {
    return "hgs:reco:" + titles.map(normalizeTitle).sort().join("|");
  }

  function loadCache(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || Date.now() - parsed.savedAt > CACHE_TTL_MS) return null;
      return parsed.results;
    } catch (_) {
      return null;
    }
  }

  function saveCache(key, results) {
    try {
      localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), results }));
    } catch (_) {
      /* Speicher voll o. ä. — dann halt kein Cache */
    }
  }

  async function buildRecommendations(watched) {
    const watchedTitles = new Set(watched.map((e) => normalizeTitle(e.title)));
    const candidates = new Map(); // tmdbId -> { movie, hits }

    const matches = await Promise.all(
      watched.map(async (entry) => {
        try {
          return await findMovie(entry.title);
        } catch (_) {
          return null;
        }
      })
    );
    const matchedIds = new Set(matches.filter(Boolean).map((m) => m.id));

    await Promise.all(
      matches.filter(Boolean).map(async (movie) => {
        let recs;
        try {
          recs = await recommendationsFor(movie.id);
        } catch (_) {
          return;
        }
        recs.forEach((rec) => {
          if (matchedIds.has(rec.id)) return; // schon selbst auf der Liste
          if (watchedTitles.has(normalizeTitle(rec.title))) return;
          const existing = candidates.get(rec.id);
          if (existing) existing.hits += 1;
          else candidates.set(rec.id, { movie: rec, hits: 1 });
        });
      })
    );

    return Array.from(candidates.values())
      .sort((a, b) => b.hits - a.hits || (b.movie.vote_average || 0) - (a.movie.vote_average || 0))
      .slice(0, MAX_RESULTS)
      .map((c) => c.movie);
  }

  function renderCard(movie) {
    const card = el("div", { class: "card reco-card" });
    if (movie.poster_path) {
      const posterWrap = el("div", { class: "reco-poster" });
      posterWrap.appendChild(el("img", { src: IMG_BASE + movie.poster_path, alt: "", loading: "lazy" }));
      card.appendChild(posterWrap);
    }
    const body = el("div", { class: "reco-body" });
    body.appendChild(el("h3", {}, movie.title));
    if (typeof movie.vote_average === "number" && movie.vote_average > 0) {
      body.appendChild(el("span", { class: "tag alt" }, "★ " + movie.vote_average.toFixed(1)));
    }
    const link = el(
      "a",
      {
        href: "https://www.justwatch.com/de/suche?q=" + encodeURIComponent(movie.title),
        target: "_blank",
        rel: "noopener",
        class: "justwatch-link",
      },
      "Bei JustWatch suchen ↗"
    );
    body.appendChild(link);
    card.appendChild(body);
    return card;
  }

  async function init() {
    if (!API_KEY) return; // kein Schlüssel hinterlegt — Feature bleibt aus

    const section = document.getElementById("reco-section");
    const status = document.getElementById("reco-status");
    const grid = document.getElementById("reco-grid");
    if (!section || !grid) return;

    let watched;
    try {
      watched = await window.HGSStore.load("movies");
    } catch (_) {
      return;
    }
    if (!watched || watched.length === 0) return;

    section.hidden = false;
    if (status) {
      status.hidden = false;
      status.textContent = "Lade Empfehlungen…";
    }

    const key = cacheKeyFor(watched.map((e) => e.title));
    let results = loadCache(key);
    if (!results) {
      try {
        results = await buildRecommendations(watched);
        saveCache(key, results);
      } catch (_) {
        results = [];
      }
    }

    if (status) status.hidden = true;
    if (results.length === 0) {
      section.hidden = true;
      return;
    }
    grid.hidden = false;
    results.forEach((movie) => grid.appendChild(renderCard(movie)));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

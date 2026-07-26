# Movie recommendations for /filme/ — implementation plan & handoff

## Goal
Suggest new movies to watch, based on the WG's shared movie list
(`data/movies.json`, mirrored live at github.com/bernhardkreminski/hgs-data).
Constraint: **fully client-side, static site, no backend, no build step
beyond GitHub Pages** — this repo is plain HTML/CSS/JS, deployed via GitHub Pages.

## Why not real embeddings
The list's `description` field is free-text personal notes in German
("Lustiger Film, evtl mit cringe"), not descriptive content — there's no
usable corpus to embed, and no ratings/genres in the data. Building a
candidate pool + embeddings client-side would need a backend anyway.

## Chosen approach
Use TMDB's own content/collaborative recommendation graph instead of
building one from scratch:
1. For each movie title in the watched/want-to-watch list, search TMDB
   (`/search/movie`) to resolve it to a TMDB id.
2. For each resolved id, fetch `/movie/{id}/recommendations` (falls back to
   `/movie/{id}/similar` if empty).
3. Aggregate results across all list entries into a candidate map keyed by
   TMDB id: a movie recommended by multiple watched films scores higher;
   ties broken by TMDB `vote_average`.
4. Filter out anything already on the list (by normalized title match).
5. Cache the result in `localStorage` for 7 days (keyed by a hash of the
   current watched titles) to avoid re-hitting the API on every page load.
6. Render as a new "Empfehlungen" section on `/filme/`, poster-card style,
   linking out to a JustWatch search per movie.

## Files (already implemented in this session)
- [assets/js/recommendations.js](assets/js/recommendations.js) — all of the
  logic above. Self-contained IIFE, no dependency on board.js except reading
  the same `HGSStore.load("movies")` data layer.
- [assets/js/config.js](assets/js/config.js) — added a `tmdb.apiKey` slot
  (currently `""` in git — see "Secret handling" below).
- [filme/index.html](filme/index.html) — added `#reco-section` /
  `#reco-status` / `#reco-grid`, plus a `<script src="/assets/js/
  recommendations.js">` tag after board.js.
- [assets/css/board.css](assets/css/board.css) — added `.reco-*` rules
  (poster aspect-ratio cards, reusing the existing `.card` glass style).
- [.github/workflows/pages.yml](.github/workflows/pages.yml) — GitHub
  Actions workflow that builds+deploys Pages, injecting the TMDB key into a
  throwaway copy of `config.js` at deploy time only (see below).

## Secret handling — why a workflow, not a hardcoded key
The user wants the TMDB key to never be committed to git in plaintext, even
though (being a static client-side site) the key must still reach the
browser to call TMDB directly — that's an accepted trade-off for a
read-only v3 key, not a real secret in the security sense.

Mechanism: `.github/workflows/pages.yml` runs on every push to `main`,
`sed`-replaces `apiKey: ""` with the real key (from repo secret
`TMDB_API_KEY`) in a checked-out copy, then publishes that via
`actions/upload-pages-artifact` + `actions/deploy-pages`. The committed
`assets/js/config.js` keeps `apiKey: ""` forever.

**Important gotcha for whoever picks this up:** use the TMDB **API Key
(v3 auth)** — the short alphanumeric string. `recommendations.js` sends it
as `?api_key=...` in the query string. The "API Read Access Token" (v4, a
long JWT meant for an `Authorization: Bearer` header) will NOT work with
the current code — don't put that one in the secret.

## Status as of this handoff
- [x] Code written and verified locally (mock-rendered the reco cards via a
      local static server + Browser pane; no console errors; existing
      board still renders fine when there's no API key — section just
      stays hidden).
- [x] `TMDB_API_KEY` GitHub Actions secret — user confirmed added.
- [ ] **Commit + push** `.github/workflows/pages.yml` (and the other 4
      changed files above) to `main`. Not yet committed as of this
      handoff — the assistant in the prior session only had read-access
      GitHub credentials (`gh` authenticated as `bernhardkreminski-qm`,
      permissions `push: false`) and could not push. Needs to be done by
      the repo owner (`bernhardkreminski`) or a session with write access.
- [ ] **Switch Pages deployment source**: repo → Settings → Pages → Build
      and deployment → Source → change from "Deploy from a branch" to
      "GitHub Actions". Currently still on legacy branch deploy
      (`build_type: "legacy"`, confirmed via `gh api repos/.../pages`).
      Also blocked on the same read-only credential in the prior session.
- [ ] After both of the above: push to `main`, watch the Actions tab for
      the `pages.yml` run, then load hgs.house/filme/ and confirm the
      "Empfehlungen" section appears below the existing movie board.

## Security note from prior session
A GitHub PAT was pasted directly into chat by the user at one point to try
to work around the push-access issue. It was **not used** (entering
tokens/credentials is refused regardless of how they're supplied), but
since it was typed into a chat transcript it should be treated as
compromised — **revoke it at github.com/settings/tokens if that hasn't
happened yet**, before doing anything else here.

## Open follow-ups / nice-to-haves (not started)
- No rate-limit backoff on the TMDB calls — fine at this list size (a
  handful of movies), would need throttling if the list grows a lot.
- No UI for "no results" beyond hiding the whole section — currently if
  TMDB returns nothing useful the section just stays hidden with no
  message, which is intentional (keeps failure modes quiet) but worth
  reconsidering if it's confusing in practice.
- Cache TTL is a flat 7 days in `localStorage`; per-device, not shared —
  each WG member's browser will do its own first fetch.

# Feature inventory

Everything that exists, what it does, and where to change it.

---

## 1. Landing page — `/`

**Files:** `index.html`, `home.css`

Full-viewport `.panel` hero: the rooftop group photo full-bleed behind a scrim,
eyebrow "Rooftop-WG", the statement headline *"Sieben Leute.<br>Ein Dach."* with
an accent-coloured period, and a warm subline. Below the fold: a short section
with four glass link cards to the subpages (gradient hairline border, hover lift,
an orange arrow sliding in).

Navigation to every subpage is reachable **without scrolling** via the fixed nav —
this was an explicit requirement. An earlier version also had pill links inside
the hero; they were removed as duplicates of the nav. Don't reintroduce them.

---

## 2. The people — `/wg/`

**Files:** `wg/index.html`, `home.css`

A **poster wall**: 8 square tiles in a 4×2 grid (2 columns on mobile), all
visible in one viewport on a 1280×800 desktop alongside the compact header.

- Portraits are greyscale, turning to colour on hover
- The **fun fact** slides in on `:hover`, `:focus` and `:focus-within` (so it
  works by keyboard and touch); the name stays pinned bottom-left
- Fun-fact text is real DOM text, not a `title` attribute — deliberate for
  accessibility and search
- Order: Alfi, Cheb, Berni, Eva, cyman *(lowercase — that's how it's spelled)*,
  Lea, Franzi, **Günni**

**Günni** is the eighth tile: a crocheted bee who travels with the flat's moka
pot. He replaced a filler tile that carried the "HGS." wordmark, which is why the
grid still comes out even.

**Cheb's tile** carries a visible "♪ Chebter One" pill linking to the hidden
album page (see §7). His fun fact hints at it.

Below the grid: the garden-party photo in a 2:1 frame (4:3 on mobile) captioned
"Gartenparty — Rosenheim Garden Peace.", and a `<details>` easter egg linking the
illustrated poster `wg-art.svg`.

**To change a person:** edit the `<li class="person-tile">` block directly in
`wg/index.html`. Photos are `assets/img/p-<name>.jpg`, square.

---

## 3. Movie list — `/filme/`

**Files:** `filme/index.html`, `board.js` (`CONFIGS.movies`), `board.css`

Renders as a **list of rows**, not a card grid (`listMode: true`).

Split into two labelled groups (`splitWatched: true`):

- **WATCHLIST** — open films, newest first
- **SCHON GESEHEN** — watched films with a count badge, most recently watched first

Each row has a **checkbox** (`watchable: true`). Checking it opens an inline
"Wann geschaut?" date field defaulting to today; only pressing Speichern writes.
Watched rows are struck through, dimmed, and carry an editable "Gesehen am …"
tag — clicking that tag reopens the date field.

Fields: `title` (required), `description` (**optional**), `url` (optional
JustWatch link, rendered as an orange pill chip).

### Recommendations block

**File:** `recommendations.js` · plan of record: [RECOMMENDATIONS_PLAN.md](RECOMMENDATIONS_PLAN.md)

Below the list, "Empfehlungen." suggests films via TMDB:

1. Take only **watched** entries as seeds
2. Resolve each title through `/search/movie`
3. Fetch `/movie/{id}/recommendations` (falling back to `/similar`)
4. Aggregate — a film recommended by several of your films ranks higher, ties
   broken by `vote_average`
5. Drop anything already on the list (watched *or* open)
6. Cache in `localStorage` under `hgs:reco:seen:<sorted titles>` for 7 days;
   stale keys are pruned

Refreshes when the set of *watched* titles changes; ticking a film off therefore
produces a fresh batch. Hidden entirely without an API key. With nothing watched
yet it shows an explanatory line rather than vanishing.

---

## 4. Workshops — `/workshops/`

**Files:** `workshops/index.html`, `board.js` (`CONFIGS.workshops`)

Classic card grid. Fields: `title`, `description`, `host` (all required) and an
optional `date`. Upcoming workshops sort first (soonest first), then undated/past
by creation date. A past date renders muted as "war am …".

---

## 5. Blog — `/blog/`

**Files:** `blog/index.html`, `board.js` (`CONFIGS.blog`)

Card grid, newest first. Fields: `title`, `text` (multi-paragraph — blank lines
become separate `<p>`), `mood` (a select: `top` → orange "Top" tag, `flop` →
plain "Naja" tag), and **images**.

### Pictures (added last)

- The form field `type: "images"` renders a small gallery manager: existing
  images as chips with a remove ✕, plus a multi-file picker
- Each selected file is **downscaled in the browser** before upload — max 1600 px
  on the long edge, JPEG quality 0.82 (`fileToResizedBase64`). A 2400×1200 test
  image came out 1600×800 at ~8 KB
- New selections show as chips flagged "neu" until saved
- On save, files upload to `hgs-data/images/` as individual files
  (`HGSStore.uploadImage`); the entry stores only the URL, keeping `blog.json` small
- Cards show a thumbnail grid; clicking opens a **full-screen viewer** with
  caption, an "n / total" counter, prev/next buttons, **←/→ keys**, and Esc or
  backdrop click to close

`src` may also be a site-local path (`/assets/img/…`) — the seeded entry "Die
Bilder hinter der Website" uses that to showcase all five background photos with
descriptions, without duplicating the files.

---

## 6. Access-code gate (all three boards)

Reading is free. **Every** write asks for the flat code (**1312**).

- Verified against `HGS_CONFIG.codeHash` (SHA-256) via `HGSStore.verifyCode`
- A correct code is cached in `sessionStorage['hgs-code']` for the tab
- **Deleting always re-asks**, even with a cached code (`{forceCode: true}`) —
  deliberate, deletion is the destructive one
- Wrong code → modal shakes, shows "Falscher Code.", lets you retry
- Deletion also requires confirming in a modal first (never `window.confirm`)

**Read [SECURITY.md](SECURITY.md) before treating this as real security.**

---

## 7. Hidden album — `/chebter-one/`

**Files:** `chebter-one/index.html`, `album.js`, `album.css`, `assets/audio/*.mp3`

A full-screen player for *Chebter One (Remastered)*, 10 tracks recorded and
produced in the flat (the user confirmed they own the rights). Not in the nav and
marked `noindex` — reachable only from Cheb's tile.

- Spinning vinyl using Cheb's portrait as the label, with groove texture
- Tracklist with an animated equaliser on the current track
- Fixed player bar: prev/play/next, seek slider, elapsed/duration
- **Listen Mode** — real fullscreen (`requestFullscreen`), giant track title,
  animated bars, minimal controls, Esc to exit
- Media Session API metadata, so lock-screen and media keys work
- Keyboard: Space toggles, Shift+←/→ change track

---

## 8. Photo backgrounds

Fixed, dimmed full-page photos with a slow Ken Burns drift (disabled under
`prefers-reduced-motion`). Cards sit on top with a backdrop blur.

| Page | Image | Scene |
|---|---|---|
| `/wg/` | `bg-wg.jpg` | Garden party |
| `/filme/` | `bg-filme.jpg` | Home cinema |
| `/workshops/` | `bg-workshops.jpg` | Craft table |
| `/blog/` | `bg-blog.jpg` | Football match |
| `/` | `group.jpg` | Rooftop at sunset (hero, not a `.page-bg`) |

Text contrast beats visual punch — if you lighten a scrim, re-check readability.

---

## 9. Icons / add-to-home-screen

**Files:** `favicon.svg`, `favicon-32.png`, `apple-touch-icon.png`, `icon-192.png`,
`icon-512.png`, `site.webmanifest`

A sunset setting behind a roofline, in the site palette. `favicon.svg` is the
source of truth; the PNGs are rasterised from it.

- `apple-touch-icon.png` is 180×180 and **opaque** — iOS ignores data-URI icons,
  which is why the original emoji favicon never worked on the home screen
- `apple-mobile-web-app-title` names the shortcut "HGS"
- `display: standalone` + `apple-mobile-web-app-capable` means the home-screen
  shortcut opens **without browser chrome**. Deliberate, but there's no back
  button — drop those two metas if that's unwanted

---

## 10. Cross-device freshness

An open page reloads its board when the tab regains focus (`visibilitychange` +
`focus`), throttled to once per 10 s and skipped while a modal or inline date
field is open. Without this, a page opened on one phone never saw entries added
on another. See also the CDN caching trap in [GOTCHAS.md](GOTCHAS.md).

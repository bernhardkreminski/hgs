# Architecture

## Stack

Static HTML/CSS/JS served by GitHub Pages. No framework, no build step, no npm.
Two external runtime dependencies, both optional-by-design:

- **Google Fonts** (Archivo + Inter) — a `<link>` in every head
- **TMDB API** — only for the recommendations block on `/filme/`; without a key
  that block hides itself and everything else works

## Repo map

```
/                       page dirs, icons, manifest, CNAME
├─ index.html           landing
├─ wg/index.html        the people
├─ filme/index.html     movie board
├─ workshops/index.html workshop board
├─ blog/index.html      blog board
├─ chebter-one/index.html  hidden album player
├─ assets/
│  ├─ css/  base.css · home.css · board.css · album.css
│  ├─ js/   config.js · store.js · board.js · recommendations.js · album.js
│  ├─ img/  bg-*.jpg (page backgrounds) · p-*.jpg (portraits) · group.jpg · wg-art.svg
│  └─ audio/ 01.mp3 … 10.mp3  (the album, ~45 MB total)
├─ data/                seed JSON, only used by the 'local' backend fallback
├─ docs/                you are here
├─ .github/workflows/pages.yml   build + deploy
├─ CNAME                hgs.house
├─ favicon.svg · favicon-32.png · apple-touch-icon.png · icon-192.png · icon-512.png
└─ site.webmanifest
```

`.claude/launch.json` (git-ignored) configures the local preview server on port 8479.

## CSS layering

Every page loads `base.css` first, then exactly one page stylesheet.

| File | Loaded by | Contains |
|---|---|---|
| `base.css` | all pages | Design tokens (`--bg`, `--accent`, fonts) and shared components (`.site-nav`, `.card`, `.btn`, `.modal-*`, `.toast`, `.tag`, `.input`, `.site-footer`). **Treat as a contract — don't redefine tokens elsewhere.** |
| `home.css` | `/`, `/wg/` | Landing hero/panel, WG portrait tiles + hover overlay, group photo frame, WG page background |
| `board.css` | `/filme/`, `/workshops/`, `/blog/` | Board headers, card treatment, movie list rows, image strip + lightbox, image picker, page backgrounds |
| `album.css` | `/chebter-one/` | Vinyl, tracklist, player bar, fullscreen listen mode |

## JS modules

Loaded as plain `<script>` tags at end of `<body>`, in this order on board pages:

```html
<script src="/assets/js/config.js"></script>
<script src="/assets/js/store.js"></script>
<script>window.HGS_BOARD = { kind: "movies" };</script>
<script src="/assets/js/board.js"></script>
<script src="/assets/js/recommendations.js"></script>  <!-- /filme/ only -->
```

Each file is an IIFE exposing at most one global.

### `config.js` → `window.HGS_CONFIG` (30 lines)

Plain configuration object. Holds `backend` (`"github"` | `"local"`), `codeHash`
(SHA-256 of the access code), `github` (owner/repo/branch + the encrypted write
token), and `tmdb.apiKey` (empty in git, injected at deploy — see
[DEPLOYMENT.md](DEPLOYMENT.md)).

### `store.js` → `window.HGSStore` (150 lines)

The **only** gateway to persisted data. Two backends behind one API:

```js
HGSStore.load(kind)                      // → Promise<Entry[]>
HGSStore.save(kind, entries, code)       // whole-array write; throws Error('bad-code')
HGSStore.uploadImage(name, base64, code) // → Promise<url>
HGSStore.verifyCode(code)                // → Promise<boolean>
HGSStore.newId()                         // → unique string id
```

`kind` is `"movies" | "workshops" | "blog"`. Writes replace the entire array —
there is no per-entry update. Details in [DATA-STORE.md](DATA-STORE.md).

### `board.js` → the board engine (~1000 lines)

One generic engine driving all three boards. The page declares its kind via
`window.HGS_BOARD = { kind: … }` before loading it; the engine looks up a
`CONFIGS[kind]` object that declares fields, sorting, renderers and behaviour
flags. **To change board behaviour, change the config — not the engine.**

Key internals (function names are stable; line numbers drift):

| Area | Functions |
|---|---|
| DOM helper | `el(tag, attrs, text)` — the only way nodes are built; always `textContent` |
| Modal stack | `pushModal`, `dismissTop` — Esc closes topmost, backdrop click closes |
| Code gate | `openCodeModal`, `ensureCode(forceCode)` |
| Writing | `saveEntries(next, msg, {forceCode, code})` |
| Images | `fileToResizedBase64`, `resolveImages`, `renderImageStrip`, `openLightbox` |
| Rendering | `createCard` (workshops/blog), `createRow` (movies list), `renderGrid` |

### `recommendations.js` (224 lines)

Self-contained. Reads the movie list via `HGSStore.load("movies")`, keeps only
**watched** entries as seeds, asks TMDB for similar films, aggregates and
renders. Hides itself entirely if `tmdb.apiKey` is empty. See
[FEATURES.md](FEATURES.md).

### `album.js` (160 lines)

Standalone audio player for `/chebter-one/`. Track titles live in a `TRACKS`
array at the top of the file; files are `assets/audio/NN.mp3`.

## How a board page boots

1. `config.js` defines `HGS_CONFIG`.
2. `store.js` defines `HGSStore` (reads `HGS_CONFIG` for backend + credentials).
3. Inline script sets `window.HGS_BOARD = { kind }`.
4. `board.js` picks `CONFIGS[kind]`, then `init()`:
   - shows "Lade…", calls `HGSStore.load(kind)`
   - `renderGrid()` builds the DOM
   - wires the "+ …" button
   - registers a focus/visibility listener that reloads when the tab is
     re-focused (throttled 10 s, skipped while a modal or inline date field is
     open) so entries added on another device appear

## Data flow for a write

```
user clicks Save
  → openEntryModal returns field data (+ _pendingImages for blog)
  → resolveImages(): if images pending → ensureCode() → uploadImage() per file
  → saveEntries(next, msg, {code}): reuses that code, else ensureCode()
  → HGSStore.save() → GitHub contents API PUT (409 → one retry)
  → entries = next; renderGrid(); showToast()
```

The single code prompt is deliberately threaded from upload into save, so users
aren't asked twice for one action.

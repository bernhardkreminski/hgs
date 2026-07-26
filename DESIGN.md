# HGS — Design & Code Contract (v2 "Rebrush")

Static site on GitHub Pages, served at the domain root (`https://hgs.house/`, CNAME committed). **Vanilla HTML/CSS/JS only, no frameworks, no build tools. All URLs are clean directory URLs — never expose `.html`:** pages live at `/` (index.html), `/wg/`, `/filme/`, `/workshops/`, `/blog/` (each `<dir>/index.html`). **All asset/link paths are root-absolute** (`/assets/css/base.css`, `/filme/`, …).

## Art direction (reference: hirschroast.com)
Cinematic and calm. Near-black warm background, photography as the hero, enormous grotesk
statement headlines that end with a period (`<span class="end">.</span>` for the accent-colored
period), quiet small sublines, generous negative space, hairline borders, minimal chrome.
No gradients-for-decoration, no drop-shadow candy, no emoji in headlines (emojis allowed in
toasts/small UI). Site content language: **German**. Full-viewport `.panel` sections where it
suits; every page must show its purpose + navigation within the first viewport (no scrolling
needed to reach any subpage — the fixed `.site-nav` guarantees that).

## Design tokens & components (`/assets/css/base.css` — DO NOT modify, only use)
- Colors: `--bg #0e0c10`, `--bg-soft`, `--card`, `--ink #f2efe9`, `--ink-soft`, `--accent #ff9e4d` (sparingly!), `--line`
- Type: `--font-display` Archivo (800/900, tight tracking), `--font-body` Inter
- Components: `.site-nav` (fixed; add class `solid` on subpages + `has-solid-nav` on `<body>`), `.panel` + `.panel-media` + `.panel-scrim` + `.on-photo`, `.statement` (+ `.end`), `.subline`, `.scroll-hint`, `.eyebrow`, `.section`, `.section-title`, `.section-sub`, `.card`, `.grid`, `.tag`/`.tag.alt`, `.btn`/`.btn-primary`/`.btn-ghost`/`.btn-danger`, `.field`+`.input`, `.modal-backdrop`/`.modal-card`/`.modal-actions`, `.toast`, `.site-footer`

## Head snippet (every page; adjust `<title>`)
```html
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>… · HGS</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800;900&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/base.css">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🌇</text></svg>">
```

## Nav (identical everywhere; `aria-current="page"` on the active link; on subpages add `solid` to nav and `has-solid-nav` to body)
```html
<nav class="site-nav solid">
  <a class="nav-brand" href="/">HGS<span class="brand-dot">.</span></a>
  <div class="nav-links">
    <a href="/wg/">WG</a>
    <a href="/filme/">Filme</a>
    <a href="/workshops/">Workshops</a>
    <a href="/blog/">Blog</a>
  </div>
</nav>
```
(Landing `/` uses the same nav without `solid` and without `has-solid-nav`.)

## Footer (identical everywhere)
```html
<footer class="site-footer">
  <span>HGS — sieben Leute, ein Dach.</span>
  <span>Mit 🧡 selbst gebaut.</span>
</footer>
```

## Photos (in `/assets/img/`)
- `group.png` — group photo on the rooftop at sunset (landing hero, full-bleed via `.panel-media` + `.panel-scrim`)
- `portraits.png` — collage; will be cropped by orchestrator into `p-alfi.jpg`, `p-cheb.jpg`, `p-berni.jpg`, `p-eva.jpg`, `p-cyman.jpg`, `p-lea.jpg`, `p-franzi.jpg` (square-ish portraits)
- `wg-art.svg` — the illustrated poster (kept as a secondary easter-egg/poster element on /wg/, small)
Until crops exist, reference the final filenames anyway — the orchestrator guarantees them.

## Whiteboard data layer (`/assets/js/store.js` — use as-is)
`HGSStore.load(kind)` / `HGSStore.save(kind, entries, code)` / `HGSStore.verifyCode(code)` / `HGSStore.newId()` — kinds now: `'movies' | 'workshops' | 'blog'`.
Shared storage is LIVE (backend `github`, repo `hgs-data`). Reads are public; every write needs the WG code (modal; cache in `sessionStorage['hgs-code']`).
Entry shapes — movies: `{id, title, description?, url?, createdAt}` (**description now OPTIONAL**) · workshops: `{id, title, description, host, date?, createdAt}` · blog: `{id, title, text, mood: 'top'|'flop', createdAt}`.

## File ownership (touch nothing outside your list)
- Orchestrator: `base.css`, `store.js`, `config.js`, `data/*.json`, `DESIGN.md`, `README.md`, portrait crops
- Agent A: `index.html` (landing), `wg/index.html`, `/assets/css/home.css`
- Agent B: `filme/index.html`, `workshops/index.html`, `blog/index.html`, `/assets/css/board.css`, `/assets/js/board.js`

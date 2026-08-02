# HGS — Design & Code Contract (v2 "Rebrush")

> **Note for new readers.** This is the *binding visual and structural contract*
> for the site — head snippet, nav, footer, tokens, components, conventions.
> Follow it for any UI work. Two caveats:
>
> - The **"File ownership"** section at the bottom is historical: it split work
>   between parallel agents during the original build. Ignore it unless you are
>   again running several agents in parallel; there are no ownership rules today.
> - The **Photos** section names `group.png` / `portraits.png`; those source
>   files were cropped and removed. The live assets are `group.jpg`, `bg-*.jpg`
>   and `p-*.jpg` — see [FEATURES.md](FEATURES.md) for the current list.
>
> For everything else — architecture, features, data, deployment — start at
> [README.md](README.md).

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
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#0e0c10">
<meta name="apple-mobile-web-app-title" content="HGS">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black">
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
Entry shapes — movies: `{id, title, description?, url?, createdAt, watched?, watchedAt?}` (**description OPTIONAL**; `watched` bool + `watchedAt` "YYYY-MM-DD" set via the list checkbox) · workshops: `{id, title, description, host, date?, createdAt}` · blog: `{id, title, text, mood: 'top'|'flop', images?: [{src, caption?}], createdAt}`.
Blog-Bilder: im Formular auswählbar (`type: "images"`), werden im Browser auf max. 1600px/JPEG q0.82 verkleinert und über `HGSStore.uploadImage(name, base64, code)` als eigene Datei nach `hgs-data/images/` geschrieben; im Eintrag steht nur die URL. Klick auf ein Bild öffnet die Vollbild-Ansicht (Pfeiltasten blättern, Esc schließt). `src` darf auch ein seiteneigener Pfad sein (`/assets/img/…`).
Movies render as a checkable LIST (`listMode`/`watchable` in board.js), not a card grid: checkbox = "gesehen", checking opens an inline "Wann geschaut?" date field; every state change goes through the same code gate. /filme/ also has a TMDB-based recommendations section (`assets/js/recommendations.js`, see RECOMMENDATIONS_PLAN.md — API key injected at deploy time via `.github/workflows/pages.yml`, never committed).

## Board-page photo backgrounds (round 3)
`/assets/img/bg-filme.jpg` (WG im Heimkino, ~1:1), `/assets/img/bg-workshops.jpg` (Basteltisch, ~2:1), `/assets/img/bg-blog.jpg` (Fußballplatz, ~1:1). Used as fixed, heavily dimmed full-page backgrounds behind the boards (dark scrim so cards stay readable, subtle slow effect allowed — keep text contrast first).

## Hidden album page (orchestrator-owned)
`/chebter-one/` — full-screen player for the HGS-produced album "Chebter One (Remastered)" (tracks at `/assets/audio/01.mp3` … `10.mp3`). NOT in the main nav. Agent A links it subtly from Cheb's tile on /wg/.

## Delete security
Delete must ALWAYS ask for the WG code — the sessionStorage code cache applies to add/edit only.

## File ownership (touch nothing outside your list)
- Orchestrator: `base.css`, `store.js`, `config.js`, `data/*.json`, `DESIGN.md`, `README.md`, image crops, `chebter-one/index.html`, `/assets/css/album.css`, `/assets/js/album.js`
- Agent A: `index.html` (landing), `wg/index.html`, `/assets/css/home.css`
- Agent B: `filme/index.html`, `workshops/index.html`, `blog/index.html`, `/assets/css/board.css`, `/assets/js/board.js`

# HGS — Design- & Code-Contract

Statische Website (GitHub Pages, project site unter `/hgs/`). **Nur Vanilla HTML/CSS/JS, keine Frameworks, keine Build-Tools. Alle Links/Pfade relativ** (`about.html`, `assets/css/base.css`, …).

## Thema
Rooftop-Sonnenuntergang (wie das WG-Foto): dunkles Violett → warmes Orange. Verspielt, warm, poster-artig. Sprache der Inhalte: **Deutsch**.

## Seiten
- `index.html` — Landing (Hero mit Sky-Gradient, Teaser auf die anderen Seiten)
- `about.html` — Die WG: generiertes Artwork (`assets/img/wg-art.svg`) + 7 Bewohner:innen-Karten
- `movies.html` — Whiteboard: Filmliste (Titel, Kurzbeschreibung, JustWatch-Link)
- `workshops.html` — Whiteboard: Workshops (Titel, Beschreibung, Host, optionales Datum)

## Design-Tokens & Komponenten (in `assets/css/base.css`, NICHT ändern — nur benutzen)
- Farben: `--bg`, `--bg-soft`, `--card`, `--ink`, `--ink-soft`, `--accent` (Sonnenorange), `--accent-2` (Pink), `--line`
- Fonts: `--font-display` (Fraunces), `--font-body` (Inter) — via Google Fonts, Link-Tag steht im Head-Snippet unten
- Komponenten: `.site-nav` (+ `.nav-links`, `.nav-brand`), `.container`, `.hero`, `.section`, `.section-title`, `.card`, `.grid`, `.btn` / `.btn-primary` / `.btn-ghost`, `.tag`, `.field` + `.input`, `.modal` (+ `.modal-backdrop`, `.modal-card`), `.toast`, `.site-footer`

## Head-Snippet (auf jeder Seite identisch)
```html
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>… · HGS</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700;9..144,900&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/css/base.css">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🌇</text></svg>">
```

## Navigation (auf jeder Seite identisch, aktiven Link mit `aria-current="page"` markieren)
```html
<nav class="site-nav">
  <a class="nav-brand" href="index.html">HGS<span class="brand-dot">.</span></a>
  <div class="nav-links">
    <a href="index.html">Start</a>
    <a href="about.html">Die WG</a>
    <a href="movies.html">Filme</a>
    <a href="workshops.html">Workshops</a>
  </div>
</nav>
```

## Footer (identisch überall)
```html
<footer class="site-footer">
  <p>HGS — unsere WG überm Dach der Stadt. Mit 🧡 selbst gebaut.</p>
</footer>
```

## Whiteboard-Datenlayer (`assets/js/store.js`, NICHT ändern — nur benutzen)
```js
HGSStore.load(kind)                    // Promise<Entry[]> — kind: 'movies' | 'workshops'
HGSStore.save(kind, entries, code)     // Promise<void> — wirft Error('bad-code') bei falschem Code
HGSStore.verifyCode(code)              // Promise<boolean>
HGSStore.newId()                       // string
```
Entry movies: `{id, title, description, url, createdAt}` · workshops: `{id, title, description, host, date?, createdAt}`.
Lesen ist frei; jede Schreiboperation (neu/ändern/löschen) verlangt den Code via Modal. Richtigen Code für die Session merken (`sessionStorage['hgs-code']`) und bei `save` wiederverwenden.

## Datei-Ownership (WICHTIG: nichts außerhalb der eigenen Liste anfassen)
- Orchestrator: `base.css`, `store.js`, `config.js`, `data/*.json`, `DESIGN.md`, README
- Agent A: `index.html`, `about.html`, `assets/css/home.css`, `assets/img/wg-art.svg`
- Agent B: `movies.html`, `workshops.html`, `assets/css/board.css`, `assets/js/board.js`

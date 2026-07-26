# HGS 🌇

The website of our shared flat — live at **[hgs.house](https://hgs.house/)**.

## Pages

| Page | Path | Description |
|---|---|---|
| Home | `/` | Full-screen rooftop hero, quick links to everything |
| WG | `/wg/` | Who lives here — portraits & bios |
| Filme | `/filme/` | Shared watchlist (movies we still need to watch) |
| Workshops | `/workshops/` | Who teaches whom what |
| Blog | `/blog/` | Great (and not so great) moments |

## Shared boards

Everyone can **read** the boards. **Adding, editing or deleting** entries requires the
flat's access code (you know — it's on the fridge 😉).

Entries are stored as JSON in the [`hgs-data`](https://github.com/bernhardkreminski/hgs-data)
repo and written via the GitHub API. The token used for writes is encrypted with the
access code (PBKDF2 + AES-GCM) in `assets/js/config.js` and only has write access to
`hgs-data` — worst case someone scribbles on the whiteboard, and git history lets us
restore it anytime.

Switch storage backend: `assets/js/config.js` → `backend: "github" | "local"`.

## Development

No build step, no framework — plain HTML/CSS/JS. Locally:

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

Note: pages use root-absolute paths (`/assets/…`), so serve from the repo root.
Design system & conventions: see [`DESIGN.md`](DESIGN.md).

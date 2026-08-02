# HGS 🌇

The website of our shared flat — live at **[hgs.house](https://hgs.house/)**.

## Pages

| Page | Path | Description |
|---|---|---|
| Home | `/` | Full-screen rooftop hero, quick links to everything |
| WG | `/wg/` | Who lives here — portraits & bios |
| Filme | `/filme/` | Shared watchlist, taggable by mood and filterable |
| Workshops | `/workshops/` | Who teaches whom what |
| Blog | `/blog/` | Great (and not so great) moments, with photos |
| Album | `/chebter-one/` | Hidden player for our own album — find it on the WG page |
| Impressum | `/impressum/` | Legally required details, linked in every footer |
| Datenschutz | `/datenschutz/` | What data the site touches, and what it doesn't |

## Shared boards

Everyone can **read** the boards. **Adding, editing or deleting** entries requires the
flat's access code (you know — it's on the fridge 😉).

Entries are stored as JSON in the [`hgs-data`](https://github.com/bernhardkreminski/hgs-data)
repo and written via the GitHub API. The token used for writes is encrypted with the
access code (PBKDF2 + AES-GCM) in `assets/js/config.js` and only has write access to
`hgs-data` — worst case someone scribbles on the whiteboard, and git history lets us
restore it anytime.

Switch storage backend: `assets/js/config.js` → `backend: "github" | "local"`.

On a phone, **pull down** at the top of a page to fetch the latest entries.

## Daily digest

A GitHub Action mails a summary every morning at **09:00** — everything added,
edited or deleted on the boards since the last one. Nothing happened, no mail.
Same mechanism as the sibling project rosencri.me: poll, diff against a
committed snapshot, send through our own SMTP client — no third-party mail
action, no npm install. The recipient address and the SMTP login live in
repository secrets, never in the repo; setup is in
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Development

No build step, no framework — plain HTML/CSS/JS. Locally:

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

Note: pages use root-absolute paths (`/assets/…`), so serve from the repo root.

## Documentation

Full documentation lives in [`docs/`](docs/README.md) — architecture, every
feature, the data store, deployment, security and the traps worth knowing.
**Start at [`docs/README.md`](docs/README.md).**

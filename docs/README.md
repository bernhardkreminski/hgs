# HGS — documentation

Documentation for the website of a seven-person shared flat ("WG") in Germany.
**Written for someone (or some agent) arriving with zero context.**

- **Live:** <https://hgs.house/>
- **Site repo:** `bernhardkreminski/hgs` (this repo) — deploys `main` straight to production
- **Data repo:** `bernhardkreminski/hgs-data` — holds the user-editable board content as JSON
- **Site language:** German (all user-facing copy). **Docs and commit messages: English.**

## Read in this order

| Doc | What it answers |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | What the stack is, what every file does, how a page boots |
| [FEATURES.md](FEATURES.md) | Every feature that exists, and where its code lives |
| [DATA-STORE.md](DATA-STORE.md) | How entries are stored, the schemas, the access-code gate |
| [DEPLOYMENT.md](DEPLOYMENT.md) | How it ships, the TMDB secret, credential realities |
| [SECURITY.md](SECURITY.md) | Honest assessment — read before touching the code gate |
| [GOTCHAS.md](GOTCHAS.md) | Traps that cost real time. Read before debugging anything |
| [OPEN-ITEMS.md](OPEN-ITEMS.md) | Unfinished work and sensible next steps |
| [DESIGN.md](DESIGN.md) | Binding visual/code contract. Follow it for any UI work |

## 60-second orientation

Plain **static HTML/CSS/JS**. No framework, no build step, no bundler, no
dependencies. Files are served exactly as they sit in the repo. If you find
yourself adding a package manager, stop and reconsider — the whole point is that
any flatmate can open a file and understand it.

Five public pages plus one hidden one:

```
/               Landing — full-screen rooftop photo, statement headline
/wg/            The people — 8 portrait tiles, fun fact on hover
/filme/         Movie watchlist — checkable, with TMDB recommendations
/workshops/     Who teaches whom what
/blog/          Moments, with photos and a full-screen viewer
/chebter-one/   Hidden album player (noindex, linked only from Cheb's tile)
```

Three of those (`/filme/`, `/workshops/`, `/blog/`) are **shared boards**: anyone
can read them, but adding/editing/deleting requires a 4-digit access code
(**1312**), and the content lives in a separate GitHub repo so all flatmates see
the same lists.

## Running it locally

Paths are **root-absolute** (`/assets/css/base.css`), so you must serve the repo
root — opening `index.html` via `file://` will not work.

```bash
cd /path/to/hgs && python3 -m http.server 8000
```

Then open <http://localhost:8000>. Note that with `backend: "github"` in
`assets/js/config.js`, a local page still reads and **writes the real shared
data**. Don't test writes casually — see [DATA-STORE.md](DATA-STORE.md).

## Conventions that matter

1. **Clean URLs.** Never expose `.html` in a link. Pages are directories with an
   `index.html`. Link to `/filme/`, never `/filme/index.html`.
2. **Root-absolute paths** everywhere, for assets and links alike.
3. **German for anything a visitor reads**; English for docs, comments are mixed
   (older code has German comments — that's fine, don't churn it).
4. **`base.css` is a contract.** Use its tokens and components; don't redefine
   them in page CSS. See [DESIGN.md](DESIGN.md).
5. **XSS-safety is deliberate.** All user content is rendered via `textContent`
   and DOM building — never `innerHTML` with stored data. Keep it that way; the
   boards accept arbitrary text from anyone who knows the code.

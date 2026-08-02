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
JustWatch link, rendered as an orange pill chip) and `tags` (optional).

### Tags and mood filter

**Code:** `board.js` — `MOOD_TAGS`, the `type: "tags"` field, `renderFilters`,
`matchesFilter` · markup hook: `<div id="board-filters">` in `filme/index.html`

Movies (and only movies — `taggable: true`) carry a list of tags:

- **Moods** come from a fixed list in `MOOD_TAGS`, tapped on/off in the form:
  Zum Lachen, Spannend, Zum Weinen, Gruselig, Zum Nachdenken, Herzerwärmend,
  Action, Feelgood, Verstörend, Romantisch, Nebenbei, Anspruchsvoll. A fixed list
  keeps "Zum Lachen"/"zum lachen"/"lustig" from all existing side by side.
- **Own tags** are free text (genre, "WG-Kino", a director), added with Enter or
  "+ Tag", max 24 characters, de-duplicated ignoring case.
- The **emoji is presentation only** (`tagLabel`) — the JSON holds plain text.

Above the list sits a filter bar of every tag actually in use, each with a count,
plus an "Alle" chip. Selecting several tags means **or** — anything carrying at
least one of them shows. (With moods, "and" would be empty almost every time.)
Tag chips on a row are buttons too: tapping one filters by it. The filter is
in-memory only and applies to both groups; the group placeholders change to
"Nichts Offenes mit diesen Tags." while filtering, and an empty result offers a
reset button. Tags that no longer exist drop out of the filter automatically.

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

---

## 11. Pull-to-refresh

**Files:** `assets/js/pull-to-refresh.js`, `assets/css/pull-refresh.css`

Drag down at the top of any page (except the album player) and the site
refreshes — the gesture people expect on a phone, and the fastest way to see
what a flatmate just entered.

- Touch only. On desktop nothing is attached; `HGSRefresh.run()` still works.
- Ignored unless the page is scrolled to the very top, when the gesture starts
  sideways, and while a modal, the lightbox or an inline date field is open.
- The pull is damped (factor 0.55, capped at 120 px); past 72 px the indicator
  turns orange and releasing triggers the refresh.
- Board pages register `reloadEntries(true)` — data is re-fetched **without a
  page reload**, and a toast confirms ("Aktualisiert."). Every other page falls
  back to `location.reload()`.
- `overscroll-behavior-y: contain` on `html` (in `pull-refresh.css`) keeps
  Chrome's own pull-to-refresh from firing on top of ours.

Adding it to a new page: load the CSS in the head and the script **before**
`board.js`.

---

## 12. Morning email digest

**Files:** `.github/workflows/notify.yml`, `.github/scripts/notify-changes.mjs`,
`.github/scripts/smtp.mjs`, `.github/notify-state.json`
· setup walkthrough: [DEPLOYMENT.md](DEPLOYMENT.md)

One mail a morning at **09:00**, listing everything added, edited or deleted on
the three boards since the last digest. Nothing changed means no mail.

The mechanism is lifted from the sibling project **rosencri.me** (`scripts/`
there): poll, diff against a committed snapshot, send through our own SMTP
client. No third-party mail Action, no npm install, no server.

```
.github/workflows/notify.yml     4 morning slots, sends once
        │
        ▼
.github/scripts/notify-changes.mjs
        │  GET movies/workshops/blog.json  ──►  hgs-data (public, via the API)
        │  compare against .github/notify-state.json
        │  nothing changed ──► exit, no mail, no commit
        ▼
.github/scripts/smtp.mjs  ──►  your SMTP provider  ──►  your inbox
        │
        ▼
commit .github/notify-state.json  [skip ci]
```

Entries carry no `updatedAt`, so the data cannot say what changed. Each run
stores a snapshot of the tracked fields per entry and diffs it against the
previous run's. **The very first run sends nothing** — with no previous state
everything would look new, so it records a baseline and stops.

The snapshot holds only what the site already shows publicly, never the
recipient address. `lastMailedOn` in the same file is what keeps it to one mail
a day.

### Cadence — hitting 09:00 all year

GitHub cron is UTC and ignores DST, so no single expression is 09:00 local in
both halves of the year. The workflow fires **four candidate slots**
(`0 7,8,9,10 * * *`) and the script sends on the **first slot at or after 09:00
Berlin**, recording the date so the rest do nothing.

|  | 07 UTC | 08 UTC | 09 UTC | 10 UTC |
|---|---|---|---|---|
| summer (CEST) | **09:00 → sends** | 10:00 skip | 11:00 skip | 12:00 skip |
| winter (CET) | 08:00 too early | **09:00 → sends** | 10:00 skip | 11:00 skip |

The spare slots also absorb GitHub starting scheduled jobs late. A **manual
dispatch ignores the gate** and sends whatever is pending — `NOTIFY_DIGEST_HOUR`
is only set for `schedule` events.

Consequence worth knowing: a change made at 09:05 is reported the *next* morning.

### What the mail looks like

Subject is the change itself when there is one (`HGS: neuer Film „…"`), a count
when there are several. The body groups changes by board, and each change is a
card: orange **NEU**, outlined **GEÄNDERT** with the changed fields struck
through as `vorher → nachher`, pink **GELÖSCHT**. Movie cards show tags and the
watched date, workshops the host and date, blog entries mood and picture count.

Sent as `multipart/alternative` — plain text first, then HTML, so a terminal
mail reader and a notification preview both stay readable. The HTML is
deliberately old-fashioned (tables, inline styles, no images, no `<style>`
block): Gmail strips embedded stylesheets, blocks remote content and ignores
flexbox. The palette is the site's own, dark and warm.

To look at it without sending:

```bash
NOTIFY_DRY_RUN=1 NOTIFY_DUMP_HTML=/tmp/mail.html \
NOTIFY_STATE_PATH=/tmp/state.json node .github/scripts/notify-changes.mjs
```

Run it once to write the baseline, change something on a board, run it again.
`SMTP_DEBUG=1` traces the SMTP conversation (credentials are never traced) —
that trace is the only practical way to see why a provider is unhappy.

### Failure behaviour

| Situation | What happens |
|---|---|
| Secrets not set | Job succeeds, logs that it skipped. Nothing breaks before setup. |
| `hgs-data` unreachable | Job **fails**, state untouched, next run retries. |
| SMTP rejects the mail | Job **fails**, state untouched — the change is reported next run rather than lost. |
| State file missing or in an older format | Silently re-baselines. No mail. |
| Every slot delayed past 10:00 local | That day's digest is skipped; changes go out the next morning. |

The state file is written **only after** the mail is accepted. That ordering is
the whole failure design: a crash can produce a duplicate notification, never a
missing one.

---

## 13. Impressum & Datenschutz

**Files:** `impressum/index.html`, `datenschutz/index.html`, `legal.css`

Ported from the sibling project rosencri.me and rewritten for what this site
actually does. Both are `noindex, follow`, linked from the footer of every page,
and use the same operator details — HGS *is* Heilig-Geist-Straße.

What differs from rosencri.me's versions, and matters if you edit them:

- **No third-party requests to disclose.** Archivo and Inter are served from
  `/assets/fonts/`, so §2 can state plainly that nothing is loaded from Google.
  (The policy briefly had a Google Fonts section; it was deleted the moment the
  fonts moved in-house. Re-add it if a `<link>` to any CDN ever comes back.)
- **Entries live in a public GitHub repo**, and git history keeps deleted ones.
  The warning box in §4 says that outright — it's the one paragraph a flatmate
  should actually read before typing someone's phone number into a blog post.
- **Writing needs the WG code**, so the "anyone can edit anything" wording of
  the original does not apply. The Impressum says entries come from residents
  and are not pre-checked.
- **TMDB** gets its own section: `/filme/` sends film titles and the visitor's
  IP to TMDB, and only that page does.
- The **daily digest** is disclosed too, along with what it does *not* contain
  (no IP addresses, no idea who typed what).

Contact throughout is `kontakt@hgs.house`, forwarded to a private mailbox at the
registrar, so no personal address appears on the site.

`/chebter-one/` has no footer at all (it's a full-screen player); it stays
unlinked from the footer pair and is reachable only from `/wg/`.

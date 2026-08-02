# Gotchas

Traps that cost real time during development. Check here before debugging.

## Data & storage

**`raw.githubusercontent.com` serves stale content for minutes after a write.**
Cache-busting query strings do *not* help. This caused entries to silently
disappear from boards — the writer saw their change (rendered from memory) while
everyone else, and any reload, saw an older list. Fixed by reading through the
GitHub contents API, with raw only as a fallback. **Don't revert that.**

**An open page does not poll.** It refreshes on tab focus (throttled 10 s). If
you're comparing two devices, focus the tab before concluding something is broken.

**Writes replace the entire array.** There's no per-entry update, so two people
saving at once means last-write-wins. A stale-SHA `409` is retried once.

**`data/*.json` is not production data.** It seeds the `local` backend only.
Production reads `hgs-data`. Editing `data/movies.json` changes nothing live.

**Local dev writes to real shared data** when `backend: "github"`. Flip to
`"local"` in your working copy before experimenting (and don't commit that).

## Deployment

**Pages source must be "GitHub Actions"**, not "Deploy from a branch". With the
branch setting the workflow can't deploy and the TMDB key never reaches the site.

**A green Actions run doesn't mean the CDN caught up.** Verify by fetching the
actual asset with a cache-buster.

**Don't delete `CNAME`.** A deploy without it drops the custom domain.

**Use the TMDB *v3 API key*, not the v4 read token.** The v4 JWT needs a Bearer
header; the code sends `?api_key=` and will just fail quietly.

**The morning digest reads `hgs-data`, not this repo.** "nothing changed" in the
`notify` run usually means it really was quiet — check
`gh api "repos/bernhardkreminski/hgs-data/commits?per_page=5"` before suspecting
the script. Missing mail secrets are a logged **skip**, not a failure.

**The first digest run after setup sends nothing.** It records the baseline
snapshot; there is nothing to compare against yet. Same after
`.github/notify-state.json` is deleted or its `version` changes.

**A dry run does not consume the diff, a real run does.** Once the mail is away
the snapshot is updated, so re-running reports nothing. To re-see a digest,
revert the state file commit.

**Scheduled workflows get disabled after 60 days without repo activity.** If the
digest simply stops arriving, look there first — GitHub also mails a notice.

## Front end

**Pull-to-refresh must stay on a non-passive `touchmove` listener.** It calls
`preventDefault()` to stop the browser's own rubber-band/refresh; with
`{ passive: true }` that call is ignored and you get both gestures at once.

**Movie tag emoji live in `MOOD_TAGS`, not in the data.** Entries store plain
text like `"Zum Lachen"`. Renaming a mood therefore orphans the tag on existing
entries (it stays, just without an emoji) — rename in the data too if it matters.

## Credentials

**`gh api … --jq .permissions` showing `push: true` proves nothing** about
whether a token can push — that's the *account's* permission, not the *token's*
scopes. A fine-grained PAT without `Contents: write` produces
`Permission to bernhardkreminski/hgs.git denied to bernhardkreminski`, naming the
owner, which reads like a bug but isn't.

**Two different tokens exist**: one scoped to `hgs` (site, for pushing) and one
scoped to `hgs-data` (board writes, encrypted in `config.js`). Neither works for
the other's repo.

**`export GH_TOKEN=…` doesn't persist between separate shell invocations.**
Prefix each command, or run `gh auth login --web` once and be done.

## iOS / icons

**iOS ignores `data:` URI favicons for home-screen icons.** The original emoji
favicon worked in browser tabs but produced a page screenshot on the home screen.
A real `apple-touch-icon.png` (180×180, opaque) is required.

**iOS caches the home-screen icon per shortcut, permanently.** After changing the
icon you must delete the shortcut and re-add it; nothing else refreshes it.

**`display: standalone` removes browser chrome** — no back button. Intentional
here, but it surprises people. Drop `apple-mobile-web-app-capable` and the
manifest `display` to revert.

## Images & tooling

**`sips --cropOffset 0 0` is ignored** and silently centre-crops instead. Use an
offset of `1` when you mean zero. This produced several wrong portrait crops.

**An `<img>` `height` attribute overrides CSS `aspect-ratio`.** A group photo
refused to letterbox until `height="…"` was replaced with `height: auto` in CSS.

**`qlmanage -t -s 512 -o <dir> file.svg`** rasterises SVG → PNG on macOS without
any dependency. Useful — no ImageMagick, no PIL, no npm needed. Then `sips -z N N`
to resize.

**Neither PIL nor ImageMagick nor Node is installed.** Available: `python3`
(stdlib only), `sips`, `qlmanage`, `curl`, `gh`.

## Browser preview tooling

The in-app preview pane is **flaky about scrolling and screenshots** — `scroll`
can time out, `scrollIntoView` may not move the viewport, and screenshots
sometimes return a half-rendered or stale frame. Workarounds that worked:

- Verify via `javascript_tool` DOM queries rather than screenshots
- To photograph something below the fold, temporarily `display: none` the
  sections above it via JS, screenshot, then reload
- Assets are cached aggressively; append `?v=<timestamp>` or re-fetch with
  `{cache:'reload'}` after editing CSS/JS

## Code structure

**`board.js` drives all three boards.** A change to the engine affects movies,
workshops *and* blog. Prefer changing `CONFIGS[kind]`.

**The edit flow preserves unknown fields** via `Object.assign({}, entry, data)`,
which is why adding `watched`/`images` didn't break existing entries.

**One code prompt per user action.** `resolveImages` obtains the code, then hands
it to `saveEntries` via `{code}`. If you add another write path, thread the code
the same way or users get asked twice.

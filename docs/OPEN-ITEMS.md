# Open items & next steps

State as of the last session. Nothing here is broken in production — these are
unfinished requests, known trade-offs and sensible improvements.

## Requested but not delivered

### QR code to the website — **not done**

The user asked for a QR code linking to <https://hgs.house/>. Work started but
never completed (tooling check was interrupted). Nothing was created.

Notes for whoever picks it up:

- No QR tooling is installed. Checked: no `qrencode`, no Python `qrcode`/`segno`,
  no Node, no PIL.
- Options: install `segno` into a throwaway venv (`python3 -m venv`, keeps the
  system clean), `brew install qrencode`, or implement encoding by hand (a
  version 2–3 byte-mode QR for a 19-character URL — doable but a lot of code for
  the value).
- Avoid third-party web QR generators if it can be helped; the URL is public so
  it's not a leak, but it adds a needless external dependency.
- Suggested output: an **SVG** (crisp for printing on the flat door) plus a PNG.
  Dark modules `#0e0c10` on cream `#f2efe9` stays on-brand while keeping the
  contrast scanners need. Don't tint the modules themselves.
- Ask whether it should also appear *on* the site (e.g. a small print-friendly
  block) or just be a file to share — the original request was ambiguous.

### Instant mail on every change — **not done, by design of where the code can live**

The request was "mail me when something is added or edited", delivered as "one
update in the morning". The morning digest does that (see
[FEATURES.md](FEATURES.md) §12). A mail *within seconds of each edit* is not
possible from this repo: the writes land in **`hgs-data`**, and only a workflow
**in that repo** sees them.

If it's wanted later, the shape is small:

- Add `.github/workflows/notify-on-push.yml` to `hgs-data`, triggered on
  `push: paths: ["*.json"]`, running the same two scripts (copy them over, or
  fire a `repository_dispatch` back to `hgs` so the formatting stays here).
- The mail secrets have to be created in `hgs-data` as well — secrets are
  per-repo.
- Expect several mails per session: every checkbox tick is its own commit. That
  noisiness is the reason the digest is the better default.

A middle ground needs no second repo at all: keep the workflow here, drop
`NOTIFY_DIGEST_HOUR` from `notify.yml` and set the cron to `*/30 * * * *`. Half
an hour late, one mail per burst, and nothing else changes.

## Known trade-offs (deliberate, revisit if priorities change)

- **The board access code is not real security.** The write token is recoverable
  from the published page. Full reasoning and the proper fix (a serverless proxy)
  in [SECURITY.md](SECURITY.md).
- **Last-write-wins.** Simultaneous saves from two devices overwrite each other's
  array. Fine at flat scale; a per-entry merge would need a real backend.
- **TMDB recommendations have no rate-limit backoff.** Harmless with a handful of
  watched films; would need throttling if the list grows a lot.
- **Recommendation cache is per device** (`localStorage`, 7-day TTL). Each
  flatmate's browser does its own first fetch.
- **Album files are ~45 MB in the repo.** Fine for GitHub Pages today. If more
  albums appear, consider moving audio out of the site repo.
- **Standalone display mode** means the iOS home-screen shortcut has no back
  button. Intentional, but easy to reverse (see [GOTCHAS.md](GOTCHAS.md)).

## Housekeeping

- **Rotate development PATs.** Tokens were pasted into chat during development
  and should be considered compromised:
  <https://github.com/settings/personal-access-tokens>
- The **`hgs-data` write token** in `config.js` is fine to keep until you want a
  rotation; procedure is in [DATA-STORE.md](DATA-STORE.md).
- `data/*.json` drifts from live `hgs-data` content over time. That's harmless
  (it only seeds the `local` backend) but don't mistake it for a backup.

## Ideas that would genuinely improve things

Roughly in order of value per effort:

1. **Serverless write proxy** — removes the only real security weakness and
   allows a longer/rotatable code. `store.js` is the single choke point, so the
   client change is small.
2. **A "Neu laden" control on the recommendations block** so nobody needs the
   console to bust the 7-day cache. Previously scoped at ~15 lines.
3. **Images for workshops and movies too.** The image field, upload path and
   lightbox are already generic — only `CONFIGS[kind].fields` and the body
   renderer need extending.
4. **Backup of `hgs-data`.** Git history is the current safety net; a scheduled
   export would be sturdier.
5. **Empty-state polish on `/filme/`** when everything is watched (currently a
   single friendly line).

# Data store

All user-editable board content lives in a **separate public repo**,
`bernhardkreminski/hgs-data`, written directly from the browser via the GitHub
API. There is no server.

```
hgs-data/
├─ movies.json
├─ workshops.json
├─ blog.json
├─ images/        uploaded blog pictures
└─ README.md
```

Why a second repo: writes must not touch the site repo (a bad write can't break
the site or trigger a deploy), and the write token stays scoped to data only.

## The two backends

`assets/js/config.js` → `backend`:

| Value | Behaviour |
|---|---|
| `"github"` | **Current setting.** Shared storage in `hgs-data`. |
| `"local"` | `localStorage` per device, seeded from `data/*.json`. Useful for offline UI work; entries are then per-browser and invisible to others. |

The `data/*.json` files in *this* repo are only the seed for the `local`
backend, plus a readable snapshot. They are **not** what production reads.

⚠️ With `backend: "github"`, a page served from `localhost` still reads **and
writes the real shared data**. Don't test writes casually. To experiment safely,
flip to `"local"` in your working copy (and don't commit that).

## Entry schemas

```jsonc
// movies.json
{
  "id": "e-…",                 // HGSStore.newId()
  "title": "Die Nackte Kanone", // required
  "description": "…",           // OPTIONAL
  "url": "https://www.justwatch.com/…", // optional; only http(s) is rendered
  "tags": ["Zum Lachen", "WG-Kino"],    // optional; moods from a fixed list + own tags
  "watched": true,              // set by the row checkbox
  "watchedAt": "2026-05-22",    // YYYY-MM-DD, local date
  "createdAt": "2026-07-26T12:00:00.000Z"
}

// workshops.json
{
  "id": "…", "title": "…", "description": "…", "host": "Berni",
  "date": "2026-08-03",        // optional
  "createdAt": "…"
}

// blog.json
{
  "id": "…", "title": "…",
  "text": "Absatz eins.\n\nAbsatz zwei.",   // blank line = new paragraph
  "mood": "top",                            // "top" | "flop"
  "images": [                               // optional
    { "src": "https://raw.githubusercontent.com/…/images/e-….jpg",
      "caption": "…" }                      // src may also be "/assets/img/…"
  ],
  "createdAt": "…"
}
```

Unknown fields are preserved on edit (`Object.assign({}, entry, data)`), so
adding a field to the schema won't silently drop data on the next save.

**Tags** are plain strings. The mood tags come from `MOOD_TAGS` in `board.js` —
the emoji lives there, never in the data, so renaming an emoji doesn't rewrite
entries. Own tags are free text (max 24 chars, de-duplicated case-insensitively).
Entries written before this field simply have no `tags` key; everything treats
that as an empty list.

## API

```js
HGSStore.load(kind)                       // Promise<Entry[]>
HGSStore.save(kind, entries, code)        // whole array; throws Error('bad-code')
HGSStore.uploadImage(name, base64, code)  // Promise<rawUrl>
HGSStore.verifyCode(code)                 // Promise<boolean>
HGSStore.newId()                          // "e-<base36>-<random>"
```

**Writes replace the whole array.** There is no per-entry endpoint. Two people
saving simultaneously means last-write-wins for the array; a `409` (stale SHA) is
retried once automatically.

### Reads go through the API, not the CDN

`load()` fetches
`https://api.github.com/repos/…/contents/<kind>.json` with
`Accept: application/vnd.github.raw`, falling back to `raw.githubusercontent.com`
only on error (e.g. rate limit).

This is **load-bearing**: `raw.githubusercontent.com` serves stale content for
minutes after a write, regardless of cache-busting query strings, which caused
entries to silently go missing. Unauthenticated API reads are limited to 60/hour
per IP — ample for a flat, and the CDN fallback covers the limit. **Don't
"simplify" this back to raw.**

### Writes and the token

`save()` and `uploadImage()`:

1. Verify the code against `codeHash`
2. Derive an AES-GCM key from the code via PBKDF2 (150 000 iterations, SHA-256)
3. Decrypt `HGS_CONFIG.github.encToken` → a fine-grained PAT with
   `Contents: write` scoped to `hgs-data` only
4. `PUT` to the contents API (fetching the current SHA first)

A wrong code fails at step 3 as an AES-GCM integrity error, surfaced as
`Error('bad-code')`.

**This means the token ships to every visitor in encrypted form. It is
recoverable — see [SECURITY.md](SECURITY.md) before relying on it.**

## Rotating the hgs-data token

There is no script for this yet; it's manual:

1. Create a fine-grained PAT: repository access **only `hgs-data`**,
   permission **Contents: Read and write**
2. In a browser console on the live site, encrypt it with the access code:

```js
(async () => {
  const token = "PASTE_TOKEN", code = "1312", enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const km = await crypto.subtle.importKey("raw", enc.encode(code), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({name:"PBKDF2", salt, iterations:150000, hash:"SHA-256"},
                km, {name:"AES-GCM", length:256}, false, ["encrypt"]);
  const data = new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM", iv}, key, enc.encode(token)));
  const b64 = u => btoa(String.fromCharCode(...u));
  return JSON.stringify({salt: b64(salt), iv: b64(iv), data: b64(data)});
})()
```

3. Paste the result into `github.encToken` in `assets/js/config.js`, commit, deploy
4. Revoke the old PAT

Changing the **access code** means recomputing `codeHash`
(`echo -n "NEWCODE" | shasum -a 256`) *and* re-encrypting the token with it, since
the code is the encryption key.

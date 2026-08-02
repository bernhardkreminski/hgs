# Security — honest assessment

Read this before extending the access-code system or telling anyone the boards
are "protected".

## Summary

| Item | Status |
|---|---|
| Credentials in git history | ✅ None. Verified across all commits. |
| Credentials in the working tree | ✅ None. |
| `hgs-data` write token | 🔴 **Effectively public.** Recoverable from the live site in minutes. |
| TMDB API key | 🟡 Public by necessity. Low value, read-only. |
| XSS in board rendering | ✅ Mitigated — all user content via `textContent`/DOM building. |

## 🔴 The write token is recoverable

`config.js` publicly ships `codeHash`, the AES-GCM-encrypted `encToken`, and the
fact that the key is PBKDF2(code, 150 000, SHA-256).

The access code is **4 digits — 10 000 possibilities**.

- Recovering the code from `codeHash` by brute force takes **~0.001 s** (measured,
  unsalted SHA-256 over all 10 000 candidates).
- Feeding those same 10 000 candidates through PBKDF2 against `encToken` costs
  roughly 50 ms each — the entire keyspace in **under 10 minutes on a laptop**,
  seconds on a GPU.

So anyone who views source can decrypt the token. The encryption buys essentially
nothing against a secret this small; it only raises the effort from "copy-paste"
to "run a short script".

**Blast radius is deliberately small**, which is why this was an accepted
trade-off rather than an oversight:

- The token is fine-grained: `Contents: write` on **`hgs-data` only**
- It cannot touch the site repo, the account, or any other repo
- Worst case: someone vandalises the board JSON or adds junk to `images/`
- Everything is recoverable via `hgs-data`'s git history

Since the image upload feature landed, that token also permits writing arbitrary
files into `hgs-data/images/` — a slightly wider surface than text-only writes,
same blast radius.

**Do not** extend this scheme to anything that matters (real accounts, payments,
private data). If the boards ever need genuine protection, see below.

## 🟡 The TMDB key

The deployed `config.js` contains a 32-character v3 key readable by any visitor.
Git history is clean — the workflow injects it only into the published artifact.
On a static site with no backend this is unavoidable: any key the browser uses is
public. It's read-only; abuse means burning the rate limit. Rotate at
themoviedb.org if that happens.

## ✅ What is actually solid

- **No credential has ever been committed.** Confirmed by scanning every commit
  in history for PAT/key patterns.
- **XSS-safe rendering.** All stored content is inserted via `textContent` or
  built as DOM nodes; `innerHTML` is never used with user data. The boards accept
  arbitrary text from anyone with the code, so **keep it that way**.
- **URL handling.** Only `http(s)` links are rendered as anchors; other schemes
  (`javascript:` etc.) are ignored.
- **Delete is gated harder than add/edit** — always re-asks for the code.

## The real fix, if wanted

Stop shipping a write token to browsers. A small serverless proxy — Cloudflare
Worker, Netlify or Vercel function — holds the token as a server-side secret and
verifies the code server-side. The client then calls the proxy instead of the
GitHub API. Free at this scale, roughly 50 lines, and `store.js` is already the
single choke point for every read and write, so only that file changes.

Until then, the honest description is: **a lock on the garden gate**. Fine for a
flat's film list; not security.

## Operational hygiene

- Personal access tokens have been pasted into chat transcripts during
  development. Any token that appears in a transcript should be considered
  compromised and rotated at
  <https://github.com/settings/personal-access-tokens>.
- Rotation procedures for both the `hgs-data` token and the access code are in
  [DATA-STORE.md](DATA-STORE.md).

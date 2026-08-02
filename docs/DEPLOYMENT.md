# Deployment

## Pipeline

`main` → GitHub Actions → GitHub Pages → <https://hgs.house/>

Every push to `main` triggers `.github/workflows/pages.yml`:

1. `actions/checkout`
2. **Inject the TMDB key** — `sed` replaces `apiKey: ""` with the real key from
   the repo secret `TMDB_API_KEY`, in the checked-out copy only
3. `actions/upload-pages-artifact` with `path: .` (the repo root *is* the site)
4. `actions/deploy-pages`

There is no build. What's in the repo is what ships, apart from that one `sed`.

**Pages source must be "GitHub Actions"** (Settings → Pages → Build and
deployment). It was originally "Deploy from a branch"; with that setting the
workflow can't deploy and the TMDB key never reaches the site. If recommendations
mysteriously vanish, check this first.

The custom domain comes from the committed `CNAME` file (`hgs.house`). Don't
delete it — a deploy without it reverts the site to
`bernhardkreminski.github.io/hgs/`.

## The TMDB secret

The site is static, so any key the browser uses is ultimately public. The
workflow exists so the key isn't in **git history** — the committed
`config.js` keeps `apiKey: ""` forever, and only the published artifact has the
real value.

- Use the **v3 API key** (short alphanumeric string), *not* the v4 read access
  token (a long JWT). `recommendations.js` sends it as `?api_key=…`; the v4 token
  needs an `Authorization: Bearer` header and will silently fail here.
- Rotate at themoviedb.org → Settings → API, then update the repo secret. No code
  change needed.

## Verifying a deploy

```bash
gh run list -R bernhardkreminski/hgs --workflow=pages.yml --limit 1
```

Then confirm the live site actually changed — a green run is not proof the CDN
has caught up:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "https://hgs.house/apple-touch-icon.png?x=$(date +%s)"
```

For JS/CSS changes, grep the deployed file for a string you just added rather
than trusting the run status.

## Credentials — read this before trying to push

This has been the single biggest time sink in the project.

- The repo owner is `bernhardkreminski`. The machine's `gh` keyring has held
  **multiple** accounts/tokens, and at least one of them is a fine-grained PAT
  **without `Contents: write` on `hgs`**.
- Symptom: `git push` fails with
  `remote: Permission to bernhardkreminski/hgs.git denied to bernhardkreminski` —
  confusingly, the *owner's own name*.
- **`gh api repos/…/hgs --jq .permissions` reporting `push: true` proves
  nothing.** That reflects the *account's* permission on the repo, not the
  *token's* scopes. A git push additionally needs `Contents: write` on the token.

Fix, in order of preference:

```bash
gh auth login --hostname github.com --git-protocol https --web
```

That issues a full-access OAuth token and makes both `git push` and `gh` work.
Alternatively, export a PAT that has `Contents: write` on `hgs`:

```bash
GH_TOKEN=<token-with-contents-write> git push origin main
```

Note that a token scoped to `hgs-data` (the one in `config.js`) **cannot** push
to the site repo, and vice versa. They are two different tokens with two
different scopes; mixing them up produces exactly the 403 above.

Also: environment variables do not persist between separate shell invocations,
so `export GH_TOKEN=…` in one command is gone by the next. Prefix each command,
or fix the auth properly with `gh auth login`.

## Manual deploy

The workflow has `workflow_dispatch`, so a deploy can be re-run without a commit:

```bash
gh workflow run pages.yml -R bernhardkreminski/hgs
```

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

## The morning digest (`notify.yml`)

A second workflow, unrelated to deploying: every morning at 09:00 it mails what
changed on the boards. See [FEATURES.md](FEATURES.md) §12 for the mechanism.

### Secrets it needs

Four, plus two optional ones. Nothing about the mail lives in the repo — the
recipient address least of all.

| Secret | Required | Value |
|---|---|---|
| `NOTIFY_TO` | yes | where the mail goes |
| `SMTP_HOST` | yes | e.g. `smtp.gmail.com` |
| `SMTP_USER` | yes | the mailbox to send **from** |
| `SMTP_PASS` | yes | an **app password**, never the account password |
| `SMTP_PORT` | no | `465` (default, implicit TLS) or `587` (STARTTLS) |
| `SMTP_FROM` | no | defaults to `SMTP_USER` |

With [the GitHub CLI](https://cli.github.com/):

```bash
gh secret set NOTIFY_TO -R bernhardkreminski/hgs
gh secret set SMTP_HOST -R bernhardkreminski/hgs --body "smtp.gmail.com"
gh secret set SMTP_USER -R bernhardkreminski/hgs
gh secret set SMTP_PASS -R bernhardkreminski/hgs
```

Omitting `--body` prompts for the value instead of putting it in your shell
history — worth doing for all but the host, since the recipient address is the
one thing this feature exists to keep out of the repo. The web UI does the same
job: **Settings → Secrets and variables → Actions → New repository secret**.

Note that managing secrets needs a token with the **Secrets: write** permission
on the repo — a fine-grained PAT without it fails with `HTTP 403: Resource not
accessible by personal access token`, the same class of trap as the push
problem below.

**Gmail:** account passwords are rejected over SMTP. With 2-step verification
on, create an app password at <https://myaccount.google.com/apppasswords> and
use it as `SMTP_PASS`; `SMTP_USER` is the full address, host `smtp.gmail.com`,
port 465. `SMTP_FROM` must be that same address or a verified alias — Gmail
rewrites or refuses anything else. A `+tag` address (`…+hgs@gmail.com`) as
`NOTIFY_TO` is fine and makes the digest trivially filterable.

Any provider works — the client speaks plain SMTP submission on 465 or 587.
There is no unencrypted path: a server offering neither is refused rather than
sent a password in the clear.

### Trying it out

**Actions → Notify on board changes → Run workflow**, with *dry run* ticked: the
mail is printed to the job log instead of sent, and the snapshot is left alone
so the next real run still reports the same changes. Then run it again without
dry run for a real mail.

```bash
gh workflow run notify.yml -R bernhardkreminski/hgs -f dry_run=true
gh run watch -R bernhardkreminski/hgs
```

Locally, touching nothing that is committed:

```bash
NOTIFY_DRY_RUN=1 NOTIFY_DUMP_HTML=/tmp/mail.html \
NOTIFY_STATE_PATH=/tmp/state.json node .github/scripts/notify-changes.mjs
```

Notes worth knowing:

- The **first run after setup sends nothing** — it records the baseline. That is
  expected, not a failure.
- The workflow **commits** `.github/notify-state.json` back to `main`, so it
  needs `contents: write`. The commit carries `[skip ci]` so it doesn't trigger
  a Pages deploy.
- That state file ships with the site (`path: .` uploads the whole repo), so
  treat it as public. It contains only board content that is public anyway.
- The job reads the **data** repo, `hgs-data`. It is public, so this works even
  though `GITHUB_TOKEN` is scoped to `hgs`; the token only raises the API rate
  limit, and the script retries anonymously if it is rejected.
- GitHub disables scheduled workflows in repos with no activity for 60 days.
- `scripts/smtp.mjs` is a copy of the file of the same name in **rosencri.me**.
  Fix a bug in one, copy it to the other.

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

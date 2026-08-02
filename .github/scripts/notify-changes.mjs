#!/usr/bin/env node
// .github/scripts/notify-changes.mjs
//
// Emails one digest a morning: what was added, edited or deleted on the boards
// (/filme/, /workshops/, /blog/).
//
// Same mechanism as the sibling project rosencri.me — poll, diff against a
// committed snapshot, send through our own SMTP client. No third-party mail
// Action, no npm install, no server.
//
// How it detects a change
// -----------------------
// The entries live as JSON in the data repo (hgs-data) and carry no
// "updatedAt", so the data itself cannot say what changed. Every run therefore
// stores a snapshot of the tracked fields per entry and compares it against the
// previous run's:
//
//   .github/notify-state.json   committed by .github/workflows/notify.yml
//
// The snapshot holds only what the website already shows publicly — never the
// recipient address, which lives solely in the NOTIFY_TO repository secret.
//
// **The very first run sends nothing.** With no previous state every entry
// would look new, so that run records a baseline and stops.
//
// Environment
// -----------
//   NOTIFY_TO             recipient
//   SMTP_HOST             e.g. smtp.gmail.com
//   SMTP_PORT             465 (implicit TLS, default) or 587
//   SMTP_USER, SMTP_PASS  app password, never an account password
//   SMTP_FROM             defaults to SMTP_USER
//   DATA_REPO             defaults to bernhardkreminski/hgs-data
//   DATA_BRANCH           defaults to main
//   GITHUB_TOKEN          optional, only raises the API rate limit
//   NOTIFY_STATE_PATH     defaults to .github/notify-state.json
//   NOTIFY_SITE_URL       defaults to https://hgs.house/
//   NOTIFY_DIGEST_HOUR    hold everything until this hour, Berlin local, at most
//                         one mail per day. Unset = send now (manual runs do).
//   NOTIFY_DRY_RUN=1      print the mail instead of sending it
//   NOTIFY_DUMP_HTML=path dry runs also write the HTML part there
//
// A missing secret is a skip, not a failure: the workflow stays green from the
// first run, before anything has been configured. A fetch or SMTP error IS a
// failure, and leaves the state file untouched so the next run retries.
//
// Usage:
//   node .github/scripts/notify-changes.mjs
//   NOTIFY_DRY_RUN=1 NOTIFY_STATE_PATH=/tmp/state.json node .github/scripts/notify-changes.mjs

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sendMail } from './smtp.mjs';

// Wall-clock times in the mail are Berlin's, not the runner's UTC.
process.env.TZ ??= 'Europe/Berlin';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_STATE_PATH = path.join(REPO_ROOT, '.github', 'notify-state.json');
const STATE_VERSION = 1;

/**
 * The three boards, and per board the fields worth an email.
 *
 * An explicit allowlist, exactly like `CONFIGS` in assets/js/board.js — and with
 * the same hazard: a field added to a board but not here is silently never
 * reported. Add both at once.
 */
const BOARDS = [
  {
    kind: 'movies',
    label: 'Filme',
    noun: 'Film',
    page: '/filme/',
    tracked: {
      title: 'Titel',
      description: 'Beschreibung',
      url: 'JustWatch-Link',
      tags: 'Tags',
      watched: 'Gesehen',
      watchedAt: 'Gesehen am',
    },
  },
  {
    kind: 'workshops',
    label: 'Workshops',
    noun: 'Workshop',
    page: '/workshops/',
    tracked: {
      title: 'Titel',
      description: 'Beschreibung',
      host: "Wer macht's",
      date: 'Datum',
    },
  },
  {
    kind: 'blog',
    label: 'Blog',
    noun: 'Moment',
    page: '/blog/',
    tracked: {
      title: 'Titel',
      text: 'Text',
      mood: 'Stimmung',
      images: 'Bilder',
    },
  },
];

/* ------------------------------- snapshots ------------------------------- */

const str = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value.map(str).filter(Boolean) : []);

function snapshotOf(kind, entry) {
  const base = { title: str(entry.title), createdAt: str(entry.createdAt) };
  if (kind === 'movies') {
    return {
      ...base,
      description: str(entry.description),
      url: str(entry.url),
      tags: list(entry.tags),
      watched: !!entry.watched,
      watchedAt: str(entry.watchedAt),
    };
  }
  if (kind === 'workshops') {
    return { ...base, description: str(entry.description), host: str(entry.host), date: str(entry.date) };
  }
  return {
    ...base,
    text: str(entry.text),
    mood: str(entry.mood),
    // Only the count matters for a notification; the URLs would bloat the state
    // file and change on every re-upload without anything visible changing.
    images: Array.isArray(entry.images) ? entry.images.filter((i) => i && i.src).length : 0,
  };
}

/** Entries have ids; the very first seeds might not, hence the title fallback. */
const keyOf = (entry, index) => str(entry?.id) || `title:${str(entry?.title) || index}`;

const same = (a, b) => JSON.stringify(a ?? '') === JSON.stringify(b ?? '');

function diffSnapshots(board, before, after) {
  const added = [];
  const edited = [];
  const removed = [];

  for (const [id, snap] of Object.entries(after)) {
    const prev = before[id];
    if (!prev) { added.push({ id, board, snap }); continue; }
    const changes = Object.entries(board.tracked)
      .filter(([field]) => !same(prev[field], snap[field]))
      .map(([field, label]) => ({ field, label, from: prev[field], to: snap[field] }));
    if (changes.length) edited.push({ id, board, snap, prev, changes });
  }

  for (const [id, prev] of Object.entries(before)) {
    if (!after[id]) removed.push({ id, board, snap: prev });
  }

  return { added, edited, removed };
}

/* -------------------------------- sources -------------------------------- */

/**
 * Read one board file from the data repo.
 *
 * Through the API rather than raw.githubusercontent.com for the same reason
 * store.js does it: the CDN serves minutes-old content after a write, which
 * here would mean reporting a change a day late. See docs/GOTCHAS.md.
 */
async function fetchBoard(repo, branch, kind, token) {
  const url = `https://api.github.com/repos/${repo}/contents/${kind}.json?ref=${encodeURIComponent(branch)}`;
  const headers = { Accept: 'application/vnd.github.raw', 'User-Agent': 'hgs-notify' };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res = await fetch(url, { headers });
  if ((res.status === 401 || res.status === 403) && token) {
    // The data repo is public — a token the runner cannot use is no reason to fail.
    delete headers.Authorization;
    res = await fetch(url, { headers });
  }
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`GitHub request for ${kind}.json failed: ${res.status} ${res.statusText}`);

  const parsed = JSON.parse(await res.text());
  if (!Array.isArray(parsed)) throw new Error(`${kind}.json is not a JSON array`);
  return parsed;
}

async function readState(statePath) {
  let raw;
  try {
    raw = await readFile(statePath, 'utf8');
  } catch (err) {
    if (err?.code === 'ENOENT') return null;
    throw err;
  }
  try {
    const parsed = JSON.parse(raw);
    // An unknown shape is treated as absent: re-baseline quietly rather than
    // mail every entry on all three boards as "new".
    if (parsed?.version !== STATE_VERSION || typeof parsed.boards !== 'object') return null;
    return { boards: parsed.boards, lastMailedOn: parsed.lastMailedOn || '' };
  } catch {
    return null;
  }
}

async function writeState(statePath, boards, lastMailedOn = '') {
  await mkdir(path.dirname(statePath), { recursive: true });
  const payload = { version: STATE_VERSION, updatedAt: new Date().toISOString(), lastMailedOn, boards };
  await writeFile(statePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

/* ------------------------------ digest timing ----------------------------- */

const berlinParts = (date = new Date()) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Berlin',
    }).formatToParts(date).map(({ type, value }) => [type, value]),
  );
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
};

/* ------------------------------- formatting ------------------------------ */

const fmtStamp = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin',
});
const fmtDay = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Europe/Berlin',
});

const stamp = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${fmtStamp.format(d)} Uhr`;
};
/** "2026-08-03" is a local calendar date — parse it as one, not as UTC midnight. */
const day = (value) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str(value));
  if (!m) return str(value);
  return fmtDay.format(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
};

const MOODS = { top: 'Top-Moment', flop: 'Naja-Moment' };
const shorten = (text, max) => {
  const one = str(text).replace(/\s+/g, ' ');
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
};

/** One field value as it appears inside a "before → after" line. */
function fieldValue(field, value) {
  if (typeof value === 'boolean') return value ? 'ja' : 'nein';
  if (field === 'images') return !value ? '—' : value === 1 ? '1 Bild' : `${value} Bilder`;
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  const text = str(value);
  if (!text) return '—';
  if (field === 'watchedAt' || field === 'date') return day(text);
  if (field === 'mood') return MOODS[text] || text;
  return shorten(text, 110);
}

/** The one or two lines under a card's title: the entry at a glance. */
function metaLines(kind, snap) {
  const lines = [];
  if (kind === 'movies') {
    if (snap.watched) lines.push(snap.watchedAt ? `Gesehen am ${day(snap.watchedAt)}` : 'Gesehen');
    if (snap.tags?.length) lines.push(snap.tags.join(' · '));
    if (snap.description) lines.push(shorten(snap.description, 150));
  } else if (kind === 'workshops') {
    const head = [snap.host && `Host: ${snap.host}`, snap.date && day(snap.date)].filter(Boolean).join(' · ');
    if (head) lines.push(head);
    if (snap.description) lines.push(shorten(snap.description, 150));
  } else {
    const head = [MOODS[snap.mood] || snap.mood, snap.images ? fieldValue('images', snap.images) : '']
      .filter(Boolean).join(' · ');
    if (head) lines.push(head);
    if (snap.text) lines.push(shorten(snap.text, 150));
  }
  return lines;
}

/* ---------------------------------- html --------------------------------- */

/*
 * Inline styles only, tables for structure, no images and no external assets.
 * Mail clients strip <style> blocks (Gmail), ignore flexbox and grid, and block
 * remote content by default — so this looks deliberately like 2005 markup.
 *
 * The palette is the site's (assets/css/base.css): near-black warm background,
 * cream ink, orange accent, pink for anything destructive. Badge text is the
 * dark background colour, because white on #ff9e4d does not clear 4.5:1.
 */
const C = {
  page: '#0e0c10', card: '#16131a', tile: '#1c1822', line: '#2b2632', rule: '#242029',
  ink: '#f2efe9', dim: '#a49c96', faint: '#6f6862',
  added: '#ff9e4d', edited: '#a49c96', removed: '#c86b98',
};
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function htmlChangeRows(changes) {
  const rows = changes.map((c) => `
            <tr>
              <td style="padding:4px 12px 4px 0;color:${C.dim};font-size:13px;white-space:nowrap;vertical-align:top">${esc(c.label)}</td>
              <td style="padding:4px 0;font-size:13px;color:${C.ink}">
                <span style="color:${C.faint};text-decoration:line-through">${esc(fieldValue(c.field, c.from))}</span>
                <span style="color:${C.faint}">&nbsp;→&nbsp;</span>
                <strong style="color:${C.ink}">${esc(fieldValue(c.field, c.to))}</strong>
              </td>
            </tr>`).join('');
  return `
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0 0;border-collapse:collapse">${rows}
          </table>`;
}

/**
 * One change as a card.
 *
 * Only the two states you can't undo by editing are filled — orange for new,
 * pink for deleted. An edit gets an outlined badge, so a busy morning still
 * reads at a glance instead of turning into a wall of colour.
 */
function htmlCard(label, accent, item, filled = true) {
  const { board, snap, changes } = item;
  const meta = metaLines(board.kind, snap).map((line) => `
            <div style="font-size:14px;color:${C.dim};margin-top:5px;line-height:1.45">${esc(line)}</div>`).join('');
  const badge = filled
    ? `background:${accent};color:${C.page};border:1px solid ${accent}`
    : `background:transparent;color:${accent};border:1px solid ${C.line}`;

  return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px;background:${C.tile};border:1px solid ${C.line};border-radius:14px;border-collapse:separate">
        <tr>
          <td style="border-left:3px solid ${accent};border-radius:14px 0 0 14px;padding:16px 18px">
            <span style="display:inline-block;font-size:10px;font-weight:700;letter-spacing:.12em;border-radius:999px;padding:3px 10px;${badge}">${esc(label)}</span>
            <div style="font-size:18px;font-weight:700;color:${C.ink};margin:10px 0 0;line-height:1.3">${esc(snap.title || 'Ohne Titel')}</div>${meta}${changes?.length ? htmlChangeRows(changes) : ''}
          </td>
        </tr>
      </table>`;
}

function htmlSection(board, items, siteUrl) {
  const cards = [
    ...items.filter((i) => i.state === 'added').map((i) => htmlCard('NEU', C.added, i)),
    ...items.filter((i) => i.state === 'edited').map((i) => htmlCard('GEÄNDERT', C.edited, i, false)),
    ...items.filter((i) => i.state === 'removed').map((i) => htmlCard('GELÖSCHT', C.removed, i)),
  ].join('');

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px">
      <tr>
        <td style="padding:0 0 12px">
          <span style="font-size:11px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:${C.dim}">${esc(board.label)}</span>
          <span style="color:${C.rule}">&nbsp;·&nbsp;</span>
          <a href="${esc(new URL(board.page, siteUrl).href)}" style="color:${C.added};text-decoration:none;font-size:12px;font-weight:600">öffnen&nbsp;↗</a>
        </td>
      </tr>
      <tr><td>${cards}</td></tr>
    </table>`;
}

/** "1 neu · 3 geändert · 1 gelöscht" as small pills under the headline. */
function htmlCounts(counts) {
  const pills = [
    counts.added && { text: `${counts.added} neu`, color: C.added },
    counts.edited && { text: `${counts.edited} geändert`, color: C.dim },
    counts.removed && { text: `${counts.removed} gelöscht`, color: C.removed },
  ].filter(Boolean);
  return pills.map(({ text, color }) => `<span style="display:inline-block;font-size:12px;font-weight:600;color:${color};border:1px solid ${C.line};border-radius:999px;padding:4px 12px;margin:10px 6px 0 0">${esc(text)}</span>`).join('');
}

function composeHtml(sections, siteUrl, total, counts) {
  const body = sections.map(({ board, items }) => htmlSection(board, items, siteUrl)).join(`
    <div style="height:1px;background:${C.rule};margin:6px 0 22px"></div>`);

  // A full document, not a fragment. The MIME part already declares
  // charset=utf-8, but clients that extract the HTML and re-render it (or a
  // browser opening a saved .eml) fall back to guessing without the meta tag,
  // and every umlaut arrives as mojibake.
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>HGS</title>
</head>
<body style="margin:0;padding:0;background:${C.page}">
<div style="margin:0;padding:26px 12px;background:${C.page};font-family:${FONT};-webkit-text-size-adjust:100%">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto;background:${C.card};border:1px solid ${C.line};border-radius:18px">
  <tr>
    <td style="padding:26px 26px 20px;border-bottom:1px solid ${C.line}">
      <div style="font-size:15px;font-weight:800;letter-spacing:.16em;color:${C.ink}">HGS<span style="color:${C.added}">.</span></div>
      <div style="font-size:27px;font-weight:800;letter-spacing:-.02em;color:${C.ink};margin-top:14px;line-height:1.15">Was sich getan hat<span style="color:${C.added}">.</span></div>
      <div style="font-size:14px;color:${C.dim};margin-top:6px">${total === 1 ? 'Eine Änderung' : `${total} Änderungen`} seit dem letzten Digest</div>
      <div>${htmlCounts(counts)}</div>
    </td>
  </tr>
  <tr><td style="padding:24px 26px 6px">${body}</td></tr>
  <tr>
    <td style="padding:16px 26px 22px;border-top:1px solid ${C.line};font-size:12px;color:${C.dim};line-height:1.6">
      Stand: ${esc(stamp(new Date().toISOString()))} · <a href="${esc(siteUrl)}" style="color:${C.dim}">${esc(siteUrl.replace(/^https?:\/\/|\/$/g, ''))}</a><br>
      Jede Person mit dem WG-Code kann Einträge anlegen, ändern und löschen.
      Zurückholen lässt sich alles über die Git-Historie von <code>hgs-data</code>.
    </td>
  </tr>
</table>
</div>
</body>
</html>`;
}

/* ---------------------------------- text --------------------------------- */

function textBlock(label, item) {
  const { board, snap, changes } = item;
  const lines = [`${label}  ${snap.title || 'Ohne Titel'}`];
  const push = (text) => lines.push(`    ${text}`);

  for (const line of metaLines(board.kind, snap)) push(line);
  if (changes?.length) {
    lines.push('');
    for (const c of changes) push(`${c.label}: ${fieldValue(c.field, c.from)}  →  ${fieldValue(c.field, c.to)}`);
  }
  return lines.join('\n');
}

function composeBody(sections, siteUrl, total) {
  const rule = '─'.repeat(58);
  const out = [`${total === 1 ? 'Eine Änderung' : `${total} Änderungen`} auf hgs.house`, rule, ''];

  for (const { board, items } of sections) {
    out.push(`${board.label.toUpperCase()}  ·  ${new URL(board.page, siteUrl).href}`, '');
    const blocks = [
      ...items.filter((i) => i.state === 'added').map((i) => textBlock('NEU', i)),
      ...items.filter((i) => i.state === 'edited').map((i) => textBlock('GEÄNDERT', i)),
      ...items.filter((i) => i.state === 'removed').map((i) => textBlock('GELÖSCHT', i)),
    ];
    out.push(blocks.join('\n\n'), '');
  }

  out.push(
    rule,
    `Stand: ${stamp(new Date().toISOString())} · ${siteUrl}`,
    'Jede Person mit dem WG-Code kann Einträge anlegen, ändern und löschen.',
    'Zurückholen lässt sich alles über die Git-Historie von hgs-data.',
    '',
  );
  return out.join('\n');
}

function composeSubject(sections, counts) {
  const total = counts.added + counts.edited + counts.removed;
  if (total === 1) {
    const [item] = sections[0].items;
    const title = item.snap.title || 'Ohne Titel';
    if (item.state === 'added') return `HGS: neuer ${item.board.noun} „${title}"`;
    if (item.state === 'edited') return `HGS: „${title}" geändert`;
    return `HGS: „${title}" gelöscht`;
  }
  const parts = [
    counts.added && `${counts.added} neu`,
    counts.edited && `${counts.edited} geändert`,
    counts.removed && `${counts.removed} gelöscht`,
  ].filter(Boolean);
  return `HGS: ${total} Änderungen (${parts.join(', ')})`;
}

/* ---------------------------------- main --------------------------------- */

async function main() {
  const repo = process.env.DATA_REPO || 'bernhardkreminski/hgs-data';
  const branch = process.env.DATA_BRANCH || 'main';
  const token = process.env.GITHUB_TOKEN || '';
  const to = process.env.NOTIFY_TO;
  const smtpHost = process.env.SMTP_HOST;
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const dryRun = process.env.NOTIFY_DRY_RUN === '1';
  const digestHour = process.env.NOTIFY_DIGEST_HOUR;
  const siteUrl = process.env.NOTIFY_SITE_URL || 'https://hgs.house/';
  const statePath = process.env.NOTIFY_STATE_PATH
    ? path.resolve(process.env.NOTIFY_STATE_PATH)
    : DEFAULT_STATE_PATH;

  // Deliberately never logs the address itself.
  if (!dryRun && (!to || !smtpHost || !from)) {
    console.log('[notify] NOTIFY_TO / SMTP_HOST / SMTP_FROM not all set — skipping (set the repository secrets to enable mail).');
    return;
  }

  const after = {};
  let entryCount = 0;
  for (const board of BOARDS) {
    const entries = await fetchBoard(repo, branch, board.kind, token);
    entryCount += entries.length;
    after[board.kind] = Object.fromEntries(
      entries.map((entry, i) => [keyOf(entry, i), snapshotOf(board.kind, entry)]),
    );
  }

  const state = await readState(statePath);
  if (!state) {
    await writeState(statePath, after);
    console.log(`[notify] No previous state — recorded ${entryCount} entries as the baseline, no mail sent.`);
    return;
  }

  const sections = [];
  const counts = { added: 0, edited: 0, removed: 0 };
  for (const board of BOARDS) {
    const diff = diffSnapshots(board, state.boards[board.kind] || {}, after[board.kind]);
    const items = [
      ...diff.added.map((i) => ({ ...i, state: 'added' })),
      ...diff.edited.map((i) => ({ ...i, state: 'edited' })),
      ...diff.removed.map((i) => ({ ...i, state: 'removed' })),
    ];
    if (!items.length) continue;
    counts.added += diff.added.length;
    counts.edited += diff.edited.length;
    counts.removed += diff.removed.length;
    sections.push({ board, items });
  }

  const total = counts.added + counts.edited + counts.removed;
  if (!total) {
    console.log(`[notify] ${entryCount} entries, nothing changed.`);
    return;
  }

  /*
   * One digest a day, in the morning.
   *
   * `digestHour` is only set for scheduled runs, so a manual dispatch always
   * sends. The gate lives here rather than in the cron because GitHub cron is
   * UTC and ignores DST: `0 7 * * *` is 09:00 in Berlin in summer and 08:00 in
   * winter. The workflow fires several candidate slots and this drops all but
   * the first one at or after 09:00 local — which also absorbs GitHub's habit
   * of starting scheduled jobs late.
   */
  const now = berlinParts();
  if (digestHour) {
    if (now.hour < Number(digestHour)) {
      console.log(`[notify] ${total} change(s) pending — holding until ${digestHour}:00 (now ${now.hour}:xx in Berlin).`);
      return;
    }
    if (state.lastMailedOn === now.day) {
      console.log(`[notify] ${total} change(s) pending — today's digest already went out; they go in tomorrow's.`);
      return;
    }
  }

  const subject = composeSubject(sections, counts);
  const text = composeBody(sections, siteUrl, total);
  const html = composeHtml(sections, siteUrl, total, counts);

  if (dryRun) {
    // Deliberately returns without storing: a dry run that consumed the diff
    // would leave the next real run with nothing to report.
    console.log(`[notify] DRY RUN — would send:\n\nSubject: ${subject}\n\n${text}`);
    if (process.env.NOTIFY_DUMP_HTML) {
      await writeFile(process.env.NOTIFY_DUMP_HTML, html, 'utf8');
      console.log(`[notify] HTML part written to ${process.env.NOTIFY_DUMP_HTML}`);
    }
    return;
  }

  await sendMail({
    host: smtpHost,
    port: process.env.SMTP_PORT || 465,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from,
    to,
    subject,
    text,
    html,
  });
  console.log(`[notify] Sent: ${subject}`);

  // Only after the mail is away. A failed send throws before this line, so the
  // next run sees the same diff again instead of losing the notification.
  await writeState(statePath, after, now.day);
  console.log(`[notify] ${counts.added} added, ${counts.edited} edited, ${counts.removed} removed — state updated.`);
}

// Guarded so the pure functions below can be imported and exercised without
// the script reaching for the network.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('[notify] Failed:', err.message);
    process.exitCode = 1;
  });
}

export { BOARDS, diffSnapshots, snapshotOf, composeSubject, composeBody, composeHtml, berlinParts };

/* HGS whiteboard engine — generic pinboard for /filme/, /workshops/ and /blog/.
 * Owned by Agent B. Configured per page via window.HGS_BOARD = { kind: "movies" | "workshops" | "blog" }.
 * Uses HGSStore (assets/js/store.js) as the only data/write gateway.
 */
(function () {
  "use strict";

  const BOARD = window.HGS_BOARD || {};
  const KIND = BOARD.kind;

  /* ---------- small DOM helper (never sets innerHTML with user content) ---------- */
  function el(tag, attrs, text) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach((key) => {
        const value = attrs[key];
        if (key === "class") node.className = value;
        else if (key === "for") node.htmlFor = value;
        else if (value === true) node.setAttribute(key, "");
        else if (value === false || value === undefined || value === null) {
          /* skip */
        } else node.setAttribute(key, value);
      });
    }
    if (text !== undefined) node.textContent = text;
    return node;
  }

  /* ---------- tags ----------
   * Stimmungs-Tags sind eine feste Auswahl, damit die Liste nicht ausfranst
   * ("Zum Lachen" vs. "zum lachen" vs. "lustig"). Gespeichert wird nur der Text;
   * das Emoji kommt erst beim Anzeigen dazu, die Daten bleiben also sauber.
   * Eigene Tags (Genre, Regisseur, "Filmabend Freitag") sind zusätzlich erlaubt. */
  const MOOD_TAGS = [
    { value: "Zum Lachen", emoji: "😂" },
    { value: "Spannend", emoji: "🍿" },
    { value: "Zum Weinen", emoji: "😢" },
    { value: "Gruselig", emoji: "😱" },
    { value: "Zum Nachdenken", emoji: "🧠" },
    { value: "Herzerwärmend", emoji: "🥰" },
    { value: "Action", emoji: "💥" },
    { value: "Feelgood", emoji: "✨" },
    { value: "Verstörend", emoji: "🌀" },
    { value: "Romantisch", emoji: "❤️" },
    { value: "Nebenbei", emoji: "😴" },
    { value: "Anspruchsvoll", emoji: "🎬" },
  ];
  const MOOD_EMOJI = {};
  const MOOD_ORDER = {};
  MOOD_TAGS.forEach((m, i) => {
    MOOD_EMOJI[m.value] = m.emoji;
    MOOD_ORDER[m.value] = i;
  });
  const MAX_TAG_LENGTH = 24;

  function tagList(entry) {
    if (!Array.isArray(entry && entry.tags)) return [];
    return entry.tags.map((t) => String(t).trim()).filter(Boolean);
  }
  function tagLabel(tag) {
    return MOOD_EMOJI[tag] ? MOOD_EMOJI[tag] + " " + tag : tag;
  }
  /* Stimmungen zuerst (in der Reihenfolge oben), eigene Tags danach alphabetisch */
  function compareTags(a, b) {
    const ma = MOOD_ORDER[a];
    const mb = MOOD_ORDER[b];
    if (ma !== undefined && mb !== undefined) return ma - mb;
    if (ma !== undefined) return -1;
    if (mb !== undefined) return 1;
    return a.localeCompare(b, "de");
  }

  /* ---------- date helpers ---------- */
  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function parseLocalDate(str) {
    if (!str) return null;
    const parts = String(str).split("-");
    if (parts.length !== 3) return null;
    const y = Number(parts[0]);
    const m = Number(parts[1]);
    const d = Number(parts[2]);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }
  function formatCreated(iso) {
    try {
      return new Date(iso).toLocaleDateString("de-DE");
    } catch (_) {
      return "";
    }
  }
  function formatCreatedLong(iso) {
    try {
      return new Date(iso).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
    } catch (_) {
      return "";
    }
  }

  /* ---------- sort strategies ---------- */
  function sortByCreatedDesc(list) {
    return list.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  /* Filme: erst die Watchlist (neueste zuerst), dann die gesehenen (zuletzt gesehen zuerst) */
  function sortMovies(list) {
    const unwatched = list.filter((e) => !e.watched);
    const watched = list.filter((e) => e.watched);
    unwatched.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    watched.sort(
      (a, b) =>
        String(b.watchedAt || "").localeCompare(String(a.watchedAt || "")) ||
        new Date(b.createdAt) - new Date(a.createdAt)
    );
    return unwatched.concat(watched);
  }
  function localTodayISO() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function sortWorkshops(list) {
    const today = startOfDay(new Date());
    const upcoming = [];
    const rest = [];
    list.forEach((e) => {
      const d = parseLocalDate(e.date);
      if (d && d.getTime() >= today.getTime()) upcoming.push(e);
      else rest.push(e);
    });
    upcoming.sort((a, b) => parseLocalDate(a.date) - parseLocalDate(b.date));
    rest.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return upcoming.concat(rest);
  }

  /* ---------- card body renderers (main content, kind-specific) ---------- */
  function renderMovieBody(card, entry) {
    if (entry.description) card.appendChild(el("p", {}, entry.description));
  }
  function renderWorkshopBody(card, entry) {
    card.appendChild(el("p", {}, entry.description));
  }
  function renderBlogBody(card, entry) {
    renderImageStrip(card, entry);
    const body = el("div", { class: "entry-body" });
    String(entry.text || "")
      .split(/\n{2,}/)
      .forEach((para) => {
        const trimmed = para.trim();
        if (!trimmed) return;
        body.appendChild(el("p", {}, trimmed));
      });
    card.appendChild(body);
  }

  /* ---------- Bilder: verkleinern, anzeigen, groß ansehen ---------- */
  function imageList(entry) {
    return Array.isArray(entry.images) ? entry.images.filter((i) => i && i.src) : [];
  }

  /* Vor dem Upload im Browser verkleinern — spart Platz und Ladezeit. */
  function fileToResizedBase64(file, maxDim, quality) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("read-failed"));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("decode-failed"));
        img.onload = () => {
          let w = img.naturalWidth;
          let h = img.naturalHeight;
          const scale = Math.min(1, maxDim / Math.max(w, h));
          w = Math.max(1, Math.round(w * scale));
          h = Math.max(1, Math.round(h * scale));
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL("image/jpeg", quality);
          resolve(dataUrl.slice(dataUrl.indexOf(",") + 1));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /* Vollbild-Ansicht mit Blättern über die Bilder eines Eintrags */
  function openLightbox(images, startIndex) {
    let i = startIndex || 0;
    const backdrop = el("div", { class: "lightbox-backdrop" });
    const figure = el("figure", { class: "lightbox-figure" });
    const img = el("img", { class: "lightbox-img", alt: "" });
    const caption = el("figcaption", { class: "lightbox-caption" });
    figure.append(img, caption);

    const closeBtn = el("button", { type: "button", class: "lightbox-close", "aria-label": "Schließen" }, "✕");
    const prevBtn = el("button", { type: "button", class: "lightbox-nav prev", "aria-label": "Vorheriges Bild" }, "‹");
    const nextBtn = el("button", { type: "button", class: "lightbox-nav next", "aria-label": "Nächstes Bild" }, "›");
    const counter = el("span", { class: "lightbox-counter" });

    function show() {
      const cur = images[i];
      img.src = cur.src;
      img.alt = cur.caption || "Bild aus dem Blogeintrag";
      caption.textContent = cur.caption || "";
      caption.hidden = !cur.caption;
      counter.textContent = images.length > 1 ? i + 1 + " / " + images.length : "";
      prevBtn.hidden = images.length < 2;
      nextBtn.hidden = images.length < 2;
    }
    function step(d) {
      i = (i + d + images.length) % images.length;
      show();
    }
    prevBtn.addEventListener("click", () => step(-1));
    nextBtn.addEventListener("click", () => step(1));
    closeBtn.addEventListener("click", () => dismissTop(backdrop));

    function onKey(e) {
      if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
    }
    document.addEventListener("keydown", onKey);

    backdrop.append(closeBtn, prevBtn, figure, nextBtn, counter);
    show();
    pushModal(backdrop, () => document.removeEventListener("keydown", onKey));
  }

  function renderImageStrip(card, entry) {
    const images = imageList(entry);
    if (images.length === 0) return;
    const strip = el("div", { class: "entry-images" + (images.length === 1 ? " single" : "") });
    images.forEach((image, idx) => {
      const btn = el("button", {
        type: "button",
        class: "entry-image",
        "aria-label": (image.caption || "Bild") + " — in voller Größe ansehen",
      });
      btn.appendChild(el("img", { src: image.src, alt: image.caption || "", loading: "lazy" }));
      btn.addEventListener("click", () => openLightbox(images, idx));
      strip.appendChild(btn);
    });
    card.appendChild(strip);
  }

  /* ---------- Teilen ----------
   * Jeder Eintrag ist über /blog/#<id> direkt verlinkbar — die Karte trägt ihre
   * id im DOM. Auf dem Handy öffnet navigator.share das System-Menü (WhatsApp,
   * Signal, Mail …); wo es das nicht gibt (die meisten Desktop-Browser), landet
   * der Link in der Zwischenablage. */
  function entryUrl(entry) {
    /* saubere URL: /blog/, nie /blog/index.html */
    const path = location.pathname.replace(/index\.html$/, "");
    return location.origin + path + "#" + entry.id;
  }

  /* Letzter Ausweg, wenn weder Teilen noch Zwischenablage gehen (http, alter Browser):
   * den Link zum Markieren und Kopieren zeigen. */
  function openLinkModal(url) {
    const backdrop = el("div", { class: "modal-backdrop" });
    const card = el("div", {
      class: "modal-card",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "share-modal-title",
    });
    const h3 = el("h3", { id: "share-modal-title" }, "Link teilen");
    const field = el("div", { class: "field" });
    const label = el("label", { for: "share-link-input" }, "Link zu diesem Eintrag");
    const input = el("input", { class: "input", id: "share-link-input", type: "text", readonly: true });
    input.value = url;
    field.append(label, input);
    const actions = el("div", { class: "modal-actions" });
    const closeBtn = el("button", { type: "button", class: "btn btn-ghost" }, "Schließen");
    closeBtn.addEventListener("click", () => dismissTop(backdrop));
    actions.appendChild(closeBtn);
    card.append(h3, field, actions);
    backdrop.appendChild(card);
    pushModal(backdrop);
    requestAnimationFrame(() => input.select());
  }

  /* Wichtig: navigator.share muss direkt im Klick laufen (iOS verlangt die
   * Nutzergeste), deshalb vor dem Aufruf nichts awaiten. */
  async function shareEntry(entry) {
    const url = entryUrl(entry);
    if (navigator.share) {
      try {
        await navigator.share({
          title: entry.title + " · HGS",
          text: "„" + entry.title + "“ — " + config.shareText,
          url: url,
        });
        return;
      } catch (err) {
        /* Abbrechen im System-Menü ist kein Fehler, sonst unten weiter mit Kopieren */
        if (err && (err.name === "AbortError" || err.name === "NotAllowedError")) return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast("Link kopiert.");
    } catch (_) {
      openLinkModal(url);
    }
  }

  /* Seite mit /blog/#<id> geöffnet (oder ein Link auf derselben Seite geklickt):
   * den Eintrag anspringen und kurz hervorheben. */
  function focusHashEntry() {
    const id = decodeURIComponent(String(location.hash || "").slice(1));
    if (!id) return;
    const target = document.getElementById(id);
    if (!target) {
      if (entries.length) showToast("Diesen Eintrag gibt es nicht mehr.", true);
      return;
    }
    const calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ block: "start", behavior: calm ? "auto" : "smooth" });
    target.classList.add("is-linked");
    setTimeout(() => target.classList.remove("is-linked"), 2600);
  }

  /* ---------- card tag renderers (small badge next to the title) ---------- */
  function renderBlogTag(entry) {
    return entry.mood === "top"
      ? el("span", { class: "tag alt" }, "Top")
      : el("span", { class: "tag" }, "Naja");
  }

  /* ---------- card meta renderers (kind-specific presentation) ---------- */
  function renderMovieMeta(card, entry) {
    if (entry.url && /^https?:\/\//i.test(entry.url)) {
      const link = el(
        "a",
        { href: entry.url, target: "_blank", rel: "noopener", class: "justwatch-link" },
        "Bei JustWatch ansehen ↗"
      );
      card.appendChild(link);
    }
    card.appendChild(el("p", { class: "date-meta muted" }, "eingetragen am " + formatCreated(entry.createdAt)));
  }
  function renderWorkshopMeta(card, entry) {
    const row = el("div", { class: "tags-row" });
    row.appendChild(el("span", { class: "tag" }, "Host: " + entry.host));
    if (entry.date) {
      const d = parseLocalDate(entry.date);
      if (d) {
        const isPast = d.getTime() < startOfDay(new Date()).getTime();
        const formatted = d.toLocaleDateString("de-DE", {
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric",
        });
        row.appendChild(
          el("span", { class: "tag alt" + (isPast ? " is-past" : "") }, (isPast ? "war am " : "") + formatted)
        );
      }
    }
    card.appendChild(row);
  }
  function renderBlogMeta(card, entry) {
    card.appendChild(el("p", { class: "date-meta muted" }, formatCreatedLong(entry.createdAt)));
  }

  /* ---------- per-kind configuration ---------- */
  const CONFIGS = {
    movies: {
      modalTitleAdd: "Film eintragen",
      modalTitleEdit: "Film bearbeiten",
      emptyMessage: "Noch nichts hier — trag was ein!",
      toastAdd: "Eingetragen!",
      toastEdit: "Gespeichert!",
      toastDelete: "Gelöscht.",
      fields: [
        { key: "title", label: "Titel", type: "text", required: true, placeholder: "z. B. Everything Everywhere All at Once" },
        {
          key: "description",
          label: "Beschreibung",
          type: "textarea",
          required: false,
          placeholder: "Kurz, worum's geht… (optional)",
          hint: "Optional.",
        },
        {
          key: "url",
          label: "JustWatch-Link",
          type: "url",
          required: false,
          placeholder: "https://www.justwatch.com/de/…",
          hint: "Optional, aber gern gesehen.",
        },
        {
          key: "tags",
          label: "Stimmung & Tags",
          type: "tags",
          required: false,
          hint: "Optional. Stimmung antippen — eigene Tags gehen auch.",
        },
      ],
      sort: sortMovies,
      listMode: true,
      watchable: true,
      splitWatched: true,
      taggable: true,
      renderBody: renderMovieBody,
      renderMeta: renderMovieMeta,
    },
    workshops: {
      modalTitleAdd: "Workshop eintragen",
      modalTitleEdit: "Workshop bearbeiten",
      emptyMessage: "Noch nichts hier — trag was ein!",
      toastAdd: "Eingetragen!",
      toastEdit: "Gespeichert!",
      toastDelete: "Gelöscht.",
      fields: [
        { key: "title", label: "Titel", type: "text", required: true, placeholder: "z. B. Sauerteig 101" },
        { key: "description", label: "Beschreibung", type: "textarea", required: true, placeholder: "Worum geht's, was lernt man?" },
        { key: "host", label: "Wer macht's?", type: "text", required: true, placeholder: "Name" },
        { key: "date", label: "Datum", type: "date", required: false },
      ],
      sort: sortWorkshops,
      renderBody: renderWorkshopBody,
      renderMeta: renderWorkshopMeta,
    },
    blog: {
      modalTitleAdd: "Moment eintragen",
      modalTitleEdit: "Moment bearbeiten",
      emptyMessage: "Noch nichts hier — trag den ersten Moment ein!",
      toastAdd: "Eingetragen!",
      toastEdit: "Gespeichert!",
      toastDelete: "Gelöscht.",
      fields: [
        { key: "title", label: "Titel", type: "text", required: true, placeholder: "Kurzer Titel" },
        { key: "text", label: "Was ist passiert?", type: "textarea", required: true, placeholder: "Erzähl kurz, was los war…" },
        {
          key: "mood",
          label: "Stimmung",
          type: "select",
          required: true,
          options: [
            { value: "top", label: "Top-Moment" },
            { value: "flop", label: "Naja-Moment" },
          ],
        },
        {
          key: "images",
          label: "Bilder",
          type: "images",
          required: false,
          hint: "Optional. Werden vor dem Hochladen automatisch verkleinert.",
        },
      ],
      sort: sortByCreatedDesc,
      shareable: true,
      shareText: "ein Moment aus der HGS.",
      renderTag: renderBlogTag,
      renderBody: renderBlogBody,
      renderMeta: renderBlogMeta,
    },
  };

  const config = CONFIGS[KIND];
  if (!config) {
    console.error("[board.js] Unbekannter oder fehlender window.HGS_BOARD.kind:", KIND);
    return;
  }

  let entries = [];
  let activeTags = []; /* Tag-Filter der Filmliste — leer heißt "alles zeigen" */

  /* ---------- modal stack (Esc closes topmost, backdrop click closes it) ---------- */
  const modalStack = [];

  function pushModal(backdrop, onClose) {
    document.body.appendChild(backdrop);
    modalStack.push({ backdrop, onClose });
    backdrop.addEventListener("mousedown", (e) => {
      if (e.target === backdrop) dismissTop(backdrop);
    });
    requestAnimationFrame(() => {
      const first = backdrop.querySelector("input, textarea, select, button");
      if (first) first.focus();
    });
  }
  function dismissTop(backdrop) {
    const idx = modalStack.findIndex((m) => m.backdrop === backdrop);
    if (idx === -1) return;
    const entry = modalStack[idx];
    modalStack.splice(idx, 1);
    backdrop.remove();
    if (entry.onClose) entry.onClose();
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modalStack.length) {
      dismissTop(modalStack[modalStack.length - 1].backdrop);
    }
  });

  /* ---------- toast ---------- */
  function showToast(message, isError) {
    const existing = document.querySelector(".toast");
    if (existing) existing.remove();
    const t = el("div", { class: "toast" + (isError ? " error" : ""), role: "status" }, message);
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }

  /* ---------- field validation ---------- */
  function validateField(field, value) {
    const trimmed = (value || "").trim();
    if (field.required && !trimmed) return "Pflichtfeld.";
    if (field.type === "url" && trimmed && !/^https?:\/\//i.test(trimmed)) {
      return "Bitte einen Link mit http(s):// angeben.";
    }
    return null;
  }

  /* ---------- code modal: resolves with a verified code, or null if cancelled ---------- */
  function openCodeModal() {
    return new Promise((resolve) => {
      let settled = false;
      const backdrop = el("div", { class: "modal-backdrop" });
      const card = el("div", {
        class: "modal-card",
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": "code-modal-title",
      });
      backdrop.appendChild(card);

      const h3 = el("h3", { id: "code-modal-title" }, "🔒 WG-Code");
      const form = el("form", { novalidate: true });
      const field = el("div", { class: "field" });
      const label = el("label", { for: "wg-code-input" }, "Zugangscode");
      const input = el("input", {
        class: "input",
        id: "wg-code-input",
        type: "password",
        inputmode: "numeric",
        autocomplete: "off",
      });
      const hint = el("p", { class: "hint" }, "Steht am Kühlschrank 😉");
      const error = el("p", { class: "field-error", hidden: true }, "Falscher Code.");
      field.append(label, input, hint, error);

      const actions = el("div", { class: "modal-actions" });
      const cancelBtn = el("button", { type: "button", class: "btn btn-ghost" }, "Abbrechen");
      const okBtn = el("button", { type: "submit", class: "btn btn-primary" }, "Bestätigen");
      actions.append(cancelBtn, okBtn);

      form.append(field, actions);
      card.append(h3, form);

      function finish(value) {
        if (settled) return;
        settled = true;
        resolve(value);
        dismissTop(backdrop);
      }
      function triggerError() {
        error.hidden = false;
        input.value = "";
        card.classList.remove("shake");
        void card.offsetWidth; /* restart animation */
        card.classList.add("shake");
        input.focus();
      }

      cancelBtn.addEventListener("click", () => finish(null));
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const val = input.value.trim();
        if (!val) {
          triggerError();
          return;
        }
        okBtn.disabled = true;
        let ok = false;
        try {
          ok = await HGSStore.verifyCode(val);
        } catch (_) {
          ok = false;
        }
        okBtn.disabled = false;
        if (ok) finish(val);
        else triggerError();
      });

      pushModal(backdrop, () => finish(null));
    });
  }

  /* ---------- confirm-delete modal: resolves true/false ---------- */
  function openConfirmModal(entryTitle) {
    return new Promise((resolve) => {
      let settled = false;
      const backdrop = el("div", { class: "modal-backdrop" });
      const card = el("div", {
        class: "modal-card",
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": "confirm-modal-title",
      });
      const h3 = el("h3", { id: "confirm-modal-title" }, "Wirklich löschen?");
      const p = el(
        "p",
        { class: "muted" },
        entryTitle ? "„" + entryTitle + "“ wird endgültig entfernt." : "Der Eintrag wird endgültig entfernt."
      );
      const actions = el("div", { class: "modal-actions" });
      const cancelBtn = el("button", { type: "button", class: "btn btn-ghost" }, "Abbrechen");
      const deleteBtn = el("button", { type: "button", class: "btn btn-danger" }, "Löschen");
      actions.append(cancelBtn, deleteBtn);
      card.append(h3, p, actions);
      backdrop.appendChild(card);

      function finish(value) {
        if (settled) return;
        settled = true;
        resolve(value);
        dismissTop(backdrop);
      }
      cancelBtn.addEventListener("click", () => finish(false));
      deleteBtn.addEventListener("click", () => finish(true));

      pushModal(backdrop, () => finish(false));
    });
  }

  /* ---------- add/edit entry modal: resolves with field data, or null if cancelled ---------- */
  function openEntryModal(mode, existingEntry) {
    return new Promise((resolve) => {
      let settled = false;
      const backdrop = el("div", { class: "modal-backdrop" });
      const card = el("div", {
        class: "modal-card",
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": "entry-modal-title",
      });
      backdrop.appendChild(card);

      const h3 = el(
        "h3",
        { id: "entry-modal-title" },
        mode === "add" ? config.modalTitleAdd : config.modalTitleEdit
      );
      const form = el("form", { novalidate: true });
      const controls = {};

      config.fields.forEach((f) => {
        const wrap = el("div", { class: "field" });
        const inputId = "field-" + f.key;
        const label = el("label", { for: inputId }, f.label);
        let inputEl;
        if (f.type === "images") {
          /* Sonderfall: kein einfaches Wertfeld, sondern eine kleine Bildverwaltung.
           * kept  = bereits gespeicherte Bilder, die bleiben sollen
           * added = neu gewählte Dateien (werden erst beim Speichern hochgeladen) */
          const kept = imageList(existingEntry || {}).slice();
          const added = [];
          const gallery = el("div", { class: "image-picker" });

          function drawGallery() {
            gallery.textContent = "";
            kept.forEach((image, idx) => {
              const item = el("div", { class: "image-chip" });
              item.appendChild(el("img", { src: image.src, alt: image.caption || "" }));
              const rm = el("button", { type: "button", class: "image-chip-remove", "aria-label": "Bild entfernen" }, "✕");
              rm.addEventListener("click", () => {
                kept.splice(idx, 1);
                drawGallery();
              });
              item.appendChild(rm);
              gallery.appendChild(item);
            });
            added.forEach((pending, idx) => {
              const item = el("div", { class: "image-chip pending" });
              item.appendChild(el("img", { src: "data:image/jpeg;base64," + pending.base64, alt: "" }));
              const rm = el("button", { type: "button", class: "image-chip-remove", "aria-label": "Bild entfernen" }, "✕");
              rm.addEventListener("click", () => {
                added.splice(idx, 1);
                drawGallery();
              });
              item.append(rm, el("span", { class: "image-chip-flag" }, "neu"));
              gallery.appendChild(item);
            });
          }

          const picker = el("input", { class: "image-input", id: inputId, type: "file", accept: "image/*", multiple: true });
          const status = el("p", { class: "hint" });
          picker.addEventListener("change", async () => {
            const files = Array.from(picker.files || []);
            picker.value = "";
            for (const file of files) {
              status.textContent = "Bild wird vorbereitet…";
              try {
                added.push({ base64: await fileToResizedBase64(file, 1600, 0.82) });
              } catch (_) {
                status.textContent = "Ein Bild konnte nicht gelesen werden.";
              }
              drawGallery();
            }
            status.textContent = "";
          });

          drawGallery();
          wrap.append(label, gallery, picker, status);
          if (f.hint) wrap.append(el("p", { class: "hint" }, f.hint));
          const errorEl = el("p", { class: "field-error", hidden: true });
          wrap.append(errorEl);
          form.appendChild(wrap);
          controls[f.key] = { imagesField: true, kept, added, errorEl };
          return;
        }
        if (f.type === "tags") {
          /* Sonderfall wie bei den Bildern: kein einzelnes Wertfeld, sondern
           * antippbare Stimmungen plus ein kleines Eingabefeld für eigene Tags. */
          const chosen = tagList(existingEntry || {});
          const presetRow = el("div", { class: "tag-picker" });
          const customRow = el("div", { class: "tag-picker custom", hidden: true });

          function toggleTag(tag) {
            const idx = chosen.indexOf(tag);
            if (idx === -1) chosen.push(tag);
            else chosen.splice(idx, 1);
            drawPicker();
          }
          function drawPicker() {
            presetRow.textContent = "";
            MOOD_TAGS.forEach((mood) => {
              const active = chosen.indexOf(mood.value) !== -1;
              const chip = el(
                "button",
                {
                  type: "button",
                  class: "tag-chip" + (active ? " is-active" : ""),
                  "aria-pressed": active ? "true" : "false",
                },
                tagLabel(mood.value)
              );
              chip.addEventListener("click", () => toggleTag(mood.value));
              presetRow.appendChild(chip);
            });

            customRow.textContent = "";
            const custom = chosen.filter((t) => MOOD_EMOJI[t] === undefined);
            custom.forEach((tag) => {
              const chip = el("span", { class: "tag-chip is-active is-custom" }, tag);
              const rm = el(
                "button",
                { type: "button", class: "tag-chip-remove", "aria-label": "Tag „" + tag + "“ entfernen" },
                "✕"
              );
              rm.addEventListener("click", () => toggleTag(tag));
              chip.appendChild(rm);
              customRow.appendChild(chip);
            });
            customRow.hidden = custom.length === 0;
          }

          const addRow = el("div", { class: "tag-add-row" });
          const tagInput = el("input", {
            class: "input tag-input",
            id: inputId,
            type: "text",
            maxlength: String(MAX_TAG_LENGTH),
            placeholder: "Eigener Tag…",
            autocomplete: "off",
          });
          const addBtn = el("button", { type: "button", class: "btn btn-ghost btn-small" }, "+ Tag");
          function addCustomTag() {
            const value = tagInput.value.trim().slice(0, MAX_TAG_LENGTH);
            tagInput.value = "";
            if (!value) return;
            /* Groß-/Kleinschreibung egal — sonst stehen "Klassiker" und "klassiker" nebeneinander */
            const known = chosen.some((t) => t.toLowerCase() === value.toLowerCase());
            if (!known) chosen.push(value);
            drawPicker();
          }
          addBtn.addEventListener("click", addCustomTag);
          tagInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
              e.preventDefault(); /* sonst würde das Formular abschicken */
              addCustomTag();
            }
          });
          addRow.append(tagInput, addBtn);

          drawPicker();
          wrap.append(label, presetRow, customRow, addRow);
          if (f.hint) wrap.append(el("p", { class: "hint" }, f.hint));
          form.appendChild(wrap);
          controls[f.key] = { tagsField: true, chosen };
          return;
        }
        if (f.type === "textarea") {
          inputEl = el("textarea", { class: "input", id: inputId, rows: "3" });
        } else if (f.type === "select") {
          inputEl = el("select", { class: "input", id: inputId });
          (f.options || []).forEach((opt) => {
            inputEl.appendChild(el("option", { value: opt.value }, opt.label));
          });
        } else {
          inputEl = el("input", {
            class: "input",
            id: inputId,
            type: f.type === "url" ? "url" : f.type === "date" ? "date" : "text",
          });
        }
        if (f.placeholder) inputEl.setAttribute("placeholder", f.placeholder);
        if (f.required) inputEl.setAttribute("aria-required", "true");
        if (existingEntry && existingEntry[f.key] !== undefined && existingEntry[f.key] !== null) {
          inputEl.value = existingEntry[f.key];
        }
        const errorEl = el("p", { class: "field-error", hidden: true });
        wrap.append(label, inputEl);
        if (f.hint) wrap.append(el("p", { class: "hint" }, f.hint));
        wrap.append(errorEl);
        form.appendChild(wrap);
        controls[f.key] = { inputEl, errorEl };
      });

      const actions = el("div", { class: "modal-actions" });
      const cancelBtn = el("button", { type: "button", class: "btn btn-ghost" }, "Abbrechen");
      const saveBtn = el("button", { type: "submit", class: "btn btn-primary" }, "Speichern");
      actions.append(cancelBtn, saveBtn);
      form.appendChild(actions);
      card.append(h3, form);

      function finish(value) {
        if (settled) return;
        settled = true;
        resolve(value);
        dismissTop(backdrop);
      }

      cancelBtn.addEventListener("click", () => finish(null));
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        let valid = true;
        let firstInvalid = null;
        const data = {};
        config.fields.forEach((f) => {
          const ctrl = controls[f.key];
          if (ctrl.imagesField) {
            data[f.key] = ctrl.kept.slice();
            data._pendingImages = ctrl.added.slice();
            return;
          }
          if (ctrl.tagsField) {
            data[f.key] = ctrl.chosen.slice().sort(compareTags);
            return;
          }
          const { inputEl, errorEl } = ctrl;
          const rawVal = inputEl.value;
          const errMsg = validateField(f, rawVal);
          if (errMsg) {
            valid = false;
            errorEl.textContent = errMsg;
            errorEl.hidden = false;
            inputEl.classList.add("invalid");
            if (!firstInvalid) firstInvalid = inputEl;
          } else {
            errorEl.hidden = true;
            inputEl.classList.remove("invalid");
          }
          data[f.key] = f.type === "date" ? rawVal : rawVal.trim();
        });
        if (!valid) {
          if (firstInvalid) firstInvalid.focus();
          return;
        }
        finish(data);
      });

      pushModal(backdrop, () => finish(null));
    });
  }

  /* ---------- write flow: code gate + HGSStore.save + re-render ----------
   * options.forceCode (used by delete) skips the sessionStorage shortcut so the
   * WG code modal always opens — even if a valid code is cached from a prior
   * add/edit in this session. On success the code is still cached for later
   * add/edit calls. */
  /* Gültigen Code besorgen — aus der Session oder per Modal.
   * Gibt null zurück, wenn abgebrochen wurde. */
  async function ensureCode(forceCode) {
    let code = forceCode ? null : sessionStorage.getItem("hgs-code");
    if (code) {
      let stillValid = false;
      try {
        stillValid = await HGSStore.verifyCode(code);
      } catch (_) {
        stillValid = false;
      }
      if (!stillValid) {
        sessionStorage.removeItem("hgs-code");
        code = null;
      }
    }
    if (!code) {
      code = await openCodeModal();
      if (code === null) return null;
    }
    return code;
  }

  async function saveEntries(nextEntries, successMsg, options) {
    const forceCode = !!(options && options.forceCode);
    let code = (options && options.code) || null;
    if (!code) {
      code = await ensureCode(forceCode);
      if (code === null) return false; /* user cancelled */
    }
    try {
      await HGSStore.save(KIND, nextEntries, code);
      sessionStorage.setItem("hgs-code", code);
      entries = nextEntries;
      renderGrid();
      showToast(successMsg);
      return true;
    } catch (err) {
      if (err && err.message === "bad-code") {
        sessionStorage.removeItem("hgs-code");
        /* den mitgegebenen Code verwerfen, sonst würde erneut derselbe versucht */
        const retryOpts = Object.assign({}, options, { code: null });
        return saveEntries(nextEntries, successMsg, retryOpts); /* reprompt */
      }
      showToast("Speichern fehlgeschlagen…", true);
      return false;
    }
  }

  /* Neu gewählte Bilder hochladen und an die behaltenen anhängen.
   * Gibt null zurück, wenn abgebrochen wurde oder etwas schiefging. */
  async function resolveImages(data) {
    const pending = data._pendingImages || [];
    delete data._pendingImages;
    if (pending.length === 0) return { data, code: null };

    const code = await ensureCode(false);
    if (code === null) return null;

    showToast(pending.length === 1 ? "Bild wird hochgeladen…" : "Bilder werden hochgeladen…");
    const uploaded = [];
    for (let n = 0; n < pending.length; n++) {
      const name = HGSStore.newId() + "-" + (n + 1) + ".jpg";
      try {
        uploaded.push({ src: await HGSStore.uploadImage(name, pending[n].base64, code) });
      } catch (err) {
        if (err && err.message === "bad-code") sessionStorage.removeItem("hgs-code");
        showToast("Bild-Upload fehlgeschlagen…", true);
        return null;
      }
    }
    data.images = (data.images || []).concat(uploaded);
    return { data, code };
  }

  /* ---------- Tag-Filter (nur Filme) ----------
   * Mehrere Tags gleichzeitig heißt "oder": gezeigt wird, was mindestens einen
   * der gewählten Tags trägt. Bei Stimmungen ist das die nützlichere Lesart —
   * "Zum Lachen UND Gruselig" wäre fast immer leer. */
  function matchesFilter(entry) {
    if (activeTags.length === 0) return true;
    const tags = tagList(entry);
    return activeTags.some((t) => tags.indexOf(t) !== -1);
  }

  function toggleFilter(tag) {
    const idx = activeTags.indexOf(tag);
    if (idx === -1) activeTags.push(tag);
    else activeTags.splice(idx, 1);
    renderGrid();
  }

  function renderFilters() {
    const bar = document.getElementById("board-filters");
    if (!bar) return;

    const counts = new Map();
    entries.forEach((entry) => {
      tagList(entry).forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1));
    });
    /* Tags, die es nicht mehr gibt (Eintrag gelöscht oder geändert), nicht weiterfiltern */
    activeTags = activeTags.filter((t) => counts.has(t));

    bar.textContent = "";
    if (counts.size === 0) {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;

    const chips = el("div", { class: "filter-chips" });
    const allChip = el(
      "button",
      {
        type: "button",
        class: "filter-chip" + (activeTags.length === 0 ? " is-active" : ""),
        "aria-pressed": activeTags.length === 0 ? "true" : "false",
      },
      "Alle"
    );
    allChip.addEventListener("click", () => {
      if (activeTags.length === 0) return;
      activeTags = [];
      renderGrid();
    });
    chips.appendChild(allChip);

    Array.from(counts.keys())
      .sort(compareTags)
      .forEach((tag) => {
        const active = activeTags.indexOf(tag) !== -1;
        const chip = el(
          "button",
          {
            type: "button",
            class: "filter-chip" + (active ? " is-active" : ""),
            "aria-pressed": active ? "true" : "false",
          },
          tagLabel(tag)
        );
        chip.appendChild(el("span", { class: "filter-count" }, String(counts.get(tag))));
        chip.addEventListener("click", () => toggleFilter(tag));
        chips.appendChild(chip);
      });

    bar.append(el("p", { class: "filter-label" }, "Filtern nach Stimmung & Tags"), chips);
  }

  /* Tag-Chips im Eintrag — ein Klick filtert die Liste danach */
  function renderEntryTags(container, entry) {
    const tags = tagList(entry).slice().sort(compareTags);
    if (tags.length === 0) return;
    const row = el("div", { class: "row-tags" });
    tags.forEach((tag) => {
      const active = activeTags.indexOf(tag) !== -1;
      const chip = el(
        "button",
        {
          type: "button",
          class: "tag row-tag" + (active ? " is-active" : ""),
          "aria-label": "Nach „" + tag + "“ filtern",
        },
        tagLabel(tag)
      );
      chip.addEventListener("click", () => toggleFilter(tag));
      row.appendChild(chip);
    });
    container.appendChild(row);
  }

  /* ---------- rendering: list rows (movies) ----------
   * Checkbox = "gesehen". Beim Abhaken öffnet sich inline ein Datumsfeld
   * ("Wann geschaut?"); erst Speichern schreibt (Code-Gate wie immer). */
  function createRow(entry) {
    const row = el("div", { class: "card entry-row" + (entry.watched ? " is-watched" : "") });

    const checkLabel = el("label", { class: "watch-check" });
    const checkbox = el("input", {
      type: "checkbox",
      "aria-label": entry.watched ? "Als noch nicht gesehen markieren" : "Als gesehen markieren",
    });
    checkbox.checked = !!entry.watched;
    checkLabel.append(checkbox, el("span", { class: "watch-box", "aria-hidden": "true" }, "✓"));

    const main = el("div", { class: "row-main" });
    const titleLine = el("div", { class: "row-title-line" });
    titleLine.appendChild(el("h3", {}, entry.title));

    function openDateRow(initial, onSave) {
      const existing = main.querySelector(".watch-date-row");
      if (existing) existing.remove();
      const wrap = el("div", { class: "watch-date-row" });
      const dateInput = el("input", { class: "input watch-date-input", type: "date", "aria-label": "Wann geschaut?" });
      dateInput.value = initial || localTodayISO();
      const ok = el("button", { type: "button", class: "btn btn-primary btn-small" }, "Speichern");
      const cancel = el("button", { type: "button", class: "btn btn-ghost btn-small" }, "Abbrechen");
      wrap.append(el("span", { class: "watch-date-label" }, "Wann geschaut?"), dateInput, ok, cancel);
      main.appendChild(wrap);
      dateInput.focus();
      cancel.addEventListener("click", () => {
        wrap.remove();
        checkbox.checked = !!entry.watched;
        checkbox.disabled = false;
      });
      ok.addEventListener("click", () => onSave(dateInput.value || localTodayISO(), wrap));
      return wrap;
    }

    if (entry.watched) {
      const d = parseLocalDate(entry.watchedAt);
      const tagText = d ? "Gesehen am " + d.toLocaleDateString("de-DE") : "Gesehen";
      const watchedTag = el(
        "button",
        { type: "button", class: "tag alt watched-tag", "aria-label": tagText + " — Datum ändern" },
        tagText + " ✎"
      );
      watchedTag.addEventListener("click", () => {
        openDateRow(entry.watchedAt, async (val, wrap) => {
          const next = entries.map((e) => (e.id === entry.id ? Object.assign({}, entry, { watchedAt: val }) : e));
          const saved = await saveEntries(next, "Datum aktualisiert.");
          if (!saved) wrap.remove();
        });
      });
      titleLine.appendChild(watchedTag);
    }
    main.appendChild(titleLine);
    if (entry.description) main.appendChild(el("p", { class: "row-desc" }, entry.description));
    if (config.taggable) renderEntryTags(main, entry);

    const metaRow = el("div", { class: "row-meta" });
    if (entry.url && /^https?:\/\//i.test(entry.url)) {
      metaRow.appendChild(
        el("a", { href: entry.url, target: "_blank", rel: "noopener", class: "justwatch-link" }, "JustWatch ↗")
      );
    }
    metaRow.appendChild(el("span", { class: "date-meta muted" }, "eingetragen am " + formatCreated(entry.createdAt)));
    main.appendChild(metaRow);

    const actions = el("div", { class: "card-actions" });
    const editBtn = el("button", { type: "button", class: "icon-btn", "aria-label": "Bearbeiten" }, "✏️");
    const deleteBtn = el("button", { type: "button", class: "icon-btn", "aria-label": "Löschen" }, "🗑");
    actions.append(editBtn, deleteBtn);

    row.append(checkLabel, main, actions);

    checkbox.addEventListener("change", async () => {
      if (checkbox.checked) {
        checkbox.disabled = true;
        openDateRow(null, async (val, wrap) => {
          const updated = Object.assign({}, entry, { watched: true, watchedAt: val });
          const next = entries.map((e) => (e.id === entry.id ? updated : e));
          const saved = await saveEntries(next, "Als gesehen markiert 🎬");
          if (!saved) {
            wrap.remove();
            checkbox.checked = false;
            checkbox.disabled = false;
          }
        });
      } else {
        const updated = Object.assign({}, entry, { watched: false, watchedAt: "" });
        const next = entries.map((e) => (e.id === entry.id ? updated : e));
        const saved = await saveEntries(next, "Wieder auf der Watchlist.");
        if (!saved) checkbox.checked = true;
      }
    });

    editBtn.addEventListener("click", async () => {
      const data = await openEntryModal("edit", entry);
      if (!data) return;
      const resolved = await resolveImages(data);
      if (!resolved) return;
      const updated = Object.assign({}, entry, resolved.data);
      const next = entries.map((e) => (e.id === entry.id ? updated : e));
      await saveEntries(next, config.toastEdit, { code: resolved.code });
    });
    deleteBtn.addEventListener("click", async () => {
      const confirmed = await openConfirmModal(entry.title);
      if (!confirmed) return;
      const next = entries.filter((e) => e.id !== entry.id);
      await saveEntries(next, config.toastDelete, { forceCode: true });
    });

    return row;
  }

  /* ---------- rendering ---------- */
  function createCard(entry) {
    if (config.watchable) return createRow(entry);
    /* Teilbare Einträge tragen ihre id als Anker — /blog/#<id> springt hierher */
    const card = el("div", config.shareable ? { class: "card entry-card", id: entry.id } : { class: "card" });
    const head = el("div", { class: "card-head" });
    const titleWrap = el("div", { class: "card-title-wrap" });
    if (config.renderTag) {
      const tag = config.renderTag(entry);
      if (tag) titleWrap.appendChild(tag);
    }
    titleWrap.appendChild(el("h3", {}, entry.title));
    const actions = el("div", { class: "card-actions" });
    if (config.shareable) {
      const shareBtn = el("button", { type: "button", class: "icon-btn", "aria-label": "Teilen" }, "🔗");
      shareBtn.addEventListener("click", () => shareEntry(entry));
      actions.appendChild(shareBtn);
    }
    const editBtn = el("button", { type: "button", class: "icon-btn", "aria-label": "Bearbeiten" }, "✏️");
    const deleteBtn = el("button", { type: "button", class: "icon-btn", "aria-label": "Löschen" }, "🗑");
    actions.append(editBtn, deleteBtn);
    head.append(titleWrap, actions);
    card.append(head);
    config.renderBody(card, entry);
    config.renderMeta(card, entry);

    editBtn.addEventListener("click", async () => {
      const data = await openEntryModal("edit", entry);
      if (!data) return;
      const resolved = await resolveImages(data);
      if (!resolved) return;
      const updated = Object.assign({}, entry, resolved.data);
      const next = entries.map((e) => (e.id === entry.id ? updated : e));
      await saveEntries(next, config.toastEdit, { code: resolved.code });
    });
    deleteBtn.addEventListener("click", async () => {
      const confirmed = await openConfirmModal(entry.title);
      if (!confirmed) return;
      const next = entries.filter((e) => e.id !== entry.id);
      await saveEntries(next, config.toastDelete, { forceCode: true });
    });

    return card;
  }

  function renderGrid() {
    const grid = document.getElementById("board-grid");
    const status = document.getElementById("board-status");
    if (!grid) return;
    if (config.listMode) {
      grid.classList.remove("grid");
      grid.classList.add("board-list");
    }
    grid.textContent = "";
    if (status) status.hidden = true;
    grid.hidden = false;
    if (config.taggable) renderFilters(); /* setzt auch nicht mehr vorhandene Filter zurück */

    if (entries.length === 0) {
      const emptyCard = el("div", { class: "card empty-card" });
      emptyCard.appendChild(el("p", { class: "muted" }, config.emptyMessage));
      grid.appendChild(emptyCard);
      return;
    }

    const visible = config.taggable ? entries.filter(matchesFilter) : entries;

    if (visible.length === 0) {
      const noMatch = el("div", { class: "card empty-card" });
      noMatch.appendChild(el("p", { class: "muted" }, "Kein Film mit diesen Tags."));
      const reset = el("button", { type: "button", class: "btn btn-ghost btn-small" }, "Filter zurücksetzen");
      reset.addEventListener("click", () => {
        activeTags = [];
        renderGrid();
      });
      noMatch.appendChild(reset);
      grid.appendChild(noMatch);
      return;
    }

    /* Filme: zwei getrennte Listen — offene Watchlist und schon Gesehenes */
    if (config.splitWatched) {
      const open = config.sort(visible.filter((e) => !e.watched));
      const seen = config.sort(visible.filter((e) => e.watched));

      const filtering = activeTags.length > 0;

      grid.appendChild(el("h2", { class: "list-group-title" }, "Watchlist"));
      if (open.length === 0) {
        const done = el("div", { class: "card empty-card" });
        done.appendChild(
          el("p", { class: "muted" }, filtering ? "Nichts Offenes mit diesen Tags." : "Alles abgehakt — Zeit für Nachschub!")
        );
        grid.appendChild(done);
      } else {
        open.forEach((entry) => grid.appendChild(createCard(entry)));
      }

      const seenTitle = el("h2", { class: "list-group-title watched-group-title" }, "Schon gesehen");
      seenTitle.appendChild(el("span", { class: "list-group-count" }, String(seen.length)));
      grid.appendChild(seenTitle);
      if (seen.length === 0) {
        const none = el("div", { class: "card empty-card" });
        none.appendChild(
          el(
            "p",
            { class: "muted" },
            filtering
              ? "Nichts Gesehenes mit diesen Tags."
              : "Noch nichts abgehakt. Häkchen setzen, sobald ihr was geschaut habt."
          )
        );
        grid.appendChild(none);
      } else {
        seen.forEach((entry) => grid.appendChild(createCard(entry)));
      }
      return;
    }

    config.sort(visible).forEach((entry) => grid.appendChild(createCard(entry)));
  }

  /* ---------- init ---------- */
  async function init() {
    const status = document.getElementById("board-status");
    const addBtn = document.getElementById("add-entry-btn");

    if (status) status.textContent = "Lade…";
    try {
      entries = await HGSStore.load(KIND);
    } catch (_) {
      entries = [];
      showToast("Laden fehlgeschlagen…", true);
    }
    renderGrid();

    /* Die Karten stehen erst jetzt im DOM — der Browser hat den Anker aus der
     * URL längst aufgegeben, also selbst hinspringen. */
    if (config.shareable) {
      focusHashEntry();
      window.addEventListener("hashchange", focusHashEntry);
    }

    if (addBtn) {
      addBtn.addEventListener("click", async () => {
        const data = await openEntryModal("add");
        if (!data) return;
        const resolved = await resolveImages(data);
        if (!resolved) return;
        const entry = Object.assign({ id: HGSStore.newId(), createdAt: new Date().toISOString() }, resolved.data);
        await saveEntries(entries.concat(entry), config.toastAdd, { code: resolved.code });
      });
    }

    /* Offene Seite aktualisieren, wenn sie wieder in den Vordergrund kommt —
     * sonst sieht man Einträge nicht, die jemand anderes zwischenzeitlich
     * eingetragen oder abgehakt hat. Nicht stören, während gerade jemand
     * tippt (Modal offen) oder ein Datum eingibt.
     * force = die Aktualisierung wurde ausdrücklich verlangt (Pull-to-Refresh):
     * dann ohne Wartezeit und ohne Sichtbarkeitsprüfung. */
    let lastRefresh = Date.now();
    async function reloadEntries(force) {
      if (!force) {
        if (document.visibilityState !== "visible") return true;
        if (Date.now() - lastRefresh < 10000) return true;
        if (document.querySelector(".modal-backdrop") || document.querySelector(".watch-date-row")) return true;
      }
      lastRefresh = Date.now();
      let fresh;
      try {
        fresh = await HGSStore.load(KIND);
      } catch (_) {
        return false;
      }
      if (JSON.stringify(fresh) === JSON.stringify(entries)) return true;
      entries = fresh;
      renderGrid();
      return true;
    }
    document.addEventListener("visibilitychange", () => reloadEntries(false));
    window.addEventListener("focus", () => reloadEntries(false));

    /* Nach unten ziehen holt die Einträge frisch (assets/js/pull-to-refresh.js) */
    if (window.HGSRefresh) {
      window.HGSRefresh.register(async () => {
        const ok = await reloadEntries(true);
        showToast(ok ? "Aktualisiert." : "Aktualisieren fehlgeschlagen…", !ok);
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

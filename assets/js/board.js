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
      ],
      sort: sortMovies,
      listMode: true,
      watchable: true,
      splitWatched: true,
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
      ],
      sort: sortByCreatedDesc,
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
          const { inputEl, errorEl } = controls[f.key];
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
  async function saveEntries(nextEntries, successMsg, options) {
    const forceCode = !!(options && options.forceCode);
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
        return saveEntries(nextEntries, successMsg, options); /* reprompt */
      }
      showToast("Speichern fehlgeschlagen…", true);
      return false;
    }
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
      const updated = Object.assign({}, entry, data);
      const next = entries.map((e) => (e.id === entry.id ? updated : e));
      await saveEntries(next, config.toastEdit);
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
    const card = el("div", { class: "card" });
    const head = el("div", { class: "card-head" });
    const titleWrap = el("div", { class: "card-title-wrap" });
    if (config.renderTag) {
      const tag = config.renderTag(entry);
      if (tag) titleWrap.appendChild(tag);
    }
    titleWrap.appendChild(el("h3", {}, entry.title));
    const actions = el("div", { class: "card-actions" });
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
      const updated = Object.assign({}, entry, data);
      const next = entries.map((e) => (e.id === entry.id ? updated : e));
      await saveEntries(next, config.toastEdit);
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

    if (entries.length === 0) {
      const emptyCard = el("div", { class: "card empty-card" });
      emptyCard.appendChild(el("p", { class: "muted" }, config.emptyMessage));
      grid.appendChild(emptyCard);
      return;
    }

    /* Filme: zwei getrennte Listen — offene Watchlist und schon Gesehenes */
    if (config.splitWatched) {
      const open = config.sort(entries.filter((e) => !e.watched));
      const seen = config.sort(entries.filter((e) => e.watched));

      grid.appendChild(el("h2", { class: "list-group-title" }, "Watchlist"));
      if (open.length === 0) {
        const done = el("div", { class: "card empty-card" });
        done.appendChild(el("p", { class: "muted" }, "Alles abgehakt — Zeit für Nachschub!"));
        grid.appendChild(done);
      } else {
        open.forEach((entry) => grid.appendChild(createCard(entry)));
      }

      const seenTitle = el("h2", { class: "list-group-title watched-group-title" }, "Schon gesehen");
      seenTitle.appendChild(el("span", { class: "list-group-count" }, String(seen.length)));
      grid.appendChild(seenTitle);
      if (seen.length === 0) {
        const none = el("div", { class: "card empty-card" });
        none.appendChild(el("p", { class: "muted" }, "Noch nichts abgehakt. Häkchen setzen, sobald ihr was geschaut habt."));
        grid.appendChild(none);
      } else {
        seen.forEach((entry) => grid.appendChild(createCard(entry)));
      }
      return;
    }

    config.sort(entries).forEach((entry) => grid.appendChild(createCard(entry)));
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

    if (addBtn) {
      addBtn.addEventListener("click", async () => {
        const data = await openEntryModal("add");
        if (!data) return;
        const entry = Object.assign({ id: HGSStore.newId(), createdAt: new Date().toISOString() }, data);
        await saveEntries(entries.concat(entry), config.toastAdd);
      });
    }

    /* Offene Seite aktualisieren, wenn sie wieder in den Vordergrund kommt —
     * sonst sieht man Einträge nicht, die jemand anderes zwischenzeitlich
     * eingetragen oder abgehakt hat. Nicht stören, während gerade jemand
     * tippt (Modal offen) oder ein Datum eingibt. */
    let lastRefresh = Date.now();
    async function refresh() {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastRefresh < 10000) return;
      if (document.querySelector(".modal-backdrop") || document.querySelector(".watch-date-row")) return;
      lastRefresh = Date.now();
      let fresh;
      try {
        fresh = await HGSStore.load(KIND);
      } catch (_) {
        return;
      }
      if (JSON.stringify(fresh) === JSON.stringify(entries)) return;
      entries = fresh;
      renderGrid();
    }
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

/* HGS Pull-to-Refresh — am oberen Seitenrand nach unten ziehen aktualisiert.
 * Auf jeder Seite eingebunden (außer dem Album-Player). Seiten mit eigenen Daten
 * melden über HGSRefresh.register(fn) eine eigene Aktualisierung an; ohne
 * Anmeldung wird die Seite schlicht neu geladen.
 *
 *   window.HGSRefresh.register(async () => { … });   // z. B. board.js
 *
 * Nur für Touch-Geräte — am Desktop gibt es den Reload-Button des Browsers.
 */
(function () {
  "use strict";

  const THRESHOLD = 72; /* ab hier löst das Loslassen die Aktualisierung aus */
  const MAX_PULL = 120; /* weiter lässt sich nicht ziehen */
  const RESISTANCE = 0.55; /* zähes Ziehen, wie man es von nativen Apps kennt */
  const MIN_SPIN = 550; /* kurz sichtbar bleiben, sonst blitzt es nur auf */

  let handler = null;

  window.HGSRefresh = {
    register(fn) {
      handler = fn;
    },
    /* Aktualisieren ohne Geste — z. B. für Tests oder spätere Buttons */
    run() {
      return runRefresh();
    },
  };

  let indicator = null;
  let arrow = null;
  let startY = 0;
  let startX = 0;
  let distance = 0;
  let tracking = false; /* Finger unten, Seite war ganz oben */
  let pulling = false; /* eindeutig eine Zieh-Geste (nicht seitwärts, nicht scrollen) */
  let refreshing = false;

  function ensureIndicator() {
    if (indicator) return;
    indicator = document.createElement("div");
    indicator.className = "ptr-indicator";
    indicator.setAttribute("aria-hidden", "true");
    arrow = document.createElement("span");
    arrow.className = "ptr-arrow";
    arrow.textContent = "↓";
    indicator.appendChild(arrow);
    document.body.appendChild(indicator);
  }

  function place(dist) {
    ensureIndicator();
    const progress = Math.min(1, dist / THRESHOLD);
    indicator.style.transform = "translate(-50%, " + Math.round(dist) + "px)";
    indicator.style.opacity = String(Math.min(1, progress * 1.2));
    indicator.classList.toggle("is-ready", dist >= THRESHOLD);
    if (!refreshing) arrow.style.transform = "rotate(" + Math.round(progress * 180) + "deg)";
  }

  function reset() {
    if (!indicator) return;
    indicator.classList.add("is-settling");
    indicator.classList.remove("is-ready", "is-refreshing");
    indicator.style.transform = "translate(-50%, 0)";
    indicator.style.opacity = "0";
    arrow.textContent = "↓";
    arrow.style.transform = "rotate(0deg)";
    setTimeout(() => indicator && indicator.classList.remove("is-settling"), 260);
  }

  /* Nicht stören, während jemand gerade tippt oder ein Bild groß ansieht */
  function blocked() {
    return !!document.querySelector(".modal-backdrop, .lightbox-backdrop, .watch-date-row");
  }

  async function runRefresh() {
    if (refreshing) return;
    refreshing = true;
    ensureIndicator();
    indicator.classList.add("is-refreshing");
    indicator.classList.remove("is-ready");
    indicator.style.opacity = "1";
    indicator.style.transform = "translate(-50%, " + THRESHOLD + "px)";
    arrow.textContent = "↻";
    arrow.style.transform = "";

    const started = Date.now();
    try {
      if (handler) await handler();
      else {
        window.location.reload();
        return; /* Seite geht ohnehin weg */
      }
    } catch (_) {
      /* Die angemeldete Aktualisierung meldet Fehler selbst (Toast) */
    }
    const rest = MIN_SPIN - (Date.now() - started);
    if (rest > 0) await new Promise((r) => setTimeout(r, rest));
    refreshing = false;
    distance = 0;
    reset();
  }

  /* Die Geste selbst gibt es nur auf Touch-Geräten — am Desktop tut es der
   * Reload-Button des Browsers. HGSRefresh.run() funktioniert trotzdem überall. */
  if (!("ontouchstart" in window) && !(navigator.maxTouchPoints > 0)) return;

  document.addEventListener(
    "touchstart",
    (e) => {
      if (refreshing || e.touches.length !== 1) return;
      if (window.scrollY > 0 || blocked()) return;
      tracking = true;
      pulling = false;
      distance = 0;
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
    },
    { passive: true }
  );

  document.addEventListener(
    "touchmove",
    (e) => {
      if (!tracking || refreshing) return;
      const dy = e.touches[0].clientY - startY;
      const dx = e.touches[0].clientX - startX;

      if (!pulling) {
        /* Erst ab einem klaren Zug nach unten übernehmen — seitwärts wischen
         * und normales Scrollen sollen sich unverändert anfühlen. */
        if (dy < 10 || Math.abs(dx) > Math.abs(dy)) {
          if (dy < -4 || Math.abs(dx) > 12) tracking = false;
          return;
        }
        if (window.scrollY > 0) {
          tracking = false;
          return;
        }
        pulling = true;
      }

      if (dy <= 0) {
        distance = 0;
        place(0);
        return;
      }
      e.preventDefault(); /* hält das Gummiband des Browsers an */
      distance = Math.min(MAX_PULL, dy * RESISTANCE);
      place(distance);
    },
    { passive: false }
  );

  function endTouch() {
    if (!tracking) return;
    tracking = false;
    if (!pulling || refreshing) return;
    pulling = false;
    if (distance >= THRESHOLD) runRefresh();
    else reset();
  }

  document.addEventListener("touchend", endTouch, { passive: true });
  document.addEventListener("touchcancel", endTouch, { passive: true });
})();

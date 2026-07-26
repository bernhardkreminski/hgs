/* Chebter One (Remastered) — player. Owned by orchestrator. */
(function () {
  "use strict";

  const TRACKS = [
    { n: 1, title: "Chepperia" },
    { n: 2, title: "Where R U tonight?" },
    { n: 3, title: "Pfenningfuchser" },
    { n: 4, title: "Forget us" },
    { n: 5, title: "Fruits" },
    { n: 6, title: "Wenn nicht mit Cheb dann mit der Pumpgun" },
    { n: 7, title: "Bauch-Gewitter" },
    { n: 8, title: "Midnight" },
    { n: 9, title: "Where You Left Me" },
    { n: 10, title: "Chepperia (Gen-Z Remix)" },
  ];
  const src = (t) => "/assets/audio/" + String(t.n).padStart(2, "0") + ".mp3";

  const audio = document.getElementById("audio");
  const list = document.getElementById("tracklist");
  const vinyl = document.getElementById("vinyl");
  const playToggle = document.getElementById("play-toggle");
  const pbPlay = document.getElementById("pb-play");
  const pbTitle = document.getElementById("pb-title");
  const seek = document.getElementById("seek");
  const cur = document.getElementById("pb-current");
  const dur = document.getElementById("pb-duration");
  const overlay = document.getElementById("listen-overlay");
  const loTitle = document.getElementById("lo-title");
  const loPlay = document.getElementById("lo-play");

  let idx = -1;
  let seeking = false;

  const fmt = (s) => {
    if (!isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    return m + ":" + String(Math.floor(s % 60)).padStart(2, "0");
  };

  /* ---------- track list ---------- */
  TRACKS.forEach((t, i) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "track";
    const num = document.createElement("span");
    num.className = "track-num";
    num.textContent = String(t.n).padStart(2, "0");
    const name = document.createElement("span");
    name.className = "track-name";
    name.textContent = t.title;
    const eq = document.createElement("span");
    eq.className = "track-eq";
    eq.setAttribute("aria-hidden", "true");
    eq.innerHTML = "<i></i><i></i><i></i>";
    btn.append(num, name, eq);
    btn.addEventListener("click", () => (i === idx ? toggle() : play(i)));
    li.appendChild(btn);
    list.appendChild(li);
  });
  const trackBtns = [...list.querySelectorAll(".track")];

  /* ---------- core ---------- */
  function play(i) {
    idx = (i + TRACKS.length) % TRACKS.length;
    audio.src = src(TRACKS[idx]);
    audio.play().catch(() => {});
    updateUi();
  }
  function toggle() {
    if (idx === -1) return play(0);
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  }
  function updateUi() {
    const playing = idx !== -1 && !audio.paused && !audio.ended;
    const t = idx === -1 ? null : TRACKS[idx];
    pbTitle.textContent = t ? String(t.n).padStart(2, "0") + " · " + t.title : "—";
    loTitle.textContent = t ? t.title : "—";
    playToggle.innerHTML = playing ? "⏸&nbsp; Pause" : "▶&nbsp; Abspielen";
    pbPlay.textContent = playing ? "⏸" : "▶";
    loPlay.textContent = playing ? "⏸" : "▶";
    vinyl.classList.toggle("spinning", idx !== -1);
    vinyl.classList.toggle("paused", !playing);
    document.body.classList.toggle("is-playing", playing);
    trackBtns.forEach((b, i) => b.classList.toggle("current", i === idx));
    if ("mediaSession" in navigator && t) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: t.title,
        artist: "Cheb",
        album: "Chebter One (Remastered)",
        artwork: [{ src: "/assets/img/p-cheb.jpg", sizes: "512x512", type: "image/jpeg" }],
      });
    }
  }

  audio.addEventListener("play", updateUi);
  audio.addEventListener("pause", updateUi);
  audio.addEventListener("ended", () => (idx < TRACKS.length - 1 ? play(idx + 1) : updateUi()));
  audio.addEventListener("loadedmetadata", () => (dur.textContent = fmt(audio.duration)));
  audio.addEventListener("timeupdate", () => {
    cur.textContent = fmt(audio.currentTime);
    if (!seeking && audio.duration) seek.value = (audio.currentTime / audio.duration) * 100;
  });

  /* ---------- controls ---------- */
  playToggle.addEventListener("click", toggle);
  pbPlay.addEventListener("click", toggle);
  loPlay.addEventListener("click", toggle);
  document.getElementById("prev-btn").addEventListener("click", () => play(idx - 1));
  document.getElementById("next-btn").addEventListener("click", () => play(idx + 1));
  document.getElementById("lo-prev").addEventListener("click", () => play(idx - 1));
  document.getElementById("lo-next").addEventListener("click", () => play(idx + 1));

  seek.addEventListener("input", () => (seeking = true));
  seek.addEventListener("change", () => {
    if (audio.duration) audio.currentTime = (seek.value / 100) * audio.duration;
    seeking = false;
  });

  /* ---------- listen mode (fullscreen) ---------- */
  function enterListenMode() {
    overlay.hidden = false;
    document.body.classList.add("listen-mode");
    if (idx === -1) play(0);
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }
  function exitListenMode() {
    overlay.hidden = true;
    document.body.classList.remove("listen-mode");
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  }
  document.getElementById("listen-mode-btn").addEventListener("click", enterListenMode);
  document.getElementById("lo-exit").addEventListener("click", exitListenMode);
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && !overlay.hidden) {
      overlay.hidden = true;
      document.body.classList.remove("listen-mode");
    }
  });

  /* ---------- keyboard ---------- */
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    if (e.code === "Space") { e.preventDefault(); toggle(); }
    else if (e.key === "ArrowRight" && e.shiftKey) play(idx + 1);
    else if (e.key === "ArrowLeft" && e.shiftKey) play(idx - 1);
    else if (e.key === "Escape" && !overlay.hidden) exitListenMode();
  });

  if ("mediaSession" in navigator) {
    navigator.mediaSession.setActionHandler("previoustrack", () => play(idx - 1));
    navigator.mediaSession.setActionHandler("nexttrack", () => play(idx + 1));
  }
})();

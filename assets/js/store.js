/* HGS data layer — owned by orchestrator.
 * Lesen ist für alle frei. Schreiben verlangt den WG-Code.
 * Backends: 'local' (localStorage, Seed aus data/*.json) und
 * 'github' (geteiltes JSON in einem GitHub-Repo, Token per Code entschlüsselt).
 */
(function () {
  "use strict";
  const CFG = window.HGS_CONFIG;
  const enc = new TextEncoder();

  async function sha256Hex(str) {
    const buf = await crypto.subtle.digest("SHA-256", enc.encode(str));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function b64ToBytes(b64) {
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  }

  async function verifyCode(code) {
    return (await sha256Hex(String(code).trim())) === CFG.codeHash;
  }

  /* Schlüssel aus dem Code ableiten und den hinterlegten Token entschlüsseln.
   * Wirft bei falschem Code (AES-GCM-Integritätsfehler). */
  async function decryptToken(code) {
    const t = CFG.github.encToken;
    const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(String(code).trim()), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: b64ToBytes(t.salt), iterations: 150000, hash: "SHA-256" },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBytes(t.iv) }, key, b64ToBytes(t.data));
    return new TextDecoder().decode(plain);
  }

  const localBackend = {
    async load(kind) {
      const raw = localStorage.getItem("hgs:" + kind);
      if (raw !== null) {
        try { return JSON.parse(raw); } catch (_) { /* fällt auf Seed zurück */ }
      }
      try {
        const res = await fetch("data/" + kind + ".json", { cache: "no-store" });
        if (res.ok) return await res.json();
      } catch (_) { /* offline / file:// */ }
      return [];
    },
    async save(kind, entries) {
      localStorage.setItem("hgs:" + kind, JSON.stringify(entries));
    },
  };

  const githubBackend = {
    async load(kind) {
      const g = CFG.github;
      /* Primär über die GitHub-API lesen: raw.githubusercontent.com liefert nach
       * einem Schreibvorgang noch minutenlang veraltete Inhalte aus dem CDN aus
       * (dann fehlen z. B. gerade eingetragene Filme). Die API antwortet frisch.
       * Fällt bei Rate-Limit/Netzproblemen auf das CDN zurück. */
      const api =
        "https://api.github.com/repos/" + g.owner + "/" + g.repo + "/contents/" + kind + ".json?ref=" + g.branch + "&t=" + Date.now();
      try {
        const res = await fetch(api, { headers: { Accept: "application/vnd.github.raw" }, cache: "no-store" });
        if (res.status === 404) return [];
        if (res.ok) return JSON.parse(await res.text());
      } catch (_) {
        /* unten über das CDN versuchen */
      }
      const url = "https://raw.githubusercontent.com/" + g.owner + "/" + g.repo + "/" + g.branch + "/" + kind + ".json?t=" + Date.now();
      const res = await fetch(url, { cache: "no-store" });
      if (res.status === 404) return [];
      if (!res.ok) throw new Error("load-failed");
      return res.json();
    },
    async save(kind, entries, code) {
      const g = CFG.github;
      let token;
      try {
        token = await decryptToken(code);
      } catch (_) {
        throw new Error("bad-code");
      }
      const api = "https://api.github.com/repos/" + g.owner + "/" + g.repo + "/contents/" + kind + ".json";
      const headers = { Authorization: "Bearer " + token, Accept: "application/vnd.github+json" };
      const putOnce = async () => {
        let sha;
        const head = await fetch(api + "?ref=" + g.branch + "&t=" + Date.now(), { headers, cache: "no-store" });
        if (head.ok) sha = (await head.json()).sha;
        const body = {
          message: "whiteboard: update " + kind,
          content: btoa(unescape(encodeURIComponent(JSON.stringify(entries, null, 2)))),
          branch: g.branch,
        };
        if (sha) body.sha = sha;
        return fetch(api, { method: "PUT", headers, body: JSON.stringify(body) });
      };
      let res = await putOnce();
      if (res.status === 409) res = await putOnce(); /* sha veraltet (paralleler Write) — einmal neu versuchen */
      if (!res.ok) throw new Error("save-failed");
    },
  };

  window.HGSStore = {
    async load(kind) {
      return (CFG.backend === "github" ? githubBackend : localBackend).load(kind);
    },
    async save(kind, entries, code) {
      if (!(await verifyCode(code))) throw new Error("bad-code");
      if (CFG.backend === "github") {
        await githubBackend.save(kind, entries, code);
      } else {
        await localBackend.save(kind, entries);
      }
    },
    verifyCode,
    newId() {
      return "e-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    },
  };
})();

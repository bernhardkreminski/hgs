/* HGS config — owned by orchestrator. */
window.HGS_CONFIG = {
  // 'local'  : Einträge liegen im localStorage des Geräts (Seed aus data/*.json)
  // 'github' : geteilter Speicher — Einträge liegen als JSON in einem GitHub-Repo
  backend: "local",

  // SHA-256 des Zugangscodes (der Code selbst steht bewusst nicht im Klartext hier)
  codeHash: "712dca40936b39ce670dc803736fe3735cf99311030a928de039a36f77926230",

  // Nur für backend 'github':
  github: {
    owner: "bernhardkreminski",
    repo: "hgs-data",
    branch: "main",
    // Fine-grained PAT (nur Contents:write auf das Daten-Repo), AES-GCM-verschlüsselt,
    // Schlüssel wird per PBKDF2 aus dem Zugangscode abgeleitet. { salt, iv, data } als Base64.
    encToken: null
  }
};

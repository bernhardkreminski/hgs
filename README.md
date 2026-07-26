# HGS 🌇

Die Website unserer WG — gebaut für [GitHub Pages](https://bernhardkreminski.github.io/hgs/).

## Seiten

| Seite | Datei | Beschreibung |
|---|---|---|
| Start | `index.html` | Landing Page mit Rooftop-Sunset-Hero |
| Die WG | `about.html` | Generiertes Gruppen-Artwork + wer hier wohnt |
| Filmliste | `movies.html` | Whiteboard: Filme, die wir noch schauen müssen |
| Workshops | `workshops.html` | Whiteboard: Wer zeigt wem was |

## Whiteboards

Alle können Einträge **lesen**. Zum **Eintragen/Ändern/Löschen** braucht es den WG-Code
(ihr wisst schon — steht am Kühlschrank 😉).

Die Einträge liegen als JSON im Repo [`hgs-data`](https://github.com/bernhardkreminski/hgs-data)
und werden per GitHub-API geschrieben. Der dafür nötige Token ist mit dem WG-Code
verschlüsselt (PBKDF2 + AES-GCM) in `assets/js/config.js` hinterlegt und hat nur
Schreibrechte auf `hgs-data` — schlimmstenfalls malt jemand das Whiteboard voll,
und das lässt sich über die Git-History jederzeit zurückholen.

Backend umschalten: `assets/js/config.js` → `backend: "github" | "local"`.

## Entwicklung

Kein Build, kein Framework — statisches HTML/CSS/JS. Lokal einfach:

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

Design-System & Konventionen: siehe [`DESIGN.md`](DESIGN.md).

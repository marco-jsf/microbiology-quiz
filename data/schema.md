# Datenmodell — eine JSON-Datei pro Vorlesung

Jede Datei in `data/` ist ein Kapitel (= eine Vorlesung). Registriert werden die
Dateien in `js/data.js` (`CHAPTER_FILES`). Alle Inhalte sind **deutsch**;
Fachbegriffe, die auf den Folien englisch stehen, stehen in Klammern dabei
(z. B. „Axoninitialsegment (AIS)“, „Gliogenic Switch“).

```jsonc
{
  "id": "vl01",                       // eindeutig
  "title": "VL01 · Neuroglia",        // Kapitelauswahl / Dashboard
  "short": "Glia",                    // kurzes Label
  "color": "#3fa7a0",                 // Akzentfarbe
  "topics": ["Zellzahlen & Glia-Typen", "Oligodendrozyten & Myelin", "..."],  // Reihenfolge fürs Dashboard
  "questions": [ /* Fragen, siehe unten */ ]
}
```

## Gemeinsame Felder jeder Frage

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `id` | ✓ | stabil, kebab-case, mit Kapitelpräfix: `vl01-mikroglia-ursprung`. Fortschritt hängt an der ID, also nie umbenennen. Zieht eine Frage in ein anderes Kapitel um, alte → neue ID in `ID_ALIASES` (js/engine.js) eintragen. |
| `type` | ✓ | `single` · `multi` · `combo` · `open` · `label` · `order` |
| `topic` | ✓ | genau einer der Einträge aus `topics` |
| `source` | ✓ | `exam` (aus Gedankenprotokoll) · `slides` (aus den Folien erstellt) · `book` (Lehrbuchwissen, nur wo Folien fehlen) |
| `exam` | bei exam | z. B. `"WS23/24"`, `"WS24/25"`, `"WS25/26"`; mehrere: `"WS23/24, WS25/26"` |
| `ref` | ✓ | Folienbezug zum Nachschlagen: `"VL01 · Folie 20"` (bzw. `"Folien 20–22"`) |
| `stem` | ✓ | Fragetext. Erlaubtes Inline-HTML: `<b> <i> <sub> <sup> <br>` |
| `explanation` | ✓ | kurze Begründung / Merksatz (1–3 Sätze), wird nach dem Antworten gezeigt |
| `note` | – | z. B. „Antwortoptionen im Protokoll unvollständig – sinnvoll ergänzt“ |
| `stemSrc` | – | Bild im Fragetext (z. B. „Wie heißt die dargestellte Struktur?“), siehe Bild-Ausschnitte |
| `answerSrc` | – | Bild in der Auflösung (z. B. Strukturformel bei „Zeichnen Sie Serotonin“) |

## Fragetypen

### `single` — Single Choice (eine richtige Antwort)
Auch für „Was trifft **nicht** zu?“ (dann ist die falsche Aussage die richtige Option;
das Wort **nicht** im Stem fett: `<b>nicht</b>`). Wertung: alles oder nichts.
```json
{ "type": "single", "options": [ {"t": "GABA", "correct": true}, {"t": "EDTA", "correct": false} ] }
```

### `multi` — Mehrfachauswahl („mehrere richtig“, „4 richtig“)
Gleiche `options`-Struktur, mehrere `correct:true`. Wertung: Anteil korrekt
klassifizierter Optionen (Teilpunkte). Wenn das Protokoll die Anzahl nennt,
in den Stem schreiben: „(4 richtig)“.

### `combo` — Aussagenkombination (Klausur-Klassiker „A und C sind richtig“)
Aussagen A, B, C, D … werden aufgelistet, gewählt wird **eine** Kombination.
```json
{
  "type": "combo",
  "stem": "Welche Aussagen zu Mikroglia treffen zu?",
  "statements": [
    {"t": "Sie regulieren die Myelin-Homöostase.", "correct": true},
    {"t": "Sie phagozytieren Synapsen.", "correct": true},
    {"t": "Sie sind die einzigen Makrophagen im Gehirn.", "correct": false}
  ],
  "combos": ["A", "B", "AB", "ABC"]     // optional; Buchstabenfolgen, "" = keine
}
```
Die richtige Kombination ergibt sich aus den `correct`-Flags und **muss** in
`combos` enthalten sein. Ohne `combos` erzeugt die App 4–5 plausible Kombinationen.
Wertung: alles oder nichts.

### `open` — Offene Frage mit Musterlösung & Selbstbewertung
Für „Nennen Sie …“, „Beschreiben Sie …“, „Wie werden NMDA-Rezeptoren aktiviert?“,
„Zeichnen Sie …“. Sie schreibt/denkt die Antwort, deckt die Musterlösung auf und
hakt ab, welche Kernpunkte sie hatte.
```json
{
  "type": "open",
  "stem": "Nennen Sie 3 Funktionen von Astrozyten.",
  "points": ["K⁺-Pufferung (spatial buffering)", "Glutamat-Aufnahme (EAAT1/2) & Glutamin-Glutamat-Zyklus", "Blut-Hirn-Schranke (Endfüße)", "Laktat-Shuttle zu Neuronen", "Synapsenbildung/-eliminierung"],
  "need": 3,                 // „Nennen Sie 3“ → 3 von points genügen; ohne need = alle
  "answer": "Optionaler Fließtext, falls die Punkte allein nicht reichen."
}
```
`points` = einzelne, kurze, abhakbare Kernaussagen (ein Punkt = ein Gedanke).
Wertung: `min(abgehakt, need) / need`.

Fragen nach „je einem“ aus mehreren Kategorien („Nennen Sie ein ROS und einen
antioxidativen Mechanismus“): `points` als Objekte mit Kategorie `g` (dann kein `need`):
```json
"points": [ {"t": "Superoxid (O₂•⁻)", "g": "ROS"}, {"t": "H₂O₂", "g": "ROS"},
            {"t": "Superoxid-Dismutase", "g": "Antioxidativer Mechanismus"} ]
```
Wertung: Anteil der Kategorien, in denen mindestens ein Punkt abgehakt ist.

### `label` — Schaubild beschriften (neu)
Ein Schaubild aus den Folien; die Beschriftungen werden abgedeckt und müssen
ergänzt werden (Wortbank oder Freitext).
```json
{
  "type": "label",
  "stem": "Beschriften Sie das myelinisierte Axon.",
  "src": {"pdf": "VL01Neuroglia 2026.pdf", "page": 20, "crop": [60, 85, 700, 460],
          "hide": [[x0, y0, x1, y1]]},           // optional: weitere Stellen abdecken (z. B. Legende, die verrät)
  "labels": [
    {"find": "inner tongue", "answer": "innere Zunge (inner tongue)", "accept": ["inner tongue", "innere Zunge", "inner loop"]},
    {"box": [462, 245, 590, 262], "answer": "Ranvier-Schnürring", "accept": ["Node of Ranvier", "Ranvier", "Schnürring"]}
  ],
  "bank": ["Paranodium"]                          // optional: zusätzliche Ablenker für die Wortbank
}
```
- Koordinaten in **PDF-Punkten** (Folie = 960 × 540), Ursprung oben links.
- `find` = Beschriftung, die als echter PDF-Text auf der Folie steht (Wortfolge, exakt
  wie auf der Folie; `"nth": 1` für das zweite Vorkommen). `box` = Beschriftung, die
  im Bild eingebrannt ist → Rechteck um den Text, abgelesen mit `figtool.py grid`.
- `answer` = kanonische Lösung (wie in der Vorlesung benannt). `accept` = weitere
  akzeptierte Schreibweisen (englisch/deutsch, Abkürzungen). Groß-/Kleinschreibung,
  Bindestriche und kleine Tippfehler toleriert die App selbst.
- `python3 tools/figtool.py build data/<kapitel>.json --pdf-dir <Folienordner>` rendert das
  Bild nach `assets/figures/<id>.webp` und schreibt `image`, `iw`, `ih` und je Label
  `x, y, w, h` (Prozent des Bildes) zurück in die JSON. Diese Felder nie von Hand pflegen.
- Wertung: Anteil richtig beschrifteter Felder.

### `order` — Reihenfolge
Für Synthesewege, Signalkaskaden, Entwicklungsschritte.
```json
{ "type": "order", "stem": "Bringen Sie die Katecholamin-Synthese in die richtige Reihenfolge.",
  "items": ["L-Tyrosin", "L-DOPA", "Dopamin", "Noradrenalin", "Adrenalin"] }
```
`items` in **richtiger** Reihenfolge (3–7 Elemente); die App mischt.
Wertung: Anteil richtig benachbarter Paare.

## Bild-Ausschnitte für `stemSrc` / `answerSrc`
Gleiches Format wie `src` bei `label` (`pdf`, `page`, `crop`, optional `hide`).
`figtool.py build` erzeugt daraus `stemImage` bzw. `answerImage`.

## Konventionen
- Altklausur-Fragen (`source:"exam"`) möglichst nah am Protokoll-Wortlaut; fehlende
  Optionen („…“) sinnvoll ergänzen und das in `note` vermerken. Die Lösung muss durch
  die Folien (oder gesichertes Lehrbuchwissen) gedeckt sein.
- Jede `single`/`multi`-Frage hat ≥ 1 richtige Option; `single` genau eine.
- Prüfen: `python3 tools/validate.py` (Schema, IDs, Topics, Bilder).

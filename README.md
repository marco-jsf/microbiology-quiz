# Neuro-Quiz

Statische Lern-App (kein Build-Schritt) für die Klausur **Grundlagen der Neurobiologie**.
Pro Vorlesung ein Kapitel, Fragen aus den Folien und aus Gedankenprotokollen der
Altklausuren (WS23/24, WS24/25, WS25/26). Lernstand mit Spaced Repetition, Münzen und
Vogel-Garten als Belohnung.

## Fragetypen

| Typ | Wofür | Wertung |
|---|---|---|
| Single Choice | eine richtige Antwort, auch „trifft **nicht** zu“ | alles oder nichts |
| Mehrfachauswahl | „mehrere richtig“, „(4 richtig)“ | Teilpunkte pro Option |
| Aussagen A–D | Klausur-Klassiker „nur A und C stimmen“ – hier wird jede Aussage einzeln angekreuzt statt eine Kombination gewählt | Teilpunkte pro Aussage |
| Offene Frage | „Nennen Sie 3 …“, „Beschreiben Sie …“, „Zeichnen Sie …“ – Musterlösung aufdecken und Kernpunkte selbst abhaken | Anteil Kernpunkte |
| Schaubild beschriften | Abbildung aus den Folien mit abgedeckten Beschriftungen; Wortbank oder Freitext (Tippfehler-tolerant, Deutsch/Englisch) | Anteil richtiger Felder |
| Reihenfolge | Synthesewege, Signalkaskaden, Entwicklungsschritte | Anteil richtig benachbarter Paare |

## Starten

Die App lädt JSON per `fetch` und muss deshalb über HTTP laufen:

```bash
cd microbio-quiz
python3 -m http.server 8799   # dann http://localhost:8799 öffnen
```

## Aufbau

```
index.html             Oberfläche: Filter (Vorlesung, Thema, Format, Auswahl, Runde, nur Altklausur)
js/
  data.js              Kapitel-Registry + Laden
  engine.js            Spaced Repetition (Leitner), Lernstand, Münzen, Rundenbau
  qtypes.js            die sechs Fragetypen: Darstellung, Interaktion, Wertung, Auflösung
  render.js            Fragekarte, Feedback, Lernstand-Dashboard
  app.js               Steuerung, Tastatur, Ereignisse
  garden-data.js       Garten-Katalog: Vögel, Steckbriefe, Eier, Deko
  garden-variants.js   je Vogelart drei echte Farbvarianten (Palettentausch)
  garden-store.js      Garten-Spielstand (Vögel mit Namen, Nest, Deko samt Positionen) in localStorage
  garden.js            alte 2D-Garten-Szene (Canvas) – nur noch Rückfall ohne WebGL2
  garden3d/            der 2.5D-Garten (Three.js, wird erst beim Öffnen des Garten-Tabs geladen):
    scene.js           Einbindung in den Tab: Kamera, Antippen, Gestalten-Modus, Abgleich mit dem Spielstand
    world.js           Gelände (Rasen, Terrasse mit Mauer und Treppe, Wege, Teich), Bäume, Büsche
    birds.js           Vögel als Sprites im Raum: laufen, hüpfen, fliegen, sitzen, schlafen nachts
    decor.js / eggs.js gekaufte Deko an ihren Plätzen · Nest mit Eiern und Schlüpfen
    sky.js / post.js   Tageszeit (Sonne, Mond, Licht) · Tilt-Shift, Farbstimmung
    fx.js / fx-extra.js Glühwürmchen, Schmetterlinge, Blütenblätter, Sonnenstrahlen, Funkeln
    pixelart.js        prozedurale Pixel-Grafik (Mauer, Bäume, Büsche, Gras …)
  garden-art.js        selbst gezeichnete Pixel-Grafik (Deko, Eier, Effekte) + Umfärben
  garden-ui.js         Vogel-/Ei-Karte und Banner über dem Garten
  shop.js              Shop: Eier · Deko · Vogelbuch (Arten + Farbvarianten)
data/
  schema.md            Datenformat – vor dem Bearbeiten lesen
  vlXX-*.json          ein Kapitel pro Vorlesung
  x-weitere-themen.json Klausurthemen ohne Foliensatz (Modellorganismen, TMS, Schlaganfall, Sprache)
assets/figures/        aus den Folien erzeugte Schaubilder (Beschriftungen abgedeckt)
tools/
  figtool.py           Folien sichten (sheet/grid/words) und Schaubilder bauen (build)
  validate.py          prüft alle Kapitel gegen das Schema
  dove_rig.py          zeichnet Vögel auf der Animation der Türkentaube (Grundlage der make_*.py)
  make_<art>.py        Sprites der selbst gezeichneten Papageien samt Farbvarianten:
                       cockatiel (Nymphensittich), budgie (Wellensittich),
                       caique (Weißbauchpapagei), cockatoo (Kakadu)
```

## Garten

Münzen gibt es für (teilweise) richtige Antworten; im Garten-Tab werden sie ausgegeben.

- **Eier** (einfach / selten / episch) kommen ins Nest (max. 3). Jede Antwort im Quiz wärmt alle Eier
  um die erreichte Punktzahl; ist ein Ei warm genug, schlüpft es per Antippen im Garten.
- **Neue Vogelarten** gibt es nur aus Eiern; Arten, die man noch nicht hat, zählen beim Schlüpfen 3×
  so viel wie schon entdeckte (die Ei-Kachel im Shop zeigt die Chance auf eine neue Art).
  Im Shop-Tab „Vogelbuch“ sind unentdeckte Arten schwarze Silhouetten. Vögel gibt es (vorerst) nur aus Eiern,
  nicht zu kaufen. Vögel antippen → Steckbrief, Name vergeben.
- **Verkaufen** (auf der Vogelkarte, der Knopf zeigt den Wert; mit Rückfrage): der Vogel fliegt davon, dafür
  gibt es 25 % seines Werts (`cost`) als Münzen, bei seltenen Farbvarianten das Doppelte. Der letzte Vogel
  bleibt; Art und Variante bleiben im Vogelbuch (`discovered` im Spielstand).
- **Seltene Farbvarianten** gibt es nur aus Eiern: je Art drei echte Farbformen (Mutationen wie Lutino
  oder Leuzismus, Jugendkleider, bei Gattungen auch nahe Verwandte), definiert in `js/garden-variants.js`
  als Farbtausch der Sprite-Palette. Spätestens jedes 8. Ei bringt eine Variante. Der Shop zeigt
  im **Vogelbuch** (3. Tab) jede Art mit ihren drei Varianten (Namen erst, wenn sie geschlüpft sind). Alte Fantasiefarben (Gold, Weiß,
  Mitternacht, Rosé, Mint) aus früheren Spielständen werden beim Laden in eine echte Variante umgewandelt.
- **2.5D-Garten**: Ein Gartentag dauert 10 Minuten (Sonne und Schatten wandern, abends gehen die Laternen an,
  nachts schlafen die Vögel in Bäumen und Büschen – der Kiwi tagsüber). Die Tageszeit wird aus der echten Uhr
  berechnet (Stelle im aktuellen 10-Minuten-Abschnitt), läuft also weiter, wenn der Tab zu ist, und ist nach
  dem Neuladen dieselbe. Im Modus 🌾 **Füttern**
  streut ein Tipp auf den Rasen eine Handvoll Körner (kostet 1 Münze), Vögel in der Nähe kommen picken.
  Ziehen = schwenken, Mausrad / zwei Finger = zoomen.
  Zum Testen: `?gartenzeit=21.5` hält die Uhrzeit fest.
- **Deko**: Gartenobjekte kann man mehrfach kaufen (Höchstzahl je Objekt in `garden-data.js`, `max`) und
  selbst platzieren: nach dem Kauf stellt man sie im Garten auf, mit ✏️ **Gestalten** lassen sich Deko und
  Nest verschieben oder Deko ins 📦 Lager räumen und später wieder aufstellen. Der Teich ist Landschaft
  (einmal kaufen, ein-/ausblenden), Effekte ebenso.
- **Neu anfangen** (ganz unten im Vogelbuch, mit Rückfrage): löscht Vögel, Eier, Deko und das Vogelbuch,
  zurück bleibt eine Stadttaube. Münzen und Lernfortschritt bleiben. Der alte Garten wird einmalig unter
  `microbioBirdsV1-backup` gesichert (Wiederherstellen per Konsole:
  `localStorage.setItem('microbioBirdsV1', localStorage.getItem('microbioBirdsV1-backup'))`).

Spielstand im Browser (`localStorage`): `microbioCoinsV1` (Münzen), `microbioBirdsV1` (Garten).
Beide Schlüssel stammen noch aus der Mikrobio-Version und dürfen nicht umbenannt werden. Im
Garten-Schlüssel bleibt `owned` ({Art: Anzahl}) erhalten und wird mitgeschrieben. Platzierte Deko steht in
`items` ([{uid, id, pos: {x, z} | null}], `pos: null` = im Lager), der Nest-Platz in `nestPos`; `decor[id].on`
wird für ältere Versionen weiter gepflegt (an = mindestens eins aufgestellt). Alte Spielstände bekommen
beim ersten Laden ihre Deko an Standardplätzen (`spot`), ausgeblendete Deko landet im Lager.

## Inhalte pflegen

- Fragen in `data/<kapitel>.json` bearbeiten (Format: `data/schema.md`), danach
  `python3 tools/validate.py`.
- Schaubild-Fragen nach Änderungen an `src`/`labels` neu bauen:
  `python3 tools/figtool.py build data/<kapitel>.json --pdf-dir <Ordner mit den Folien-PDFs>`.
- Neue Vorlesung: JSON anlegen und in `js/data.js` (`CHAPTER_FILES`) eintragen.

# Microbiology Quiz

A static, no-build study app for the Microbiology exam. Practice **exam-accurate
multiple-choice questions** (multi-select with partial credit) and track
**per-chapter mastery** on a dashboard. Questions come from two sources:

- **Real past-exam questions** (transcribed verbatim, with multi-correct answers).
- **Auto-generated questions** built from structured organism data.

## Run locally

It loads JSON via `fetch`, so it must be served over HTTP (opening `index.html`
directly with `file://` will not work). Any static server is fine:

```bash
cd microbio-quiz
npx serve            # then open the printed http://localhost:... URL
# or
python3 -m http.server 8799   # then open http://localhost:8799
```

## Deploy

It's pure static files — push the `microbio-quiz/` folder to GitHub Pages,
Netlify, Vercel, Cloudflare Pages, etc. No build step.

## Project layout

```
index.html            shell: chapter selector, mode tabs, mount points
css/styles.css        styles
js/
  data.js             chapter registry + fetch
  engine.js           scoring (single = all-or-nothing; multi = ¼-per-option partial), SRS/mastery, session build
  quizgen.js          auto-generates MCQs from entities (single + multi-select)
  render.js           quiz card, feedback, dashboard, entity profile
  app.js              bootstrap, router, controls, event handling
data/
  schema.md           the data model (read this before editing data)
  bacteriology-general.json    concept questions (no entities)
  bacteriology-specific.json   53 organisms + organism questions
  (virology.json, mycology.json, parasitology.json — added in later phases)
```

## Scoring

Matches the real exam: each question has (usually) 4 options.
- **Single-answer:** 1.00 if the correct option is chosen, else 0.
- **Multi-select:** every option is graded; score = correctly-classified / total
  → `{0, 0.25, 0.5, 0.75, 1.0}`. (Selecting a wrong option *and* missing a
  correct one both cost ¼ each.)

## Add a chapter

1. Create `data/<chapter>.json` following `data/schema.md`
   (a `title`, `color`, an `entities` array for auto-generated questions, and a
   `questions` array for authored/exam items).
2. Add the filename to `CHAPTER_FILES` in `js/data.js`.

That's it — the engine, chapter selector and dashboard pick it up automatically.

## Progress

Mastery/accuracy is stored in your browser's `localStorage` (key
`microbioQuizV1`). Use **Dashboard → Reset all progress** to clear it. Progress
is per-browser; it does not sync across devices.

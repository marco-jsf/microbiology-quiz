# Data model — one JSON file per chapter

Each file in `data/` describes one exam chapter. The engine merges all
*registered* chapters (see `js/data.js`) into a single item pool.

```jsonc
{
  "id": "bacteriology-specific",      // unique, kebab-case
  "title": "Bacteriology – Specific", // shown in chapter selector / dashboard
  "short": "Bact. (specific)",        // compact label
  "color": "#5a7ad8",                 // chapter accent colour

  // (a) ENTITIES — organisms/viruses/fungi/parasites.
  //     The engine auto-generates questions from these (js/quizgen.js).
  //     A chapter may have an empty list (e.g. bacteriology-general),
  //     in which case it is quizzed only from its authored `questions`.
  "entities": [
    {
      "id": "saureus",
      "name": "Staphylococcus aureus",
      "group": "Staphylococcaceae",   // family / higher taxon, used for grouping + "which belongs to" Qs
      "color": "#e0567a",             // group colour (visual anchor)
      "gram": "pos",                  // pos | neg | "" (n/a for non-bacteria)
      "attrs": {
        // discrete lab traits — "+", "−", "±", or "" (not a defining feature)
        "cat": "+", "ox": "−", "ure": "+",
        "mot": "Non-motile",          // free text ("Motile", "Non-motile", "Immobile", …)
        "bio": "Yes", "micro": "Yes (skin, anterior nares)",
        // prose fields (bulleted on "; ")
        "transmission": "…", "pathogenesis": "…", "disease": "…",
        "keyVF": "Protein A (binds Fc of IgG)",  // single most-important VF (drives one Q type); "" if none
        "virulence": "…", "vaccine": "None", "vYN": "no",   // vYN: yes|no|partial
        "treatment": "…", "special": "…"
      }
    }
  ],

  // (b) AUTHORED QUESTIONS — real past-exam items (verbatim) + concept items.
  //     `multi:true` ⇒ checkboxes + partial scoring; else single-answer (radio).
  //     Always exactly the options the exam gave (usually 4). Mark every
  //     correct option with "correct":true. Partial score = (#correctly
  //     classified options)/(#options) → {0,.25,.5,.75,1} for 4-option items.
  "questions": [
    {
      "id": "bsp-exam-33",
      "stem": "Which of the following bacteria can cause food poisoning?",
      "options": [
        { "t": "Staphylococcus aureus", "correct": true },
        { "t": "Streptococcus pyogenes", "correct": false },
        { "t": "Streptococcus agalactiae", "correct": false },
        { "t": "Bacillus cereus", "correct": true }
      ],
      "multi": true,
      "explanation": "S. aureus (enterotoxins) and B. cereus (emetic/diarrheal toxins) are classic food-poisoning agents.",
      "topic": "toxins / food poisoning",
      "source": "exam"               // exam | concept
    }
  ]
}
```

## Conventions
- IDs are stable — mastery/SRS is keyed on them in `localStorage`. Auto-generated
  item ids are `"<entityId>:<questionType>"`.
- Keep `stem`/options faithful to the exam wording when `source:"exam"`.
- A question must have **≥1** option with `"correct":true`.
- To add a chapter: drop a new JSON here and register its filename in `js/data.js` `CHAPTER_FILES`.

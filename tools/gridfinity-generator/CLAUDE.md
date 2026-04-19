# Claude Code Instructions — Gridfinity Generator

## Before Generating Any Bin

1. Read `MODEL_PREFERENCES.md` for project defaults and naming conventions.
   Project defaults differ from OpenSCAD defaults — always use the project ones.
2. Read the parameter reference in memory (`gridfinity_parameters.md`) for valid
   enum values and parameter interactions.

## Naming Convention

STL filenames encode dimensions and features. Other systems trust this encoding
to short-circuit model review — getting it wrong causes downstream failures.

- Format: `{name}_{W}x{D}x{H}[_feature1][_feature2].stl`
- Example: `deck_screws_2x3x6_labeled.stl`
- Use past-tense verbs for features to avoid collision with nouns (e.g. a bin
  that IS a label vs a bin that HAS a label): labeled, magnetized, screwed,
  fingerslid, patterned, cutout, etc.
- PNG renders use the same base name: `deck_screws_2x3x6_label.png`

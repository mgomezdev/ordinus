# Model Preferences

Preferences and conventions for generating Gridfinity bins. Claude Code should consult this file when interpreting bin descriptions.

## Defaults

- **Height:** 10 units `[10, 0]`
- **Lip style:** none (non-stackable) `"none"`
- **Sub-pitch:** half pitch `2`
- **Magnets:** disabled
- **Screws:** disabled
- **Label style:** disabled (no label by default)
- When a label is requested:
  - **Label style:** `"normal"`
  - **Label position:** `"left"`
  - **Label size:** `[1, 14, 0, 0.6]` (width = 1 grid unit)
  - **Label walls:** back wall only `[0,1,0,0]`
- **Finger slide:** none (unless requested)
- **Floor thickness:** 0.7mm

## Naming

- Output files use the pattern `bin_WxDxH.stl` (e.g., `bin_2x1x3.stl`)
- Add a short suffix for notable features using past-tense verbs: `bin_2x1x3_labeled.stl`, `bin_1x1x6_magnetized.stl`

## Situational Rules

<!-- Add rules here as patterns emerge, e.g.: -->
<!-- - Bins taller than 5u should use wall_thickness 1.2 -->
<!-- - Storage bins for small parts should default to subdivisions -->
<!-- - Label bins always get label_style "normal" unless gflabel is specified -->
